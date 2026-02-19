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

  // Get all users with alert settings enabled
  const { data: alertConfigs } = await supabaseAdmin
    .from("alert_settings")
    .select("*")
    .eq("enabled", true);

  if (!alertConfigs || alertConfigs.length === 0) {
    return new Response(JSON.stringify({ message: "No alert configs found" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const SLACK_API_KEY = Deno.env.get("SLACK_API_KEY");
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const GATEWAY_URL = "https://connector-gateway.lovable.dev/slack/api";

  const results = [];

  for (const config of alertConfigs) {
    const { user_id, max_cac, min_roas, slack_channel } = config;
    if (!slack_channel) continue;
    if (!max_cac && !min_roas) continue;

    // Get today's campaign data
    const today = new Date().toISOString().split("T")[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];

    const { data: campaigns } = await supabaseAdmin
      .from("ad_campaigns")
      .select("campaign_name, spend, revenue, conversions, roas")
      .eq("user_id", user_id)
      .gte("date", yesterday)
      .lte("date", today);

    if (!campaigns || campaigns.length === 0) continue;

    // Aggregate by campaign
    const byCampaign = new Map<string, { spend: number; revenue: number; conversions: number }>();
    for (const c of campaigns) {
      const existing = byCampaign.get(c.campaign_name) || { spend: 0, revenue: 0, conversions: 0 };
      existing.spend += Number(c.spend);
      existing.revenue += Number(c.revenue);
      existing.conversions += Number(c.conversions);
      byCampaign.set(c.campaign_name, existing);
    }

    const alerts: string[] = [];

    for (const [name, vals] of byCampaign.entries()) {
      if (vals.spend === 0) continue;

      const cac = vals.conversions > 0 ? vals.spend / vals.conversions : null;
      const roas = vals.spend > 0 ? vals.revenue / vals.spend : 0;

      if (max_cac && cac !== null && cac > max_cac) {
        alerts.push(`🚨 *${name}*: CAC $${cac.toFixed(2)} exceeds target $${max_cac} (${vals.conversions} conv, $${vals.spend.toFixed(0)} spend)`);
      }
      if (min_roas && roas < min_roas) {
        alerts.push(`📉 *${name}*: ROAS ${roas.toFixed(2)}x below target ${min_roas}x ($${vals.revenue.toFixed(0)} rev / $${vals.spend.toFixed(0)} spend)`);
      }
    }

    if (alerts.length === 0) continue;

    // Send Slack notification
    if (SLACK_API_KEY && LOVABLE_API_KEY) {
      try {
        const message = `⚡ *Performance Alert*\n\n${alerts.join("\n\n")}`;
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
        if (!res.ok) {
          console.error(`Slack error: ${JSON.stringify(data)}`);
        }
        results.push({ user_id, alerts_sent: alerts.length, slack_ok: res.ok });
      } catch (err) {
        console.error("Slack send error:", err);
        results.push({ user_id, alerts_sent: alerts.length, slack_ok: false, error: err.message });
      }
    } else {
      console.log("Slack not configured, logging alerts:", alerts);
      results.push({ user_id, alerts_sent: alerts.length, slack_ok: false, reason: "No Slack configured" });
    }
  }

  return new Response(JSON.stringify({ results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
