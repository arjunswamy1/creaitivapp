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

  const SLACK_API_KEY = Deno.env.get("SLACK_API_KEY");
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const GATEWAY_URL = "https://connector-gateway.lovable.dev/slack/api";
  const ALERT_THRESHOLD = 10; // 10% day-over-day change triggers alert

  // Get alert configs with slack channels
  const { data: alertConfigs } = await supabaseAdmin
    .from("alert_settings")
    .select("*")
    .eq("enabled", true);

  if (!alertConfigs || alertConfigs.length === 0) {
    return new Response(JSON.stringify({ message: "No alert configs found" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const today = new Date();
  const yesterday = new Date(today.getTime() - 86400000);
  const dayBefore = new Date(today.getTime() - 2 * 86400000);

  const todayStr = today.toISOString().split("T")[0];
  const yesterdayStr = yesterday.toISOString().split("T")[0];
  const dayBeforeStr = dayBefore.toISOString().split("T")[0];

  const results = [];

  for (const config of alertConfigs) {
    const { user_id, client_id, slack_channel } = config;
    if (!slack_channel || !client_id) continue;

    // Fetch yesterday + day before campaigns (Meta flights only)
    const { data: campaigns } = await supabaseAdmin
      .from("ad_campaigns")
      .select("date, spend, impressions, clicks, conversions, campaign_name")
      .eq("client_id", client_id)
      .eq("platform", "meta")
      .ilike("campaign_name", "%Flight%")
      .gte("date", dayBeforeStr)
      .lte("date", yesterdayStr);

    // Fetch ringba calls for same period
    const { data: calls } = await supabaseAdmin
      .from("ringba_calls")
      .select("call_date, duration_seconds, revenue, connected, converted, campaign_name")
      .eq("client_id", client_id)
      .gte("call_date", dayBeforeStr + "T00:00:00.000Z")
      .lte("call_date", yesterdayStr + "T23:59:59.999Z");

    // Aggregate by day
    function aggregateDay(dayStr: string) {
      const dayCampaigns = (campaigns || []).filter(c => c.date === dayStr);
      const spend = dayCampaigns.reduce((s, c) => s + Number(c.spend), 0);
      const clicks = dayCampaigns.reduce((s, c) => s + Number(c.clicks), 0);
      const impressions = dayCampaigns.reduce((s, c) => s + Number(c.impressions), 0);

      const flightCalls = ((calls || []) as any[]).filter(c => {
        const name = (c.campaign_name || "").toLowerCase();
        return name.includes("flight") && c.call_date.startsWith(dayStr);
      });

      const totalCalls = flightCalls.length;
      const connected = flightCalls.filter(c => c.connected && Number(c.duration_seconds || 0) > 0).length;
      const revenue = flightCalls.filter(c => c.connected && Number(c.duration_seconds || 0) > 0)
        .reduce((s, c) => s + Number(c.revenue || 0), 0);

      const cpc = clicks > 0 ? spend / clicks : 0;
      const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
      const lpCvr = clicks > 0 ? (totalCalls / clicks) * 100 : 0;
      const rpv = clicks > 0 ? revenue / clicks : 0;
      const connectRate = totalCalls > 0 ? (connected / totalCalls) * 100 : 0;
      const callROAS = spend > 0 ? revenue / spend : 0;
      const profit = revenue - spend;

      return { spend, clicks, impressions, cpc, ctr, lpCvr, rpv, totalCalls, connected, revenue, connectRate, callROAS, profit };
    }

    const yday = aggregateDay(yesterdayStr);
    const dbefore = aggregateDay(dayBeforeStr);

    function pctDelta(curr: number, prev: number): number | null {
      if (prev === 0) return curr > 0 ? 100 : null;
      return Math.round(((curr - prev) / prev) * 1000) / 10;
    }

    // Build deltas
    const metrics = [
      { name: "Spend", curr: yday.spend, prev: dbefore.spend, fmt: (v: number) => `$${v.toFixed(0)}`, invert: true },
      { name: "Clicks", curr: yday.clicks, prev: dbefore.clicks, fmt: (v: number) => `${v}` },
      { name: "CPC", curr: yday.cpc, prev: dbefore.cpc, fmt: (v: number) => `$${v.toFixed(3)}`, invert: true },
      { name: "CTR", curr: yday.ctr, prev: dbefore.ctr, fmt: (v: number) => `${v.toFixed(1)}%` },
      { name: "LP CVR", curr: yday.lpCvr, prev: dbefore.lpCvr, fmt: (v: number) => `${v.toFixed(1)}%` },
      { name: "RPV", curr: yday.rpv, prev: dbefore.rpv, fmt: (v: number) => `$${v.toFixed(2)}` },
      { name: "Total Calls", curr: yday.totalCalls, prev: dbefore.totalCalls, fmt: (v: number) => `${v}` },
      { name: "Connect Rate", curr: yday.connectRate, prev: dbefore.connectRate, fmt: (v: number) => `${v.toFixed(1)}%` },
      { name: "Revenue", curr: yday.revenue, prev: dbefore.revenue, fmt: (v: number) => `$${v.toFixed(0)}` },
      { name: "ROAS", curr: yday.callROAS, prev: dbefore.callROAS, fmt: (v: number) => `${v.toFixed(2)}x` },
      { name: "Profit", curr: yday.profit, prev: dbefore.profit, fmt: (v: number) => `${v < 0 ? "-" : ""}$${Math.abs(v).toFixed(0)}` },
    ];

    const alertLines: string[] = [];
    const summaryLines: string[] = [];

    for (const m of metrics) {
      const delta = pctDelta(m.curr, m.prev);
      const emoji = delta === null ? "➖" : (m.invert ? (delta <= 0 ? "🟢" : "🔴") : (delta >= 0 ? "🟢" : "🔴"));
      const deltaStr = delta !== null ? `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%` : "—";
      summaryLines.push(`${emoji} *${m.name}*: ${m.fmt(m.curr)} (${deltaStr})`);

      if (delta !== null && Math.abs(delta) >= ALERT_THRESHOLD) {
        const isGood = m.invert ? delta <= 0 : delta >= 0;
        if (!isGood) {
          alertLines.push(`🚨 *${m.name}* ${deltaStr} (${m.fmt(m.prev)} → ${m.fmt(m.curr)})`);
        }
      }
    }

    // Build message
    const header = `📊 *Daily Summary — Flights* (${yesterdayStr})`;
    const summaryBlock = summaryLines.join("\n");
    const alertBlock = alertLines.length > 0
      ? `\n⚠️ *Alerts (>${ALERT_THRESHOLD}% negative change):*\n${alertLines.join("\n")}`
      : "\n✅ No major alerts — all metrics within normal range.";

    const message = `${header}\n\n${summaryBlock}\n${alertBlock}`;

    // Send to Slack
    if (SLACK_API_KEY && LOVABLE_API_KEY) {
      try {
        const res = await fetch(`${GATEWAY_URL}/chat.postMessage`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${LOVABLE_API_KEY}`,
            "X-Connection-Api-Key": SLACK_API_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ channel: slack_channel, text: message }),
        });
        const data = await res.json();
        if (!res.ok) console.error(`Slack error: ${JSON.stringify(data)}`);
        results.push({ client_id, alerts: alertLines.length, slack_ok: res.ok });
      } catch (err) {
        console.error("Slack send error:", err);
        results.push({ client_id, alerts: alertLines.length, slack_ok: false, error: (err as Error).message });
      }
    } else {
      console.log("Slack not configured, summary:", message);
      results.push({ client_id, alerts: alertLines.length, slack_ok: false, reason: "No Slack configured" });
    }
  }

  return new Response(JSON.stringify({ results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
