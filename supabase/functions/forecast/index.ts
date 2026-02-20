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
  const remainingDays = totalDaysInMonth - today;
  const monthName = now.toLocaleString("en-US", { month: "long", year: "numeric" });

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

  if (revenueSource === "shopify") {
    // Use Shopify orders
    let orderQuery = supabase
      .from("shopify_orders")
      .select("order_date")
      .in("financial_status", ["paid", "partially_refunded"])
      .gte("order_date", fromUTC)
      .lte("order_date", toUTC);

    if (clientId) orderQuery = orderQuery.eq("client_id", clientId);

    const { data: orders, error: ordErr } = await orderQuery;
    if (ordErr) return errResponse(ordErr.message);

    actualOrders = (orders || []).length;
    for (const row of orders || []) {
      if (!(row as any).order_date) continue;
      const d = (row as any).order_date.split("T")[0];
      mtdDailyOrders.set(d, (mtdDailyOrders.get(d) || 0) + 1);
    }
  } else {
    // Use Subbly subscriptions
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

  // Build daily MTD maps for this month
  const mtdDailySpend = new Map<string, number>();
  for (const row of monthAdMetrics || []) {
    mtdDailySpend.set(row.date, (mtdDailySpend.get(row.date) || 0) + Number(row.spend));
  }

  // Build ordered MTD daily series
  const mtdDates: string[] = [];
  for (let i = 1; i <= today; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), i);
    mtdDates.push(formatDate(d));
  }

  const mtdSeries = mtdDates.map(d => ({
    date: d,
    spend: mtdDailySpend.get(d) || 0,
    subs: mtdDailyOrders.get(d) || 0,
  }));

  const daysWithData = mtdSeries.filter(d => d.spend > 0 || d.subs > 0).length || 1;

  // Use weighted recent average for projection (last 7 days weighted 2x vs earlier days)
  const recentWindow = 7;
  const recentDays = mtdSeries.slice(-recentWindow);
  const olderDays = mtdSeries.slice(0, -recentWindow);

  const recentAvgSubs = recentDays.length > 0
    ? recentDays.reduce((s, d) => s + d.subs, 0) / recentDays.length
    : 0;
  const olderAvgSubs = olderDays.length > 0
    ? olderDays.reduce((s, d) => s + d.subs, 0) / olderDays.length
    : recentAvgSubs;

  const recentAvgSpend = recentDays.length > 0
    ? recentDays.reduce((s, d) => s + d.spend, 0) / recentDays.length
    : 0;
  const olderAvgSpend = olderDays.length > 0
    ? olderDays.reduce((s, d) => s + d.spend, 0) / olderDays.length
    : recentAvgSpend;

  // Weighted average: recent gets 2x weight
  const recentWeight = 2;
  const olderWeight = 1;
  const totalWeight = (olderDays.length > 0 ? olderWeight : 0) + recentWeight;

  const projDailySubs = olderDays.length > 0
    ? (recentAvgSubs * recentWeight + olderAvgSubs * olderWeight) / totalWeight
    : recentAvgSubs;
  const projDailySpend = olderDays.length > 0
    ? (recentAvgSpend * recentWeight + olderAvgSpend * olderWeight) / totalWeight
    : recentAvgSpend;

  // Also compute trend direction from last 3 days vs overall avg
  const last3 = mtdSeries.slice(-3);
  const last3AvgSubs = last3.length > 0 ? last3.reduce((s, d) => s + d.subs, 0) / last3.length : 0;
  const overallAvgSubs = actualOrders / daysWithData;
  const rawTrend = overallAvgSubs > 0 ? last3AvgSubs / overallAvgSubs : 1;
  const trendMultiplier = Math.min(1.25, Math.max(0.8, 0.7 + 0.3 * rawTrend));

  const adjustedDailySubs = projDailySubs * trendMultiplier;

  let projectedSpend = 0;
  let projectedSubs = 0;
  const dailyForecast: any[] = [];

  for (let i = 1; i <= remainingDays; i++) {
    const forecastDate = new Date(now);
    forecastDate.setDate(forecastDate.getDate() + i);
    const daySpend = Math.max(0, Math.round(projDailySpend));
    const daySubs = Math.max(0, Math.round(adjustedDailySubs));

    projectedSpend += daySpend;
    projectedSubs += daySubs;

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
    daily_forecast: dailyForecast,
    trend_direction: trendMultiplier > 1.05 ? "accelerating" : trendMultiplier < 0.95 ? "decelerating" : "steady",
  };

  // AI insight
  let aiInsight = "";
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (LOVABLE_API_KEY) {
    try {
      const prompt = `You are a performance marketing analyst for a DTC ${revenueSource === "shopify" ? "e-commerce" : "subscription"} brand. Provide a concise 3-4 sentence monthly forecast summary.

Month: ${monthName}
Days elapsed: ${today} of ${totalDaysInMonth} (${remainingDays} remaining)
Actuals MTD: ${actualOrders} new ${ordersLabel}, $${Math.round(actualSpend)} total ad spend, CAC $${stats.actual_cac}
Avg daily: ${avgDailySubs} ${ordersLabel}/day, $${avgDailySpend} spend/day
Recent trend (last 3 days): ${last3AvgSubs.toFixed(1)} ${ordersLabel}/day (${stats.trend_direction})

Forecast for full month: ${monthTotalSubs} total new ${ordersLabel} (+${projectedSubs} projected remaining), $${Math.round(monthTotalSpend)} total spend, projected CAC $${monthCAC}

Focus on: ${revenueSource === "shopify" ? "customer acquisition trajectory" : "subscription growth trajectory"}, CAC efficiency, and actionable advice to improve acquisition.`;

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
