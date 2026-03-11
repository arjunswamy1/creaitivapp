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
    const type = url.searchParams.get("type") || "keywords"; // keywords or search_terms
    const minSpend = parseFloat(url.searchParams.get("minSpend") || "0");

    if (!clientId || !startDate || !endDate) {
      return new Response(JSON.stringify({ error: "Missing required params: clientId, startDate, endDate" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const auth = await authenticate(req, supabaseAdmin, clientId);
    if (!auth.ok) return auth.error!;

    const cacheKey = `keywords:${clientId}:${startDate}:${endDate}:${type}:${minSpend}`;
    const cached = getCached(cacheKey);
    if (cached) return new Response(JSON.stringify(cached), { headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "HIT" } });

    const { data: client } = await supabaseAdmin.from("clients").select("name").eq("id", clientId).single();

    if (type === "search_terms") {
      const { data: terms } = await supabaseAdmin
        .from("search_terms")
        .select("search_term, keyword_text, match_type, campaign_name, adset_name, spend, clicks, impressions, conversions, revenue, roas, date")
        .eq("client_id", clientId)
        .gte("date", startDate)
        .lte("date", endDate);

      // Aggregate by search term
      const termMap = new Map<string, any>();
      for (const row of (terms || []) as any[]) {
        const key = `${row.search_term}::${row.keyword_text}`;
        if (!termMap.has(key)) {
          termMap.set(key, { searchTerm: row.search_term, keyword: row.keyword_text, matchType: row.match_type, campaignName: row.campaign_name, adsetName: row.adset_name, spend: 0, clicks: 0, impressions: 0, conversions: 0, revenue: 0 });
        }
        const t = termMap.get(key)!;
        t.spend += Number(row.spend); t.clicks += Number(row.clicks); t.impressions += Number(row.impressions); t.conversions += Number(row.conversions); t.revenue += Number(row.revenue);
      }

      const result = {
        client: client?.name || clientId,
        dateRange: { startDate, endDate },
        type: "search_terms",
        searchTerms: Array.from(termMap.values())
          .filter(t => t.spend >= minSpend)
          .map(t => ({ ...t, spend: round(t.spend), revenue: round(t.revenue), cpc: t.clicks > 0 ? round(t.spend / t.clicks) : null, ctr: t.impressions > 0 ? round((t.clicks / t.impressions) * 100, 2) : null, cpa: t.conversions > 0 ? round(t.spend / t.conversions) : null, roas: t.spend > 0 ? round(t.revenue / t.spend, 2) : null }))
          .sort((a, b) => b.spend - a.spend),
      };

      setCache(cacheKey, result);
      return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "MISS" } });
    }

    // Keywords
    const { data: keywords } = await supabaseAdmin
      .from("keywords")
      .select("keyword_text, match_type, campaign_name, adset_name, status, quality_score, spend, clicks, impressions, conversions, revenue, roas, date")
      .eq("client_id", clientId)
      .gte("date", startDate)
      .lte("date", endDate);

    const kwMap = new Map<string, any>();
    for (const row of (keywords || []) as any[]) {
      const key = `${row.keyword_text}::${row.match_type}::${row.campaign_name}`;
      if (!kwMap.has(key)) {
        kwMap.set(key, { keyword: row.keyword_text, matchType: row.match_type, campaignName: row.campaign_name, adsetName: row.adset_name, status: row.status, qualityScore: row.quality_score, spend: 0, clicks: 0, impressions: 0, conversions: 0, revenue: 0 });
      }
      const k = kwMap.get(key)!;
      k.spend += Number(row.spend); k.clicks += Number(row.clicks); k.impressions += Number(row.impressions); k.conversions += Number(row.conversions); k.revenue += Number(row.revenue);
    }

    const result = {
      client: client?.name || clientId,
      dateRange: { startDate, endDate },
      type: "keywords",
      keywords: Array.from(kwMap.values())
        .filter(k => k.spend >= minSpend)
        .map(k => ({ ...k, spend: round(k.spend), revenue: round(k.revenue), cpc: k.clicks > 0 ? round(k.spend / k.clicks) : null, ctr: k.impressions > 0 ? round((k.clicks / k.impressions) * 100, 2) : null, cpa: k.conversions > 0 ? round(k.spend / k.conversions) : null, roas: k.spend > 0 ? round(k.revenue / k.spend, 2) : null }))
        .sort((a, b) => b.spend - a.spend),
    };

    setCache(cacheKey, result);
    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "MISS" } });
  } catch (err) {
    console.error("api-keywords error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

function round(n: number, decimals = 2) { return Math.round(n * 10 ** decimals) / 10 ** decimals; }
