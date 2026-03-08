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
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const token = authHeader.replace("Bearer ", "");
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
  if (claimsError || !claimsData?.claims) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Parse body for client_id and revenue_source
  let clientId: string | null = null;
  let revenueSource = "subbly";
  try {
    const body = await req.json();
    clientId = body.client_id || null;
    revenueSource = body.revenue_source || "subbly";
  } catch {
    // No body is fine for backwards compat
  }

  // Determine current month boundaries
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const totalDaysInMonth = monthEnd.getDate();
  const today = now.getDate();
  // Today is incomplete, so count it as a remaining day for projections
  const remainingDays = totalDaysInMonth - today + 1;
  const completedDays = today - 1;

  const monthStartStr = formatDate(monthStart);
  const todayStr = formatDate(now);

  // Fetch MTD ad spend (all platforms except shopify), scoped by client_id
  let adQuery = supabase
    .from("ad_daily_metrics")
    .select("date, spend")
    .neq("platform", "shopify")
    .gte("date", monthStartStr)
    .lte("date", todayStr)
    .order("date", { ascending: true });

  if (clientId) adQuery = adQuery.eq("client_id", clientId);

  const { data: monthAdMetrics, error: adErr } = await adQuery;

  if (adErr) {
    return errResponse(adErr.message);
  }

  // Fetch MTD orders/subscriptions based on revenue source
  const fromUTC = monthStartStr + "T00:00:00.000Z";
  const tomorrowStr = formatDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  const toUTC = tomorrowStr + "T04:59:59.999Z";

  let actualOrders = 0;
  const mtdDailyOrders = new Map<string, number>();
  let mtdRevenue = 0;
  let mtdCOGS = 0;
  let mtdTaxesShipping = 0;
  let mtdDiscounts = 0;
  const mtdDailyRevenue = new Map<string, number>();
  const mtdDailyCosts = new Map<string, { cogs: number; taxes: number; discounts: number }>();

  if (revenueSource === "shopify") {
    let orderQuery = supabase
      .from("shopify_orders")
      .select("order_date, total_price, total_cost, total_tax, total_shipping, total_discounts")
      .in("financial_status", ["paid", "partially_refunded"])
      .gte("order_date", fromUTC)
      .lte("order_date", toUTC);

    if (clientId) orderQuery = orderQuery.eq("client_id", clientId);

    const { data: orders, error: ordErr } = await orderQuery;
    if (ordErr) return errResponse(ordErr.message);

    actualOrders = (orders || []).length;
    for (const row of (orders || []) as any[]) {
      if (!row.order_date) continue;
      const d = row.order_date.split("T")[0];
      mtdDailyOrders.set(d, (mtdDailyOrders.get(d) || 0) + 1);
      const rev = Number(row.total_price || 0);
      mtdRevenue += rev;
      mtdDailyRevenue.set(d, (mtdDailyRevenue.get(d) || 0) + rev);
      const cogs = Number(row.total_cost || 0);
      const taxes = Number(row.total_tax || 0) + Number(row.total_shipping || 0);
      const discounts = Number(row.total_discounts || 0);
      mtdCOGS += cogs;
      mtdTaxesShipping += taxes;
      mtdDiscounts += discounts;
      const existing = mtdDailyCosts.get(d) || { cogs: 0, taxes: 0, discounts: 0 };
      existing.cogs += cogs;
      existing.taxes += taxes;
      existing.discounts += discounts;
      mtdDailyCosts.set(d, existing);
    }
  } else {
    let subQuery = supabase
      .from("subbly_subscriptions")
      .select("id, subbly_created_at")
      .gte("subbly_created_at", fromUTC)
      .lte("subbly_created_at", toUTC);

    if (clientId) subQuery = subQuery.eq("client_id", clientId);

    const { data: monthSubs, error: subErr } = await subQuery;
    if (subErr) return errResponse(subErr.message);

    actualOrders = (monthSubs || []).length;
    for (const sub of monthSubs || []) {
      if (!sub.subbly_created_at) continue;
      const d = sub.subbly_created_at.split("T")[0];
      mtdDailyOrders.set(d, (mtdDailyOrders.get(d) || 0) + 1);
    }
  }

  // MTD actuals
  const actualSpend = (monthAdMetrics || []).reduce((s, r) => s + Number(r.spend), 0);

  const mtdDailySpend = new Map<string, number>();
  for (const row of monthAdMetrics || []) {
    mtdDailySpend.set(row.date, (mtdDailySpend.get(row.date) || 0) + Number(row.spend));
  }

  // Build MTD series — include today for actuals but use yesterday as the
  // last "complete" day for projection averages (today's data is partial).
  const mtdDates: string[] = [];
  for (let i = 1; i <= today; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), i);
    mtdDates.push(formatDate(d));
  }

  const mtdSeries = mtdDates.map(d => ({
    date: d,
    spend: mtdDailySpend.get(d) || 0,
    subs: mtdDailyOrders.get(d) || 0,
    revenue: mtdDailyRevenue.get(d) || 0,
    cogs: mtdDailyCosts.get(d)?.cogs || 0,
    taxes: mtdDailyCosts.get(d)?.taxes || 0,
    discounts: mtdDailyCosts.get(d)?.discounts || 0,
  }));

  // Use only completed days (exclude today) for projection averages.
  // Today's partial data would otherwise drag down all daily rate estimates.
  const completedSeries = mtdSeries.slice(0, -1);
  const daysWithData = completedSeries.filter(d => d.spend > 0 || d.subs > 0).length || 1;

  const recentWindow = 7;
  const recentDays = completedSeries.slice(-recentWindow);
  const olderDays = completedSeries.slice(0, -recentWindow);

  const weightedAvg = (arr: typeof completedSeries, older: typeof completedSeries, field: string) => {
    const recentAvg = arr.length > 0 ? arr.reduce((s, d) => s + Number((d as any)[field]), 0) / arr.length : 0;
    const olderAvg = older.length > 0 ? older.reduce((s, d) => s + Number((d as any)[field]), 0) / older.length : recentAvg;
    if (older.length > 0) return (recentAvg * 2 + olderAvg * 1) / 3;
    return recentAvg;
  };

  const projDailySubs = weightedAvg(recentDays, olderDays, "subs");
  const projDailySpend = weightedAvg(recentDays, olderDays, "spend");
  const projDailyRevenue = weightedAvg(recentDays, olderDays, "revenue");
  const projDailyCOGS = weightedAvg(recentDays, olderDays, "cogs");
  const projDailyTaxes = weightedAvg(recentDays, olderDays, "taxes");
  const projDailyDiscounts = weightedAvg(recentDays, olderDays, "discounts");

  const last3 = completedSeries.slice(-3);
  const last3AvgSubs = last3.length > 0 ? last3.reduce((s, d) => s + d.subs, 0) / last3.length : 0;
  const overallAvgSubs = actualOrders / daysWithData;
  const rawTrend = overallAvgSubs > 0 ? last3AvgSubs / overallAvgSubs : 1;
  const trendMultiplier = Math.min(1.25, Math.max(0.8, 0.7 + 0.3 * rawTrend));

  const adjustedDailySubs = projDailySubs * trendMultiplier;

  let projectedSpend = 0;
  let projectedSubs = 0;
  let projectedRevenue = 0;
  let projectedCOGS = 0;
  let projectedTaxes = 0;
  let projectedDiscounts = 0;
  const dailyForecast: any[] = [];

  for (let i = 1; i <= remainingDays; i++) {
    const forecastDate = new Date(now);
    forecastDate.setDate(forecastDate.getDate() + i);
    const daySpend = Math.max(0, Math.round(projDailySpend));
    const daySubs = Math.max(0, Math.round(adjustedDailySubs));

    projectedSpend += daySpend;
    projectedSubs += daySubs;
    projectedRevenue += Math.max(0, projDailyRevenue);
    projectedCOGS += Math.max(0, projDailyCOGS);
    projectedTaxes += Math.max(0, projDailyTaxes);
    projectedDiscounts += Math.max(0, projDailyDiscounts);

    dailyForecast.push({
      date: formatDate(forecastDate),
      projected_spend: daySpend,
      projected_subs: daySubs,
    });
  }

  const monthTotalSpend = actualSpend + projectedSpend;
  const monthTotalSubs = actualOrders + projectedSubs;
  const monthCAC = monthTotalSubs > 0 ? Math.round((monthTotalSpend / monthTotalSubs) * 100) / 100 : 0;

  const avgDailySubs = daysWithData > 0 ? Math.round((actualOrders / daysWithData) * 10) / 10 : 0;
  const avgDailySpend = daysWithData > 0 ? Math.round(actualSpend / daysWithData) : 0;
  const avgDailyRevenue = daysWithData > 0 ? Math.round(mtdRevenue / daysWithData) : 0;
  const avgDailyConversions = daysWithData > 0 
    ? Math.round(((monthAdMetrics || []).reduce((s, r) => s + Number(r.spend), 0) > 0 ? actualOrders / daysWithData : 0) * 10) / 10 
    : 0;

  // Profit calculations
  const actualProfit = Math.round((mtdRevenue - actualSpend - mtdCOGS - mtdTaxesShipping - mtdDiscounts) * 100) / 100;
  const monthTotalRevenue = mtdRevenue + projectedRevenue;
  const monthTotalCOGS = mtdCOGS + projectedCOGS;
  const monthTotalTaxes = mtdTaxesShipping + projectedTaxes;
  const monthTotalDiscounts = mtdDiscounts + projectedDiscounts;
  const monthTotalProfit = Math.round((monthTotalRevenue - monthTotalSpend - monthTotalCOGS - monthTotalTaxes - monthTotalDiscounts) * 100) / 100;

  const ordersLabel = revenueSource === "shopify" ? "customers" : "subscriptions";

  const stats = {
    month: monthName,
    days_elapsed: today,
    days_remaining: remainingDays,
    total_days: totalDaysInMonth,
    actual_subs: actualOrders,
    actual_spend: Math.round(actualSpend),
    actual_cac: actualOrders > 0 ? Math.round((actualSpend / actualOrders) * 100) / 100 : 0,
    projected_remaining_subs: projectedSubs,
    projected_remaining_spend: Math.round(projectedSpend),
    month_total_subs: monthTotalSubs,
    month_total_spend: Math.round(monthTotalSpend),
    month_cac: monthCAC,
    avg_daily_subs: avgDailySubs,
    avg_daily_spend: avgDailySpend,
    avg_daily_revenue: avgDailyRevenue,
    avg_daily_conversions: avgDailyConversions,
    daily_forecast: dailyForecast,
    completed_days: completedDays,
    trend_direction: trendMultiplier > 1.05 ? "accelerating" : trendMultiplier < 0.95 ? "decelerating" : "steady",
    // Profit fields (populated for Shopify clients)
    actual_revenue: Math.round(mtdRevenue * 100) / 100,
    actual_cogs: Math.round(mtdCOGS * 100) / 100,
    actual_taxes_shipping: Math.round(mtdTaxesShipping * 100) / 100,
    actual_discounts: Math.round(mtdDiscounts * 100) / 100,
    actual_profit: actualProfit,
    month_total_revenue: Math.round(monthTotalRevenue * 100) / 100,
    month_total_cogs: Math.round(monthTotalCOGS * 100) / 100,
    month_total_taxes_shipping: Math.round(monthTotalTaxes * 100) / 100,
    month_total_discounts: Math.round(monthTotalDiscounts * 100) / 100,
    month_total_profit: monthTotalProfit,
    revenue_source: revenueSource,
  };

  // AI insight
  let aiInsight = "";
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (LOVABLE_API_KEY) {
    try {
      const profitContext = revenueSource === "shopify"
        ? `\nMTD Revenue: $${Math.round(mtdRevenue)}, MTD COGS: $${Math.round(mtdCOGS)}, MTD Taxes/Shipping: $${Math.round(mtdTaxesShipping)}, MTD Discounts: $${Math.round(mtdDiscounts)}\nMTD Profit: $${actualProfit}\nProjected Month Profit: $${monthTotalProfit} (Revenue $${Math.round(monthTotalRevenue)} - Spend $${Math.round(monthTotalSpend)} - COGS $${Math.round(monthTotalCOGS)} - Taxes/Shipping $${Math.round(monthTotalTaxes)} - Discounts $${Math.round(monthTotalDiscounts)})`
        : "";

      const prompt = `You are a performance marketing analyst for a DTC ${revenueSource === "shopify" ? "e-commerce" : "subscription"} brand. Provide a concise 3-4 sentence monthly forecast summary.

Month: ${monthName}
Days elapsed: ${today} of ${totalDaysInMonth} (${remainingDays} remaining)
Actuals MTD: ${actualOrders} new ${ordersLabel}, $${Math.round(actualSpend)} total ad spend, CAC $${stats.actual_cac}
Avg daily: ${avgDailySubs} ${ordersLabel}/day, $${avgDailySpend} spend/day
Recent trend (last 3 days): ${last3AvgSubs.toFixed(1)} ${ordersLabel}/day (${stats.trend_direction})${profitContext}

Forecast for full month: ${monthTotalSubs} total new ${ordersLabel} (+${projectedSubs} projected remaining), $${Math.round(monthTotalSpend)} total spend, projected CAC $${monthCAC}

Focus on: ${revenueSource === "shopify" ? "profitability trajectory, margin optimization," : "subscription growth trajectory,"} CAC efficiency, and actionable advice to improve ${revenueSource === "shopify" ? "profit" : "acquisition"}.`;

      const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 300,
        }),
      });

      const aiData = await aiRes.json();
      aiInsight = aiData.choices?.[0]?.message?.content || "";
    } catch (err) {
      console.error("AI insight error:", err);
    }
  }

  return new Response(JSON.stringify({ ...stats, ai_insight: aiInsight }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

function errResponse(msg: string, status = 500) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/json",
    },
  });
}

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}
