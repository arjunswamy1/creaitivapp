import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Parse optional client_id from request body
  let bodyClientId: string | null = null;
  try {
    const body = await req.json();
    bodyClientId = body?.client_id || body?.clientId || null;
  } catch { /* no body */ }

  let userId: string | null = null;
  const authHeader = req.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData } = await supabaseUser.auth.getClaims(token);
    userId = claimsData?.claims?.sub || null;
  }

  let targetConnections: { user_id: string; access_token: string; metadata: any; selected_ad_account: any; client_id: string | null }[] = [];

  if (userId) {
    let query = supabaseAdmin
      .from("platform_connections")
      .select("user_id, access_token, metadata, selected_ad_account, client_id")
      .eq("user_id", userId)
      .eq("platform", "meta");
    if (bodyClientId) {
      query = query.eq("client_id", bodyClientId);
    }
    const { data: conns } = await query;
    if (!conns || conns.length === 0) {
      return new Response(JSON.stringify({ success: true, records_synced: 0, message: "No Meta connection found for this client" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    targetConnections = conns;
  } else {
    const { data: connections } = await supabaseAdmin
      .from("platform_connections")
      .select("user_id, access_token, metadata, selected_ad_account, client_id")
      .eq("platform", "meta");
    if (!connections || connections.length === 0) {
      return new Response(JSON.stringify({ success: true, records_synced: 0, message: "No meta connections found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    targetConnections = connections;
  }

  // Filter out connections that don't have a selected_ad_account — syncing
  // without one pulls data from ALL ad accounts and produces wildly wrong totals.
  const validConnections = targetConnections.filter(conn => {
    const sel = conn.selected_ad_account as any;
    const syncAccounts = (conn.metadata as any)?.sync_ad_accounts;
    // Allow if sync_ad_accounts is configured OR selected_ad_account is set
    if (sel?.id || (Array.isArray(syncAccounts) && syncAccounts.length > 0)) return true;
    console.warn(`Skipping Meta sync for client ${conn.client_id}: no ad account selected`);
    return false;
  });

  if (validConnections.length === 0) {
    return new Response(JSON.stringify({ 
      success: false, 
      records_synced: 0, 
      message: "No Meta connections have a selected ad account. Please select an ad account in Settings before syncing." 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const results = [];
  for (const conn of validConnections) {
    // Support syncing multiple ad accounts via metadata.sync_ad_accounts
    const syncAccounts = (conn.metadata as any)?.sync_ad_accounts;
    let adAccountsToSync: any[];

    if (Array.isArray(syncAccounts) && syncAccounts.length > 0) {
      // Multi-account mode: sync all specified accounts
      adAccountsToSync = syncAccounts;
      console.log(`Multi-account sync for client ${conn.client_id}: ${syncAccounts.map((a: any) => a.account_id).join(', ')}`);
    } else {
      // Single account mode (default): use selected_ad_account
      const selectedAccount = conn.selected_ad_account as any;
      adAccountsToSync = selectedAccount?.id ? [selectedAccount] : [];
    }

    if (adAccountsToSync.length === 0) {
      console.warn(`No accounts to sync for client ${conn.client_id}`);
      continue;
    }

    const metadata = { ...conn.metadata, ad_accounts: adAccountsToSync };
    const result = await syncMetaForUser(supabaseAdmin, conn.user_id, conn.access_token, metadata, conn.client_id);
    results.push(result);
  }
  return new Response(JSON.stringify({ results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

async function syncMetaForUser(supabase: any, userId: string, accessToken: string, metadata: any, clientId: string | null = null) {
  const { data: syncLog } = await supabase
    .from("ad_sync_log")
    .insert({ user_id: userId, platform: "meta", status: "running" })
    .select("id")
    .single();
  const syncId = syncLog?.id;

  try {
    const adAccounts = metadata?.ad_accounts || [];
    if (adAccounts.length === 0) {
      await updateSyncLog(supabase, syncId, "error", 0, "No ad accounts found");
      return { error: "No ad accounts found" };
    }

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 90); // 90-day window to avoid edge function timeouts
    const since = formatDate(startDate);
    const until = formatDate(endDate);

    // Non-destructive: use upsert only. Never delete data before syncing
    // to prevent data loss when API calls fail (e.g. expired tokens).

    let totalRecords = 0;

    const accountPromises = adAccounts.map(async (account: any) => {
      const accountId = account.id || account.account_id;
      if (!accountId) return 0;
      const accountIdTag = accountId.replace(/^act_/, "");
      let records = 0;

      const [dailyInsights, campaignInsights, adsetInsights] = await Promise.all([
        fetchInsights(accountId, accessToken, since, until, "account"),
        fetchInsights(accountId, accessToken, since, until, "campaign", "campaign_id,campaign_name,objective,buying_type,"),
        fetchInsights(accountId, accessToken, since, until, "adset", "campaign_id,campaign_name,adset_id,adset_name,optimization_goal,"),
      ]);

      // Fetch ad-level data with creative fields in monthly chunks
      const adInsights = await fetchInsightsChunked(
        accountId, accessToken, since, until, "ad",
        "campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,",
        "video_p25_watched_actions,video_p50_watched_actions,video_p95_watched_actions,video_30_sec_watched_actions,frequency,"
      );

      if (dailyInsights) {
        const batch = dailyInsights.map((day: any) => {
          const m = extractMetrics(day);
          return {
            user_id: userId, client_id: clientId, platform: "meta", date: day.date_start,
            account_id: accountIdTag,
            spend: m.spend, revenue: m.revenue, impressions: m.impressions, clicks: m.clicks, conversions: m.conversions,
            add_to_cart: m.addToCart,
            cpc: m.clicks > 0 ? m.spend / m.clicks : null,
            ctr: m.impressions > 0 ? (m.clicks / m.impressions) * 100 : null,
            cpm: m.impressions > 0 ? (m.spend / m.impressions) * 1000 : null,
            roas: m.spend > 0 ? m.revenue / m.spend : null,
          };
        });
        await batchUpsert(supabase, "ad_daily_metrics", batch, "user_id,platform,date,client_id");
        records += batch.length;
      }

      // Fetch real statuses for campaigns, adsets, and ads
      const [campaignStatusMap, adsetStatusMap] = await Promise.all([
        fetchEntityStatuses(accountId, accessToken, "campaigns"),
        fetchEntityStatuses(accountId, accessToken, "adsets"),
      ]);

      if (campaignInsights) {
        const batch = campaignInsights.map((c: any) => {
          const m = extractMetrics(c);
          return {
            user_id: userId, client_id: clientId, platform: "meta", platform_campaign_id: c.campaign_id,
            account_id: accountIdTag,
            campaign_name: c.campaign_name, status: campaignStatusMap.get(c.campaign_id) || "unknown", date: c.date_start,
            spend: m.spend, revenue: m.revenue, impressions: m.impressions, clicks: m.clicks, conversions: m.conversions,
            add_to_cart: m.addToCart,
            roas: m.spend > 0 ? m.revenue / m.spend : null,
            bidding_strategy_type: c.objective ? formatMetaObjective(c.objective) : null,
            campaign_type: c.buying_type || null,
          };
        });
        await batchUpsert(supabase, "ad_campaigns", batch, "user_id,platform,platform_campaign_id,date");
        records += batch.length;
      }

      if (adsetInsights) {
        const batch = adsetInsights.map((a: any) => {
          const m = extractMetrics(a);
          return {
            user_id: userId, client_id: clientId, platform: "meta", platform_campaign_id: a.campaign_id,
            account_id: accountIdTag,
            platform_adset_id: a.adset_id, adset_name: a.adset_name, campaign_name: a.campaign_name,
            status: adsetStatusMap.get(a.adset_id) || "unknown", date: a.date_start,
            spend: m.spend, revenue: m.revenue, impressions: m.impressions, clicks: m.clicks, conversions: m.conversions,
            add_to_cart: m.addToCart,
            roas: m.spend > 0 ? m.revenue / m.spend : null,
          };
        });
        await batchUpsert(supabase, "ad_sets", batch, "user_id,platform,platform_adset_id,date");
        records += batch.length;
      }

      if (adInsights) {
        // Fetch ad creatives for format detection
        const creativeMap = await fetchAdCreatives(accountId, accessToken);

        const batch = adInsights.map((ad: any) => {
          const m = extractMetrics(ad);
          const creative = creativeMap.get(ad.ad_id);
          const format = detectFormat(ad.ad_name, creative);
          return {
            user_id: userId, client_id: clientId, platform: "meta", platform_ad_id: ad.ad_id,
            account_id: accountIdTag,
            platform_adset_id: ad.adset_id, platform_campaign_id: ad.campaign_id,
            ad_name: ad.ad_name, adset_name: ad.adset_name, campaign_name: ad.campaign_name,
            status: creative?.effective_status || "unknown", date: ad.date_start,
            spend: m.spend, revenue: m.revenue, impressions: m.impressions, clicks: m.clicks, conversions: m.conversions,
            add_to_cart: m.addToCart,
            roas: m.spend > 0 ? m.revenue / m.spend : null,
            format,
            frequency: ad.frequency ? parseFloat(ad.frequency) : null,
            video_views_3s: extractVideoMetric(ad.video_30_sec_watched_actions),
            video_views_25: extractVideoMetric(ad.video_p25_watched_actions),
            video_views_50: extractVideoMetric(ad.video_p50_watched_actions),
            video_views_95: extractVideoMetric(ad.video_p95_watched_actions),
            thumbnail_url: creative?.thumbnail_url || null,
          };
        });
        await batchUpsert(supabase, "ads", batch, "user_id,platform,platform_ad_id,date");
        records += batch.length;
      }

      return records;
    });

    const recordCounts = await Promise.all(accountPromises);
    totalRecords = recordCounts.reduce((sum, r) => sum + r, 0);

    await updateSyncLog(supabase, syncId, "success", totalRecords);
    return { success: true, records_synced: totalRecords };
  } catch (err) {
    console.error("Meta sync error:", err);
    await updateSyncLog(supabase, syncId, "error", 0, err.message);
    return { error: err.message };
  }
}

async function fetchInsights(accountId: string, accessToken: string, since: string, until: string, level: string, extraFields = "", extraMetricFields = "") {
  const fields = `${extraFields}spend,impressions,clicks,actions,action_values${extraMetricFields ? "," + extraMetricFields.replace(/,$/, "") : ""}`;
  let allData: any[] = [];
  let url: string | null = `https://graph.facebook.com/v21.0/${accountId}/insights?fields=${fields}&time_range={"since":"${since}","until":"${until}"}&time_increment=1&level=${level}&access_token=${accessToken}&limit=500`;
  console.log(`Fetching ${level} for ${accountId}`);

  while (url) {
    const res = await fetch(url);
    const data = await res.json();
    if (data.error) {
      console.error(`${level} error ${accountId}: ${data.error.message}`);
      break;
    }
    if (data.data) allData = allData.concat(data.data);
    url = data.paging?.next || null;
  }

  if (allData.length) console.log(`${level} for ${accountId}: ${allData.length} rows`);
  return allData.length > 0 ? allData : null;
}

async function fetchInsightsChunked(accountId: string, accessToken: string, since: string, until: string, level: string, extraFields = "", extraMetricFields = "") {
  // Split into 30-day chunks to avoid Meta's "reduce the amount of data" error
  const chunks: { since: string; until: string }[] = [];
  const start = new Date(since);
  const end = new Date(until);
  let chunkStart = new Date(start);

  while (chunkStart <= end) {
    const chunkEnd = new Date(chunkStart);
    chunkEnd.setDate(chunkEnd.getDate() + 29);
    if (chunkEnd > end) chunkEnd.setTime(end.getTime());
    chunks.push({ since: formatDate(chunkStart), until: formatDate(chunkEnd) });
    chunkStart = new Date(chunkEnd);
    chunkStart.setDate(chunkStart.getDate() + 1);
  }

  let allData: any[] = [];
  for (const chunk of chunks) {
    const data = await fetchInsights(accountId, accessToken, chunk.since, chunk.until, level, extraFields, extraMetricFields);
    if (data) allData = allData.concat(data);
  }

  console.log(`${level} chunked total for ${accountId}: ${allData.length} rows`);
  return allData.length > 0 ? allData : null;
}

async function fetchAdCreatives(accountId: string, accessToken: string): Promise<Map<string, any>> {
  const map = new Map<string, any>();
  let url: string | null = `https://graph.facebook.com/v21.0/${accountId}/ads?fields=id,effective_status,creative{object_type,thumbnail_url,effective_object_story_id}&limit=500&access_token=${accessToken}`;
  
  try {
    while (url) {
      const res = await fetch(url);
      const data = await res.json();
      if (data.error) {
        console.error("Ad creatives error:", data.error.message);
        break;
      }
      if (data.data) {
        for (const ad of data.data) {
          map.set(ad.id, {
            object_type: ad.creative?.object_type || null,
            thumbnail_url: ad.creative?.thumbnail_url || null,
            effective_status: ad.effective_status?.toLowerCase() || "unknown",
          });
        }
      }
      url = data.paging?.next || null;
    }
  } catch (err) {
    console.error("Failed to fetch ad creatives:", err);
  }
  console.log(`Fetched creatives for ${map.size} ads`);
  return map;
}

async function fetchEntityStatuses(accountId: string, accessToken: string, entityType: "campaigns" | "adsets"): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  let url: string | null = `https://graph.facebook.com/v21.0/${accountId}/${entityType}?fields=id,effective_status&limit=500&access_token=${accessToken}`;
  
  try {
    while (url) {
      const res = await fetch(url);
      const data = await res.json();
      if (data.error) {
        console.error(`${entityType} status error:`, data.error.message);
        break;
      }
      if (data.data) {
        for (const entity of data.data) {
          map.set(entity.id, entity.effective_status?.toLowerCase() || "unknown");
        }
      }
      url = data.paging?.next || null;
    }
  } catch (err) {
    console.error(`Failed to fetch ${entityType} statuses:`, err);
  }
  console.log(`Fetched statuses for ${map.size} ${entityType}`);
  return map;
}

function detectFormat(adName: string, creative: any): string {
  const objectType = creative?.object_type?.toLowerCase() || "";
  if (objectType.includes("video")) return "video";
  if (objectType === "share" || objectType === "link") return "static";
  if (objectType === "carousel") return "carousel";
  // Fallback: name-based detection
  const nameLower = adName.toLowerCase();
  if (nameLower.includes("video") || nameLower.includes("ugc") || nameLower.includes("vsl")) return "video";
  if (nameLower.includes("carousel") || nameLower.includes("caro")) return "carousel";
  if (nameLower.includes("static") || nameLower.includes("image")) return "static";
  return "unknown";
}

function extractVideoMetric(actions: any[] | undefined): number | null {
  if (!actions || !Array.isArray(actions)) return null;
  for (const a of actions) {
    if (a.action_type === "video_view") return parseInt(a.value || "0");
  }
  return null;
}
async function batchUpsert(supabase: any, table: string, rows: any[], onConflict: string, batchSize = 200) {
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    const { error } = await supabase.from(table).upsert(chunk, { onConflict });
    if (error) console.error(`Batch upsert error on ${table}:`, error.message);
  }
}

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

async function updateSyncLog(supabase: any, syncId: string, status: string, records: number, error?: string) {
  if (!syncId) return;
  await supabase.from("ad_sync_log").update({
    status, records_synced: records, error_message: error || null, completed_at: new Date().toISOString(),
  }).eq("id", syncId);
}

function formatMetaObjective(objective: string): string {
  const map: Record<string, string> = {
    OUTCOME_SALES: "Sales",
    OUTCOME_LEADS: "Leads",
    OUTCOME_ENGAGEMENT: "Engagement",
    OUTCOME_AWARENESS: "Awareness",
    OUTCOME_TRAFFIC: "Traffic",
    OUTCOME_APP_PROMOTION: "App Promotion",
    CONVERSIONS: "Conversions",
    LINK_CLICKS: "Traffic",
    POST_ENGAGEMENT: "Engagement",
    VIDEO_VIEWS: "Video Views",
    REACH: "Reach",
    BRAND_AWARENESS: "Brand Awareness",
    LEAD_GENERATION: "Lead Gen",
    MESSAGES: "Messages",
    PAGE_LIKES: "Page Likes",
    APP_INSTALLS: "App Installs",
    PRODUCT_CATALOG_SALES: "Catalog Sales",
    STORE_VISITS: "Store Visits",
  };
  return map[objective] || objective.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
}

const PURCHASE_ACTIONS = [
  "purchase",
  "offsite_conversion.fb_pixel_purchase",
];

const ADD_TO_CART_ACTIONS = [
  "add_to_cart", "omni_add_to_cart",
  "offsite_conversion.fb_pixel_add_to_cart",
];

function extractMetrics(row: any) {
  const spend = parseFloat(row.spend || "0");
  const impressions = parseInt(row.impressions || "0");
  const clicks = parseInt(row.clicks || "0");
  let conversions = 0, revenue = 0, addToCart = 0;

  if (row.actions) {
    for (const a of row.actions) {
      if (conversions === 0 && PURCHASE_ACTIONS.includes(a.action_type)) { conversions = parseInt(a.value || "0"); }
      if (addToCart === 0 && ADD_TO_CART_ACTIONS.includes(a.action_type)) { addToCart = parseInt(a.value || "0"); }
    }
  }
  if (row.action_values) {
    for (const a of row.action_values) {
      if (PURCHASE_ACTIONS.includes(a.action_type)) { revenue += parseFloat(a.value || "0"); break; }
    }
  }
  return { spend, impressions, clicks, conversions, revenue, addToCart };
}
