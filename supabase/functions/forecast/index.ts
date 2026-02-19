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
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const totalDaysInMonth = monthEnd.getDate();
  const today = now.getDate();
  const remainingDays = totalDaysInMonth - today;
  const monthName = now.toLocaleString("en-US", { month: "long", year: "numeric" });

  const monthStartStr = formatDate(monthStart);
  const todayStr = formatDate(now);

  // Fetch MTD ad spend (all platforms)
  const { data: monthAdMetrics, error: adErr } = await supabase
    .from("ad_daily_metrics")
    .select("date, spend")
    .gte("date", monthStartStr)
    .lte("date", todayStr)
    .order("date", { ascending: true });

  if (adErr) {
    return errResponse(adErr.message);
  }

  // Fetch MTD Subbly new subscriptions
  const fromUTC = monthStartStr + "T05:00:00.000Z";
  const tomorrowStr = formatDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  const toUTC = tomorrowStr + "T04:59:59.999Z";

  const { data: monthSubs, error: subErr } = await supabase
    .from("subbly_subscriptions")
    .select("id, subbly_created_at")
    .gte("subbly_created_at", fromUTC)
    .lte("subbly_created_at", toUTC);

  if (subErr) {
    return errResponse(subErr.message);
  }

  // Fetch historical daily data for regression (spend + subs)
  const { data: allAdMetrics, error: allAdErr } = await supabase
    .from("ad_daily_metrics")
    .select("date, spend")
    .order("date", { ascending: true });

  if (allAdErr) {
    return errResponse(allAdErr.message);
  }

  const { data: allSubs, error: allSubErr } = await supabase
    .from("subbly_subscriptions")
    .select("subbly_created_at")
    .not("subbly_created_at", "is", null)
    .order("subbly_created_at", { ascending: true });

  if (allSubErr) {
    return errResponse(allSubErr.message);
  }

  // Build daily spend map
  const dailySpend = new Map<string, number>();
  for (const row of allAdMetrics || []) {
    const d = row.date;
    dailySpend.set(d, (dailySpend.get(d) || 0) + Number(row.spend));
  }

  // Build daily subs map
  const dailySubs = new Map<string, number>();
  for (const sub of allSubs || []) {
    if (!sub.subbly_created_at) continue;
    const d = sub.subbly_created_at.split("T")[0];
    dailySubs.set(d, (dailySubs.get(d) || 0) + 1);
  }

  // Merge into aligned daily series
  const allDates = [...new Set([...dailySpend.keys(), ...dailySubs.keys()])].sort();
  if (allDates.length < 3) {
    return errResponse("Not enough data for forecasting (need 3+ days)", 400);
  }

  const dailyData = allDates.map((d, i) => ({
    index: i,
    spend: dailySpend.get(d) || 0,
    subs: dailySubs.get(d) || 0,
  }));

  // MTD actuals
  const actualSpend = (monthAdMetrics || []).reduce((s, r) => s + Number(r.spend), 0);
  const actualSubs = (monthSubs || []).length;
  const daysWithData = new Set((monthAdMetrics || []).map(r => r.date)).size;

  // Linear regression for projections
  const spendReg = linearRegression(dailyData.map(d => d.index), dailyData.map(d => d.spend));
  const subsReg = linearRegression(dailyData.map(d => d.index), dailyData.map(d => d.subs));
  const n = dailyData.length;

  let projectedSpend = 0;
  let projectedSubs = 0;
  const dailyForecast: any[] = [];

  for (let i = 1; i <= remainingDays; i++) {
    const idx = n + i - 1;
    const forecastDate = new Date(now);
    forecastDate.setDate(forecastDate.getDate() + i);
    const daySpend = Math.max(0, Math.round(spendReg.slope * idx + spendReg.intercept));
    const daySubs = Math.max(0, Math.round(subsReg.slope * idx + subsReg.intercept));

    projectedSpend += daySpend;
    projectedSubs += daySubs;

    dailyForecast.push({
      date: formatDate(forecastDate),
      projected_spend: daySpend,
      projected_subs: daySubs,
    });
  }

  const monthTotalSpend = actualSpend + projectedSpend;
  const monthTotalSubs = actualSubs + projectedSubs;
  const monthCAC = monthTotalSubs > 0 ? Math.round((monthTotalSpend / monthTotalSubs) * 100) / 100 : 0;

  const avgDailySubs = daysWithData > 0 ? Math.round((actualSubs / daysWithData) * 10) / 10 : 0;
  const avgDailySpend = daysWithData > 0 ? Math.round(actualSpend / daysWithData) : 0;

  const stats = {
    month: monthName,
    days_elapsed: today,
    days_remaining: remainingDays,
    total_days: totalDaysInMonth,
    actual_subs: actualSubs,
    actual_spend: Math.round(actualSpend),
    actual_cac: actualSubs > 0 ? Math.round((actualSpend / actualSubs) * 100) / 100 : 0,
    projected_remaining_subs: projectedSubs,
    projected_remaining_spend: Math.round(projectedSpend),
    month_total_subs: monthTotalSubs,
    month_total_spend: Math.round(monthTotalSpend),
    month_cac: monthCAC,
    avg_daily_subs: avgDailySubs,
    avg_daily_spend: avgDailySpend,
    daily_forecast: dailyForecast,
  };

  // AI insight
  let aiInsight = "";
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (LOVABLE_API_KEY) {
    try {
      const prompt = `You are a performance marketing analyst for a DTC subscription brand. Provide a concise 3-4 sentence monthly forecast summary.

Month: ${monthName}
Days elapsed: ${today} of ${totalDaysInMonth}
Actuals MTD: ${actualSubs} new subscriptions, $${Math.round(actualSpend)} total ad spend, CAC $${stats.actual_cac}
Avg daily: ${avgDailySubs} subs/day, $${avgDailySpend} spend/day

Forecast for full month: ${monthTotalSubs} total new subscriptions, $${Math.round(monthTotalSpend)} total spend, CAC $${monthCAC}

Focus on: subscription growth trajectory, CAC efficiency, and actionable advice to improve acquisition.`;

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
