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

  let targetUserIds: string[] = [];
  if (userId) {
    targetUserIds = [userId];
  } else {
    const { data: connections } = await supabaseAdmin
      .from("platform_connections")
      .select("user_id, access_token, metadata, selected_ad_account")
      .eq("platform", "meta");
    if (!connections || connections.length === 0) {
      return new Response(JSON.stringify({ message: "No meta connections found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const results = [];
    for (const conn of connections) {
      const selectedAccount = conn.selected_ad_account as any;
      const metadata = selectedAccount?.id
        ? { ...conn.metadata, ad_accounts: [selectedAccount] }
        : conn.metadata;
      const result = await syncMetaForUser(supabaseAdmin, conn.user_id, conn.access_token, metadata);
      results.push(result);
    }
    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: connection } = await supabaseAdmin
    .from("platform_connections")
    .select("access_token, metadata, selected_ad_account")
    .eq("user_id", userId)
    .eq("platform", "meta")
    .single();

  if (!connection) {
    return new Response(JSON.stringify({ error: "No Meta connection found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const selectedAccount = connection.selected_ad_account as any;
  const metadata = selectedAccount?.id
    ? { ...connection.metadata, ad_accounts: [selectedAccount] }
    : connection.metadata;

  const result = await syncMetaForUser(supabaseAdmin, userId!, connection.access_token, metadata);
  return new Response(JSON.stringify(result), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

async function syncMetaForUser(supabase: any, userId: string, accessToken: string, metadata: any) {
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
    startDate.setDate(startDate.getDate() - 7);
    const since = formatDate(startDate);
    const until = formatDate(endDate);

    // Clear existing data so only selected account data remains
    await Promise.all([
      supabase.from("ad_daily_metrics").delete().eq("user_id", userId).eq("platform", "meta"),
      supabase.from("ad_campaigns").delete().eq("user_id", userId).eq("platform", "meta"),
      supabase.from("ad_sets").delete().eq("user_id", userId).eq("platform", "meta"),
      supabase.from("ads").delete().eq("user_id", userId).eq("platform", "meta"),
    ]);

    let totalRecords = 0;

    const accountPromises = adAccounts.map(async (account: any) => {
      const accountId = account.id || account.account_id;
      if (!accountId) return 0;
      let records = 0;

      const [dailyInsights, campaignInsights, adsetInsights, adInsights] = await Promise.all([
        fetchInsights(accountId, accessToken, since, until, "account"),
        fetchInsights(accountId, accessToken, since, until, "campaign", "campaign_id,campaign_name,"),
        fetchInsights(accountId, accessToken, since, until, "adset", "campaign_id,campaign_name,adset_id,adset_name,"),
        fetchInsights(accountId, accessToken, since, until, "ad", "campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,"),
      ]);

      if (dailyInsights) {
        for (const day of dailyInsights) {
          const m = extractMetrics(day);
          await supabase.from("ad_daily_metrics").upsert({
            user_id: userId, platform: "meta", date: day.date_start,
            spend: m.spend, revenue: m.revenue, impressions: m.impressions, clicks: m.clicks, conversions: m.conversions,
            cpc: m.clicks > 0 ? m.spend / m.clicks : null,
            ctr: m.impressions > 0 ? (m.clicks / m.impressions) * 100 : null,
            cpm: m.impressions > 0 ? (m.spend / m.impressions) * 1000 : null,
            roas: m.spend > 0 ? m.revenue / m.spend : null,
          }, { onConflict: "user_id,platform,date" });
          records++;
        }
      }

      if (campaignInsights) {
        for (const c of campaignInsights) {
          const m = extractMetrics(c);
          await supabase.from("ad_campaigns").upsert({
            user_id: userId, platform: "meta", platform_campaign_id: c.campaign_id,
            campaign_name: c.campaign_name, status: "active", date: c.date_start,
            spend: m.spend, revenue: m.revenue, impressions: m.impressions, clicks: m.clicks, conversions: m.conversions,
            roas: m.spend > 0 ? m.revenue / m.spend : null,
          }, { onConflict: "user_id,platform,platform_campaign_id,date" });
          records++;
        }
      }

      if (adsetInsights) {
        for (const a of adsetInsights) {
          const m = extractMetrics(a);
          await supabase.from("ad_sets").upsert({
            user_id: userId, platform: "meta", platform_campaign_id: a.campaign_id,
            platform_adset_id: a.adset_id, adset_name: a.adset_name, campaign_name: a.campaign_name,
            status: "active", date: a.date_start,
            spend: m.spend, revenue: m.revenue, impressions: m.impressions, clicks: m.clicks, conversions: m.conversions,
            roas: m.spend > 0 ? m.revenue / m.spend : null,
          }, { onConflict: "user_id,platform,platform_adset_id,date" });
          records++;
        }
      }

      if (adInsights) {
        for (const ad of adInsights) {
          const m = extractMetrics(ad);
          await supabase.from("ads").upsert({
            user_id: userId, platform: "meta", platform_ad_id: ad.ad_id,
            platform_adset_id: ad.adset_id, platform_campaign_id: ad.campaign_id,
            ad_name: ad.ad_name, adset_name: ad.adset_name, campaign_name: ad.campaign_name,
            status: "active", date: ad.date_start,
            spend: m.spend, revenue: m.revenue, impressions: m.impressions, clicks: m.clicks, conversions: m.conversions,
            roas: m.spend > 0 ? m.revenue / m.spend : null,
          }, { onConflict: "user_id,platform,platform_ad_id,date" });
          records++;
        }
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

async function fetchInsights(accountId: string, accessToken: string, since: string, until: string, level: string, extraFields = "") {
  const fields = `${extraFields}spend,impressions,clicks,actions,action_values`;
  const url = `https://graph.facebook.com/v21.0/${accountId}/insights?fields=${fields}&time_range={"since":"${since}","until":"${until}"}&time_increment=1&level=${level}&access_token=${accessToken}&limit=500`;
  console.log(`Fetching ${level} for ${accountId}`);
  const res = await fetch(url);
  const data = await res.json();
  if (data.error) console.error(`${level} error ${accountId}: ${data.error.message}`);
  if (data.data?.length) console.log(`${level} for ${accountId}: ${data.data.length} rows`);
  return data.data || null;
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

const PURCHASE_ACTIONS = [
  "purchase", "omni_purchase", "web_in_store_purchase",
  "offsite_conversion.fb_pixel_purchase", "offsite_conversion.custom.purchase",
];

function extractMetrics(row: any) {
  const spend = parseFloat(row.spend || "0");
  const impressions = parseInt(row.impressions || "0");
  const clicks = parseInt(row.clicks || "0");
  let conversions = 0, revenue = 0;

  if (row.actions) {
    for (const a of row.actions) {
      if (PURCHASE_ACTIONS.includes(a.action_type)) { conversions += parseInt(a.value || "0"); break; }
    }
  }
  if (row.action_values) {
    for (const a of row.action_values) {
      if (PURCHASE_ACTIONS.includes(a.action_type)) { revenue += parseFloat(a.value || "0"); break; }
    }
  }
  return { spend, impressions, clicks, conversions, revenue };
}
