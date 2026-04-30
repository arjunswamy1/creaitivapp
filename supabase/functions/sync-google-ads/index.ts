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
        .select("user_id, access_token, refresh_token, metadata, token_expires_at, client_id, selected_ad_account")
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
      .select("user_id, access_token, refresh_token, metadata, token_expires_at, client_id, selected_ad_account")
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
      const refreshResult = await refreshGoogleToken(supabaseAdmin, conn.user_id, conn.refresh_token, conn.client_id);
      if (!refreshResult.access_token) {
        results.push({
          user_id: conn.user_id,
          client_id: conn.client_id,
          error: `Token refresh failed: ${refreshResult.error || "unknown"}${refreshResult.error_description ? " - " + refreshResult.error_description : ""}`,
          needs_reauth: refreshResult.needs_reauth,
        });
        continue;
      }
      accessToken = refreshResult.access_token;
    }

      const daysBack = bodyDaysBack || 30;
      const selectedAccountId = conn.selected_ad_account?.id || conn.selected_ad_account?.account_id || null;
      const preferredHistoricalAccountId = !bodyAccountId && !selectedAccountId
        ? await resolvePreferredGoogleAccountId(supabaseAdmin, conn.user_id, conn.client_id)
        : null;
      const effectiveAccountId = bodyAccountId || selectedAccountId || preferredHistoricalAccountId;
      const result = await syncGoogleForUser(
        supabaseAdmin,
        conn.user_id,
        accessToken,
        conn.metadata,
        conn.client_id,
        daysBack,
        effectiveAccountId
      );
    results.push(result);
  }

  // Return consistent format: aggregate records_synced across all connections
  const totalSynced = results.reduce((sum: number, r: any) => sum + (r.records_synced || 0), 0);
  const errors = results.filter((r: any) => r.error);
  const responseBody = errors.length === results.length
    ? { error: errors[0]?.error || "All connections failed", results }
    : { success: true, records_synced: totalSynced, connections: results.length, results };
  return new Response(JSON.stringify(responseBody), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

async function refreshGoogleToken(
  supabase: any,
  userId: string,
  refreshToken: string,
  clientId: string | null = null,
): Promise<{ access_token: string | null; error?: string; error_description?: string; needs_reauth?: boolean }> {
  if (!refreshToken) return { access_token: null, error: "no_refresh_token", needs_reauth: true };
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
      let updateQuery = supabase
        .from("platform_connections")
        .update({ access_token: data.access_token, token_expires_at: tokenExpiresAt })
        .eq("user_id", userId)
        .eq("platform", "google");
      if (clientId) {
        updateQuery = updateQuery.eq("client_id", clientId);
      }
      await updateQuery;
      return { access_token: data.access_token };
    }

    console.error("Token refresh failed:", data);

    // For permanent failures, clear refresh_token so UI surfaces a re-auth prompt
    const permanentErrors = ["invalid_grant", "unauthorized_client", "invalid_client"];
    const needsReauth = permanentErrors.includes(data.error);
    if (needsReauth) {
      let clearQuery = supabase
        .from("platform_connections")
        .update({
          refresh_token: null,
          metadata: {
            validation_error: `refresh_${data.error}`,
            validation_detail: data.error_description || data.error,
            validated_at: new Date().toISOString(),
          },
        })
        .eq("user_id", userId)
        .eq("platform", "google");
      if (clientId) clearQuery = clearQuery.eq("client_id", clientId);
      await clearQuery;
      console.warn(`[refreshGoogleToken] Cleared refresh_token for user ${userId} client ${clientId} due to ${data.error}`);
    }

    return {
      access_token: null,
      error: data.error,
      error_description: data.error_description,
      needs_reauth: needsReauth,
    };
  } catch (err) {
    console.error("Token refresh error:", err);
    return { access_token: null, error: "network_error", error_description: String(err) };
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
                campaign.campaign_budget,
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

            // Fetch budget amounts in a separate query (no segments)
            let budgetMap = new Map<string, number>();
            try {
              const budgetRows = await queryGoogleAds(cid, accessToken, developerToken, `
                SELECT
                  campaign.id,
                  campaign_budget.amount_micros
                FROM campaign
                WHERE campaign.status IN ('ENABLED', 'PAUSED')
              `, loginCustomerId);
              for (const br of budgetRows) {
                const campId = String(br.campaign?.id);
                const amountMicros = br.campaignBudget?.amountMicros;
                if (amountMicros && amountMicros !== "0") {
                  budgetMap.set(campId, Number(amountMicros) / 1_000_000);
                }
              }
              console.log(`Budget data fetched for ${budgetMap.size} campaigns on ${cid}`);
            } catch (budgetErr) {
              console.error(`Budget query error for ${cid} (non-fatal):`, budgetErr?.message || budgetErr);
            }

            // Separate query for bid strategy details (no metrics/segments needed)
            let bidStrategyMap = new Map<string, Record<string, any>>();
            try {
              // Step 1: Simple query to get campaign IDs and their portfolio strategy references
              const bidRows = await queryGoogleAds(cid, accessToken, developerToken, `
                SELECT
                  campaign.id,
                  campaign.bidding_strategy_type,
                  campaign.bidding_strategy
                FROM campaign
                WHERE campaign.status IN ('ENABLED', 'PAUSED')
              `, loginCustomerId);
              console.log(`Bid strategy base query returned ${bidRows.length} rows for ${cid}`);
              if (bidRows.length > 0) {
                console.log(`Sample: ${JSON.stringify(bidRows[0]?.campaign || {})}`);
              }

              const portfolioStrategyIds = new Set<string>();
              const campaignToPortfolio = new Map<string, string>();

              for (const br of bidRows) {
                const c = br.campaign || {};
                const campaignId = String(c.id);
                // biddingStrategy is a resource name like "customers/123/biddingStrategies/456"
                if (c.biddingStrategy) {
                  portfolioStrategyIds.add(c.biddingStrategy);
                  campaignToPortfolio.set(campaignId, c.biddingStrategy);
                  console.log(`Campaign ${campaignId} uses portfolio strategy: ${c.biddingStrategy}`);
                }
              }

              // Step 2: Try campaign-level strategy fields (only works for non-portfolio strategies)
              try {
                const directBidRows = await queryGoogleAds(cid, accessToken, developerToken, `
                  SELECT
                    campaign.id,
                    campaign.maximize_clicks.max_cpc_bid_ceiling_micros,
                    campaign.maximize_conversions.target_cpa_micros,
                    campaign.maximize_conversion_value.target_roas,
                    campaign.target_cpa.target_cpa_micros,
                    campaign.target_cpa.cpc_bid_ceiling_micros,
                    campaign.target_roas.target_roas
                  FROM campaign
                  WHERE campaign.status IN ('ENABLED', 'PAUSED')
                `, loginCustomerId);
                console.log(`Direct bid strategy query returned ${directBidRows.length} rows for ${cid}`);
                for (const br of directBidRows) {
                  const bidDetails: Record<string, any> = {};
                  const c = br.campaign || {};
                  if (c.maximizeClicks?.maxCpcBidCeilingMicros && c.maximizeClicks.maxCpcBidCeilingMicros !== "0")
                    bidDetails.maxCpcBidCeiling = Number(c.maximizeClicks.maxCpcBidCeilingMicros) / 1_000_000;
                  if (c.maximizeConversions?.targetCpaMicros && c.maximizeConversions.targetCpaMicros !== "0")
                    bidDetails.targetCpa = Number(c.maximizeConversions.targetCpaMicros) / 1_000_000;
                  if (c.maximizeConversionValue?.targetRoas && c.maximizeConversionValue.targetRoas !== 0)
                    bidDetails.targetRoas = Number(c.maximizeConversionValue.targetRoas);
                  if (c.targetCpa?.targetCpaMicros && c.targetCpa.targetCpaMicros !== "0")
                    bidDetails.targetCpa = Number(c.targetCpa.targetCpaMicros) / 1_000_000;
                  if (c.targetCpa?.cpcBidCeilingMicros && c.targetCpa.cpcBidCeilingMicros !== "0")
                    bidDetails.cpcBidCeiling = Number(c.targetCpa.cpcBidCeilingMicros) / 1_000_000;
                  if (c.targetRoas?.targetRoas && c.targetRoas.targetRoas !== 0)
                    bidDetails.targetRoas = Number(c.targetRoas.targetRoas);
                  if (Object.keys(bidDetails).length > 0) {
                    bidStrategyMap.set(String(c.id), bidDetails);
                  }
                }
              } catch (directErr) {
                console.error(`Direct bid strategy query error for ${cid} (non-fatal):`, directErr?.message || directErr);
              }

              // Step 3: Query portfolio bidding_strategy resource for shared strategies
              if (portfolioStrategyIds.size > 0) {
                console.log(`Found ${portfolioStrategyIds.size} portfolio bidding strategies for ${cid}, querying bidding_strategy resource...`);
                try {
                  // First try querying on child account with MCC header
                  const portfolioRows = await queryGoogleAds(cid, accessToken, developerToken, `
                    SELECT
                      bidding_strategy.resource_name,
                      bidding_strategy.id,
                      bidding_strategy.name,
                      bidding_strategy.type
                    FROM bidding_strategy
                  `, loginCustomerId);
                  console.log(`Portfolio basic query on child ${cid} with header ${loginCustomerId}: ${portfolioRows.length} rows`);

                  let allPortfolioRows = portfolioRows;
                  // If child returns 0, try querying MCC directly
                  if (allPortfolioRows.length === 0 && loginCustomerId && loginCustomerId !== cid) {
                    console.log(`Retrying bidding_strategy on MCC ${loginCustomerId} directly...`);
                    const mccRows = await queryGoogleAds(loginCustomerId, accessToken, developerToken, `
                      SELECT
                        bidding_strategy.resource_name,
                        bidding_strategy.id,
                        bidding_strategy.name,
                        bidding_strategy.type
                      FROM bidding_strategy
                    `);
                    console.log(`Portfolio basic query on MCC ${loginCustomerId}: ${mccRows.length} rows`);
                    allPortfolioRows = mccRows;
                  }

                  if (allPortfolioRows.length > 0) {
                    console.log(`Sample portfolio: ${JSON.stringify(allPortfolioRows[0])}`);
                  }

                  const portfolioMap = new Map<string, Record<string, any>>();
                  for (const pr of allPortfolioRows) {
                    const bs = pr.biddingStrategy || {};
                    const resourceName = bs.resourceName || `customers/${cid}/biddingStrategies/${bs.id}`;
                    const details: Record<string, any> = { portfolioName: bs.name, portfolioType: bs.type };
                    console.log(`Found portfolio strategy: ${resourceName} type=${bs.type}`);

                    // Query detailed fields per strategy type
                    try {
                      const ownerCid = resourceName.match(/customers\/(\d+)\//)?.[1] || cid;
                      const headerCid = ownerCid === cid ? loginCustomerId : undefined;
                      let detailQuery = "";
                      if (bs.type === "MAXIMIZE_CLICKS" || bs.type === "TARGET_SPEND") {
                        detailQuery = `SELECT bidding_strategy.id, bidding_strategy.maximize_clicks.max_cpc_bid_micros, bidding_strategy.target_spend.cpc_bid_ceiling_micros FROM bidding_strategy WHERE bidding_strategy.id = ${bs.id}`;
                      } else if (bs.type === "MAXIMIZE_CONVERSIONS" || bs.type === "TARGET_CPA") {
                        detailQuery = `SELECT bidding_strategy.id, bidding_strategy.maximize_conversions.target_cpa_micros, bidding_strategy.target_cpa.target_cpa_micros, bidding_strategy.target_cpa.cpc_bid_ceiling_micros FROM bidding_strategy WHERE bidding_strategy.id = ${bs.id}`;
                      } else if (bs.type === "MAXIMIZE_CONVERSION_VALUE" || bs.type === "TARGET_ROAS") {
                        detailQuery = `SELECT bidding_strategy.id, bidding_strategy.maximize_conversion_value.target_roas, bidding_strategy.target_roas.target_roas FROM bidding_strategy WHERE bidding_strategy.id = ${bs.id}`;
                      }
                      if (detailQuery) {
                        const detailRows = await queryGoogleAds(ownerCid, accessToken, developerToken, detailQuery, headerCid);
                        if (detailRows.length > 0) {
                          const d = detailRows[0].biddingStrategy || {};
                          console.log(`Detail for strategy ${bs.id}: ${JSON.stringify(d)}`);
                          if (d.maximizeClicks?.maxCpcBidMicros && d.maximizeClicks.maxCpcBidMicros !== "0")
                            details.maxCpcBidCeiling = Number(d.maximizeClicks.maxCpcBidMicros) / 1_000_000;
                          if (d.targetSpend?.cpcBidCeilingMicros && d.targetSpend.cpcBidCeilingMicros !== "0")
                            details.maxCpcBidCeiling = Number(d.targetSpend.cpcBidCeilingMicros) / 1_000_000;
                          if (d.maximizeConversions?.targetCpaMicros && d.maximizeConversions.targetCpaMicros !== "0")
                            details.targetCpa = Number(d.maximizeConversions.targetCpaMicros) / 1_000_000;
                          if (d.targetCpa?.targetCpaMicros && d.targetCpa.targetCpaMicros !== "0")
                            details.targetCpa = Number(d.targetCpa.targetCpaMicros) / 1_000_000;
                          if (d.targetCpa?.cpcBidCeilingMicros && d.targetCpa.cpcBidCeilingMicros !== "0")
                            details.cpcBidCeiling = Number(d.targetCpa.cpcBidCeilingMicros) / 1_000_000;
                          if (d.maximizeConversionValue?.targetRoas && d.maximizeConversionValue.targetRoas !== 0)
                            details.targetRoas = Number(d.maximizeConversionValue.targetRoas);
                          if (d.targetRoas?.targetRoas && d.targetRoas.targetRoas !== 0)
                            details.targetRoas = Number(d.targetRoas.targetRoas);
                        }
                      }
                    } catch (detailErr) {
                      console.error(`Detail query error for strategy ${bs.id} (non-fatal):`, detailErr?.message || detailErr);
                    }

                    // Store under all possible resource name formats
                    portfolioMap.set(resourceName, details);
                    portfolioMap.set(`customers/${cid}/biddingStrategies/${bs.id}`, details);
                    if (loginCustomerId) portfolioMap.set(`customers/${loginCustomerId}/biddingStrategies/${bs.id}`, details);
                  }

                  // Merge portfolio details into campaigns
                  for (const [campaignId, resourceName] of campaignToPortfolio) {
                    const portfolioDetails = portfolioMap.get(resourceName);
                    if (portfolioDetails) {
                      const existing = bidStrategyMap.get(campaignId) || {};
                      bidStrategyMap.set(campaignId, { ...existing, ...portfolioDetails });
                    } else {
                      console.log(`No portfolio match for campaign ${campaignId}, resource: ${resourceName}`);
                    }
                  }
                  console.log(`Portfolio details merged. Total campaigns with bid details: ${bidStrategyMap.size}`);
                } catch (portfolioErr) {
                  console.error(`Portfolio bidding_strategy query error for ${cid} (non-fatal):`, portfolioErr?.message || portfolioErr);
                }
              }

              console.log(`Final bid strategy details for ${cid}: ${bidStrategyMap.size} campaigns with details`);

              // Bulk-update bid_strategy_details on ALL existing rows for this account
              if (bidStrategyMap.size > 0) {
                let updatedCount = 0;
                for (const [campaignId, details] of bidStrategyMap) {
                  const { error: updateErr, count } = await supabase
                    .from("ad_campaigns")
                    .update({ bid_strategy_details: details })
                    .eq("platform_campaign_id", campaignId)
                    .eq("account_id", cid)
                    .eq("platform", "google");
                  if (updateErr) {
                    console.error(`Failed to update bid details for campaign ${campaignId}:`, updateErr.message);
                  } else {
                    updatedCount++;
                  }
                }
                console.log(`Bulk-updated bid_strategy_details for ${updatedCount}/${bidStrategyMap.size} campaigns on account ${cid}`);
              }
            } catch (bidErr) {
              console.error(`Bid strategy query error for ${cid} (non-fatal):`, bidErr?.message || bidErr);
            }

            console.log(`Campaign rows for ${cid} (${since}-${until}): ${campaignRows.length}`);
            if (campaignRows.length > 0) {
              const batch = campaignRows.map((row: any) => {
                const spend = (row.metrics?.costMicros || 0) / 1_000_000;
                const revenue = row.metrics?.conversionsValue || 0;
                const biddingType = row.campaign?.biddingStrategyType || null;
                const channelType = row.campaign?.advertisingChannelType || null;
                const campaignId = String(row.campaign?.id);
                const bidDetails = bidStrategyMap.get(campaignId) || null;

                return {
                  user_id: userId,
                  client_id: clientId,
                  account_id: cid,
                  platform: "google",
                  platform_campaign_id: campaignId,
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
                  bid_strategy_details: bidDetails,
                  daily_budget: budgetMap.get(campaignId) ?? null,
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
  return chunks.reverse();
}

async function resolvePreferredGoogleAccountId(
  supabase: any,
  userId: string,
  clientId: string | null,
): Promise<string | null> {
  if (!clientId) return null;

  const { data, error } = await supabase
    .from("ad_campaigns")
    .select("account_id, date")
    .eq("user_id", userId)
    .eq("client_id", clientId)
    .eq("platform", "google")
    .not("account_id", "is", null)
    .order("date", { ascending: false })
    .limit(50);

  if (error) {
    console.warn(`[resolvePreferredGoogleAccountId] ${error.message}`);
    return null;
  }

  const accountId = data?.find((row: any) => row.account_id)?.account_id ?? null;
  if (accountId) {
    console.log(`[resolvePreferredGoogleAccountId] Using historical account ${accountId} for client ${clientId}`);
  }
  return accountId;
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
  return d.toISOString().substring(0, 10);
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
