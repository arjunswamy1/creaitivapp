import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-api-key, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
    const clientId = url.searchParams.get("clientId");
    const platform = url.searchParams.get("platform");
    const startDate = url.searchParams.get("startDate");
    const endDate = url.searchParams.get("endDate");
    const minImpressions = parseInt(url.searchParams.get("minImpressions") || "0");

    if (!clientId || !platform || !startDate || !endDate) {
      return new Response(JSON.stringify({ error: "Missing required params: clientId, platform, startDate, endDate" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization");
    const apiKey = req.headers.get("x-api-key");
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    if (apiKey) {
      const expected = Deno.env.get("OPENCLAW_API_KEY");
      if (!expected || apiKey !== expected) {
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

    const cacheKey = `ads:${clientId}:${platform}:${startDate}:${endDate}:${minImpressions}`;
    const cached = getCached(cacheKey);
    if (cached) {
      return new Response(JSON.stringify(cached), {
        headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "HIT" },
      });
    }

    const { data: client } = await supabaseAdmin
      .from("clients")
      .select("name")
      .eq("id", clientId)
      .single();

    // Fetch ad-level data
    const { data: ads } = await supabaseAdmin
      .from("ads")
      .select("platform_ad_id, ad_name, campaign_name, adset_name, status, format, frequency, spend, clicks, impressions, conversions, revenue, roas, add_to_cart, date, video_views_3s, video_views_25, video_views_50, video_views_95, thumbnail_url")
      .eq("client_id", clientId)
      .eq("platform", platform)
      .gte("date", startDate)
      .lte("date", endDate);

    // Aggregate by ad
    const adMap = new Map<string, any>();
    for (const row of ads || []) {
      const key = row.platform_ad_id;
      if (!adMap.has(key)) {
        adMap.set(key, {
          id: row.platform_ad_id,
          name: row.ad_name,
          campaignName: row.campaign_name,
          adsetName: row.adset_name,
          status: row.status,
          format: row.format,
          thumbnailUrl: row.thumbnail_url,
          spend: 0, clicks: 0, impressions: 0, conversions: 0, revenue: 0, addToCart: 0,
          frequencySum: 0, frequencyCount: 0,
          videoViews3s: 0, videoViews25: 0, videoViews50: 0, videoViews95: 0,
          lastConversionDate: null as string | null,
          dates: [] as string[],
        });
      }
      const a = adMap.get(key)!;
      a.spend += Number(row.spend);
      a.clicks += Number(row.clicks);
      a.impressions += Number(row.impressions);
      a.conversions += Number(row.conversions);
      a.revenue += Number(row.revenue);
      a.addToCart += Number(row.add_to_cart);
      if (row.frequency) { a.frequencySum += Number(row.frequency); a.frequencyCount++; }
      if (row.video_views_3s) a.videoViews3s += Number(row.video_views_3s);
      if (row.video_views_25) a.videoViews25 += Number(row.video_views_25);
      if (row.video_views_50) a.videoViews50 += Number(row.video_views_50);
      if (row.video_views_95) a.videoViews95 += Number(row.video_views_95);
      if (row.conversions > 0) {
        if (!a.lastConversionDate || row.date > a.lastConversionDate) a.lastConversionDate = row.date;
      }
    }

    const today = new Date().toISOString().split("T")[0];
    const result = {
      client: client?.name || clientId,
      platform,
      dateRange: { startDate, endDate },
      ads: Array.from(adMap.values())
        .filter((a) => a.impressions >= minImpressions)
        .map((a) => {
          const creativeFormat = detectFormat(a.name, a.format);
          const creativeType = detectCreativeType(a.name);
          const daysSinceLastConversion = a.lastConversionDate
            ? Math.floor((new Date(today).getTime() - new Date(a.lastConversionDate).getTime()) / 86400000)
            : null;

          return {
            id: a.id,
            name: a.name,
            campaignName: a.campaignName,
            adsetName: a.adsetName,
            status: a.status,
            creativeFormat,
            creativeType,
            thumbnailUrl: a.thumbnailUrl,
            metrics: {
              spend: round(a.spend),
              clicks: a.clicks,
              impressions: a.impressions,
              conversions: a.conversions,
              revenue: round(a.revenue),
              addToCart: a.addToCart,
              cpc: a.clicks > 0 ? round(a.spend / a.clicks) : null,
              ctr: a.impressions > 0 ? round((a.clicks / a.impressions) * 100, 2) : null,
              cpa: a.conversions > 0 ? round(a.spend / a.conversions) : null,
              roas: a.spend > 0 ? round(a.revenue / a.spend, 2) : null,
              frequency: a.frequencyCount > 0 ? round(a.frequencySum / a.frequencyCount, 2) : null,
            },
            videoMetrics: a.videoViews3s > 0 ? {
              views3s: a.videoViews3s,
              views25: a.videoViews25,
              views50: a.videoViews50,
              views95: a.videoViews95,
            } : null,
            lastConversionDate: a.lastConversionDate,
            daysSinceLastConversion,
          };
        }),
    };

    setCache(cacheKey, result);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "MISS" },
    });
  } catch (err) {
    console.error("api-ads error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function detectFormat(adName: string, dbFormat: string | null): string {
  if (dbFormat && dbFormat !== "unknown") return dbFormat;
  const n = adName.toLowerCase();
  if (n.includes("video") || n.includes("ugc") || n.includes("vsl")) return "video";
  if (n.includes("carousel") || n.includes("caro")) return "carousel";
  if (n.includes("static") || n.includes("image")) return "static";
  return "unknown";
}

function detectCreativeType(adName: string): string {
  const n = adName.toLowerCase();
  if (n.includes("ugc")) return "ugc";
  if (n.includes("founder")) return "founder";
  if (n.includes("product") || n.includes("pdp") || n.includes("catalog")) return "product";
  if (n.includes("testimonial") || n.includes("review")) return "ugc";
  if (n.includes("lifestyle")) return "product";
  return "unknown";
}

function round(n: number, decimals = 2) {
  return Math.round(n * 10 ** decimals) / 10 ** decimals;
}
