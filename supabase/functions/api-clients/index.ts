import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-api-key, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const cache = new Map<string, { data: any; expires: number }>();
const CACHE_TTL = 10 * 60 * 1000;

function getCached(key: string): any | null {
  const entry = cache.get(key);
  if (entry && Date.now() < entry.expires) return entry.data;
  if (entry) cache.delete(key);
  return null;
}

function setCache(key: string, data: any) {
  cache.set(key, { data, expires: Date.now() + CACHE_TTL });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    const apiKey = req.headers.get("x-api-key");
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let userId: string | null = null;

    let scopedClientId: string | null = null;

    if (apiKey) {
      const openclawKey = Deno.env.get("OPENCLAW_API_KEY");
      const billyKey = Deno.env.get("BILLY_API_KEY");
      const BILLY_CLIENT_ID = "b1013915-13a0-4688-b41c-e84e8623506e";

      if (billyKey && apiKey === billyKey) {
        scopedClientId = BILLY_CLIENT_ID;
      } else if (openclawKey && apiKey === openclawKey) {
        // Full access — userId stays null
      } else {
        return new Response(JSON.stringify({ error: "Invalid API key" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else if (authHeader?.startsWith("Bearer ")) {
      const supabaseUser = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: { user } } = await supabaseUser.auth.getUser();
      if (!user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userId = user.id;
    } else {
      return new Response(JSON.stringify({ error: "Missing authentication" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cacheKey = `clients:${scopedClientId || userId || "all"}`;
    const cached = getCached(cacheKey);
    if (cached) {
      return new Response(JSON.stringify(cached), {
        headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "HIT" },
      });
    }

    // Get clients the user has access to
    let clientIds: string[] = [];
    if (scopedClientId) {
      clientIds = [scopedClientId];
    } else if (userId) {
      const { data: memberRows } = await supabaseAdmin
        .from("client_members")
        .select("client_id")
        .eq("user_id", userId);
      clientIds = (memberRows || []).map((r: any) => r.client_id);
    }

    let clientsQuery = supabaseAdmin.from("clients").select("id, name, slug, logo_url, brand_colors");
    if ((scopedClientId || userId) && clientIds.length > 0) {
      clientsQuery = clientsQuery.in("id", clientIds);
    } else if (scopedClientId || userId) {
      return new Response(JSON.stringify({ clients: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: clients } = await clientsQuery;

    // Get platform connections and dashboard config for each client
    const allClientIds = (clients || []).map((c: any) => c.id);

    const [{ data: connections }, { data: configs }] = await Promise.all([
      supabaseAdmin
        .from("platform_connections")
        .select("client_id, platform, account_id, account_name, selected_ad_account")
        .in("client_id", allClientIds),
      supabaseAdmin
        .from("client_dashboard_config")
        .select("client_id, enabled_platforms, revenue_source, kpi, target, break_even_roas")
        .in("client_id", allClientIds),
    ]);

    const connectionsByClient = new Map<string, any[]>();
    for (const conn of connections || []) {
      if (!connectionsByClient.has(conn.client_id)) connectionsByClient.set(conn.client_id, []);
      connectionsByClient.get(conn.client_id)!.push(conn);
    }

    const configByClient = new Map<string, any>();
    for (const cfg of configs || []) {
      configByClient.set(cfg.client_id, cfg);
    }

    const result = {
      clients: (clients || []).map((c: any) => {
        const conns = connectionsByClient.get(c.id) || [];
        const config = configByClient.get(c.id);
        const platforms = [...new Set(conns.map((co: any) => co.platform))];
        const accountIds: Record<string, string> = {};
        for (const co of conns) {
          const sel = co.selected_ad_account as any;
          accountIds[co.platform] = sel?.id || co.account_id || "";
        }

        return {
          id: c.id,
          name: c.name,
          brand: c.slug,
          logoUrl: c.logo_url,
          platforms,
          revenueSource: config?.revenue_source || "subbly",
          kpi: config?.kpi || "ROAS",
          target: config?.target ?? 0,
          ...(config?.break_even_roas != null && { breakEvenROAS: config.break_even_roas }),
          accountIds,
        };
      }),
    };

    setCache(cacheKey, result);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "MISS" },
    });
  } catch (err) {
    console.error("api-clients error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
