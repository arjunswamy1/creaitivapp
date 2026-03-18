import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TW_API_BASE = "https://api.triplewhale.com/api/v2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Auth: accept bearer token or cron secret
    const authHeader = req.headers.get("Authorization");
    const cronSecret = req.headers.get("x-cron-secret");
    
    if (cronSecret) {
      if (cronSecret !== Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
        return new Response(JSON.stringify({ error: "Invalid cron secret" }), {
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
    } else {
      return new Response(JSON.stringify({ error: "Missing auth" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const { client_id, start_date, end_date } = body;

    // Find TW-enabled clients
    let clients: any[] = [];
    if (client_id) {
      const { data } = await supabaseAdmin
        .from("client_dashboard_config")
        .select("client_id, triplewhale_shop_domain")
        .eq("client_id", client_id)
        .eq("triplewhale_enabled", true);
      clients = data || [];
    } else {
      const { data } = await supabaseAdmin
        .from("client_dashboard_config")
        .select("client_id, triplewhale_shop_domain")
        .eq("triplewhale_enabled", true);
      clients = data || [];
    }

    if (clients.length === 0) {
      return new Response(JSON.stringify({ message: "No TW-enabled clients found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const twApiKey = Deno.env.get("TRIPLEWHALE_API_KEY");
    if (!twApiKey) {
      return new Response(JSON.stringify({ error: "TRIPLEWHALE_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: any[] = [];

    for (const client of clients) {
      const shopDomain = client.triplewhale_shop_domain;
      if (!shopDomain) continue;

      // Default: last 7 days
      const now = new Date();
      const sd = start_date || new Date(now.getTime() - 7 * 86400000).toISOString().split("T")[0];
      const ed = end_date || now.toISOString().split("T")[0];

      try {
        // 1. Fetch Summary Page data
        const summaryResult = await syncSummaryData(
          supabaseAdmin, twApiKey, shopDomain, client.client_id, sd, ed
        );

        // 2. Fetch Attribution data (order-level with ad attribution)
        const attrResult = await syncAttributionData(
          supabaseAdmin, twApiKey, shopDomain, client.client_id, sd, ed
        );

        results.push({
          client_id: client.client_id,
          summary: summaryResult,
          attribution: attrResult,
        });
      } catch (err) {
        console.error(`Error syncing TW for client ${client.client_id}:`, err);
        results.push({ client_id: client.client_id, error: err.message });
      }
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("sync-triplewhale error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function syncSummaryData(
  supabaseAdmin: any, twApiKey: string, shopDomain: string,
  clientId: string, startDate: string, endDate: string
) {
  const response = await fetch(`${TW_API_BASE}/summary-page/get-data`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": twApiKey,
    },
    body: JSON.stringify({
      shopDomain,
      period: {
        start: startDate,
        end: endDate,
      },
      todayHour: 25, // Full day
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`TW Summary API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  console.log("TW Summary response keys:", Object.keys(data));

  // Parse daily data from the summary response
  // TW returns data grouped by date with channel breakdowns
  const rows: any[] = [];
  
  // The summary page API returns data with various metric keys
  // We need to extract per-day channel-level metrics
  if (data && typeof data === "object") {
    // Try to extract daily data - TW returns metrics by service/channel
    const dates = extractDailyMetrics(data, startDate, endDate);
    
    for (const [date, metrics] of Object.entries(dates) as any) {
      rows.push({
        client_id: clientId,
        date,
        total_revenue: metrics.totalRevenue || 0,
        total_orders: metrics.totalOrders || 0,
        total_spend: metrics.totalSpend || 0,
        blended_roas: metrics.totalSpend > 0 ? metrics.totalRevenue / metrics.totalSpend : 0,
        blended_cpa: metrics.totalOrders > 0 ? metrics.totalSpend / metrics.totalOrders : 0,
        new_customers: metrics.newCustomers || 0,
        returning_customers: metrics.returningCustomers || 0,
        meta_spend: metrics.metaSpend || 0,
        meta_tw_revenue: metrics.metaTwRevenue || 0,
        meta_tw_roas: metrics.metaSpend > 0 ? metrics.metaTwRevenue / metrics.metaSpend : 0,
        meta_tw_cpa: metrics.metaPurchases > 0 ? metrics.metaSpend / metrics.metaPurchases : 0,
        meta_tw_purchases: metrics.metaPurchases || 0,
        meta_clicks: metrics.metaClicks || 0,
        meta_impressions: metrics.metaImpressions || 0,
        google_spend: metrics.googleSpend || 0,
        google_tw_revenue: metrics.googleTwRevenue || 0,
        google_tw_roas: metrics.googleSpend > 0 ? metrics.googleTwRevenue / metrics.googleSpend : 0,
        google_tw_cpa: metrics.googlePurchases > 0 ? metrics.googleSpend / metrics.googlePurchases : 0,
        google_tw_purchases: metrics.googlePurchases || 0,
        google_clicks: metrics.googleClicks || 0,
        google_impressions: metrics.googleImpressions || 0,
        raw_data: metrics.raw || {},
        synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
  }

  // Upsert summary rows
  if (rows.length > 0) {
    const { error } = await supabaseAdmin
      .from("triplewhale_summary")
      .upsert(rows, { onConflict: "client_id,date" });
    if (error) {
      console.error("Error upserting TW summary:", error);
      throw error;
    }
  }

  return { synced: rows.length, rawKeys: Object.keys(data || {}) };
}

function extractDailyMetrics(data: any, startDate: string, endDate: string): Record<string, any> {
  const result: Record<string, any> = {};
  
  // TW Summary API returns data in various formats
  // Common structure: { [metricName]: { [date]: value } } or array format
  // Also may have channel-specific data under keys like "facebook", "googleAds", etc.

  // Initialize dates
  const start = new Date(startDate);
  const end = new Date(endDate);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const key = d.toISOString().split("T")[0];
    result[key] = {
      totalRevenue: 0, totalOrders: 0, totalSpend: 0,
      newCustomers: 0, returningCustomers: 0,
      metaSpend: 0, metaTwRevenue: 0, metaPurchases: 0, metaClicks: 0, metaImpressions: 0,
      googleSpend: 0, googleTwRevenue: 0, googlePurchases: 0, googleClicks: 0, googleImpressions: 0,
      raw: {},
    };
  }

  // The TW API typically returns data as:
  // { data: { [serviceName]: { metrics: [...] } } } or flat daily arrays
  // We'll handle the most common response shapes

  try {
    // If data has a "data" wrapper
    const payload = data.data || data;
    
    // Check for channel-level data (facebook/meta, google, etc.)
    const channelMappings: Record<string, string> = {
      facebook: "meta", "facebook-ads": "meta", meta: "meta",
      "google-ads": "google", google: "google", googleAds: "google",
    };

    // Extract overall store metrics
    if (payload.totalRevenue || payload.grossSales || payload.revenue) {
      for (const dateKey of Object.keys(result)) {
        // If TW returns aggregated data, we store it as a single-day summary
        if (Object.keys(result).length === 1 || !payload.dailyBreakdown) {
          result[dateKey].totalRevenue = Number(payload.totalRevenue || payload.grossSales || payload.revenue || 0);
          result[dateKey].totalOrders = Number(payload.totalOrders || payload.orders || 0);
          result[dateKey].raw = payload;
        }
      }
    }

    // Try to extract per-channel data
    for (const [twChannel, ourChannel] of Object.entries(channelMappings)) {
      const channelData = payload[twChannel] || payload[twChannel + "Ads"];
      if (!channelData) continue;

      for (const dateKey of Object.keys(result)) {
        const spend = Number(channelData.spend || channelData.adSpend || 0);
        const revenue = Number(channelData.revenue || channelData.pixelRevenue || channelData.twRevenue || 0);
        const purchases = Number(channelData.purchases || channelData.pixelPurchases || channelData.twPurchases || 0);
        const clicks = Number(channelData.clicks || channelData.outboundClicks || 0);
        const impressions = Number(channelData.impressions || 0);

        if (ourChannel === "meta") {
          result[dateKey].metaSpend = spend;
          result[dateKey].metaTwRevenue = revenue;
          result[dateKey].metaPurchases = purchases;
          result[dateKey].metaClicks = clicks;
          result[dateKey].metaImpressions = impressions;
        } else if (ourChannel === "google") {
          result[dateKey].googleSpend = spend;
          result[dateKey].googleTwRevenue = revenue;
          result[dateKey].googlePurchases = purchases;
          result[dateKey].googleClicks = clicks;
          result[dateKey].googleImpressions = impressions;
        }

        result[dateKey].totalSpend += spend;
      }
    }

    // Handle if data comes as an array of daily entries
    if (Array.isArray(payload)) {
      for (const entry of payload) {
        const date = entry.date || entry.day;
        if (!date || !result[date]) continue;
        result[date].totalRevenue = Number(entry.revenue || entry.totalRevenue || 0);
        result[date].totalOrders = Number(entry.orders || entry.totalOrders || 0);
        result[date].totalSpend = Number(entry.spend || entry.totalSpend || 0);
        result[date].raw = entry;
      }
    }
  } catch (e) {
    console.error("Error parsing TW summary data:", e);
  }

  return result;
}

async function syncAttributionData(
  supabaseAdmin: any, twApiKey: string, shopDomain: string,
  clientId: string, startDate: string, endDate: string
) {
  const response = await fetch(`${TW_API_BASE}/attribution/get-orders-with-journeys-v2`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": twApiKey,
    },
    body: JSON.stringify({
      shopDomain,
      period: {
        start: startDate,
        end: endDate,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`TW Attribution API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  console.log("TW Attribution response - order count:", Array.isArray(data) ? data.length : "non-array");

  // Parse orders and aggregate at ad level
  const adMetrics = new Map<string, any>();
  const orders = Array.isArray(data) ? data : (data.orders || data.data || []);

  for (const order of orders) {
    const orderDate = (order.created_at || order.orderDate || order.date || "").split("T")[0];
    if (!orderDate) continue;

    const totalPrice = Number(order.total_price || order.totalPrice || order.revenue || 0);
    const journey = order.journey || order.attributionInfo || order.attribution || [];

    // Extract ad-level attribution from journey
    const touchpoints = Array.isArray(journey) ? journey : [];
    
    for (const tp of touchpoints) {
      // Only process paid touchpoints with ad IDs
      const adId = tp.ad_id || tp.adId;
      const platform = normalizePlatform(tp.source || tp.channel || tp.platform || "");
      if (!adId || !platform) continue;

      const key = `${orderDate}|${platform}|${adId}`;
      const existing = adMetrics.get(key) || {
        client_id: clientId,
        date: orderDate,
        platform,
        campaign_id: tp.campaign_id || tp.campaignId || null,
        campaign_name: tp.campaign_name || tp.campaignName || null,
        adset_id: tp.adset_id || tp.adsetId || null,
        adset_name: tp.adset_name || tp.adsetName || null,
        ad_id: adId,
        ad_name: tp.ad_name || tp.adName || null,
        tw_revenue: 0,
        tw_purchases: 0,
        attribution_model: "Triple Attribution",
        raw_data: {},
        synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Attribution: if there's a specific attributed revenue, use it; otherwise distribute
      const attributedRevenue = Number(tp.revenue || tp.attributedRevenue || 0);
      if (attributedRevenue > 0) {
        existing.tw_revenue += attributedRevenue;
      } else if (touchpoints.length > 0) {
        // Proportional distribution
        existing.tw_revenue += totalPrice / touchpoints.length;
      }
      existing.tw_purchases += 1;

      adMetrics.set(key, existing);
    }
  }

  // Upsert ad attribution rows
  const rows = Array.from(adMetrics.values()).map(r => ({
    ...r,
    tw_roas: r.spend > 0 ? r.tw_revenue / r.spend : 0,
    tw_cpa: r.tw_purchases > 0 ? (r.spend || 0) / r.tw_purchases : 0,
  }));

  if (rows.length > 0) {
    // Batch upsert in chunks of 500
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const { error } = await supabaseAdmin
        .from("triplewhale_ad_attribution")
        .upsert(chunk, { onConflict: "client_id,date,platform,ad_id" });
      if (error) {
        console.error("Error upserting TW attribution chunk:", error);
        throw error;
      }
    }
  }

  return { orders_processed: orders.length, ad_rows_synced: rows.length };
}

function normalizePlatform(source: string): string | null {
  const s = source.toLowerCase();
  if (s.includes("facebook") || s.includes("meta") || s.includes("fb") || s.includes("instagram")) return "meta";
  if (s.includes("google") || s.includes("gads") || s.includes("adwords")) return "google";
  if (s.includes("tiktok")) return "tiktok";
  return null; // Skip organic/unknown
}
