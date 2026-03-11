import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-api-key, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const cache = new Map<string, { data: any; expires: number }>();
const CACHE_TTL = 5 * 60 * 1000;
function getCached(key: string) { const e = cache.get(key); if (e && Date.now() < e.expires) return e.data; if (e) cache.delete(key); return null; }
function setCache(key: string, data: any) { cache.set(key, { data, expires: Date.now() + CACHE_TTL }); }

async function authenticate(req: Request, supabaseAdmin: any, clientId: string): Promise<{ ok: boolean; error?: Response }> {
  const apiKey = req.headers.get("x-api-key");
  if (apiKey) {
    const expected = Deno.env.get("OPENCLAW_API_KEY");
    if (!expected || apiKey !== expected) return { ok: false, error: new Response(JSON.stringify({ error: "Invalid API key" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }) };
    return { ok: true };
  }
  const authHeader = req.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const supabaseUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await supabaseUser.auth.getUser();
    if (!user) return { ok: false, error: new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }) };
    const { data: isMember } = await supabaseAdmin.rpc("is_client_member", { _client_id: clientId, _user_id: user.id });
    if (!isMember) return { ok: false, error: new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }) };
    return { ok: true };
  }
  return { ok: false, error: new Response(JSON.stringify({ error: "Missing authentication" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const clientId = url.searchParams.get("clientId");
    const startDate = url.searchParams.get("startDate");
    const endDate = url.searchParams.get("endDate");
    const source = url.searchParams.get("source"); // shopify, subbly, or all (default)

    if (!clientId || !startDate || !endDate) {
      return new Response(JSON.stringify({ error: "Missing required params: clientId, startDate, endDate" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const auth = await authenticate(req, supabaseAdmin, clientId);
    if (!auth.ok) return auth.error!;

    const cacheKey = `revenue:${clientId}:${startDate}:${endDate}:${source || "all"}`;
    const cached = getCached(cacheKey);
    if (cached) return new Response(JSON.stringify(cached), { headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "HIT" } });

    const { data: client } = await supabaseAdmin.from("clients").select("name").eq("id", clientId).single();

    const result: any = {
      client: client?.name || clientId,
      dateRange: { startDate, endDate },
    };

    // Shopify orders
    if (!source || source === "all" || source === "shopify") {
      const { data: orders } = await supabaseAdmin
        .from("shopify_orders")
        .select("order_date, total_price, subtotal_price, total_tax, total_discounts, total_cost, total_shipping, financial_status, fulfillment_status, order_number")
        .eq("client_id", clientId)
        .gte("order_date", startDate + "T00:00:00.000Z")
        .lte("order_date", endDate + "T23:59:59.999Z");

      const shopifyOrders = (orders || []) as any[];
      const totalRevenue = shopifyOrders.reduce((s, o) => s + Number(o.total_price || 0), 0);
      const totalCost = shopifyOrders.reduce((s, o) => s + Number(o.total_cost || 0), 0);
      const totalTax = shopifyOrders.reduce((s, o) => s + Number(o.total_tax || 0), 0);
      const totalShipping = shopifyOrders.reduce((s, o) => s + Number(o.total_shipping || 0), 0);
      const totalDiscounts = shopifyOrders.reduce((s, o) => s + Number(o.total_discounts || 0), 0);

      // Daily breakdown
      const byDate = new Map<string, any[]>();
      for (const o of shopifyOrders) {
        const date = (o.order_date || "").split("T")[0];
        if (!byDate.has(date)) byDate.set(date, []);
        byDate.get(date)!.push(o);
      }

      result.shopify = {
        totalOrders: shopifyOrders.length,
        totalRevenue: round(totalRevenue),
        totalCost: round(totalCost),
        totalTax: round(totalTax),
        totalShipping: round(totalShipping),
        totalDiscounts: round(totalDiscounts),
        grossProfit: round(totalRevenue - totalCost - totalTax - totalShipping - totalDiscounts),
        avgOrderValue: shopifyOrders.length > 0 ? round(totalRevenue / shopifyOrders.length) : 0,
        dailyBreakdown: Array.from(byDate.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([date, orders]) => ({
          date,
          orders: orders.length,
          revenue: round(orders.reduce((s, o) => s + Number(o.total_price || 0), 0)),
        })),
      };
    }

    // Subbly invoices
    if (!source || source === "all" || source === "subbly") {
      const { data: invoices } = await supabaseAdmin
        .from("subbly_invoices")
        .select("invoice_date, amount, status, currency_code")
        .eq("client_id", clientId)
        .gte("invoice_date", startDate + "T00:00:00.000Z")
        .lte("invoice_date", endDate + "T23:59:59.999Z");

      const allInvoices = (invoices || []) as any[];
      const paidInvoices = allInvoices.filter(i => i.status === "paid");
      const totalRevenue = paidInvoices.reduce((s, i) => s + Number(i.amount || 0), 0);

      // Active subscriptions (current snapshot)
      const { data: subs } = await supabaseAdmin
        .from("subbly_subscriptions")
        .select("status, quantity")
        .eq("client_id", clientId);

      const activeSubs = ((subs || []) as any[]).filter(s => s.status === "active");

      result.subbly = {
        totalInvoices: allInvoices.length,
        paidInvoices: paidInvoices.length,
        totalRevenue: round(totalRevenue),
        avgInvoiceValue: paidInvoices.length > 0 ? round(totalRevenue / paidInvoices.length) : 0,
        activeSubscriptions: activeSubs.length,
        totalSubscriptionQuantity: activeSubs.reduce((s, sub) => s + Number(sub.quantity || 1), 0),
      };
    }

    setCache(cacheKey, result);
    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "MISS" } });
  } catch (err) {
    console.error("api-revenue error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

function round(n: number, decimals = 2) { return Math.round(n * 10 ** decimals) / 10 ** decimals; }
