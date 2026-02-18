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

  // Support both authenticated calls and cron (service role) calls
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

  // If called from cron, body may contain user_id or we sync all users
  let targetUserIds: string[] = [];
  if (userId) {
    targetUserIds = [userId];
  } else {
    // Cron mode: sync all users with meta connections
    const { data: connections } = await supabaseAdmin
      .from("platform_connections")
      .select("user_id, access_token, metadata")
      .eq("platform", "meta");
    if (!connections || connections.length === 0) {
      return new Response(JSON.stringify({ message: "No meta connections found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Process all connections
    const results = [];
    for (const conn of connections) {
      const result = await syncMetaForUser(supabaseAdmin, conn.user_id, conn.access_token, conn.metadata);
      results.push(result);
    }
    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Single user sync
  const { data: connection } = await supabaseAdmin
    .from("platform_connections")
    .select("access_token, metadata")
    .eq("user_id", userId)
    .eq("platform", "meta")
    .single();

  if (!connection) {
    return new Response(JSON.stringify({ error: "No Meta connection found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const result = await syncMetaForUser(supabaseAdmin, userId!, connection.access_token, connection.metadata);
  return new Response(JSON.stringify(result), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

async function syncMetaForUser(
  supabase: any,
  userId: string,
  accessToken: string,
  metadata: any
) {
  // Create sync log entry
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

    // Calculate date range (last 7 days)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);
    const since = formatDate(startDate);
    const until = formatDate(endDate);

    let totalRecords = 0;

    for (const account of adAccounts) {
      const accountId = account.id || account.account_id;
      if (!accountId) continue;

      // Fetch account-level daily insights
      const dailyInsights = await fetchMetaInsights(
        accountId, accessToken, since, until, "1"
      );

      if (dailyInsights) {
        for (const day of dailyInsights) {
          const spend = parseFloat(day.spend || "0");
          const impressions = parseInt(day.impressions || "0");
          const clicks = parseInt(day.clicks || "0");
          const conversions = parseInt(day.actions?.find((a: any) => a.action_type === "offsite_conversion.fb_pixel_purchase")?.value || "0");
          const revenue = parseFloat(day.action_values?.find((a: any) => a.action_type === "offsite_conversion.fb_pixel_purchase")?.value || "0");

          await supabase
            .from("ad_daily_metrics")
            .upsert({
              user_id: userId,
              platform: "meta",
              date: day.date_start,
              spend,
              revenue,
              impressions,
              clicks,
              conversions,
              cpc: clicks > 0 ? spend / clicks : null,
              ctr: impressions > 0 ? (clicks / impressions) * 100 : null,
              cpm: impressions > 0 ? (spend / impressions) * 1000 : null,
              roas: spend > 0 ? revenue / spend : null,
            }, { onConflict: "user_id,platform,date" });
          totalRecords++;
        }
      }

      // Fetch campaign-level insights
      const campaignInsights = await fetchMetaCampaignInsights(
        accountId, accessToken, since, until
      );

      if (campaignInsights) {
        for (const c of campaignInsights) {
          const spend = parseFloat(c.spend || "0");
          const impressions = parseInt(c.impressions || "0");
          const clicks = parseInt(c.clicks || "0");
          const conversions = parseInt(c.actions?.find((a: any) => a.action_type === "offsite_conversion.fb_pixel_purchase")?.value || "0");
          const revenue = parseFloat(c.action_values?.find((a: any) => a.action_type === "offsite_conversion.fb_pixel_purchase")?.value || "0");

          await supabase
            .from("ad_campaigns")
            .upsert({
              user_id: userId,
              platform: "meta",
              platform_campaign_id: c.campaign_id,
              campaign_name: c.campaign_name,
              status: c.campaign_status || "unknown",
              date: c.date_start,
              spend,
              revenue,
              impressions,
              clicks,
              conversions,
              roas: spend > 0 ? revenue / spend : null,
            }, { onConflict: "user_id,platform,platform_campaign_id,date" });
          totalRecords++;
        }
      }

      // Fetch adset-level insights
      const adsetInsights = await fetchMetaAdsetInsights(
        accountId, accessToken, since, until
      );

      if (adsetInsights) {
        for (const a of adsetInsights) {
          const spend = parseFloat(a.spend || "0");
          const impressions = parseInt(a.impressions || "0");
          const clicks = parseInt(a.clicks || "0");
          const conversions = parseInt(a.actions?.find((act: any) => act.action_type === "offsite_conversion.fb_pixel_purchase")?.value || "0");
          const revenue = parseFloat(a.action_values?.find((act: any) => act.action_type === "offsite_conversion.fb_pixel_purchase")?.value || "0");

          await supabase
            .from("ad_sets")
            .upsert({
              user_id: userId,
              platform: "meta",
              platform_campaign_id: a.campaign_id,
              platform_adset_id: a.adset_id,
              adset_name: a.adset_name,
              campaign_name: a.campaign_name,
              status: a.adset_status || "unknown",
              date: a.date_start,
              spend,
              revenue,
              impressions,
              clicks,
              conversions,
              roas: spend > 0 ? revenue / spend : null,
            }, { onConflict: "user_id,platform,platform_adset_id,date" });
          totalRecords++;
        }
      }
    }

    await updateSyncLog(supabase, syncId, "success", totalRecords);
    return { success: true, records_synced: totalRecords };
  } catch (err) {
    console.error("Meta sync error:", err);
    await updateSyncLog(supabase, syncId, "error", 0, err.message);
    return { error: err.message };
  }
}

async function fetchMetaInsights(accountId: string, accessToken: string, since: string, until: string, level: string) {
  const fields = "spend,impressions,clicks,actions,action_values";
  const url = `https://graph.facebook.com/v21.0/${accountId}/insights?fields=${fields}&time_range={"since":"${since}","until":"${until}"}&time_increment=1&level=${level}&access_token=${accessToken}`;
  const res = await fetch(url);
  const data = await res.json();
  return data.data || null;
}

async function fetchMetaCampaignInsights(accountId: string, accessToken: string, since: string, until: string) {
  const fields = "campaign_id,campaign_name,campaign_status,spend,impressions,clicks,actions,action_values";
  const url = `https://graph.facebook.com/v21.0/${accountId}/insights?fields=${fields}&time_range={"since":"${since}","until":"${until}"}&time_increment=1&level=campaign&access_token=${accessToken}&limit=500`;
  const res = await fetch(url);
  const data = await res.json();
  return data.data || null;
}

async function fetchMetaAdsetInsights(accountId: string, accessToken: string, since: string, until: string) {
  const fields = "campaign_id,campaign_name,adset_id,adset_name,adset_status,spend,impressions,clicks,actions,action_values";
  const url = `https://graph.facebook.com/v21.0/${accountId}/insights?fields=${fields}&time_range={"since":"${since}","until":"${until}"}&time_increment=1&level=adset&access_token=${accessToken}&limit=500`;
  const res = await fetch(url);
  const data = await res.json();
  return data.data || null;
}

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

async function updateSyncLog(supabase: any, syncId: string, status: string, records: number, error?: string) {
  if (!syncId) return;
  await supabase
    .from("ad_sync_log")
    .update({
      status,
      records_synced: records,
      error_message: error || null,
      completed_at: new Date().toISOString(),
    })
    .eq("id", syncId);
}
