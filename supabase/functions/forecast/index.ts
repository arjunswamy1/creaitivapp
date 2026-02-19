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

  const body = await req.json().catch(() => ({}));
  const forecastDays = body.forecast_days || 30;

  // Get historical daily metrics (last 90 days for statistical analysis)
  const { data: metrics, error } = await supabase
    .from("ad_daily_metrics")
    .select("date, spend, revenue, impressions, clicks, conversions")
    .order("date", { ascending: true });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!metrics || metrics.length < 3) {
    return new Response(JSON.stringify({ error: "Not enough data for forecasting (need 3+ days)" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Statistical forecasting: linear regression on daily conversions and revenue
  const dailyData = metrics.map((m, i) => ({
    index: i,
    date: m.date,
    spend: Number(m.spend),
    revenue: Number(m.revenue),
    conversions: Number(m.conversions),
    clicks: Number(m.clicks),
    impressions: Number(m.impressions),
  }));

  const revenueRegression = linearRegression(dailyData.map(d => d.index), dailyData.map(d => d.revenue));
  const conversionsRegression = linearRegression(dailyData.map(d => d.index), dailyData.map(d => d.conversions));
  const spendRegression = linearRegression(dailyData.map(d => d.index), dailyData.map(d => d.spend));

  const n = dailyData.length;
  const forecast: any[] = [];
  for (let i = 0; i < forecastDays; i++) {
    const idx = n + i;
    const forecastDate = new Date();
    forecastDate.setDate(forecastDate.getDate() + i);
    forecast.push({
      date: forecastDate.toISOString().split("T")[0],
      projected_revenue: Math.max(0, Math.round(revenueRegression.slope * idx + revenueRegression.intercept)),
      projected_conversions: Math.max(0, Math.round(conversionsRegression.slope * idx + conversionsRegression.intercept)),
      projected_spend: Math.max(0, Math.round(spendRegression.slope * idx + spendRegression.intercept)),
    });
  }

  const totalProjectedRevenue = forecast.reduce((s, f) => s + f.projected_revenue, 0);
  const totalProjectedConversions = forecast.reduce((s, f) => s + f.projected_conversions, 0);
  const totalProjectedSpend = forecast.reduce((s, f) => s + f.projected_spend, 0);

  // Calculate trends
  const recentAvg = (arr: number[], days: number) => {
    const slice = arr.slice(-days);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  };

  const recent7Revenue = recentAvg(dailyData.map(d => d.revenue), 7);
  const recent7Conversions = recentAvg(dailyData.map(d => d.conversions), 7);
  const older7Revenue = recentAvg(dailyData.map(d => d.revenue).slice(0, -7), Math.min(7, dailyData.length - 7));
  const older7Conversions = recentAvg(dailyData.map(d => d.conversions).slice(0, -7), Math.min(7, dailyData.length - 7));

  const stats = {
    data_points: dailyData.length,
    forecast_days: forecastDays,
    total_projected_revenue: totalProjectedRevenue,
    total_projected_conversions: totalProjectedConversions,
    total_projected_spend: totalProjectedSpend,
    projected_roas: totalProjectedSpend > 0 ? Math.round((totalProjectedRevenue / totalProjectedSpend) * 100) / 100 : 0,
    revenue_trend: older7Revenue > 0 ? Math.round(((recent7Revenue - older7Revenue) / older7Revenue) * 100) : 0,
    conversions_trend: older7Conversions > 0 ? Math.round(((recent7Conversions - older7Conversions) / older7Conversions) * 100) : 0,
    daily_forecast: forecast,
  };

  // AI-powered insight layer
  let aiInsight = "";
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (LOVABLE_API_KEY) {
    try {
      const prompt = `You are a performance marketing analyst. Analyze this ad performance data and provide a concise 3-4 sentence forecast summary.

Historical data (last ${dailyData.length} days):
- Average daily revenue: $${Math.round(dailyData.reduce((s, d) => s + d.revenue, 0) / dailyData.length)}
- Average daily conversions: ${Math.round(dailyData.reduce((s, d) => s + d.conversions, 0) / dailyData.length)}
- Average daily spend: $${Math.round(dailyData.reduce((s, d) => s + d.spend, 0) / dailyData.length)}
- Revenue trend (7d vs prior): ${stats.revenue_trend > 0 ? "+" : ""}${stats.revenue_trend}%
- Conversions trend: ${stats.conversions_trend > 0 ? "+" : ""}${stats.conversions_trend}%

Statistical forecast for next ${forecastDays} days:
- Projected revenue: $${totalProjectedRevenue.toLocaleString()}
- Projected conversions: ${totalProjectedConversions.toLocaleString()}
- Projected ROAS: ${stats.projected_roas}x

Provide actionable insights about the trajectory and recommendations. Be specific with numbers.`;

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
