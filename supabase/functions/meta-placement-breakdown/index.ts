import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const clientId = url.searchParams.get("clientId")!;
    const since = url.searchParams.get("since") || "2026-08-12";
    const until = url.searchParams.get("until") || "2026-09-10";
    const level = url.searchParams.get("level") || "ad";
    const breakdowns = url.searchParams.get("breakdowns") || "publisher_platform,platform_position";

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: conn } = await admin
      .from("platform_connections")
      .select("access_token, selected_ad_account")
      .eq("client_id", clientId)
      .eq("platform", "meta")
      .maybeSingle();

    if (!conn?.access_token) {
      return new Response(JSON.stringify({ error: "No Meta connection for client" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const acct = (conn.selected_ad_account as any)?.id;
    const fields = "ad_name,adset_name,campaign_name,spend,impressions,clicks,actions,action_values";
    const api = `https://graph.facebook.com/v21.0/${acct}/insights?level=${level}` +
      `&fields=${fields}&breakdowns=${encodeURIComponent(breakdowns)}` +
      `&time_range=${encodeURIComponent(JSON.stringify({ since, until }))}` +
      `&limit=500&access_token=${conn.access_token}`;

    const rows: any[] = [];
    let next: string | null = api;
    while (next && rows.length < 3000) {
      const res = await fetch(next);
      const json = await res.json();
      if (json.error) {
        return new Response(JSON.stringify({ error: json.error }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      rows.push(...(json.data || []));
      next = json.paging?.next || null;
    }

    const out = rows.map((r) => {
      const purch = (r.actions || []).find((a: any) =>
        a.action_type === "offsite_conversion.fb_pixel_purchase" || a.action_type === "purchase");
      const val = (r.action_values || []).find((a: any) =>
        a.action_type === "offsite_conversion.fb_pixel_purchase" || a.action_type === "purchase");
      return {
        ad: r.ad_name, adset: r.adset_name, campaign: r.campaign_name,
        platform: r.publisher_platform, position: r.platform_position,
        device: r.impression_device,
        spend: Number(r.spend || 0),
        impressions: Number(r.impressions || 0),
        clicks: Number(r.clicks || 0),
        purchases: Number(purch?.value || 0),
        revenue: Number(val?.value || 0),
      };
    });

    return new Response(JSON.stringify({ count: out.length, since, until, rows: out }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
