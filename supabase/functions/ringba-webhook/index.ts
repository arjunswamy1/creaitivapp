import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * Ringba Webhook – handles TWO event types:
 *
 * 1. **Incoming / connected call** – Ringba fires this when a call comes in.
 *    The webhook URL should include tag placeholders so Ringba substitutes
 *    the actual values. Example URL configured in Ringba:
 *
 *      https://<project>.supabase.co/functions/v1/ringba-webhook
 *        ?event=incoming
 *        &call_id=[callUUID]
 *        &referrer=[referrer]
 *        &utm_source=[utm_source]
 *        &utm_campaign=[utm_campaign]
 *        &campaign_name=[campaignName]
 *        &publisher=[publisherName]
 *        &target=[targetName]
 *        &caller=[callerNumber]
 *        &duration=[callLengthInSeconds]
 *        &connected=[hasConnected]
 *
 *    → Upserts the call and stores referrer/UTM in metadata.
 *
 * 2. **Conversion / force-billing** – fires when a call converts.
 *
 *      https://<project>.supabase.co/functions/v1/ringba-webhook
 *        ?event=conversion
 *        &call_id=[callUUID]
 *        &revenue=[conversionAmount]
 *        &converted=yes
 *
 *    → Updates existing call with revenue & converted flag.
 *
 * Both GET (query-param) and POST (JSON body) are supported.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // --- Parse params from query string or JSON body ---
    const url = new URL(req.url);
    const params: Record<string, string> = {};
    for (const [k, v] of url.searchParams.entries()) {
      params[k] = v;
    }

    // Merge JSON body if present
    if (req.method === "POST") {
      try {
        const body = await req.json();
        for (const [k, v] of Object.entries(body)) {
          if (v !== null && v !== undefined) params[k] = String(v);
        }
      } catch { /* no body */ }
    }

    const event = (params.event || "conversion").toLowerCase();
    const callId = params.call_id || params.callId || params.inboundCallId;

    if (!callId) {
      return new Response(
        JSON.stringify({ success: false, error: "call_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Webhook received: event=${event}, call_id=${callId}, params=${JSON.stringify(params)}`);

    // ─── EVENT: INCOMING ────────────────────────────────────────────────
    if (event === "incoming" || event === "call" || event === "connected") {
      const referrer = params.referrer || params.httpReferrer || params.http_referrer || null;
      const utmSource = params.utm_source || params.utmSource || null;
      const utmCampaign = params.utm_campaign || params.utmCampaign || null;
      const campaignName = params.campaign_name || params.campaignName || null;
      const publisher = params.publisher || params.publisherName || null;
      const targetName = params.target || params.targetName || null;
      const callerNumber = params.caller || params.callerNumber || params.inboundPhoneNumber || null;
      const duration = parseInt(params.duration || params.callLengthInSeconds || "0", 10);
      const isConnected = params.connected === "true" || params.connected === "True" || params.connected === "yes";
      const campaignId = params.campaign_id || params.campaignId || null;
      const revenue = parseFloat(params.revenue || params.conversionAmount || "0");
      const payout = parseFloat(params.payout || params.payoutAmount || "0");
      const isConverted = params.converted === "true" || params.converted === "yes";

      console.log(`Incoming call: referrer=${referrer}, utm_source=${utmSource}, campaign=${campaignName}, publisher=${publisher}`);

      // We need a client_id. Look up by matching the campaign name to existing calls,
      // or fall back to a default. For Billy.com this is the only Ringba client.
      // First try to find client_id from an existing call with same campaign
      let clientId: string | null = null;

      if (campaignName) {
        const { data: existing } = await supabase
          .from("ringba_calls")
          .select("client_id")
          .eq("campaign_name", campaignName)
          .limit(1)
          .maybeSingle();
        if (existing) clientId = existing.client_id;
      }

      // Fallback: find any ringba client
      if (!clientId) {
        const { data: anyCalls } = await supabase
          .from("ringba_calls")
          .select("client_id")
          .limit(1)
          .maybeSingle();
        if (anyCalls) clientId = anyCalls.client_id;
      }

      if (!clientId) {
        console.log("No client_id found for incoming call – skipping");
        return new Response(
          JSON.stringify({ success: true, action: "skipped", reason: "no client_id found" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const metadata = {
        referrer,
        utm_source: utmSource,
        utm_campaign: utmCampaign,
        publisher,
        raw_call_id: callId,
      };

      const row = {
        client_id: clientId,
        ringba_call_id: callId,
        call_date: new Date().toISOString(),
        duration_seconds: duration,
        revenue,
        payout,
        connected: isConnected,
        converted: isConverted,
        caller_number: callerNumber,
        target_name: targetName,
        campaign_name: campaignName,
        campaign_id: campaignId,
        metadata,
        synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("ringba_calls")
        .upsert(row, { onConflict: "client_id,ringba_call_id" });

      if (error) {
        console.error("Upsert error:", error);
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`Upserted incoming call ${callId} with referrer=${referrer}, utm_source=${utmSource}`);
      return new Response(
        JSON.stringify({ success: true, action: "upserted", call_id: callId, referrer, utm_source: utmSource }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── EVENT: CONVERSION / FORCE-BILLING ──────────────────────────────
    const revenueNum = parseFloat(params.revenue || params.conversionAmount || params.call_revenue || "0");
    const isConverted = params.converted === "yes" || params.converted === "true";

    // Also capture any tag data sent with conversion event
    const referrer = params.referrer || params.httpReferrer || null;
    const utmSource = params.utm_source || params.utmSource || null;
    const utmCampaign = params.utm_campaign || params.utmCampaign || null;

    const { data: existing, error: findError } = await supabase
      .from("ringba_calls")
      .select("id, revenue, converted, metadata")
      .eq("ringba_call_id", callId)
      .maybeSingle();

    if (findError) {
      console.error("Error finding call:", findError);
      return new Response(
        JSON.stringify({ success: false, error: findError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (existing) {
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (revenueNum > 0) updates.revenue = revenueNum;
      if (isConverted) updates.converted = true;

      // Merge tag data into existing metadata if provided
      if (referrer || utmSource || utmCampaign) {
        const existingMeta = (existing.metadata as Record<string, unknown>) || {};
        updates.metadata = {
          ...existingMeta,
          ...(referrer ? { referrer } : {}),
          ...(utmSource ? { utm_source: utmSource } : {}),
          ...(utmCampaign ? { utm_campaign: utmCampaign } : {}),
        };
      }

      const { error: updateError } = await supabase
        .from("ringba_calls")
        .update(updates)
        .eq("id", existing.id);

      if (updateError) {
        console.error("Error updating call:", updateError);
        return new Response(
          JSON.stringify({ success: false, error: updateError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`Updated call ${callId}: revenue ${existing.revenue} → ${revenueNum}`);
      return new Response(
        JSON.stringify({ success: true, action: "updated", call_id: callId }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Call ${callId} not found in DB — skipping conversion`);
    return new Response(
      JSON.stringify({ success: true, action: "skipped", call_id: callId, reason: "call not found" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
