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

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return errResponse("Unauthorized", 401);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  let body: { target_subs: number; client_id: string; month?: string };
  try {
    body = await req.json();
  } catch {
    return errResponse("Invalid JSON body", 400);
  }

  const { target_subs, client_id, month } = body;
  if (!target_subs || !client_id) {
    return errResponse("target_subs and client_id are required", 400);
  }

  // Determine target month (default: next month)
  const now = new Date();
  let targetYear: number, targetMonth: number;
  if (month) {
    const [y, m] = month.split("-").map(Number);
    targetYear = y;
    targetMonth = m;
  } else {
    targetYear = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear();
    targetMonth = now.getMonth() === 11 ? 1 : now.getMonth() + 2;
  }

  const daysInTargetMonth = new Date(targetYear, targetMonth, 0).getDate();
  const targetMonthName = new Date(targetYear, targetMonth - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" });

  // 90-day lookback
  const lookbackEnd = formatDate(now);
  const lookbackStart = formatDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 90));

  // Fetch campaign-level performance (last 90 days)
  const { data: campaignData, error: campErr } = await supabase
    .from("ad_campaigns")
    .select("platform, campaign_name, platform_campaign_id, spend, conversions, revenue, clicks, impressions, date, status")
    .eq("client_id", client_id)
    .gte("date", lookbackStart)
    .lte("date", lookbackEnd)
    .order("date", { ascending: true });

  if (campErr) return errResponse(campErr.message);

  // Fetch daily metrics by platform
  const { data: dailyMetrics, error: dailyErr } = await supabase
    .from("ad_daily_metrics")
    .select("platform, spend, date")
    .eq("client_id", client_id)
    .gte("date", lookbackStart)
    .lte("date", lookbackEnd)
    .order("date", { ascending: true });

  if (dailyErr) return errResponse(dailyErr.message);

  // Fetch subbly subscriptions for the same period
  const fromUTC = lookbackStart + "T00:00:00.000Z";
  const toUTC = formatDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)) + "T04:59:59.999Z";

  const { data: subsData, error: subErr } = await supabase
    .from("subbly_subscriptions")
    .select("id, subbly_created_at")
    .eq("client_id", client_id)
    .gte("subbly_created_at", fromUTC)
    .lte("subbly_created_at", toUTC);

  if (subErr) return errResponse(subErr.message);

  // Build daily subs map
  const dailySubs = new Map<string, number>();
  for (const sub of subsData || []) {
    if (!sub.subbly_created_at) continue;
    const d = sub.subbly_created_at.split("T")[0];
    dailySubs.set(d, (dailySubs.get(d) || 0) + 1);
  }

  // Platform-level analysis
  const platformStats = new Map<string, { spend: number; days: Set<string> }>();
  for (const row of dailyMetrics || []) {
    const s = platformStats.get(row.platform) || { spend: 0, days: new Set<string>() };
    s.spend += Number(row.spend);
    s.days.add(row.date);
    platformStats.set(row.platform, s);
  }

  // Daily spend by platform for trend analysis
  const dailySpendByPlatform = new Map<string, Map<string, number>>();
  for (const row of dailyMetrics || []) {
    if (!dailySpendByPlatform.has(row.platform)) dailySpendByPlatform.set(row.platform, new Map());
    const pMap = dailySpendByPlatform.get(row.platform)!;
    pMap.set(row.date, (pMap.get(row.date) || 0) + Number(row.spend));
  }

  // Total subs and spend for blended CAC
  const totalSubs = (subsData || []).length;
  let totalSpend = 0;
  for (const [, s] of platformStats) totalSpend += s.spend;
  const blendedCAC = totalSubs > 0 ? totalSpend / totalSubs : 0;

  // Recent 30-day CAC trend (for trend comparison)
  const recent30Start = formatDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30));
  let recent30Spend = 0;
  let recent30Subs = 0;
  for (const row of dailyMetrics || []) {
    if (row.date >= recent30Start) recent30Spend += Number(row.spend);
  }
  for (const [date, count] of dailySubs) {
    if (date >= recent30Start) recent30Subs += count;
  }
  const recent30CAC = recent30Subs > 0 ? recent30Spend / recent30Subs : blendedCAC;

  // Use recent CAC for projections (more accurate for next month)
  const projectionCAC = recent30CAC > 0 ? recent30CAC : blendedCAC;
  const totalBudgetNeeded = Math.round(target_subs * projectionCAC);

  // Calculate platform split based on spend-weighted efficiency
  // Use recent 30 days for platform split to reflect current allocation patterns
  const platformRecent: Record<string, number> = {};
  for (const row of dailyMetrics || []) {
    if (row.date >= recent30Start) {
      platformRecent[row.platform] = (platformRecent[row.platform] || 0) + Number(row.spend);
    }
  }

  const totalRecentSpend = Object.values(platformRecent).reduce((a, b) => a + b, 0);
  const platformSplit: Record<string, number> = {};
  for (const [platform, spend] of Object.entries(platformRecent)) {
    platformSplit[platform] = totalRecentSpend > 0 ? spend / totalRecentSpend : 0;
  }

  // Allocate budget by platform
  const platformBudgets: Record<string, number> = {};
  for (const [platform, ratio] of Object.entries(platformSplit)) {
    platformBudgets[platform] = Math.round(totalBudgetNeeded * ratio);
  }

  // Campaign-level breakdown: aggregate performance, find active campaigns
  const campaignAgg = new Map<string, {
    platform: string;
    campaign_name: string;
    platform_campaign_id: string;
    totalSpend: number;
    totalConversions: number;
    totalClicks: number;
    totalImpressions: number;
    totalRevenue: number;
    days: Set<string>;
    recentSpend: number;
    statuses: Set<string>;
  }>();

  for (const row of campaignData || []) {
    const key = `${row.platform}::${row.platform_campaign_id}`;
    const agg = campaignAgg.get(key) || {
      platform: row.platform,
      campaign_name: row.campaign_name,
      platform_campaign_id: row.platform_campaign_id,
      totalSpend: 0, totalConversions: 0, totalClicks: 0,
      totalImpressions: 0, totalRevenue: 0,
      days: new Set<string>(),
      recentSpend: 0,
      statuses: new Set<string>(),
    };
    agg.totalSpend += Number(row.spend);
    agg.totalConversions += Number(row.conversions);
    agg.totalClicks += Number(row.clicks);
    agg.totalImpressions += Number(row.impressions);
    agg.totalRevenue += Number(row.revenue);
    agg.days.add(row.date);
    if (row.date >= recent30Start) agg.recentSpend += Number(row.spend);
    if (row.status) agg.statuses.add(row.status);
    campaignAgg.set(key, agg);
  }

  // Filter to "active" campaigns (had spend in last 30 days)
  const activeCampaigns = Array.from(campaignAgg.values())
    .filter(c => c.recentSpend > 0);

  // Allocate campaign budgets proportionally to recent spend within each platform
  const campaignBudgets = [];
  for (const platform of Object.keys(platformBudgets)) {
    const platformCampaigns = activeCampaigns.filter(c => c.platform === platform);
    const platformRecentSpend = platformCampaigns.reduce((s, c) => s + c.recentSpend, 0);

    for (const camp of platformCampaigns) {
      const shareOfPlatform = platformRecentSpend > 0 ? camp.recentSpend / platformRecentSpend : 1 / platformCampaigns.length;
      const monthlyBudget = Math.round(platformBudgets[platform] * shareOfPlatform);
      const dailyBudget = Math.round((monthlyBudget / daysInTargetMonth) * 100) / 100;
      const cac = camp.totalConversions > 0 ? Math.round((camp.totalSpend / camp.totalConversions) * 100) / 100 : null;
      const ctr = camp.totalImpressions > 0 ? Math.round((camp.totalClicks / camp.totalImpressions) * 10000) / 100 : 0;
      const roas = camp.totalSpend > 0 ? Math.round((camp.totalRevenue / camp.totalSpend) * 100) / 100 : 0;

      campaignBudgets.push({
        platform: camp.platform,
        campaign_name: camp.campaign_name,
        platform_campaign_id: camp.platform_campaign_id,
        monthly_budget: monthlyBudget,
        daily_budget: dailyBudget,
        share_pct: Math.round(shareOfPlatform * 1000) / 10,
        historical_cac: cac,
        historical_roas: roas,
        historical_ctr: ctr,
        recent_30d_spend: Math.round(camp.recentSpend),
        total_90d_spend: Math.round(camp.totalSpend),
        total_90d_conversions: camp.totalConversions,
      });
    }
  }

  // Sort by monthly budget descending
  campaignBudgets.sort((a, b) => b.monthly_budget - a.monthly_budget);

  // Trend analysis
  const cacTrend = blendedCAC > 0 ? Math.round(((recent30CAC - blendedCAC) / blendedCAC) * 1000) / 10 : 0;

  // AI insight
  let aiInsight = "";
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (LOVABLE_API_KEY) {
    try {
      const platformSummary = Object.entries(platformBudgets)
        .map(([p, b]) => `${p}: $${b.toLocaleString()} (${Math.round((platformSplit[p] || 0) * 100)}%)`)
        .join(", ");

      const topCampaigns = campaignBudgets.slice(0, 5)
        .map(c => `${c.campaign_name} (${c.platform}): $${c.daily_budget}/day, CAC $${c.historical_cac ?? "N/A"}, ROAS ${c.historical_roas}`)
        .join("\n");

      const prompt = `You are a performance marketing budget strategist for a DTC subscription brand. Provide a concise 4-5 sentence budget recommendation summary.

Target: ${target_subs} new subscriptions in ${targetMonthName} (${daysInTargetMonth} days)
Total budget recommended: $${totalBudgetNeeded.toLocaleString()}
Platform split: ${platformSummary}
90-day blended CAC: $${Math.round(blendedCAC * 100) / 100}
Recent 30-day CAC: $${Math.round(recent30CAC * 100) / 100} (${cacTrend > 0 ? "+" : ""}${cacTrend}% vs 90-day)
Active campaigns: ${activeCampaigns.length}

Top campaigns by budget:
${topCampaigns}

Focus on: whether the budget is achievable, risks, platform allocation rationale, and specific campaign-level recommendations for optimization.`;

      const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 400,
        }),
      });

      const aiData = await aiRes.json();
      aiInsight = aiData.choices?.[0]?.message?.content || "";
    } catch (err) {
      console.error("AI insight error:", err);
    }
  }

  const result = {
    target_month: targetMonthName,
    days_in_month: daysInTargetMonth,
    target_subs,
    projection_cac: Math.round(projectionCAC * 100) / 100,
    blended_90d_cac: Math.round(blendedCAC * 100) / 100,
    recent_30d_cac: Math.round(recent30CAC * 100) / 100,
    cac_trend_pct: cacTrend,
    total_budget: totalBudgetNeeded,
    platform_budgets: Object.entries(platformBudgets).map(([platform, budget]) => ({
      platform,
      monthly_budget: budget,
      daily_budget: Math.round((budget / daysInTargetMonth) * 100) / 100,
      split_pct: Math.round((platformSplit[platform] || 0) * 1000) / 10,
    })),
    campaign_budgets: campaignBudgets,
    lookback_stats: {
      total_spend_90d: Math.round(totalSpend),
      total_subs_90d: totalSubs,
      total_spend_30d: Math.round(recent30Spend),
      total_subs_30d: recent30Subs,
      active_campaigns: activeCampaigns.length,
    },
    ai_insight: aiInsight,
  };

  return new Response(JSON.stringify(result), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

function errResponse(msg: string, status = 500) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" },
  });
}

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}
