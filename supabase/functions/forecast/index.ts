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

  // Determine current month boundaries
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0); // last day of month
  const totalDaysInMonth = monthEnd.getDate();
  const today = now.getDate();
  const remainingDays = totalDaysInMonth - today;
  const monthName = now.toLocaleString("en-US", { month: "long", year: "numeric" });

  const monthStartStr = formatDate(monthStart);
  const todayStr = formatDate(now);

  // Fetch actuals for current month so far
  const { data: monthActuals, error: monthErr } = await supabase
    .from("ad_daily_metrics")
    .select("date, spend, revenue, conversions")
    .gte("date", monthStartStr)
    .lte("date", todayStr)
    .order("date", { ascending: true });

  if (monthErr) {
    return new Response(JSON.stringify({ error: monthErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Fetch all historical data for regression
  const { data: allMetrics, error: allErr } = await supabase
    .from("ad_daily_metrics")
    .select("date, spend, revenue, conversions")
    .order("date", { ascending: true });

  if (allErr) {
    return new Response(JSON.stringify({ error: allErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!allMetrics || allMetrics.length < 3) {
    return new Response(JSON.stringify({ error: "Not enough data for forecasting (need 3+ days)" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Actuals MTD
  const actualPurchases = (monthActuals || []).reduce((s, r) => s + Number(r.conversions), 0);
  const actualSpend = (monthActuals || []).reduce((s, r) => s + Number(r.spend), 0);
  const actualRevenue = (monthActuals || []).reduce((s, r) => s + Number(r.revenue), 0);
  const daysWithData = (monthActuals || []).length;

  // Linear regression on all historical for daily projections
  const dailyData = allMetrics.map((m, i) => ({
    index: i,
    spend: Number(m.spend),
    revenue: Number(m.revenue),
    conversions: Number(m.conversions),
  }));

  const convRegression = linearRegression(dailyData.map(d => d.index), dailyData.map(d => d.conversions));
  const spendRegression = linearRegression(dailyData.map(d => d.index), dailyData.map(d => d.spend));
  const revRegression = linearRegression(dailyData.map(d => d.index), dailyData.map(d => d.revenue));

  const n = dailyData.length;

  // Project remaining days of the month
  const dailyForecast: any[] = [];
  let projectedPurchases = 0;
  let projectedSpend = 0;
  let projectedRevenue = 0;

  for (let i = 1; i <= remainingDays; i++) {
    const idx = n + i - 1;
    const forecastDate = new Date(now);
    forecastDate.setDate(forecastDate.getDate() + i);
    const dayPurchases = Math.max(0, Math.round(convRegression.slope * idx + convRegression.intercept));
    const daySpend = Math.max(0, Math.round(spendRegression.slope * idx + spendRegression.intercept));
    const dayRevenue = Math.max(0, Math.round(revRegression.slope * idx + revRegression.intercept));

    projectedPurchases += dayPurchases;
    projectedSpend += daySpend;
    projectedRevenue += dayRevenue;

    dailyForecast.push({
      date: formatDate(forecastDate),
      projected_conversions: dayPurchases,
      projected_spend: daySpend,
      projected_revenue: dayRevenue,
    });
  }

  // Monthly totals = actual + projected
  const monthTotalPurchases = actualPurchases + projectedPurchases;
  const monthTotalSpend = actualSpend + projectedSpend;
  const monthTotalRevenue = actualRevenue + projectedRevenue;
  const monthCAC = monthTotalPurchases > 0 ? Math.round((monthTotalSpend / monthTotalPurchases) * 100) / 100 : 0;
  const monthROAS = monthTotalSpend > 0 ? Math.round((monthTotalRevenue / monthTotalSpend) * 100) / 100 : 0;

  // Daily average for context
  const avgDailyPurchases = daysWithData > 0 ? Math.round((actualPurchases / daysWithData) * 10) / 10 : 0;
  const avgDailySpend = daysWithData > 0 ? Math.round(actualSpend / daysWithData) : 0;

  const stats = {
    month: monthName,
    days_elapsed: today,
    days_remaining: remainingDays,
    total_days: totalDaysInMonth,
    // Actuals MTD
    actual_purchases: actualPurchases,
    actual_spend: Math.round(actualSpend),
    actual_revenue: Math.round(actualRevenue),
    actual_cac: actualPurchases > 0 ? Math.round((actualSpend / actualPurchases) * 100) / 100 : 0,
    // Projected remaining
    projected_remaining_purchases: projectedPurchases,
    projected_remaining_spend: Math.round(projectedSpend),
    projected_remaining_revenue: Math.round(projectedRevenue),
    // Month totals (actual + projected)
    month_total_purchases: monthTotalPurchases,
    month_total_spend: Math.round(monthTotalSpend),
    month_total_revenue: Math.round(monthTotalRevenue),
    month_cac: monthCAC,
    month_roas: monthROAS,
    // Context
    avg_daily_purchases: avgDailyPurchases,
    avg_daily_spend: avgDailySpend,
    daily_forecast: dailyForecast,
  };

  // AI insight layer
  let aiInsight = "";
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (LOVABLE_API_KEY) {
    try {
      const prompt = `You are a performance marketing analyst. Provide a concise 3-4 sentence monthly forecast summary.

Month: ${monthName}
Days elapsed: ${today} of ${totalDaysInMonth}
Actuals MTD: ${actualPurchases} purchases, $${Math.round(actualSpend)} spend, $${Math.round(actualRevenue)} revenue, CAC $${stats.actual_cac}
Avg daily: ${avgDailyPurchases} purchases/day, $${avgDailySpend} spend/day

Forecast for full month: ${monthTotalPurchases} total purchases, $${Math.round(monthTotalSpend)} total spend, CAC $${monthCAC}, ROAS ${monthROAS}x

Focus on: Will the brand hit purchase targets? Is CAC trending well? Actionable advice.`;

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

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function linearRegression(x: number[], y: number[]) {
  const n = x.length;
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((a, xi, i) => a + xi * y[i], 0);
  const sumX2 = x.reduce((a, xi) => a + xi * xi, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  return { slope: isNaN(slope) ? 0 : slope, intercept: isNaN(intercept) ? 0 : intercept };
}
