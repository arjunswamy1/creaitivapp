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

  let targetConnections: any[] = [];

  if (userId) {
    const { data: conn } = await supabaseAdmin
      .from("platform_connections")
      .select("user_id, access_token, refresh_token, metadata, token_expires_at")
      .eq("user_id", userId)
      .eq("platform", "google")
      .single();
    if (!conn) {
      return new Response(JSON.stringify({ error: "No Google connection found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    targetConnections = [conn];
  } else {
    // Cron mode
    const { data: connections } = await supabaseAdmin
      .from("platform_connections")
      .select("user_id, access_token, refresh_token, metadata, token_expires_at")
      .eq("platform", "google");
    if (!connections || connections.length === 0) {
      return new Response(JSON.stringify({ message: "No google connections found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    targetConnections = connections;
  }

  const results = [];
  for (const conn of targetConnections) {
    // Refresh token if expired
    let accessToken = conn.access_token;
    if (conn.token_expires_at && new Date(conn.token_expires_at) < new Date()) {
      accessToken = await refreshGoogleToken(supabaseAdmin, conn.user_id, conn.refresh_token);
      if (!accessToken) {
        results.push({ user_id: conn.user_id, error: "Token refresh failed" });
        continue;
      }
    }

    const result = await syncGoogleForUser(supabaseAdmin, conn.user_id, accessToken, conn.metadata);
    results.push(result);
  }

  return new Response(JSON.stringify(userId ? results[0] : { results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

async function refreshGoogleToken(supabase: any, userId: string, refreshToken: string): Promise<string | null> {
  if (!refreshToken) return null;
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
        client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });
    const data = await res.json();
    if (data.access_token) {
      const tokenExpiresAt = data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000).toISOString()
        : null;
      await supabase
        .from("platform_connections")
        .update({ access_token: data.access_token, token_expires_at: tokenExpiresAt })
        .eq("user_id", userId)
        .eq("platform", "google");
      return data.access_token;
    }
    console.error("Token refresh failed:", data);
    return null;
  } catch (err) {
    console.error("Token refresh error:", err);
    return null;
  }
}

async function syncGoogleForUser(supabase: any, userId: string, accessToken: string, metadata: any) {
  const { data: syncLog } = await supabase
    .from("ad_sync_log")
    .insert({ user_id: userId, platform: "google", status: "running" })
    .select("id")
    .single();
  const syncId = syncLog?.id;

  try {
    const developerToken = Deno.env.get("GOOGLE_DEVELOPER_TOKEN")!;
    const customers = metadata?.customers || [];

    if (customers.length === 0) {
      await updateSyncLog(supabase, syncId, "error", 0, "No customer accounts found");
      return { error: "No customer accounts found" };
    }

    // Date range: last 7 days
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);
    const since = formatDate(startDate);
    const until = formatDate(endDate);

    let totalRecords = 0;

    for (const customerResource of customers) {
      const customerId = customerResource.replace("customers/", "");

      // First try to find accessible MCC child accounts, fallback to direct query
      const customerIds = await getAccessibleCustomerIds(customerId, accessToken, developerToken);

      for (const cid of customerIds) {
        // Fetch daily account metrics
        try {
          const dailyRows = await queryGoogleAds(cid, accessToken, developerToken, `
            SELECT
              segments.date,
              metrics.cost_micros,
              metrics.impressions,
              metrics.clicks,
              metrics.conversions,
              metrics.conversions_value
            FROM customer
            WHERE segments.date BETWEEN '${since}' AND '${until}'
          `);

          for (const row of dailyRows) {
            const spend = (row.metrics?.costMicros || 0) / 1_000_000;
            const revenue = row.metrics?.conversionsValue || 0;
            const impressions = parseInt(row.metrics?.impressions || "0");
            const clicks = parseInt(row.metrics?.clicks || "0");
            const conversions = Math.round(row.metrics?.conversions || 0);

            await supabase
              .from("ad_daily_metrics")
              .upsert({
                user_id: userId,
                platform: "google",
                date: row.segments?.date,
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
        } catch (err) {
          console.error(`Daily metrics error for ${cid}:`, err);
        }

        // Fetch campaign-level metrics
        try {
          const campaignRows = await queryGoogleAds(cid, accessToken, developerToken, `
            SELECT
              campaign.id,
              campaign.name,
              campaign.status,
              segments.date,
              metrics.cost_micros,
              metrics.impressions,
              metrics.clicks,
              metrics.conversions,
              metrics.conversions_value
            FROM campaign
            WHERE segments.date BETWEEN '${since}' AND '${until}'
          `);

          for (const row of campaignRows) {
            const spend = (row.metrics?.costMicros || 0) / 1_000_000;
            const revenue = row.metrics?.conversionsValue || 0;

            await supabase
              .from("ad_campaigns")
              .upsert({
                user_id: userId,
                platform: "google",
                platform_campaign_id: String(row.campaign?.id),
                campaign_name: row.campaign?.name || "Unknown",
                status: (row.campaign?.status || "UNKNOWN").toLowerCase(),
                date: row.segments?.date,
                spend,
                revenue,
                impressions: parseInt(row.metrics?.impressions || "0"),
                clicks: parseInt(row.metrics?.clicks || "0"),
                conversions: Math.round(row.metrics?.conversions || 0),
                roas: spend > 0 ? revenue / spend : null,
              }, { onConflict: "user_id,platform,platform_campaign_id,date" });
            totalRecords++;
          }
        } catch (err) {
          console.error(`Campaign metrics error for ${cid}:`, err);
        }

        // Fetch ad group level metrics
        try {
          const adGroupRows = await queryGoogleAds(cid, accessToken, developerToken, `
            SELECT
              campaign.id,
              campaign.name,
              ad_group.id,
              ad_group.name,
              ad_group.status,
              segments.date,
              metrics.cost_micros,
              metrics.impressions,
              metrics.clicks,
              metrics.conversions,
              metrics.conversions_value
            FROM ad_group
            WHERE segments.date BETWEEN '${since}' AND '${until}'
          `);

          for (const row of adGroupRows) {
            const spend = (row.metrics?.costMicros || 0) / 1_000_000;
            const revenue = row.metrics?.conversionsValue || 0;

            await supabase
              .from("ad_sets")
              .upsert({
                user_id: userId,
                platform: "google",
                platform_campaign_id: String(row.campaign?.id),
                platform_adset_id: String(row.adGroup?.id),
                adset_name: row.adGroup?.name || "Unknown",
                campaign_name: row.campaign?.name || "Unknown",
                status: (row.adGroup?.status || "UNKNOWN").toLowerCase(),
                date: row.segments?.date,
                spend,
                revenue,
                impressions: parseInt(row.metrics?.impressions || "0"),
                clicks: parseInt(row.metrics?.clicks || "0"),
                conversions: Math.round(row.metrics?.conversions || 0),
                roas: spend > 0 ? revenue / spend : null,
              }, { onConflict: "user_id,platform,platform_adset_id,date" });
            totalRecords++;
          }
        } catch (err) {
          console.error(`Ad group metrics error for ${cid}:`, err);
        }
      }
    }

    await updateSyncLog(supabase, syncId, "success", totalRecords);
    return { success: true, records_synced: totalRecords };
  } catch (err) {
    console.error("Google sync error:", err);
    await updateSyncLog(supabase, syncId, "error", 0, err.message);
    return { error: err.message };
  }
}

async function getAccessibleCustomerIds(customerId: string, accessToken: string, developerToken: string): Promise<string[]> {
  // Try querying directly first - if it works, this is a direct account
  try {
    const testRows = await queryGoogleAds(customerId, accessToken, developerToken, `
      SELECT customer.id FROM customer LIMIT 1
    `);
    if (testRows.length > 0) return [customerId];
  } catch {
    // May be an MCC - try listing child accounts
  }

  try {
    const childRows = await queryGoogleAds(customerId, accessToken, developerToken, `
      SELECT customer_client.id, customer_client.manager FROM customer_client WHERE customer_client.status = 'ENABLED'
    `);
    return childRows
      .filter((r: any) => !r.customerClient?.manager)
      .map((r: any) => String(r.customerClient?.id));
  } catch {
    return [customerId];
  }
}

async function queryGoogleAds(customerId: string, accessToken: string, developerToken: string, query: string): Promise<any[]> {
  const res = await fetch(
    `https://googleads.googleapis.com/v18/customers/${customerId}/googleAds:searchStream`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "developer-token": developerToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    }
  );

  const data = await res.json();
  if (data.error) {
    throw new Error(data.error.message || JSON.stringify(data.error));
  }

  // searchStream returns array of batches
  const results: any[] = [];
  if (Array.isArray(data)) {
    for (const batch of data) {
      if (batch.results) results.push(...batch.results);
    }
  }
  return results;
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
