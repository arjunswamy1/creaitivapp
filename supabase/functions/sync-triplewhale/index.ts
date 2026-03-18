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

    // Auth: accept bearer token (user or service role) or cron secret
    const authHeader = req.headers.get("Authorization");
    const cronSecret = req.headers.get("x-cron-secret");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (cronSecret) {
      if (cronSecret !== serviceRoleKey) {
        return new Response(JSON.stringify({ error: "Invalid cron secret" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");
      // Allow service role key as bearer token
      if (token === serviceRoleKey) {
        // Authenticated as service role
      } else {
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
        results.push({ client_id: client.client_id, summary: summaryResult });
      } catch (err) {
        console.error(`Error syncing TW summary for client ${client.client_id}:`, err);
        results.push({ client_id: client.client_id, summary_error: err.message });
      }

      try {
        // 2. Fetch Attribution data (order-level with ad attribution)
        const attrResult = await syncAttributionData(
          supabaseAdmin, twApiKey, shopDomain, client.client_id, sd, ed
        );
        results.push({ client_id: client.client_id, attribution: attrResult });
      } catch (err) {
        console.error(`Error syncing TW attribution for client ${client.client_id}:`, err);
        results.push({ client_id: client.client_id, attribution_error: err.message });
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
  const metricIds = (data.metrics || []).map((m: any) => `${m.id}(${m.metricId})[${(m.services||[]).join(",")}]`);
  console.log("TW metric IDs:", metricIds.join(" | "));

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
  
  // Initialize dates
  const start = new Date(startDate + "T00:00:00Z");
  const end = new Date(endDate + "T00:00:00Z");
  const year = start.getFullYear();
  
  // Build day-of-year to date mapping
  const doyToDate = new Map<number, string>();
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const dateStr = d.toISOString().split("T")[0];
    const doy = getDayOfYear(d);
    doyToDate.set(doy, dateStr);
    result[dateStr] = {
      totalRevenue: 0, totalOrders: 0, totalSpend: 0,
      newCustomers: 0, returningCustomers: 0,
      metaSpend: 0, metaTwRevenue: 0, metaPurchases: 0, metaClicks: 0, metaImpressions: 0,
      googleSpend: 0, googleTwRevenue: 0, googlePurchases: 0, googleClicks: 0, googleImpressions: 0,
      raw: {},
    };
  }

  // TW returns { metrics: [...] } where each metric has:
  // id, title, metricId, services, values.current, charts.current [{x: dayOfYear, y: value}]
  const metrics = data.metrics || [];
  
  // Map TW metric IDs to our fields (using actual TW metric IDs from API response)
  const metricMapping: Record<string, string> = {
    // Store-level
    "sales": "totalRevenue",
    "shopifyOrders": "totalOrders",
    "orders": "totalOrders",
    "newCustomersOrders": "newCustomers",
    "returningCustomerOrders": "returningCustomers",
    // Meta (Facebook) - use "id" field from TW response
    "facebookAds": "metaSpend",           // fb_ads_spend
    "facebookConversionValue": "metaTwRevenue",  // TW-attributed revenue from FB
    "facebookPurchases": "metaPurchases",
    "facebookClicks": "metaClicks",
    "facebookOutboundClicks": "metaClicks",
    "facebookImpressions": "metaImpressions",
    // Google
    "googleAds": "googleSpend",           // ga_adCost
    "googleConversionValue": "googleTwRevenue",  // TW-attributed revenue from Google
    "ga_transactions_adGroup": "googlePurchases",
    "totalGoogleAdsClicks": "googleClicks",
    "totalGoogleAdsImpressions": "googleImpressions",
    // Total ad spend
    "adsSpend": "totalSpend",
  };

  for (const metric of metrics) {
    const id = metric.id || metric.metricId || "";
    const mapping = metricMapping[id];
    if (!mapping || mapping.field.startsWith("_")) continue;

    // Try daily chart data first
    const chartData = metric.charts?.current || [];
    if (chartData.length > 0) {
      for (const point of chartData) {
        const dateStr = doyToDate.get(point.x);
        if (dateStr && result[dateStr]) {
          result[dateStr][mapping.field] = Number(point.y || 0);
        }
      }
    } else {
      // Fall back to aggregate value spread across all dates
      const totalValue = Number(metric.values?.current || 0);
      const dateKeys = Object.keys(result);
      if (dateKeys.length === 1) {
        result[dateKeys[0]][mapping.field] = totalValue;
      }
    }
  }

  // Store raw metrics array for the aggregate
  const allDates = Object.keys(result);
  if (allDates.length > 0) {
    // Store the full metrics list in raw_data of the first date for reference
    result[allDates[0]].raw = { metrics: metrics.map((m: any) => ({
      id: m.id, title: m.title, current: m.values?.current, previous: m.values?.previous,
      services: m.services,
    }))};
  }

  return result;
}

function getDayOfYear(date: Date): number {
  const start = new Date(Date.UTC(date.getUTCFullYear(), 0, 0));
  const diff = date.getTime() - start.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
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
