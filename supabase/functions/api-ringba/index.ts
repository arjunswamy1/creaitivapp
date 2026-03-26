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
    const vertical = url.searchParams.get("vertical"); // optional: flights, bath, all

    if (!clientId || !startDate || !endDate) {
      return new Response(JSON.stringify({ error: "Missing required params: clientId, startDate, endDate" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const auth = await authenticate(req, supabaseAdmin, clientId);
    if (!auth.ok) return auth.error!;

    const cacheKey = `ringba:${clientId}:${startDate}:${endDate}:${vertical || "all"}`;
    const cached = getCached(cacheKey);
    if (cached) return new Response(JSON.stringify(cached), { headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "HIT" } });

    const { data: client } = await supabaseAdmin.from("clients").select("name").eq("id", clientId).single();

    const { data: calls, error } = await supabaseAdmin
      .from("ringba_calls")
      .select("call_date, duration_seconds, revenue, payout, connected, converted, campaign_name, target_name, call_status")
      .eq("client_id", clientId)
      .gte("call_date", startDate + "T00:00:00.000Z")
      .lte("call_date", endDate + "T23:59:59.999Z");

    if (error) throw error;

    const allCalls = (calls || []) as any[];

    // Categorize calls
    function categorize(name: string): string {
      const lower = (name || "").toLowerCase();
      if (lower.includes("mixed") && lower.includes("flight")) return "mixed_flights";
      if (lower.includes("flight") || lower.includes("premium")) return "premium_flights";
      if (lower.includes("bath") || lower.includes("bathroom")) return "bath";
      return "other";
    }

    // Filter by vertical if specified
    let filteredCalls = allCalls;
    if (vertical === "flights") {
      filteredCalls = allCalls.filter(c => { const cat = categorize(c.campaign_name); return cat === "premium_flights" || cat === "mixed_flights"; });
    } else if (vertical === "bath") {
      filteredCalls = allCalls.filter(c => categorize(c.campaign_name) === "bath");
    }

    function calcMetrics(calls: any[]) {
      const validCalls = calls.filter(c => c.connected && Number(c.duration_seconds || 0) > 0);
      const totalDuration = calls.reduce((s, c) => s + Number(c.duration_seconds || 0), 0);
      const totalRevenue = validCalls.reduce((s, c) => s + Number(c.revenue || 0), 0);
      const totalPayout = validCalls.reduce((s, c) => s + Number(c.payout || 0), 0);
      const convertedCalls = validCalls.filter(c => c.converted).length;
      return {
        totalCalls: calls.length,
        connectedCalls: validCalls.length,
        convertedCalls,
        totalRevenue: round(totalRevenue),
        totalPayout: round(totalPayout),
        avgDuration: calls.length > 0 ? round(totalDuration / calls.length) : 0,
        connectRate: calls.length > 0 ? round((validCalls.length / calls.length) * 100, 1) : 0,
        conversionRate: validCalls.length > 0 ? round((convertedCalls / validCalls.length) * 100, 1) : 0,
        revenuePerCall: validCalls.length > 0 ? round(totalRevenue / validCalls.length) : 0,
      };
    }

    // Aggregate by campaign
    const byCampaign = new Map<string, any[]>();
    for (const call of filteredCalls) {
      const name = call.campaign_name || "Unknown";
      if (!byCampaign.has(name)) byCampaign.set(name, []);
      byCampaign.get(name)!.push(call);
    }

    // Daily breakdown
    const byDate = new Map<string, any[]>();
    for (const call of filteredCalls) {
      const date = call.call_date.split("T")[0];
      if (!byDate.has(date)) byDate.set(date, []);
      byDate.get(date)!.push(call);
    }

    const result = {
      client: client?.name || clientId,
      dateRange: { startDate, endDate },
      vertical: vertical || "all",
      summary: calcMetrics(filteredCalls),
      byCampaign: Array.from(byCampaign.entries()).map(([name, calls]) => ({
        campaignName: name,
        vertical: categorize(name),
        ...calcMetrics(calls),
      })),
      dailyBreakdown: Array.from(byDate.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([date, calls]) => ({
        date,
        ...calcMetrics(calls),
      })),
    };

    setCache(cacheKey, result);
    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "MISS" } });
  } catch (err) {
    console.error("api-ringba error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

function round(n: number, decimals = 2) { return Math.round(n * 10 ** decimals) / 10 ** decimals; }
