import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-api-key, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Simple in-memory cache (5 min TTL)
const cache = new Map<string, { data: any; expires: number }>();
const CACHE_TTL = 5 * 60 * 1000;

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
    const url = new URL(req.url);
    // Expected path: /api-campaigns?clientId=xxx&platform=meta&startDate=...&endDate=...
    const clientId = url.searchParams.get("clientId");
    const platform = url.searchParams.get("platform");
    const startDate = url.searchParams.get("startDate");
    const endDate = url.searchParams.get("endDate");
    const compareStartDate = url.searchParams.get("compareStartDate");
    const compareEndDate = url.searchParams.get("compareEndDate");

    if (!clientId || !platform || !startDate || !endDate) {
      return new Response(JSON.stringify({ error: "Missing required params: clientId, platform, startDate, endDate" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!["meta", "google"].includes(platform)) {
      return new Response(JSON.stringify({ error: "Platform must be 'meta' or 'google'" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Auth: API key, session token, or service role
    const authHeader = req.headers.get("Authorization");
    const apiKey = req.headers.get("x-api-key");
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // API key auth (supports multiple scoped keys)
    if (apiKey) {
      const openclawKey = Deno.env.get("OPENCLAW_API_KEY");
      const billyKey = Deno.env.get("BILLY_API_KEY");
      const BILLY_CLIENT_ID = "b1013915-13a0-4688-b41c-e84e8623506e";

      if (billyKey && apiKey === billyKey) {
        // Billy API key — lock to Billy's client_id only
        if (clientId !== BILLY_CLIENT_ID) {
          return new Response(JSON.stringify({ error: "Forbidden: API key does not have access to this client" }), {
            status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } else if (openclawKey && apiKey === openclawKey) {
        // OpenClaw key — full access
      } else {
        return new Response(JSON.stringify({ error: "Invalid API key" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else if (authHeader?.startsWith("Bearer ")) {
      // Validate user access if bearer token provided
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
      // Verify user is a member of this client
      const { data: isMember } = await supabaseAdmin.rpc("is_client_member", {
        _client_id: clientId, _user_id: user.id,
      });
      if (!isMember) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      return new Response(JSON.stringify({ error: "Missing authentication" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check cache
    const cacheKey = `campaigns:${clientId}:${platform}:${startDate}:${endDate}:${compareStartDate}:${compareEndDate}`;
    const cached = getCached(cacheKey);
    if (cached) {
      return new Response(JSON.stringify(cached), {
        headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "HIT" },
      });
    }

    // Get client name
    const { data: client } = await supabaseAdmin
      .from("clients")
      .select("name")
      .eq("id", clientId)
      .single();

    // Fetch campaign data for primary period
    const { data: campaigns } = await supabaseAdmin
      .from("ad_campaigns")
      .select("platform_campaign_id, campaign_name, status, campaign_type, bidding_strategy_type, bid_strategy_details, daily_budget, spend, clicks, impressions, conversions, revenue, roas, add_to_cart, date")
      .eq("client_id", clientId)
      .eq("platform", platform)
      .gte("date", startDate)
      .lte("date", endDate);

    // Aggregate by campaign
    const campaignMap = new Map<string, any>();
    for (const row of campaigns || []) {
      const key = row.platform_campaign_id;
      if (!campaignMap.has(key)) {
        campaignMap.set(key, {
          id: row.platform_campaign_id,
          name: row.campaign_name,
          status: row.status,
          type: row.campaign_type,
          biddingStrategy: row.bidding_strategy_type,
          bidStrategyDetails: (row as any).bid_strategy_details || null,
          dailyBudget: (row as any).daily_budget != null ? Number((row as any).daily_budget) : null,
          spend: 0, clicks: 0, impressions: 0, conversions: 0, revenue: 0, addToCart: 0,
        });
      }
      const c = campaignMap.get(key)!;
      c.spend += Number(row.spend);
      c.clicks += Number(row.clicks);
      c.impressions += Number(row.impressions);
      c.conversions += Number(row.conversions);
      c.revenue += Number(row.revenue);
      c.addToCart += Number(row.add_to_cart);
    }

    // Fetch comparison period if provided
    let comparisonMap: Map<string, any> | null = null;
    if (compareStartDate && compareEndDate) {
      const { data: compCampaigns } = await supabaseAdmin
        .from("ad_campaigns")
        .select("platform_campaign_id, spend, clicks, impressions, conversions, revenue, add_to_cart")
        .eq("client_id", clientId)
        .eq("platform", platform)
        .gte("date", compareStartDate)
        .lte("date", compareEndDate);

      comparisonMap = new Map();
      for (const row of compCampaigns || []) {
        const key = row.platform_campaign_id;
        if (!comparisonMap.has(key)) {
          comparisonMap.set(key, { spend: 0, clicks: 0, impressions: 0, conversions: 0, revenue: 0, addToCart: 0 });
        }
        const c = comparisonMap.get(key)!;
        c.spend += Number(row.spend);
        c.clicks += Number(row.clicks);
        c.impressions += Number(row.impressions);
        c.conversions += Number(row.conversions);
        c.revenue += Number(row.revenue);
        c.addToCart += Number(row.add_to_cart);
      }
    }

    // Build response
    const result = {
      client: client?.name || clientId,
      platform,
      dateRange: { startDate, endDate },
      comparisonRange: compareStartDate && compareEndDate ? { startDate: compareStartDate, endDate: compareEndDate } : null,
      campaigns: Array.from(campaignMap.values()).map((c) => {
        const metrics = calcMetrics(c);
        const entry: any = { id: c.id, name: c.name, status: c.status, type: c.type, biddingStrategy: c.biddingStrategy, bidStrategyDetails: c.bidStrategyDetails, dailyBudget: c.dailyBudget, metrics };

        if (comparisonMap) {
          const comp = comparisonMap.get(c.id);
          if (comp) {
            const compMetrics = calcMetrics(comp);
            entry.comparison = buildComparison(compMetrics, metrics);
          }
        }
        return entry;
      }),
    };

    setCache(cacheKey, result);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "MISS" },
    });
  } catch (err) {
    console.error("api-campaigns error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function calcMetrics(c: any) {
  return {
    spend: round(c.spend),
    clicks: c.clicks,
    impressions: c.impressions,
    conversions: c.conversions,
    revenue: round(c.revenue),
    addToCart: c.addToCart,
    cpc: c.clicks > 0 ? round(c.spend / c.clicks) : null,
    ctr: c.impressions > 0 ? round((c.clicks / c.impressions) * 100, 2) : null,
    cpa: c.conversions > 0 ? round(c.spend / c.conversions) : null,
    roas: c.spend > 0 ? round(c.revenue / c.spend, 2) : null,
    cpm: c.impressions > 0 ? round((c.spend / c.impressions) * 1000) : null,
  };
}

function buildComparison(prev: any, current: any) {
  const comp: any = {};
  for (const key of Object.keys(current)) {
    if (current[key] !== null && prev[key] !== null && typeof current[key] === "number") {
      const change = prev[key] !== 0 ? round(((current[key] - prev[key]) / prev[key]) * 100, 1) : null;
      comp[key] = { value: prev[key], change };
    }
  }
  return comp;
}

function round(n: number, decimals = 2) {
  return Math.round(n * 10 ** decimals) / 10 ** decimals;
}
