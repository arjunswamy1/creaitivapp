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

  let body: { target_subs?: number; client_id: string };
  try {
    body = await req.json();
  } catch {
    return errResponse("Invalid JSON body", 400);
  }

  const { client_id } = body;
  let { target_subs } = body;
  if (!client_id) {
    return errResponse("client_id is required", 400);
  }

  // Always forecast for next month based on today's date
  const now = new Date();
  let targetYear: number, targetMonth: number;
  targetYear = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear();
  targetMonth = now.getMonth() === 11 ? 1 : now.getMonth() + 2;

  const daysInTargetMonth = new Date(targetYear, targetMonth, 0).getDate();
  const targetMonthName = new Date(targetYear, targetMonth - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" });

  // Fetch last year's same-month Subbly new subscribers as baseline
  const lastYearStart = `${targetYear - 1}-${String(targetMonth).padStart(2, "0")}-01T05:00:00.000Z`;
  const lastYearEndDate = new Date(targetYear - 1, targetMonth, 0); // last day of that month
  const lastYearEndNextDay = formatDate(new Date(lastYearEndDate.getFullYear(), lastYearEndDate.getMonth(), lastYearEndDate.getDate() + 1));
  const lastYearEnd = lastYearEndNextDay + "T04:59:59.999Z";

  const { data: lastYearSubs, error: lyErr } = await supabase
    .from("subbly_subscriptions")
    .select("id")
    .eq("client_id", client_id)
    .gte("subbly_created_at", lastYearStart)
    .lte("subbly_created_at", lastYearEnd);

  if (lyErr) return errResponse(lyErr.message);
  const lastYearSubCount = (lastYearSubs || []).length;
  const suggestedGoal = Math.ceil(lastYearSubCount * 1.25);

  // If no target_subs provided, use the suggested goal
  if (!target_subs || target_subs <= 0) {
    target_subs = suggestedGoal > 0 ? suggestedGoal : 100;
  }

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

  // Fetch ALL subs - default Supabase limit is 1000 which skews CAC calculations
  let allSubs: { id: string; subbly_created_at: string | null }[] = [];
  let subOffset = 0;
  const SUB_PAGE_SIZE = 1000;
  while (true) {
    const { data: page, error: subErr } = await supabase
      .from("subbly_subscriptions")
      .select("id, subbly_created_at")
      .eq("client_id", client_id)
      .gte("subbly_created_at", fromUTC)
      .lte("subbly_created_at", toUTC)
      .range(subOffset, subOffset + SUB_PAGE_SIZE - 1);

    allSubs = allSubs.concat(page || []);
    if (!page || page.length < SUB_PAGE_SIZE) break;
    subOffset += SUB_PAGE_SIZE;
  }
  const subsData = allSubs;

  

  // Build daily subs map
  const dailySubs = new Map<string, number>();
  for (const sub of subsData || []) {
    if (!sub.subbly_created_at) continue;
    const d = sub.subbly_created_at.split("T")[0];
    dailySubs.set(d, (dailySubs.get(d) || 0) + 1);
  }

  // Multi-period CAC analysis: 30d, 60d, 90d with recency weighting
  const recent30Start = formatDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30));
  const recent60Start = formatDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 60));

  // Compute spend/subs for each period window
  let spend30 = 0, spend60 = 0, spend90 = 0;
  let subs30 = 0, subs60 = 0, subs90 = 0;

  for (const row of dailyMetrics || []) {
    const s = Number(row.spend);
    spend90 += s;
    if (row.date >= recent60Start) spend60 += s;
    if (row.date >= recent30Start) spend30 += s;
  }
  for (const [date, count] of dailySubs) {
    subs90 += count;
    if (date >= recent60Start) subs60 += count;
    if (date >= recent30Start) subs30 += count;
  }

  const cac30 = subs30 > 0 ? spend30 / subs30 : 0;
  const cac60 = subs60 > 0 ? spend60 / subs60 : 0;
  const cac90 = subs90 > 0 ? spend90 / subs90 : 0;

  // Weighted projection CAC: 50% weight on 30d, 30% on 60d, 20% on 90d
  // Only include periods that have data
  let weightedCAC = 0;
  let totalWeight = 0;
  if (cac30 > 0) { weightedCAC += cac30 * 0.50; totalWeight += 0.50; }
  if (cac60 > 0) { weightedCAC += cac60 * 0.30; totalWeight += 0.30; }
  if (cac90 > 0) { weightedCAC += cac90 * 0.20; totalWeight += 0.20; }
  const projectionCAC = totalWeight > 0 ? weightedCAC / totalWeight : 0;

  const totalBudgetNeeded = Math.round(target_subs * projectionCAC);

  // Platform split: use weighted recent spending (60% last 30d, 40% prior 30-60d)
  const platformRecent30: Record<string, number> = {};
  const platformRecent60Only: Record<string, number> = {}; // 31-60 day band
  for (const row of dailyMetrics || []) {
    if (row.date >= recent30Start) {
      platformRecent30[row.platform] = (platformRecent30[row.platform] || 0) + Number(row.spend);
    } else if (row.date >= recent60Start) {
      platformRecent60Only[row.platform] = (platformRecent60Only[row.platform] || 0) + Number(row.spend);
    }
  }

  // Blend platform splits: heavier on recent
  const allPlatforms = new Set([...Object.keys(platformRecent30), ...Object.keys(platformRecent60Only)]);
  const platformWeightedSpend: Record<string, number> = {};
  for (const p of allPlatforms) {
    platformWeightedSpend[p] = (platformRecent30[p] || 0) * 0.6 + (platformRecent60Only[p] || 0) * 0.4;
  }
  const totalWeightedSpend = Object.values(platformWeightedSpend).reduce((a, b) => a + b, 0);
  const platformSplit: Record<string, number> = {};
  for (const [platform, spend] of Object.entries(platformWeightedSpend)) {
    platformSplit[platform] = totalWeightedSpend > 0 ? spend / totalWeightedSpend : 0;
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
  const cacTrend = cac90 > 0 ? Math.round(((cac30 - cac90) / cac90) * 1000) / 10 : 0;

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

Multi-period CAC analysis:
- Last 30 days: $${r2(cac30)} (${subs30} subs from $${r2(spend30)} spend) — weight 50%
- Last 60 days: $${r2(cac60)} (${subs60} subs from $${r2(spend60)} spend) — weight 30%
- Last 90 days: $${r2(cac90)} (${subs90} subs from $${r2(spend90)} spend) — weight 20%
- Weighted projection CAC: $${r2(projectionCAC)}
- CAC trend (30d vs 90d): ${cacTrend > 0 ? "+" : ""}${cacTrend}%

Active campaigns: ${activeCampaigns.length}

Top campaigns by budget:
${topCampaigns}

Focus on: whether the budget is achievable given the multi-period CAC trend, risks from CAC volatility, platform allocation rationale, and specific campaign-level recommendations for optimization.`;

      const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 500,
        }),
      });

      const aiData = await aiRes.json();
      aiInsight = aiData.choices?.[0]?.message?.content || "";
    } catch (err) {
      console.error("AI insight error:", err);
    }
  }

  const lastYearMonthName = new Date(targetYear - 1, targetMonth - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" });

  const result = {
    target_month: targetMonthName,
    days_in_month: daysInTargetMonth,
    target_subs,
    projection_cac: r2(projectionCAC),
    cac_30d: r2(cac30),
    cac_60d: r2(cac60),
    cac_90d: r2(cac90),
    cac_trend_pct: cacTrend,
    total_budget: totalBudgetNeeded,
    last_year_baseline: {
      month: lastYearMonthName,
      new_subscribers: lastYearSubCount,
      suggested_goal: suggestedGoal,
    },
    platform_budgets: Object.entries(platformBudgets).map(([platform, budget]) => ({
      platform,
      monthly_budget: budget,
      daily_budget: Math.round((budget / daysInTargetMonth) * 100) / 100,
      split_pct: Math.round((platformSplit[platform] || 0) * 1000) / 10,
    })),
    campaign_budgets: campaignBudgets,
    lookback_stats: {
      total_spend_90d: Math.round(spend90),
      total_subs_90d: subs90,
      total_spend_60d: Math.round(spend60),
      total_subs_60d: subs60,
      total_spend_30d: Math.round(spend30),
      total_subs_30d: subs30,
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

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}
