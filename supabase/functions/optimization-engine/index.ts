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
    return jsonRes({ error: "Unauthorized" }, 401);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const serviceSupabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  let body: any = {};
  try { body = await req.json(); } catch { /* no body */ }

  const clientId = body.client_id;
  if (!clientId) return jsonRes({ error: "client_id required" }, 400);

  const action = body.action || "full"; // full, forecast, variance, recommendations
  const scenarioParams = body.scenario_params || {};

  try {
    // Fetch historical daily metrics (90 days)
    const now = new Date();
    const lookbackDays = 90;
    const lookbackDate = new Date(now);
    lookbackDate.setDate(lookbackDate.getDate() - lookbackDays);
    const lookbackStr = fmt(lookbackDate);
    const todayStr = fmt(now);

    const { data: dailyMetrics, error: metricsErr } = await supabase
      .from("ad_daily_metrics")
      .select("date, platform, spend, revenue, impressions, clicks, conversions")
      .eq("client_id", clientId)
      .neq("platform", "shopify")
      .gte("date", lookbackStr)
      .lte("date", todayStr)
      .order("date", { ascending: true });

    if (metricsErr) return jsonRes({ error: metricsErr.message }, 500);

    // Fetch campaign-level data for recommendations
    const { data: campaigns } = await supabase
      .from("ad_campaigns")
      .select("campaign_name, platform, spend, revenue, impressions, clicks, conversions, status, date")
      .eq("client_id", clientId)
      .gte("date", lookbackStr)
      .lte("date", todayStr);

    // Fetch creative data for frequency analysis
    const last30 = new Date(now);
    last30.setDate(last30.getDate() - 30);
    const { data: adData } = await supabase
      .from("ads")
      .select("ad_name, campaign_name, spend, impressions, clicks, conversions, frequency, date, thumbnail_url, platform, status")
      .eq("client_id", clientId)
      .gte("date", fmt(last30))
      .lte("date", todayStr);

    // Fetch revenue source config
    const { data: configData } = await supabase
      .from("client_dashboard_config")
      .select("revenue_source")
      .eq("client_id", clientId)
      .maybeSingle();

    const revenueSource = configData?.revenue_source || "subbly";

    // Fetch actual revenue + transaction counts (Shopify or Subbly)
    let totalRevenue30d = 0;
    let transactionCount30d = 0;
    const last30Str = fmt(last30);
    let totalCOGS30d = 0;
    let totalTax30d = 0;
    let totalShipping30d = 0;
    let totalDiscounts30d = 0;

    if (revenueSource === "shopify") {
      const { data: orders } = await supabase
        .from("shopify_orders")
        .select("total_price, total_cost, total_tax, total_shipping, total_discounts")
        .eq("client_id", clientId)
        .in("financial_status", ["paid", "partially_refunded"])
        .gte("order_date", last30Str + "T00:00:00Z")
        .lte("order_date", todayStr + "T23:59:59Z");
      totalRevenue30d = (orders || []).reduce((s, o) => s + Number(o.total_price || 0), 0);
      totalCOGS30d = (orders || []).reduce((s, o) => s + Number(o.total_cost || 0), 0);
      totalTax30d = (orders || []).reduce((s, o) => s + Number(o.total_tax || 0), 0);
      totalShipping30d = (orders || []).reduce((s, o) => s + Number(o.total_shipping || 0), 0);
      totalDiscounts30d = (orders || []).reduce((s, o) => s + Number(o.total_discounts || 0), 0);
      transactionCount30d = (orders || []).length;
    } else {
      const { data: invoices } = await supabase
        .from("subbly_invoices")
        .select("amount")
        .eq("client_id", clientId)
        .eq("status", "paid")
        .gte("invoice_date", last30Str + "T00:00:00Z")
        .lte("invoice_date", todayStr + "T23:59:59Z");
      totalRevenue30d = (invoices || []).reduce((s, i) => s + Number(i.amount || 0) / 100, 0);
      // For Subbly, count subscriptions instead of invoices
      const { data: subs } = await supabase
        .from("subbly_subscriptions")
        .select("id")
        .eq("client_id", clientId)
        .gte("subbly_created_at", last30Str + "T05:00:00Z")
        .lte("subbly_created_at", todayStr + "T23:59:59Z");
      transactionCount30d = (subs || []).length;
    }

    // Aggregate daily data
    const dailyAgg = aggregateDaily(dailyMetrics || []);
    const daysWithData = dailyAgg.filter(d => d.spend > 0).length;

    if (daysWithData < 7) {
      return jsonRes({
        error: "Insufficient data",
        message: "At least 7 days of data required. Currently have " + daysWithData + " days.",
      }, 200);
    }

    // === MODULE 1: Scenario Forecasting ===
    const baseline = computeBaselineForecast(dailyAgg, totalRevenue30d, daysWithData, transactionCount30d, revenueSource, {
      cogs: totalCOGS30d, tax: totalTax30d, shipping: totalShipping30d, discounts: totalDiscounts30d,
    });
    const spendAdjusted = computeSpendAdjustedForecast(baseline, scenarioParams.spend_change_pct);
    const efficiencyAdjusted = computeEfficiencyForecast(baseline, scenarioParams);

    // Risk scoring
    const riskAssessment = computeRiskScore(dailyAgg, daysWithData, baseline);

    // === MODULE 2: Variance Detection ===
    const variances = computeVariances(dailyAgg, baseline);

    // Fetch keyword data for Google losing keywords
    const { data: keywordData } = await supabase
      .from("keywords")
      .select("keyword_text, campaign_name, adset_name, platform_campaign_id, match_type, quality_score, spend, clicks, impressions, conversions, date, status")
      .eq("client_id", clientId)
      .gte("date", fmt(last30))
      .lte("date", todayStr);

    // === MODULE 2.5: CAC Trend Analysis ===
    const cacTrend = computeCACTrend(dailyAgg, campaigns || [], adData || [], baseline, keywordData || []);

    // === MODULE 2.6: Ads to Kill (Shopify ROAS-based) ===
    const adsToKill = revenueSource === "shopify"
      ? computeAdsToKill(adData || [], totalRevenue30d, totalSpend30d(dailyAgg), baseline)
      : [];

    // === MODULE 3: Recommendations ===
    const recommendations = generateRecommendations(
      dailyAgg, campaigns || [], adData || [], baseline, variances, riskAssessment
    );

    // Store snapshot
    await serviceSupabase.from("forecast_snapshots").insert({
      client_id: clientId,
      snapshot_type: "baseline",
      scenario_params: scenarioParams,
      projected_revenue: Math.round(baseline.projected_revenue),
      projected_spend: Math.round(baseline.projected_spend),
      projected_cpa: Math.round(baseline.projected_cpa * 100) / 100,
      projected_mer: Math.round(baseline.projected_mer * 100) / 100,
      confidence_score: baseline.confidence_score,
      risk_level: riskAssessment.risk_level,
      lookback_days: lookbackDays,
      forecast_days: baseline.days_in_month,
      daily_projections: baseline.daily_projections,
      metadata: { revenue_source: revenueSource, days_with_data: daysWithData },
    });

    // Store recommendations
    if (recommendations.length > 0) {
      await serviceSupabase.from("optimization_recommendations").insert(
        recommendations.map(r => ({
          client_id: clientId,
          type: r.type,
          entity: r.entity,
          action: r.action,
          evidence: r.evidence,
          projected_impact: r.projected_impact,
          confidence_score: r.confidence_score,
          risk_score: r.risk_score,
          source_metrics: r.source_metrics,
        }))
      );
    }

    // Store variances
    const highVariances = variances.filter(v => v.severity !== "Low");
    if (highVariances.length > 0) {
      await serviceSupabase.from("variance_reports").insert(
        highVariances.map(v => ({
          client_id: clientId,
          metric: v.metric,
          forecast_value: v.forecast_value,
          actual_value: v.actual_value,
          variance_percent: v.variance_percent,
          severity: v.severity,
        }))
      );
    }

    // AI insight
    let aiInsight = "";
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (LOVABLE_API_KEY) {
      try {
        const prompt = buildAIPrompt(baseline, spendAdjusted, efficiencyAdjusted, variances, recommendations, riskAssessment);
        const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { "Authorization": `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
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

    return jsonRes({
      baseline,
      spend_adjusted: spendAdjusted,
      efficiency_adjusted: efficiencyAdjusted,
      variances,
      recommendations,
      risk: riskAssessment,
      ai_insight: aiInsight,
      cac_trend: cacTrend,
      ads_to_kill: adsToKill,
      data_quality: {
        days_with_data: daysWithData,
        total_days_analyzed: dailyAgg.length,
        revenue_source: revenueSource,
      },
    });
  } catch (err: any) {
    console.error("Optimization engine error:", err);
    return jsonRes({ error: err.message || "Internal error" }, 500);
  }
});

// ===== Helper Functions =====

interface DailyData {
  date: string;
  spend: number;
  revenue: number;
  impressions: number;
  clicks: number;
  conversions: number;
}

function aggregateDaily(rows: any[]): DailyData[] {
  const byDate = new Map<string, DailyData>();
  for (const r of rows) {
    const d = r.date;
    const existing = byDate.get(d) || { date: d, spend: 0, revenue: 0, impressions: 0, clicks: 0, conversions: 0 };
    existing.spend += Number(r.spend || 0);
    existing.revenue += Number(r.revenue || 0);
    existing.impressions += Number(r.impressions || 0);
    existing.clicks += Number(r.clicks || 0);
    existing.conversions += Number(r.conversions || 0);
    byDate.set(d, existing);
  }
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function computeBaselineForecast(daily: DailyData[], actualRevenue: number, daysWithData: number, transactionCount: number, revenueSource: string, costBreakdown?: { cogs: number; tax: number; shipping: number; discounts: number }) {
  const last30 = daily.slice(-30);
  const totalSpend = last30.reduce((s, d) => s + d.spend, 0);
  const totalConversions = last30.reduce((s, d) => s + d.conversions, 0);
  const totalClicks = last30.reduce((s, d) => s + d.clicks, 0);
  const totalImpressions = last30.reduce((s, d) => s + d.impressions, 0);

  const activeDays = Math.min(daysWithData, 30);
  const avgDailySpend = daysWithData > 0 ? totalSpend / activeDays : 0;
  const avgDailyConversions = daysWithData > 0 ? totalConversions / activeDays : 0;
  const avgDailyRevenue = daysWithData > 0 ? actualRevenue / activeDays : 0;
  const avgDailyTransactions = daysWithData > 0 ? transactionCount / activeDays : 0;

  // Calculate remaining days in current month
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-indexed
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const currentDay = now.getDate();
  const daysElapsed = currentDay;
  const daysRemaining = daysInMonth - currentDay;
  const forecastDays = daysInMonth;

  // Month-to-date actuals (use weighted avg from lookback data)
  const mtdSpend = avgDailySpend * daysElapsed;
  const mtdRevenue = avgDailyRevenue * daysElapsed;

  const projectedSpend = avgDailySpend * forecastDays;
  const projectedRevenue = avgDailyRevenue * forecastDays;
  const projectedCPA = avgDailyConversions > 0 ? avgDailySpend / avgDailyConversions : 0;
  const projectedMER = projectedSpend > 0 ? projectedRevenue / projectedSpend : 0;
  const projectedTransactions = Math.round(avgDailyTransactions * forecastDays);

  // Confidence based on data volume and variance
  const spendValues = last30.map(d => d.spend).filter(v => v > 0);
  const spendVariance = computeCV(spendValues);
  const volumeScore = Math.min(1, daysWithData / 60);
  const stabilityScore = Math.max(0, 1 - spendVariance);
  const confidenceScore = Math.round((volumeScore * 0.4 + stabilityScore * 0.6) * 100) / 100;

  // Month name for display
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const monthName = monthNames[currentMonth];

  // Daily projections for remaining days in month
  const dailyProjections = [];
  for (let i = 1; i <= daysRemaining; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    dailyProjections.push({
      date: fmt(d),
      projected_spend: Math.round(avgDailySpend),
      projected_revenue: Math.round(avgDailyRevenue),
      projected_conversions: Math.round(avgDailyConversions * 10) / 10,
    });
  }

  // Profit breakdown for Shopify clients
  let profitBreakdown = undefined;
  if (revenueSource === "shopify" && costBreakdown) {
    const scaleFactor = activeDays > 0 ? forecastDays / activeDays : 1;
    const projCOGS = Math.round(costBreakdown.cogs * scaleFactor);
    const projTax = Math.round(costBreakdown.tax * scaleFactor);
    const projShipping = Math.round(costBreakdown.shipping * scaleFactor);
    const projDiscounts = Math.round(costBreakdown.discounts * scaleFactor);
    const projProfit = Math.round(projectedRevenue) - Math.round(projectedSpend) - projCOGS - projTax - projShipping - projDiscounts;
    profitBreakdown = {
      projected_revenue: Math.round(projectedRevenue),
      projected_ad_spend: Math.round(projectedSpend),
      projected_cogs: projCOGS,
      projected_tax_shipping: projTax + projShipping,
      projected_discounts: projDiscounts,
      projected_profit: projProfit,
    };
  }

  return {
    projected_revenue: Math.round(projectedRevenue),
    projected_spend: Math.round(projectedSpend),
    projected_cpa: Math.round(projectedCPA * 100) / 100,
    projected_mer: Math.round(projectedMER * 100) / 100,
    avg_daily_spend: Math.round(avgDailySpend),
    avg_daily_revenue: Math.round(avgDailyRevenue),
    avg_daily_conversions: Math.round(avgDailyConversions * 10) / 10,
    ctr: totalImpressions > 0 ? Math.round((totalClicks / totalImpressions) * 10000) / 100 : 0,
    cvr: totalClicks > 0 ? Math.round((totalConversions / totalClicks) * 10000) / 100 : 0,
    confidence_score: confidenceScore,
    daily_projections: dailyProjections,
    projected_transactions: projectedTransactions,
    transaction_count_30d: transactionCount,
    avg_daily_transactions: Math.round(avgDailyTransactions * 10) / 10,
    transaction_label: revenueSource === "shopify" ? "Purchases" : "Subscribers",
    forecast_month: monthName,
    days_in_month: daysInMonth,
    days_elapsed: daysElapsed,
    days_remaining: daysRemaining,
    profit_breakdown: profitBreakdown,
  };
}

function computeSpendAdjustedForecast(baseline: any, spendChangePct?: number) {
  const scenarios = spendChangePct != null
    ? [spendChangePct]
    : [-10, 10, 25];

  return scenarios.map(pct => {
    const spendMultiplier = 1 + pct / 100;
    const elasticity = 0.7;
    const roasMultiplier = Math.pow(spendMultiplier, elasticity - 1);
    const adjustedMER = baseline.projected_mer * roasMultiplier;

    const projectedSpend = baseline.projected_spend * spendMultiplier;
    const projectedRevenue = projectedSpend * adjustedMER;
    const projectedCPA = baseline.projected_cpa * Math.pow(spendMultiplier, 1 - elasticity);
    // Transactions scale with the same diminishing returns as revenue
    const projectedTransactions = Math.round(baseline.projected_transactions * Math.pow(spendMultiplier, elasticity));

    return {
      spend_change_pct: pct,
      projected_spend: Math.round(projectedSpend),
      projected_revenue: Math.round(projectedRevenue),
      projected_cpa: Math.round(projectedCPA * 100) / 100,
      projected_mer: Math.round(adjustedMER * 100) / 100,
      delta_revenue: Math.round(projectedRevenue - baseline.projected_revenue),
      delta_revenue_pct: baseline.projected_revenue > 0
        ? Math.round(((projectedRevenue - baseline.projected_revenue) / baseline.projected_revenue) * 1000) / 10
        : 0,
      projected_transactions: projectedTransactions,
      transaction_label: baseline.transaction_label,
    };
  });
}

function computeEfficiencyForecast(baseline: any, params: any) {
  const cpaImprovement = params.cpa_improvement_pct || 0;
  const ctrImprovement = params.ctr_improvement_pct || 0;
  const cvrImprovement = params.cvr_improvement_pct || 0;

  const scenarios = [];

  // Each improvement scenario
  const improvements = [
    { label: "CPA", pct: cpaImprovement || -10 },
    { label: "CTR", pct: ctrImprovement || 15 },
    { label: "CVR", pct: cvrImprovement || 10 },
  ];

  for (const imp of improvements) {
    let revenueMultiplier = 1;
    let newCPA = baseline.projected_cpa;

    if (imp.label === "CPA") {
      // Lower CPA = more conversions for same spend
      newCPA = baseline.projected_cpa * (1 + imp.pct / 100);
      revenueMultiplier = newCPA > 0 ? baseline.projected_cpa / newCPA : 1;
    } else if (imp.label === "CTR") {
      // Higher CTR = more clicks = more conversions (proportional)
      revenueMultiplier = 1 + (imp.pct / 100) * (baseline.cvr / 100);
    } else if (imp.label === "CVR") {
      revenueMultiplier = 1 + imp.pct / 100;
    }

    const projectedRevenue = baseline.projected_revenue * revenueMultiplier;
    const breakEvenLift = baseline.projected_spend > baseline.projected_revenue
      ? Math.round(((baseline.projected_spend - baseline.projected_revenue) / baseline.projected_revenue) * 1000) / 10
      : 0;

    scenarios.push({
      metric: imp.label,
      improvement_pct: imp.pct,
      projected_revenue: Math.round(projectedRevenue),
      delta_revenue: Math.round(projectedRevenue - baseline.projected_revenue),
      sensitivity_score: Math.round(Math.abs(revenueMultiplier - 1) * 100) / 100,
      break_even_lift: breakEvenLift,
    });
  }

  return scenarios;
}

function computeVariances(daily: DailyData[], baseline: any) {
  const last7 = daily.slice(-7);
  if (last7.length === 0) return [];

  const recent = {
    spend: last7.reduce((s, d) => s + d.spend, 0) / last7.length,
    revenue: last7.reduce((s, d) => s + d.revenue, 0) / last7.length,
    conversions: last7.reduce((s, d) => s + d.conversions, 0) / last7.length,
    clicks: last7.reduce((s, d) => s + d.clicks, 0) / last7.length,
    impressions: last7.reduce((s, d) => s + d.impressions, 0) / last7.length,
  };

  const recentCPA = recent.conversions > 0 ? recent.spend / recent.conversions : 0;
  const recentMER = recent.spend > 0 ? recent.revenue / recent.spend : 0;

  const metrics = [
    { metric: "Revenue", forecast: baseline.avg_daily_revenue, actual: recent.revenue },
    { metric: "Spend", forecast: baseline.avg_daily_spend, actual: recent.spend },
    { metric: "CPA", forecast: baseline.projected_cpa, actual: recentCPA },
    { metric: "MER", forecast: baseline.projected_mer, actual: recentMER },
  ];

  return metrics.map(m => {
    const variancePct = m.forecast > 0
      ? Math.round(((m.actual - m.forecast) / m.forecast) * 1000) / 10
      : 0;
    const absPct = Math.abs(variancePct);
    const severity = absPct > 20 ? "High" : absPct > 8 ? "Medium" : "Low";

    return {
      metric: m.metric,
      forecast_value: Math.round(m.forecast * 100) / 100,
      actual_value: Math.round(m.actual * 100) / 100,
      variance_percent: variancePct,
      severity,
    };
  });
}

function generateRecommendations(
  daily: DailyData[],
  campaigns: any[],
  ads: any[],
  baseline: any,
  variances: any[],
  risk: any
) {
  const recs: any[] = [];
  const last7 = daily.slice(-7);
  const last30 = daily.slice(-30);

  // 1. CPA drift detection
  const recent7CPA = (() => {
    const spend = last7.reduce((s, d) => s + d.spend, 0);
    const conv = last7.reduce((s, d) => s + d.conversions, 0);
    return conv > 0 ? spend / conv : 0;
  })();

  if (recent7CPA > baseline.projected_cpa * 1.1 && recent7CPA > 0) {
    recs.push({
      type: "Efficiency Alert",
      entity: "Blended CPA",
      action: `CPA has risen to $${Math.round(recent7CPA)} (${Math.round(((recent7CPA - baseline.projected_cpa) / baseline.projected_cpa) * 100)}% above baseline $${baseline.projected_cpa}). Review underperforming campaigns.`,
      evidence: [
        `7-day rolling CPA: $${Math.round(recent7CPA)}`,
        `30-day baseline CPA: $${baseline.projected_cpa}`,
        `Drift: +${Math.round(((recent7CPA - baseline.projected_cpa) / baseline.projected_cpa) * 100)}%`,
      ],
      projected_impact: "Reducing CPA to baseline would save ~$" + Math.round((recent7CPA - baseline.projected_cpa) * baseline.avg_daily_conversions * 30) + "/month",
      confidence_score: Math.min(0.9, risk.confidence_score + 0.1),
      risk_score: "Medium",
      source_metrics: { recent_cpa: recent7CPA, baseline_cpa: baseline.projected_cpa },
    });
  }

  // 2. Campaign-level marginal CPA analysis
  const campAgg = aggregateCampaigns(campaigns || []);
  const blendedCPA = baseline.projected_cpa;

  for (const [name, camp] of campAgg.entries()) {
    const campCPA = camp.conversions > 0 ? camp.spend / camp.conversions : Infinity;
    if (campCPA > blendedCPA * 1.28 && camp.spend > baseline.avg_daily_spend * 3) {
      // Find a better performing campaign
      let bestCamp = "";
      let bestCPA = Infinity;
      for (const [n, c] of campAgg.entries()) {
        if (n === name) continue;
        const cpa = c.conversions > 0 ? c.spend / c.conversions : Infinity;
        if (cpa < bestCPA) { bestCPA = cpa; bestCamp = n; }
      }

      const shiftAmount = Math.round(camp.spend * 0.2 / 30);
      recs.push({
        type: "Budget Reallocation",
        entity: name,
        action: bestCamp
          ? `Shift ~$${shiftAmount}/day from "${name}" to "${bestCamp}"`
          : `Reduce spend on "${name}" — marginal CPA is $${Math.round(campCPA)} vs blended $${Math.round(blendedCPA)}`,
        evidence: [
          `"${name}" CPA: $${Math.round(campCPA)} (${Math.round(((campCPA - blendedCPA) / blendedCPA) * 100)}% above blended)`,
          bestCamp ? `"${bestCamp}" CPA: $${Math.round(bestCPA)} (${Math.round(((bestCPA - blendedCPA) / blendedCPA) * 100)}% vs blended)` : "No clear reallocation target",
          `Spend on "${name}": $${Math.round(camp.spend)} over period`,
        ],
        projected_impact: `+${Math.round(((campCPA - (bestCPA || blendedCPA)) / campCPA) * shiftAmount * 30 / (bestCPA || blendedCPA))} conversions/month`,
        confidence_score: Math.round(Math.min(0.85, camp.conversions / 50) * 100) / 100,
        risk_score: camp.conversions < 20 ? "High" : "Medium",
        source_metrics: { campaign_cpa: campCPA, blended_cpa: blendedCPA, campaign_spend: camp.spend },
      });
    }
  }

  // 3. Creative frequency fatigue
  const adAgg = new Map<string, { impressions: number; clicks: number; frequency: number; count: number; campaign: string }>();
  for (const ad of (ads || [])) {
    const key = ad.ad_name;
    const existing = adAgg.get(key) || { impressions: 0, clicks: 0, frequency: 0, count: 0, campaign: ad.campaign_name || "" };
    existing.impressions += Number(ad.impressions || 0);
    existing.clicks += Number(ad.clicks || 0);
    if (ad.frequency) { existing.frequency += Number(ad.frequency); existing.count++; }
    adAgg.set(key, existing);
  }

  for (const [name, ad] of adAgg.entries()) {
    const avgFreq = ad.count > 0 ? ad.frequency / ad.count : 0;
    const ctr = ad.impressions > 0 ? (ad.clicks / ad.impressions) * 100 : 0;
    if (avgFreq > 3.5 && ctr < baseline.ctr * 0.8) {
      recs.push({
        type: "Creative Refresh",
        entity: name,
        action: `Creative "${name}" has frequency ${avgFreq.toFixed(1)} with CTR ${ctr.toFixed(2)}% (${Math.round(((ctr - baseline.ctr) / baseline.ctr) * 100)}% below baseline). Consider refreshing creative.`,
        evidence: [
          `Frequency: ${avgFreq.toFixed(1)} (threshold: 3.5)`,
          `CTR: ${ctr.toFixed(2)}% vs baseline ${baseline.ctr}%`,
          `Campaign: ${ad.campaign}`,
        ],
        projected_impact: "Restoring CTR to baseline could improve conversions by ~" + Math.round((baseline.ctr - ctr) / baseline.ctr * 100) + "%",
        confidence_score: 0.6,
        risk_score: "Low",
        source_metrics: { frequency: avgFreq, ctr, baseline_ctr: baseline.ctr },
      });
    }
  }

  // 4. MER declining while spend rising
  const merVariance = variances.find(v => v.metric === "MER");
  const spendVariance = variances.find(v => v.metric === "Spend");
  if (merVariance && spendVariance && merVariance.variance_percent < -8 && spendVariance.variance_percent > 5) {
    recs.push({
      type: "Efficiency Alert",
      entity: "MER vs Spend",
      action: "MER is declining while spend is increasing — diminishing returns detected. Consider plateauing spend until efficiency stabilizes.",
      evidence: [
        `MER variance: ${merVariance.variance_percent}%`,
        `Spend variance: +${spendVariance.variance_percent}%`,
        "Pattern indicates diminishing marginal returns",
      ],
      projected_impact: `Stabilizing spend at baseline could recover ${Math.abs(Math.round(merVariance.variance_percent))}% MER`,
      confidence_score: 0.72,
      risk_score: "Medium",
      source_metrics: { mer_variance: merVariance.variance_percent, spend_variance: spendVariance.variance_percent },
    });
  }

  return recs;
}

function computeCACTrend(daily: DailyData[], campaigns: any[], ads: any[], baseline: any, keywords: any[]) {
  const last3 = daily.slice(-3);
  const last7 = daily.slice(-7);

  const spend3 = last3.reduce((s, d) => s + d.spend, 0);
  const conv3 = last3.reduce((s, d) => s + d.conversions, 0);
  const spend7 = last7.reduce((s, d) => s + d.spend, 0);
  const conv7 = last7.reduce((s, d) => s + d.conversions, 0);

  const cac3 = conv3 > 0 ? spend3 / conv3 : 0;
  const cac7 = conv7 > 0 ? spend7 / conv7 : 0;
  const baselineCac = baseline.projected_cpa;

  const cac3VsBaseline = baselineCac > 0 ? Math.round(((cac3 - baselineCac) / baselineCac) * 1000) / 10 : 0;
  const cac3Vs7 = cac7 > 0 ? Math.round(((cac3 - cac7) / cac7) * 1000) / 10 : 0;

  // Determine signal
  let signal: "increase" | "hold" | "reduce" | "pause_losers" = "hold";
  let signal_label = "";
  let signal_detail = "";

  if (cac3 > 0 && cac7 > 0) {
    if (cac3 <= baselineCac * 0.9 && cac3 <= cac7) {
      signal = "increase";
      signal_label = "Scale: Increase Budget +5%";
      signal_detail = `CAC has dropped to $${Math.round(cac3)} over the last 3 days (${Math.abs(cac3VsBaseline)}% below baseline). Efficiency is improving — consider a 5% budget increase.`;
    } else if (cac3 > baselineCac * 1.2 && cac3 > cac7 * 1.1) {
      signal = "pause_losers";
      signal_label = "Alert: Pause Losing Creatives";
      signal_detail = `CAC spiked to $${Math.round(cac3)} over the last 3 days (${Math.round(cac3VsBaseline)}% above baseline, ${Math.round(cac3Vs7)}% above 7d avg). Identify and pause underperforming creatives.`;
    } else if (cac3 > baselineCac * 1.1) {
      signal = "reduce";
      signal_label = "Caution: Consider Reducing Spend";
      signal_detail = `CAC is trending up to $${Math.round(cac3)} (${Math.round(cac3VsBaseline)}% above baseline). Monitor closely and reduce budget if trend continues.`;
    } else {
      signal = "hold";
      signal_label = "Stable: Hold Current Budget";
      signal_detail = `CAC is $${Math.round(cac3)} over 3 days vs $${Math.round(cac7)} over 7 days — within normal range of baseline $${Math.round(baselineCac)}.`;
    }
  }

  // Find top losing META creatives (high CPA ads from last 7 days)
  const adAgg = new Map<string, { spend: number; conversions: number; clicks: number; impressions: number; campaign: string; thumbnail_url: string | null; platform: string; status: string | null }>();
  for (const ad of (ads || [])) {
    const key = ad.ad_name;
    const existing = adAgg.get(key) || { spend: 0, conversions: 0, clicks: 0, impressions: 0, campaign: ad.campaign_name || "", thumbnail_url: null, platform: ad.platform || "", status: null };
    existing.spend += Number(ad.spend || 0);
    existing.conversions += Number(ad.conversions || 0);
    existing.clicks += Number(ad.clicks || 0);
    existing.impressions += Number(ad.impressions || 0);
    if (ad.thumbnail_url && !existing.thumbnail_url) existing.thumbnail_url = ad.thumbnail_url;
    if (ad.platform) existing.platform = ad.platform;
    if (ad.status) existing.status = ad.status;
    adAgg.set(key, existing);
  }

  // Separate Meta losing creatives
  const losingCreatives: { name: string; cpa: number; spend: number; campaign: string; thumbnail_url: string | null; platform: string; status: string | null }[] = [];
  for (const [name, ad] of adAgg.entries()) {
    if (ad.platform !== "meta") continue;
    const adCpa = ad.conversions > 0 ? ad.spend / ad.conversions : (ad.spend > 0 ? Infinity : 0);
    if (ad.spend > baseline.avg_daily_spend * 0.5 && (adCpa > baselineCac * 1.3 || (ad.conversions === 0 && ad.spend > baseline.avg_daily_spend))) {
      losingCreatives.push({
        name,
        cpa: adCpa === Infinity ? -1 : Math.round(adCpa),
        spend: Math.round(ad.spend),
        campaign: ad.campaign,
        thumbnail_url: ad.thumbnail_url,
        platform: ad.platform,
        status: ad.status,
      });
    }
  }
  losingCreatives.sort((a, b) => b.spend - a.spend);

  // Find problematic Google keywords
  const kwAgg = new Map<string, { spend: number; conversions: number; clicks: number; impressions: number; campaign: string; adset: string; match_type: string; quality_score: number | null; status: string | null }>();
  for (const kw of (keywords || [])) {
    const key = `${kw.keyword_text}::${kw.platform_campaign_id}::${kw.match_type || ""}`;
    const existing = kwAgg.get(key) || { spend: 0, conversions: 0, clicks: 0, impressions: 0, campaign: kw.campaign_name || "", adset: kw.adset_name || "", match_type: kw.match_type || "", quality_score: null, status: null };
    existing.spend += Number(kw.spend || 0);
    existing.conversions += Number(kw.conversions || 0);
    existing.clicks += Number(kw.clicks || 0);
    existing.impressions += Number(kw.impressions || 0);
    if (kw.quality_score != null) existing.quality_score = Number(kw.quality_score);
    if (kw.status) existing.status = kw.status;
    kwAgg.set(key, existing);
  }

  const losingKeywords: { keyword: string; cpa: number; spend: number; clicks: number; conversions: number; campaign: string; ad_group: string; match_type: string; quality_score: number | null; ctr: number; status: string | null }[] = [];
  for (const [key, kw] of kwAgg.entries()) {
    const kwName = key.split("::")[0];
    const kwCpa = kw.conversions > 0 ? kw.spend / kw.conversions : (kw.spend > 0 ? Infinity : 0);
    const kwCtr = kw.impressions > 0 ? Math.round((kw.clicks / kw.impressions) * 10000) / 100 : 0;
    if (kw.spend > baseline.avg_daily_spend * 0.3 && (kwCpa > baselineCac * 1.3 || (kw.conversions === 0 && kw.spend > baseline.avg_daily_spend * 0.5))) {
      losingKeywords.push({
        keyword: kwName,
        cpa: kwCpa === Infinity ? -1 : Math.round(kwCpa),
        spend: Math.round(kw.spend),
        clicks: kw.clicks,
        conversions: kw.conversions,
        campaign: kw.campaign,
        ad_group: kw.adset,
        match_type: kw.match_type,
        quality_score: kw.quality_score,
        ctr: kwCtr,
        status: kw.status,
      });
    }
  }
  losingKeywords.sort((a, b) => b.spend - a.spend);

  return {
    cac_3d: Math.round(cac3 * 100) / 100,
    cac_7d: Math.round(cac7 * 100) / 100,
    cac_baseline: Math.round(baselineCac * 100) / 100,
    cac_3d_vs_baseline_pct: cac3VsBaseline,
    cac_3d_vs_7d_pct: cac3Vs7,
    spend_3d: Math.round(spend3),
    spend_7d: Math.round(spend7),
    conversions_3d: conv3,
    conversions_7d: conv7,
    signal,
    signal_label: signal_label,
    signal_detail: signal_detail,
    losing_creatives: losingCreatives.slice(0, 5),
    losing_keywords: losingKeywords.slice(0, 10),
  };
}

function computeRiskScore(daily: DailyData[], daysWithData: number, baseline: any) {
  // Data sufficiency (0-1)
  const dataSufficiency = Math.min(1, daysWithData / 60);

  // Historical volatility
  const spendCV = computeCV(daily.slice(-30).map(d => d.spend).filter(v => v > 0));
  const volatilityScore = Math.max(0, 1 - spendCV);

  // Spend concentration (platform diversity)
  // We don't have platform breakdown here, so use conversion volume
  const totalConversions = daily.slice(-30).reduce((s, d) => s + d.conversions, 0);
  const convScore = Math.min(1, totalConversions / 100);

  // Forecast sensitivity
  const sensitivityScore = baseline.confidence_score;

  const composite = (dataSufficiency * 0.25 + volatilityScore * 0.25 + convScore * 0.25 + sensitivityScore * 0.25);
  const confidenceScore = Math.round(composite * 100) / 100;
  const riskLevel = confidenceScore > 0.7 ? "Low" : confidenceScore > 0.4 ? "Medium" : "High";

  return {
    risk_level: riskLevel,
    confidence_score: confidenceScore,
    factors: {
      data_sufficiency: Math.round(dataSufficiency * 100) / 100,
      volatility: Math.round(volatilityScore * 100) / 100,
      conversion_volume: Math.round(convScore * 100) / 100,
      forecast_sensitivity: Math.round(sensitivityScore * 100) / 100,
    },
  };
}

function computeCV(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  if (mean === 0) return 0;
  const variance = values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length;
  return Math.sqrt(variance) / mean;
}

function aggregateCampaigns(campaigns: any[]) {
  const map = new Map<string, { spend: number; revenue: number; conversions: number; clicks: number; impressions: number }>();
  for (const c of campaigns) {
    const key = c.campaign_name;
    const existing = map.get(key) || { spend: 0, revenue: 0, conversions: 0, clicks: 0, impressions: 0 };
    existing.spend += Number(c.spend || 0);
    existing.revenue += Number(c.revenue || 0);
    existing.conversions += Number(c.conversions || 0);
    existing.clicks += Number(c.clicks || 0);
    existing.impressions += Number(c.impressions || 0);
    map.set(key, existing);
  }
  return map;
}

function buildAIPrompt(baseline: any, spendAdj: any[], effAdj: any[], variances: any[], recs: any[], risk: any) {
  return `You are a senior performance marketing strategist. Analyze this optimization engine output and provide a concise 4-5 sentence executive summary with the most actionable insight.

BASELINE FORECAST (30-day):
- Projected Revenue: $${baseline.projected_revenue}
- Projected Spend: $${baseline.projected_spend}
- Projected CPA: $${baseline.projected_cpa}
- MER: ${baseline.projected_mer}x
- Confidence: ${baseline.confidence_score}

SPEND SCENARIOS:
${spendAdj.map(s => `${s.spend_change_pct > 0 ? "+" : ""}${s.spend_change_pct}% spend → $${s.projected_revenue} revenue (${s.delta_revenue_pct > 0 ? "+" : ""}${s.delta_revenue_pct}%)`).join("\n")}

VARIANCES (7-day vs baseline):
${variances.map(v => `${v.metric}: ${v.variance_percent > 0 ? "+" : ""}${v.variance_percent}% (${v.severity})`).join("\n")}

RECOMMENDATIONS: ${recs.length} generated
${recs.slice(0, 3).map(r => `- ${r.type}: ${r.action}`).join("\n")}

RISK: ${risk.risk_level} (confidence: ${risk.confidence_score})

Focus on: the single most impactful action, risk-adjusted, with projected outcome.`;
}

function totalSpend30d(daily: DailyData[]): number {
  return daily.slice(-30).reduce((s, d) => s + d.spend, 0);
}

function computeAdsToKill(ads: any[], shopifyRevenue: number, totalAdSpend: number, baseline: any) {
  // Compute blended Shopify ROAS
  const blendedROAS = totalAdSpend > 0 ? shopifyRevenue / totalAdSpend : 0;

  // Aggregate ads across dates
  const adAgg = new Map<string, { spend: number; conversions: number; clicks: number; impressions: number; campaign: string; thumbnail_url: string | null; platform: string; status: string | null; revenue: number }>();
  for (const ad of ads) {
    const key = ad.ad_name;
    const existing = adAgg.get(key) || { spend: 0, conversions: 0, clicks: 0, impressions: 0, campaign: ad.campaign_name || "", thumbnail_url: null, platform: ad.platform || "", status: null, revenue: 0 };
    existing.spend += Number(ad.spend || 0);
    existing.conversions += Number(ad.conversions || 0);
    existing.clicks += Number(ad.clicks || 0);
    existing.impressions += Number(ad.impressions || 0);
    existing.revenue += Number(ad.spend || 0) * blendedROAS; // attribute revenue proportionally to spend share
    if (ad.thumbnail_url && !existing.thumbnail_url) existing.thumbnail_url = ad.thumbnail_url;
    if (ad.platform) existing.platform = ad.platform;
    if (ad.status) existing.status = ad.status;
    adAgg.set(key, existing);
  }

  // Filter to ads with significant spend but terrible unit economics
  const results: any[] = [];
  for (const [name, ad] of adAgg.entries()) {
    if (ad.spend < baseline.avg_daily_spend * 0.3) continue; // skip low-spend noise
    
    const adCPA = ad.conversions > 0 ? ad.spend / ad.conversions : (ad.spend > 0 ? -1 : 0);
    const spendShare = totalAdSpend > 0 ? (ad.spend / totalAdSpend) * 100 : 0;
    // Shopify ROAS for this ad = proportional Shopify revenue / ad spend
    const shopifyROAS = ad.spend > 0 ? (ad.spend / totalAdSpend) * shopifyRevenue / ad.spend : 0;
    // That simplifies to blendedROAS for all — so instead use conversions as the differentiator
    // Ads with 0 conversions or very high CPA are dragging ROAS down
    const isLoser = adCPA === -1 || (adCPA > 0 && adCPA > baseline.projected_cpa * 1.5);
    
    if (!isLoser) continue;

    // Calculate wasted spend (spend that generated no/insufficient return)
    const efficientSpend = ad.conversions > 0 ? ad.conversions * baseline.projected_cpa : 0;
    const wastedSpend = Math.max(0, Math.round(ad.spend - efficientSpend));

    results.push({
      name,
      platform: ad.platform,
      campaign: ad.campaign,
      thumbnail_url: ad.thumbnail_url,
      status: ad.status,
      spend: Math.round(ad.spend),
      conversions: ad.conversions,
      cpa: adCPA === -1 ? -1 : Math.round(adCPA),
      shopify_roas: Math.round(blendedROAS * 100) / 100,
      spend_share_pct: Math.round(spendShare * 10) / 10,
      wasted_spend: wastedSpend,
      recommendation: adCPA === -1 ? "Kill — spending with zero conversions" : `Kill — CPA $${Math.round(adCPA)} is ${Math.round(((adCPA / baseline.projected_cpa) - 1) * 100)}% above target`,
    });
  }

  results.sort((a, b) => b.wasted_spend - a.wasted_spend);
  return results.slice(0, 10);
}

function jsonRes(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function fmt(d: Date): string {
  return d.toISOString().split("T")[0];
}
