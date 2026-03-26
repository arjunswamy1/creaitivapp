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
    const openclawKey = Deno.env.get("OPENCLAW_API_KEY");
    const billyKey = Deno.env.get("BILLY_API_KEY");
    const BILLY_CLIENT_ID = "b1013915-13a0-4688-b41c-e84e8623506e";

    if (billyKey && apiKey === billyKey) {
      if (clientId !== BILLY_CLIENT_ID) return { ok: false, error: new Response(JSON.stringify({ error: "Forbidden: API key does not have access to this client" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }) };
      return { ok: true };
    } else if (openclawKey && apiKey === openclawKey) {
      return { ok: true };
    }
    return { ok: false, error: new Response(JSON.stringify({ error: "Invalid API key" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }) };
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

    if (!clientId || !startDate || !endDate) {
      return new Response(JSON.stringify({ error: "Missing required params: clientId, startDate, endDate" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const auth = await authenticate(req, supabaseAdmin, clientId);
    if (!auth.ok) return auth.error!;

    const cacheKey = `daily-summary:${clientId}:${startDate}:${endDate}`;
    const cached = getCached(cacheKey);
    if (cached) return new Response(JSON.stringify(cached), { headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "HIT" } });

    const { data: client } = await supabaseAdmin.from("clients").select("name").eq("id", clientId).single();

    // Fetch daily metrics for all platforms
    const { data: metrics } = await supabaseAdmin
      .from("ad_daily_metrics")
      .select("date, platform, spend, revenue, impressions, clicks, conversions, cpc, ctr, cpm, roas, add_to_cart")
      .eq("client_id", clientId)
      .gte("date", startDate)
      .lte("date", endDate)
      .order("date", { ascending: true });

    const allMetrics = (metrics || []) as any[];

    // Aggregate by date (cross-platform)
    const byDate = new Map<string, { spend: number; revenue: number; impressions: number; clicks: number; conversions: number; addToCart: number; platforms: Set<string> }>();
    // Also aggregate by platform
    const byPlatform = new Map<string, { spend: number; revenue: number; impressions: number; clicks: number; conversions: number; addToCart: number }>();

    for (const m of allMetrics) {
      // By date
      if (!byDate.has(m.date)) byDate.set(m.date, { spend: 0, revenue: 0, impressions: 0, clicks: 0, conversions: 0, addToCart: 0, platforms: new Set() });
      const d = byDate.get(m.date)!;
      d.spend += Number(m.spend);
      d.revenue += Number(m.revenue);
      d.impressions += Number(m.impressions);
      d.clicks += Number(m.clicks);
      d.conversions += Number(m.conversions);
      d.addToCart += Number(m.add_to_cart);
      d.platforms.add(m.platform);

      // By platform
      if (!byPlatform.has(m.platform)) byPlatform.set(m.platform, { spend: 0, revenue: 0, impressions: 0, clicks: 0, conversions: 0, addToCart: 0 });
      const p = byPlatform.get(m.platform)!;
      p.spend += Number(m.spend);
      p.revenue += Number(m.revenue);
      p.impressions += Number(m.impressions);
      p.clicks += Number(m.clicks);
      p.conversions += Number(m.conversions);
      p.addToCart += Number(m.add_to_cart);
    }

    // Totals
    const totals = { spend: 0, revenue: 0, impressions: 0, clicks: 0, conversions: 0, addToCart: 0 };
    for (const d of byDate.values()) {
      totals.spend += d.spend;
      totals.revenue += d.revenue;
      totals.impressions += d.impressions;
      totals.clicks += d.clicks;
      totals.conversions += d.conversions;
      totals.addToCart += d.addToCart;
    }

    const result = {
      client: client?.name || clientId,
      dateRange: { startDate, endDate },
      summary: {
        ...roundObj(totals),
        cpc: totals.clicks > 0 ? round(totals.spend / totals.clicks) : null,
        ctr: totals.impressions > 0 ? round((totals.clicks / totals.impressions) * 100, 2) : null,
        cpa: totals.conversions > 0 ? round(totals.spend / totals.conversions) : null,
        roas: totals.spend > 0 ? round(totals.revenue / totals.spend, 2) : null,
        cpm: totals.impressions > 0 ? round((totals.spend / totals.impressions) * 1000) : null,
      },
      byPlatform: Array.from(byPlatform.entries()).map(([platform, m]) => ({
        platform,
        ...roundObj(m),
        cpc: m.clicks > 0 ? round(m.spend / m.clicks) : null,
        ctr: m.impressions > 0 ? round((m.clicks / m.impressions) * 100, 2) : null,
        cpa: m.conversions > 0 ? round(m.spend / m.conversions) : null,
        roas: m.spend > 0 ? round(m.revenue / m.spend, 2) : null,
      })),
      daily: Array.from(byDate.entries()).map(([date, d]) => ({
        date,
        platforms: Array.from(d.platforms),
        ...roundObj(d),
        cpc: d.clicks > 0 ? round(d.spend / d.clicks) : null,
        ctr: d.impressions > 0 ? round((d.clicks / d.impressions) * 100, 2) : null,
        cpa: d.conversions > 0 ? round(d.spend / d.conversions) : null,
        roas: d.spend > 0 ? round(d.revenue / d.spend, 2) : null,
      })),
    };

    setCache(cacheKey, result);
    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "MISS" } });
  } catch (err) {
    console.error("api-daily-summary error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

function round(n: number, decimals = 2) { return Math.round(n * 10 ** decimals) / 10 ** decimals; }
function roundObj(obj: any) {
  const r: any = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k === "platforms") continue;
    r[k] = typeof v === "number" ? round(v) : v;
  }
  return r;
}
