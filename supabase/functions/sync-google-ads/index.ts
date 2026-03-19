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

  // Parse optional client_id from request body
  let bodyClientId: string | null = null;
  let bodyDaysBack: number | null = null;
  let bodyAccountId: string | null = null;
  try {
    const body = await req.json();
    bodyClientId = body?.client_id || body?.clientId || null;
    bodyDaysBack = body?.days_back || null;
    bodyAccountId = body?.account_id || null;
  } catch { /* no body */ }

  if (userId) {
    let query = supabaseAdmin
      .from("platform_connections")
      .select("user_id, access_token, refresh_token, metadata, token_expires_at, client_id")
      .eq("user_id", userId)
      .eq("platform", "google");
    if (bodyClientId) {
      query = query.eq("client_id", bodyClientId);
    }
    const { data: conns } = await query;
    if (!conns || conns.length === 0) {
      return new Response(JSON.stringify({ success: true, records_synced: 0, message: "No Google connection found for this client" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    targetConnections = conns;
  } else {
    // Cron mode
    const { data: connections } = await supabaseAdmin
      .from("platform_connections")
      .select("user_id, access_token, refresh_token, metadata, token_expires_at, client_id")
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
      accessToken = await refreshGoogleToken(supabaseAdmin, conn.user_id, conn.refresh_token, conn.client_id);
      if (!accessToken) {
        results.push({ user_id: conn.user_id, error: "Token refresh failed" });
        continue;
      }
    }

    const daysBack = bodyDaysBack || 30;
    const result = await syncGoogleForUser(supabaseAdmin, conn.user_id, accessToken, conn.metadata, conn.client_id, daysBack, bodyAccountId);
    results.push(result);
  }

  // Return consistent format: aggregate records_synced across all connections
  const totalSynced = results.reduce((sum: number, r: any) => sum + (r.records_synced || 0), 0);
  const errors = results.filter((r: any) => r.error);
  const responseBody = errors.length === results.length
    ? { error: errors[0]?.error || "All connections failed" }
    : { success: true, records_synced: totalSynced, connections: results.length, results };
  return new Response(JSON.stringify(responseBody), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

async function refreshGoogleToken(supabase: any, userId: string, refreshToken: string, clientId: string | null = null): Promise<string | null> {
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
      // Update token scoped to the specific connection (user + platform + client)
      let updateQuery = supabase
        .from("platform_connections")
        .update({ access_token: data.access_token, token_expires_at: tokenExpiresAt })
        .eq("user_id", userId)
        .eq("platform", "google");
      if (clientId) {
        updateQuery = updateQuery.eq("client_id", clientId);
      }
      await updateQuery;
      return data.access_token;
    }
    console.error("Token refresh failed:", data);
    return null;
  } catch (err) {
    console.error("Token refresh error:", err);
    return null;
  }
}

async function syncGoogleForUser(supabase: any, userId: string, accessToken: string, metadata: any, clientId: string | null = null, daysBack: number = 30, targetAccountId: string | null = null) {
  const startTime = Date.now();
  const TIME_BUDGET_MS = 50_000; // 50s budget out of 60s edge function limit

  function hasTimeBudget() {
    return (Date.now() - startTime) < TIME_BUDGET_MS;
  }

  const { data: syncLog } = await supabase
    .from("ad_sync_log")
    .insert({ user_id: userId, platform: "google", status: "running" })
    .select("id")
    .single();
  const syncId = syncLog?.id;

  try {
    const developerToken = Deno.env.get("GOOGLE_DEVELOPER_TOKEN")!;
    let customers = metadata?.customers || [];

    if (customers.length === 0) {
      try {
        const customersRes = await fetch(
          "https://googleads.googleapis.com/v23/customers:listAccessibleCustomers",
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "developer-token": developerToken,
            },
          }
        );
        const responseText = await customersRes.text();
        try {
          const customersData = JSON.parse(responseText);
          customers = customersData.resourceNames || [];
          if (customers.length > 0) {
            await supabase
              .from("platform_connections")
              .update({ metadata: { customers } })
              .eq("user_id", userId)
              .eq("platform", "google");
          }
        } catch {
          console.error("Google Ads API returned non-JSON:", responseText.substring(0, 500));
        }
      } catch (err) {
        console.error("Failed to fetch customers:", err);
      }
    }

    if (customers.length === 0) {
      await updateSyncLog(supabase, syncId, "error", 0, "No customer accounts found.");
      return { error: "No customer accounts found." };
    }

    // Use requested days_back with 7-day chunks
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);
    const chunks = buildDateChunks(startDate, endDate, 7);
    console.log(`Google sync: ${daysBack} days, ${chunks.length} chunks, time budget ${TIME_BUDGET_MS}ms`);

    let totalRecords = 0;

    let timedOut = false;
    for (const customerResource of customers) {
      if (!hasTimeBudget()) { timedOut = true; break; }
      const customerId = customerResource.replace("customers/", "");
      console.log(`Resolving customer ${customerId}...`);
      const resolved = await getAccessibleCustomerIds(customerId, accessToken, developerToken);
      let customerIds = resolved.childIds;
      const loginCustomerId = resolved.mccId || customerId;
      console.log(`Customer ${customerId} resolved to: ${JSON.stringify(customerIds)}, loginCustomerId: ${loginCustomerId}`);

      // If a specific account_id was requested, only process that one
      if (targetAccountId) {
        if (customerIds.includes(targetAccountId)) {
          customerIds = [targetAccountId];
          console.log(`Scoped to target account: ${targetAccountId}`);
        } else {
          console.log(`Target account ${targetAccountId} not found under ${customerId}, skipping`);
          continue;
        }
      }
      for (const cid of customerIds) {
        if (!hasTimeBudget()) { timedOut = true; break; }
        for (const { since, until } of chunks) {
          if (!hasTimeBudget()) { timedOut = true; break; }
          // Daily account metrics
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
            `, loginCustomerId);

            if (dailyRows.length > 0) {
              const batch = dailyRows.map((row: any) => {
                const spend = (row.metrics?.costMicros || 0) / 1_000_000;
                const revenue = row.metrics?.conversionsValue || 0;
                const impressions = parseInt(row.metrics?.impressions || "0");
                const clicks = parseInt(row.metrics?.clicks || "0");
                const conversions = Math.round(row.metrics?.conversions || 0);
                return {
                  user_id: userId,
                  client_id: clientId,
                  account_id: cid,
                  platform: "google",
                  date: row.segments?.date,
                  spend, revenue, impressions, clicks, conversions,
                  cpc: clicks > 0 ? spend / clicks : null,
                  ctr: impressions > 0 ? (clicks / impressions) * 100 : null,
                  cpm: impressions > 0 ? (spend / impressions) * 1000 : null,
                  roas: spend > 0 ? revenue / spend : null,
                };
              });
              await supabase.from("ad_daily_metrics").upsert(batch, { onConflict: "user_id,platform,date,client_id" });
              totalRecords += batch.length;
            }
          } catch (err) {
            console.error(`Daily metrics error for ${cid} ${since}-${until}:`, err);
          }

          // Campaign metrics with impression share and bid strategy
          try {
            const campaignRows = await queryGoogleAds(cid, accessToken, developerToken, `
              SELECT
                campaign.id,
                campaign.name,
                campaign.status,
                campaign.bidding_strategy_type,
                campaign.advertising_channel_type,
                segments.date,
                metrics.cost_micros,
                metrics.impressions,
                metrics.clicks,
                metrics.conversions,
                metrics.conversions_value,
                metrics.search_impression_share,
                metrics.search_budget_lost_impression_share,
                metrics.search_rank_lost_impression_share
              FROM campaign
              WHERE segments.date BETWEEN '${since}' AND '${until}'
            `, loginCustomerId);

            console.log(`Campaign rows for ${cid} (${since}-${until}): ${campaignRows.length}`);
            if (campaignRows.length > 0) {
              const batch = campaignRows.map((row: any) => {
                const spend = (row.metrics?.costMicros || 0) / 1_000_000;
                const revenue = row.metrics?.conversionsValue || 0;
                const biddingType = row.campaign?.biddingStrategyType || null;
                const channelType = row.campaign?.advertisingChannelType || null;
                return {
                  user_id: userId,
                  client_id: clientId,
                  account_id: cid,
                  platform: "google",
                  platform_campaign_id: String(row.campaign?.id),
                  campaign_name: row.campaign?.name || "Unknown",
                  status: (row.campaign?.status || "UNKNOWN").toLowerCase(),
                  date: row.segments?.date,
                  spend, revenue,
                  impressions: parseInt(row.metrics?.impressions || "0"),
                  clicks: parseInt(row.metrics?.clicks || "0"),
                  conversions: Math.round(row.metrics?.conversions || 0),
                  roas: spend > 0 ? revenue / spend : null,
                  impression_share: row.metrics?.searchImpressionShare ?? null,
                  lost_is_budget: row.metrics?.searchBudgetLostImpressionShare ?? null,
                  lost_is_rank: row.metrics?.searchRankLostImpressionShare ?? null,
                  bidding_strategy_type: biddingType ? formatBiddingStrategy(biddingType) : null,
                  campaign_type: channelType ? formatChannelType(channelType) : null,
                };
              });
              await supabase.from("ad_campaigns").upsert(batch, { onConflict: "user_id,platform,platform_campaign_id,date" });
              totalRecords += batch.length;
            }
          } catch (err) {
            console.error(`Campaign metrics error for ${cid} ${since}-${until}:`, err);
          }

          // Ad group metrics
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
            `, loginCustomerId);

            if (adGroupRows.length > 0) {
              const batch = adGroupRows.map((row: any) => {
                const spend = (row.metrics?.costMicros || 0) / 1_000_000;
                const revenue = row.metrics?.conversionsValue || 0;
                return {
                  user_id: userId,
                  client_id: clientId,
                  account_id: cid,
                  platform: "google",
                  platform_campaign_id: String(row.campaign?.id),
                  platform_adset_id: String(row.adGroup?.id),
                  adset_name: row.adGroup?.name || "Unknown",
                  campaign_name: row.campaign?.name || "Unknown",
                  status: (row.adGroup?.status || "UNKNOWN").toLowerCase(),
                  date: row.segments?.date,
                  spend, revenue,
                  impressions: parseInt(row.metrics?.impressions || "0"),
                  clicks: parseInt(row.metrics?.clicks || "0"),
                  conversions: Math.round(row.metrics?.conversions || 0),
                  roas: spend > 0 ? revenue / spend : null,
                };
              });
              await supabase.from("ad_sets").upsert(batch, { onConflict: "user_id,platform,platform_adset_id,date" });
              totalRecords += batch.length;
            }
          } catch (err) {
            console.error(`Ad group metrics error for ${cid} ${since}-${until}:`, err);
          }

          // Ad-level metrics
          try {
            const adRows = await queryGoogleAds(cid, accessToken, developerToken, `
              SELECT
                campaign.id,
                campaign.name,
                ad_group.id,
                ad_group.name,
                ad_group_ad.ad.id,
                ad_group_ad.ad.name,
                ad_group_ad.ad.type,
                ad_group_ad.status,
                segments.date,
                metrics.cost_micros,
                metrics.impressions,
                metrics.clicks,
                metrics.conversions,
                metrics.conversions_value
              FROM ad_group_ad
              WHERE segments.date BETWEEN '${since}' AND '${until}'
            `, loginCustomerId);

            if (adRows.length > 0) {
              const batch = adRows.map((row: any) => {
                const spend = (row.metrics?.costMicros || 0) / 1_000_000;
                const revenue = row.metrics?.conversionsValue || 0;
                const adType = row.adGroupAd?.ad?.type || "";
                let format = "unknown";
                if (adType.includes("RESPONSIVE_SEARCH")) format = "responsive_search";
                else if (adType.includes("VIDEO")) format = "video";
                else if (adType.includes("RESPONSIVE_DISPLAY") || adType.includes("IMAGE")) format = "static";
                else if (adType.includes("SHOPPING") || adType.includes("SMART_SHOPPING")) format = "shopping";
                else if (adType.includes("PERFORMANCE_MAX")) format = "pmax";
                return {
                  user_id: userId,
                  client_id: clientId,
                  account_id: cid,
                  platform: "google",
                  platform_ad_id: String(row.adGroupAd?.ad?.id || ""),
                  platform_adset_id: String(row.adGroup?.id),
                  platform_campaign_id: String(row.campaign?.id),
                  ad_name: row.adGroupAd?.ad?.name || `Ad ${row.adGroupAd?.ad?.id}`,
                  adset_name: row.adGroup?.name || "Unknown",
                  campaign_name: row.campaign?.name || "Unknown",
                  status: (row.adGroupAd?.status || "UNKNOWN").toLowerCase(),
                  date: row.segments?.date,
                  spend, revenue,
                  impressions: parseInt(row.metrics?.impressions || "0"),
                  clicks: parseInt(row.metrics?.clicks || "0"),
                  conversions: Math.round(row.metrics?.conversions || 0),
                  roas: spend > 0 ? revenue / spend : null,
                  format,
                };
              });
              await supabase.from("ads").upsert(batch, { onConflict: "user_id,platform,platform_ad_id,date" });
              totalRecords += batch.length;
            }
          } catch (err) {
            console.error(`Ad metrics error for ${cid} ${since}-${until}:`, err);
          }

          // Keyword-level metrics (Google Search only)
          try {
            console.log(`Fetching keywords for customer ${cid}, ${since} to ${until}`);
            const kwRows = await queryGoogleAds(cid, accessToken, developerToken, `
              SELECT
                campaign.id,
                campaign.name,
                ad_group.id,
                ad_group.name,
                ad_group_criterion.keyword.text,
                ad_group_criterion.keyword.match_type,
                ad_group_criterion.status,
                ad_group_criterion.quality_info.quality_score,
                segments.date,
                metrics.cost_micros,
                metrics.impressions,
                metrics.clicks,
                metrics.conversions,
                metrics.conversions_value
              FROM keyword_view
              WHERE segments.date BETWEEN '${since}' AND '${until}'
            `, loginCustomerId);

            console.log(`Keyword rows returned for ${cid}: ${kwRows.length}`);

            if (kwRows.length > 0) {
              const batch = kwRows.map((row: any) => {
                const spend = (row.metrics?.costMicros || 0) / 1_000_000;
                const revenue = row.metrics?.conversionsValue || 0;
                return {
                  user_id: userId,
                  client_id: clientId,
                  account_id: cid,
                  platform: "google",
                  platform_campaign_id: String(row.campaign?.id),
                  platform_adset_id: String(row.adGroup?.id),
                  keyword_text: row.adGroupCriterion?.keyword?.text || "Unknown",
                  match_type: (row.adGroupCriterion?.keyword?.matchType || "UNSPECIFIED").toLowerCase(),
                  campaign_name: row.campaign?.name || "Unknown",
                  adset_name: row.adGroup?.name || "Unknown",
                  status: (row.adGroupCriterion?.status || "UNKNOWN").toLowerCase(),
                  quality_score: row.adGroupCriterion?.qualityInfo?.qualityScore ?? null,
                  date: row.segments?.date,
                  spend, revenue,
                  impressions: parseInt(row.metrics?.impressions || "0"),
                  clicks: parseInt(row.metrics?.clicks || "0"),
                  conversions: Math.round(row.metrics?.conversions || 0),
                  roas: spend > 0 ? revenue / spend : null,
                };
              });
              const { error: upsertErr } = await supabase.from("keywords").upsert(batch, { onConflict: "user_id,platform,platform_adset_id,keyword_text,match_type,date" });
              if (upsertErr) {
                console.error(`Keyword upsert error for ${cid}:`, upsertErr);
              } else {
                totalRecords += batch.length;
                console.log(`Upserted ${batch.length} keywords for ${cid}`);
              }
            }
          } catch (err) {
            console.error(`Keyword metrics error for ${cid} ${since}-${until}:`, err?.message || err);
          }

          // Search term report (Google Search only) — use smaller date windows to avoid CPU limits
          try {
            // Break the chunk into 7-day sub-chunks to keep volume manageable
            const stSubChunks = buildDateChunks(new Date(since), new Date(until), 7);
            for (const sub of stSubChunks) {
              try {
                console.log(`Fetching search terms for customer ${cid}, ${sub.since} to ${sub.until}`);
                const stRows = await queryGoogleAds(cid, accessToken, developerToken, `
                  SELECT
                    campaign.id,
                    campaign.name,
                    ad_group.id,
                    ad_group.name,
                    search_term_view.search_term,
                    segments.keyword.info.text,
                    segments.keyword.info.match_type,
                    segments.date,
                    metrics.cost_micros,
                    metrics.impressions,
                    metrics.clicks,
                    metrics.conversions,
                    metrics.conversions_value
                  FROM search_term_view
                  WHERE segments.date BETWEEN '${sub.since}' AND '${sub.until}'
                `, loginCustomerId);

                console.log(`Search term rows returned for ${cid}: ${stRows.length}`);

                if (stRows.length > 0) {
                  // Deduplicate: the API can return multiple rows for the same key within a batch
                  const deduped = new Map<string, any>();
                  for (const row of stRows) {
                    const searchTerm = row.searchTermView?.searchTerm || "Unknown";
                    const keywordText = row.segments?.keyword?.info?.text || "Unknown";
                    const date = row.segments?.date;
                    const adsetId = String(row.adGroup?.id);
                    const dedupeKey = `${adsetId}|${keywordText}|${searchTerm}|${date}`;

                    const spend = (row.metrics?.costMicros || 0) / 1_000_000;
                    const revenue = row.metrics?.conversionsValue || 0;

                    if (deduped.has(dedupeKey)) {
                      const existing = deduped.get(dedupeKey);
                      existing.spend += spend;
                      existing.revenue += revenue;
                      existing.impressions += parseInt(row.metrics?.impressions || "0");
                      existing.clicks += parseInt(row.metrics?.clicks || "0");
                      existing.conversions += Math.round(row.metrics?.conversions || 0);
                    } else {
                      deduped.set(dedupeKey, {
                        user_id: userId,
                        client_id: clientId,
                        account_id: cid,
                        platform: "google",
                        platform_campaign_id: String(row.campaign?.id),
                        platform_adset_id: adsetId,
                        search_term: searchTerm,
                        keyword_text: keywordText,
                        match_type: (row.segments?.keyword?.info?.matchType || "UNSPECIFIED").toLowerCase(),
                        campaign_name: row.campaign?.name || "Unknown",
                        adset_name: row.adGroup?.name || "Unknown",
                        date,
                        spend, revenue,
                        impressions: parseInt(row.metrics?.impressions || "0"),
                        clicks: parseInt(row.metrics?.clicks || "0"),
                        conversions: Math.round(row.metrics?.conversions || 0),
                        roas: 0, // recalculated below
                      });
                    }
                  }

                  const batch = Array.from(deduped.values()).map(r => ({
                    ...r,
                    roas: r.spend > 0 ? r.revenue / r.spend : null,
                  }));

                  // Upsert in sub-batches of 500 to stay within limits
                  for (let i = 0; i < batch.length; i += 500) {
                    const slice = batch.slice(i, i + 500);
                    const { error: upsertErr } = await supabase.from("search_terms").upsert(slice, { onConflict: "user_id,platform,platform_adset_id,keyword_text,search_term,date" });
                    if (upsertErr) {
                      console.error(`Search term upsert error for ${cid}:`, upsertErr);
                    } else {
                      totalRecords += slice.length;
                    }
                  }
                  console.log(`Upserted ${batch.length} search terms for ${cid} (${sub.since} to ${sub.until})`);
                }
              } catch (err) {
                console.error(`Search term error for ${cid} ${sub.since}-${sub.until}:`, err?.message || err);
              }
            }
          } catch (err) {
            console.error(`Search term outer error for ${cid} ${since}-${until}:`, err?.message || err);
          }
        }
      }
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    const status = timedOut ? "success" : "success";
    const message = timedOut
      ? `Partial sync (${elapsed}s elapsed, time budget reached). Synced ${totalRecords} records.`
      : `Full sync complete in ${elapsed}s. Synced ${totalRecords} records.`;
    console.log(message);
    await updateSyncLog(supabase, syncId, "success", totalRecords, timedOut ? "Partial: time budget reached" : undefined);
    return { success: true, records_synced: totalRecords, partial: timedOut, message };
  } catch (err) {
    console.error("Google sync error:", err);
    await updateSyncLog(supabase, syncId, "error", 0, err.message);
    return { error: err.message };
  }
}

function buildDateChunks(start: Date, end: Date, chunkDays: number): { since: string; until: string }[] {
  const chunks: { since: string; until: string }[] = [];
  let current = new Date(start);
  while (current <= end) {
    const chunkEnd = new Date(current);
    chunkEnd.setDate(chunkEnd.getDate() + chunkDays - 1);
    if (chunkEnd > end) chunkEnd.setTime(end.getTime());
    chunks.push({ since: formatDate(current), until: formatDate(chunkEnd) });
    current = new Date(chunkEnd);
    current.setDate(current.getDate() + 1);
  }
  return chunks;
}

interface ResolvedAccounts {
  mccId: string | null; // The MCC parent ID to use as login-customer-id, or null if direct account
  childIds: string[];   // The actual accounts to query
}

async function getAccessibleCustomerIds(customerId: string, accessToken: string, developerToken: string): Promise<ResolvedAccounts> {
  // First, check if this is a manager account by trying to list child accounts
  try {
    const childRows = await queryGoogleAds(customerId, accessToken, developerToken, `
      SELECT customer_client.id, customer_client.manager, customer_client.descriptive_name
      FROM customer_client
      WHERE customer_client.status = 'ENABLED'
    `, customerId);
    // Log all children for debugging
    const allChildren = childRows.map((r: any) => ({
      id: String(r.customerClient?.id),
      name: r.customerClient?.descriptiveName || "unnamed",
      manager: r.customerClient?.manager || false,
    }));
    console.log(`Customer ${customerId} children: ${JSON.stringify(allChildren)}`);

    const nonManagerChildren = childRows
      .filter((r: any) => !r.customerClient?.manager)
      .map((r: any) => String(r.customerClient?.id));
    if (nonManagerChildren.length > 0) {
      console.log(`Customer ${customerId} is MCC with ${nonManagerChildren.length} non-manager children: ${JSON.stringify(nonManagerChildren)}`);
      return { mccId: customerId, childIds: nonManagerChildren };
    }
    // If the only child is itself, it's a direct account
    const allIds = childRows.map((r: any) => String(r.customerClient?.id));
    if (allIds.includes(customerId)) {
      return { mccId: null, childIds: [customerId] };
    }
  } catch (err) {
    console.log(`customer_client query failed for ${customerId}, treating as direct account: ${err?.message || err}`);
  }

  // Fallback: try querying directly
  try {
    const testRows = await queryGoogleAds(customerId, accessToken, developerToken, `
      SELECT customer.id FROM customer LIMIT 1
    `);
    if (testRows.length > 0) return { mccId: null, childIds: [customerId] };
  } catch {
    // ignore
  }

  return { mccId: null, childIds: [customerId] };
}

async function queryGoogleAds(customerId: string, accessToken: string, developerToken: string, query: string, loginCustomerId?: string): Promise<any[]> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "developer-token": developerToken,
    "Content-Type": "application/json",
  };
  // When querying a child account under an MCC, set login-customer-id to the MCC
  if (loginCustomerId && loginCustomerId !== customerId) {
    headers["login-customer-id"] = loginCustomerId;
  }
  const res = await fetch(
    `https://googleads.googleapis.com/v23/customers/${customerId}/googleAds:searchStream`,
    {
      method: "POST",
      headers,
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

function formatBiddingStrategy(type: string): string {
  const map: Record<string, string> = {
    TARGET_CPA: "Target CPA",
    TARGET_ROAS: "Target ROAS",
    MAXIMIZE_CONVERSIONS: "Max Conversions",
    MAXIMIZE_CONVERSION_VALUE: "Max Conv. Value",
    MANUAL_CPC: "Manual CPC",
    ENHANCED_CPC: "Enhanced CPC",
    TARGET_SPEND: "Max Clicks",
    MANUAL_CPM: "Manual CPM",
    TARGET_CPM: "Target CPM",
    MAXIMIZE_CLICKS: "Max Clicks",
    PERCENT_CPC: "Percent CPC",
    TARGET_IMPRESSION_SHARE: "Target Imp. Share",
    COMMISSION: "Commission",
  };
  return map[type] || type.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
}

function formatChannelType(type: string): string {
  const map: Record<string, string> = {
    SEARCH: "Search",
    DISPLAY: "Display",
    SHOPPING: "Shopping",
    VIDEO: "Video",
    MULTI_CHANNEL: "Performance Max",
    PERFORMANCE_MAX: "Performance Max",
    SMART: "Smart",
    DISCOVERY: "Demand Gen",
    DEMAND_GEN: "Demand Gen",
    LOCAL: "Local",
    HOTEL: "Hotel",
    LOCAL_SERVICES: "Local Services",
  };
  return map[type] || type.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
}
