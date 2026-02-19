import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUBBLY_BASE = "https://api.subbly.co/private/v1";

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function subblyFetch(path: string, apiKey: string, params: Record<string, string> = {}, retries = 2) {
  const url = new URL(`${SUBBLY_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  for (let attempt = 0; attempt <= retries; attempt++) {
    console.log(`subblyFetch: ${path} attempt ${attempt + 1}`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    
    let res: Response;
    try {
      res = await fetch(url.toString(), {
        headers: { "X-API-KEY": apiKey, Accept: "application/json" },
        signal: controller.signal,
      });
    } catch (err: any) {
      clearTimeout(timeout);
      if (err.name === "AbortError") {
        console.log(`subblyFetch: ${path} timed out on attempt ${attempt + 1}`);
        if (attempt < retries) { await sleep(2000); continue; }
        throw new Error(`Subbly API timeout after ${retries + 1} attempts`);
      }
      throw err;
    }
    clearTimeout(timeout);

    if (res.status === 429) {
      const waitMs = Math.min(2000 * Math.pow(2, attempt), 10000);
      console.log(`Rate limited, waiting ${waitMs}ms before retry ${attempt + 1}/${retries}`);
      await res.text();
      if (attempt < retries) { await sleep(waitMs); continue; }
      throw new Error(`Subbly API rate limit exceeded after ${retries + 1} attempts`);
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Subbly API ${res.status}: ${text}`);
    }
    console.log(`subblyFetch: ${path} success`);
    return res.json();
  }
}

async function fetchAllPages(path: string, apiKey: string, extraParams: Record<string, string> = {}, maxPages = 5) {
  const allData: any[] = [];
  let page = 1;
  while (page <= maxPages) {
    console.log(`fetchAllPages: ${path} page ${page}`);
    const result = await subblyFetch(path, apiKey, { ...extraParams, page: String(page), per_page: "100" });
    const pageData = result?.data;
    if (!pageData || !Array.isArray(pageData) || pageData.length === 0) {
      console.log(`fetchAllPages: ${path} no more data at page ${page}`);
      break;
    }
    allData.push(...pageData);
    // Break if we got fewer items than requested (last page)
    if (pageData.length < 100) break;
    // Also check pagination metadata
    if (result?.pagination?.last_page && page >= result.pagination.last_page) break;
    page++;
    await sleep(500);
  }
  console.log(`fetchAllPages: ${path} total records: ${allData.length}`);
  return allData;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    console.log("sync-subbly: start");
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      console.log("sync-subbly: no auth header");
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const token = authHeader.replace("Bearer ", "");
    const cronSecret = Deno.env.get("SUBBLY_CRON_SECRET");
    const isCron = cronSecret && token === cronSecret;

    if (!isCron) {
      // Normal user auth flow
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
      );
      console.log("sync-subbly: verifying user");
      const { data: { user }, error: userErr } = await supabase.auth.getUser();
      if (userErr || !user) {
        console.log("sync-subbly: auth failed", userErr?.message);
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
      }
      console.log("sync-subbly: user verified", user.id);
    } else {
      console.log("sync-subbly: cron invocation");
    }

    const body = await req.json().catch(() => ({}));
    console.log("sync-subbly: body", JSON.stringify(body));
    const clientId = body.client_id;
    if (!clientId) {
      return new Response(JSON.stringify({ error: "client_id is required" }), { status: 400, headers: corsHeaders });
    }

    const SUBBLY_API_KEY = Deno.env.get("SUBBLY_API_KEY");
    if (!SUBBLY_API_KEY) {
      return new Response(JSON.stringify({ error: "SUBBLY_API_KEY not configured" }), { status: 500, headers: corsHeaders });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Sync subscriptions
    console.log("sync-subbly: fetching subscriptions");
    const subs = await fetchAllPages("/subscriptions", SUBBLY_API_KEY);
    console.log("sync-subbly: got", subs.length, "subscriptions");
    let subsUpserted = 0;

    if (subs.length > 0) {
      const subRows = subs.map((s: any) => ({
        client_id: clientId,
        subbly_id: s.id,
        customer_id: s.customer_id,
        product_id: s.product_id,
        quantity: s.quantity ?? 1,
        currency_code: s.currency_code ?? null,
        status: s.status,
        next_payment_date: s.next_payment_date ?? null,
        last_payment_at: s.last_payment_at ?? null,
        successful_charges_count: s.successful_charges_count ?? 0,
        past_due: s.past_due ?? false,
        synced_at: new Date().toISOString(),
      }));

      for (let i = 0; i < subRows.length; i += 500) {
        const chunk = subRows.slice(i, i + 500);
        const { error } = await admin.from("subbly_subscriptions").upsert(chunk, {
          onConflict: "client_id,subbly_id",
        });
        if (error) console.error("Sub upsert error:", error.message);
        else subsUpserted += chunk.length;
      }
    }

    // Small delay before fetching invoices
    await sleep(1000);

    // Sync invoices (paid only for revenue tracking)
    const invoices = await fetchAllPages("/invoices", SUBBLY_API_KEY, { "statuses[]": "paid" });
    let invoicesUpserted = 0;

    if (invoices.length > 0) {
      const invRows = invoices.map((inv: any) => ({
        client_id: clientId,
        subbly_id: inv.id,
        customer_id: inv.customer_id,
        subscription_id: inv.subscription_id ?? null,
        status: inv.status,
        amount: inv.total ?? inv.amount ?? 0,
        currency_code: inv.currency_code ?? null,
        invoice_date: inv.created_at ?? null,
        synced_at: new Date().toISOString(),
      }));

      for (let i = 0; i < invRows.length; i += 500) {
        const chunk = invRows.slice(i, i + 500);
        const { error } = await admin.from("subbly_invoices").upsert(chunk, {
          onConflict: "client_id,subbly_id",
        });
        if (error) console.error("Invoice upsert error:", error.message);
        else invoicesUpserted += chunk.length;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        subscriptions_synced: subsUpserted,
        invoices_synced: invoicesUpserted,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Sync error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
