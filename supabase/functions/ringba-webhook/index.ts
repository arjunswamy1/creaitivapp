import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * Ringba Force Billing Webhook
 * 
 * This endpoint receives conversion/force-billing events from Ringba webhooks.
 * Configure in Ringba: Integrations → Webhooks → Create Webhook
 * 
 * Ringba webhook URL format:
 *   https://<project>.supabase.co/functions/v1/ringba-webhook?call_id=[callUUID]&revenue=[conversionAmount]&converted=yes
 * 
 * Or POST body with JSON:
 *   { "call_id": "...", "revenue": 35.00, "converted": true }
 * 
 * Supports both query params (Ringba's default webhook format) and JSON body.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Parse from query params (Ringba default webhook format) or JSON body
    const url = new URL(req.url);
    let callId = url.searchParams.get("call_id") || url.searchParams.get("callId");
    let revenue = url.searchParams.get("revenue") || url.searchParams.get("call_revenue") || url.searchParams.get("conversionAmount");
    let converted = url.searchParams.get("converted") || url.searchParams.get("sale_successful");

    // Also try JSON body
    if (!callId) {
      try {
        const body = await req.json();
        callId = body.call_id || body.callId || body.inboundCallId;
        revenue = body.revenue || body.call_revenue || body.conversionAmount;
        converted = body.converted || body.sale_successful;
      } catch { /* no body */ }
    }

    if (!callId) {
      return new Response(
        JSON.stringify({ success: false, error: "call_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const revenueNum = parseFloat(String(revenue || "0"));
    const isConverted = converted === "yes" || converted === "true" || converted === true;

    console.log(`Webhook received: call_id=${callId}, revenue=${revenueNum}, converted=${isConverted}`);

    // Update the call record if it exists
    const { data: existing, error: findError } = await supabase
      .from("ringba_calls")
      .select("id, revenue, converted")
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
      // Update existing call with force-billed revenue
      const updates: any = { updated_at: new Date().toISOString() };
      if (revenueNum > 0) updates.revenue = revenueNum;
      if (isConverted) updates.converted = true;

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
        JSON.stringify({ success: true, action: "updated", call_id: callId, old_revenue: existing.revenue, new_revenue: revenueNum }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      // Call not found in our DB — log it for debugging
      console.log(`Call ${callId} not found in ringba_calls table — skipping`);
      return new Response(
        JSON.stringify({ success: true, action: "skipped", call_id: callId, reason: "call not found in database" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
