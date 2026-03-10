import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const RINGBA_API_TOKEN = Deno.env.get("RINGBA_API_TOKEN");
    const RINGBA_ACCOUNT_ID = Deno.env.get("RINGBA_ACCOUNT_ID");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!RINGBA_API_TOKEN || !RINGBA_ACCOUNT_ID) {
      throw new Error("Missing Ringba credentials");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Parse request body for client_id and date range
    const body = await req.json().catch(() => ({}));
    const clientId = body.client_id;
    const daysBack = body.days_back || 30;

    if (!clientId) {
      throw new Error("client_id is required");
    }

    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    const formatDate = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    // Fetch call logs from Ringba API
    // The Ringba API v2 calllogs endpoint
    const url = `https://api.ringba.com/v2/${RINGBA_ACCOUNT_ID}/calllogs`;

    const requestBody = {
      startDate: formatDate(startDate),
      endDate: formatDate(endDate),
      filters: [
        {
          column: "CallFlowName",
          operand: "Is",
          value: "Premium Flights Call Flow",
        },
      ],
      pageSize: 500,
      page: 1,
    };

    console.log("Fetching Ringba call logs:", JSON.stringify(requestBody));

    let allCalls: any[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      requestBody.page = page;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Token ${RINGBA_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error("Ringba API error:", response.status, errText);
        throw new Error(`Ringba API error: ${response.status} - ${errText}`);
      }

      const data = await response.json();
      const calls = data.calls || data.records || data.data || [];

      console.log(`Page ${page}: got ${calls.length} calls`);

      if (calls.length === 0) {
        hasMore = false;
      } else {
        allCalls = allCalls.concat(calls);
        page++;
        // Safety limit
        if (page > 20) hasMore = false;
      }
    }

    console.log(`Total calls fetched: ${allCalls.length}`);

    // Map and upsert calls
    let upserted = 0;
    const batchSize = 100;

    for (let i = 0; i < allCalls.length; i += batchSize) {
      const batch = allCalls.slice(i, i + batchSize);

      const rows = batch.map((call: any) => ({
        client_id: clientId,
        ringba_call_id: call.callId || call.inboundCallId || call.id || `unknown-${i}`,
        call_date: call.callDt || call.startTime || call.callDateTime || new Date().toISOString(),
        duration_seconds: call.callLengthInSeconds || call.duration || call.connectedDuration || 0,
        revenue: parseFloat(call.revenue || call.totalRevenue || call.payoutAmount || "0"),
        payout: parseFloat(call.payout || call.publisherPayout || "0"),
        connected: call.isConnected ?? call.connected ?? (call.connectedDuration > 0),
        converted: call.isConverted ?? call.converted ?? false,
        caller_number: call.callerNumber || call.caller || call.ani || null,
        target_name: call.targetName || call.target || call.buyerName || null,
        campaign_name: call.campaignName || call.callFlowName || "Premium Flights Call Flow",
        campaign_id: call.campaignId || call.callFlowId || null,
        call_status: call.callStatus || call.status || call.disposition || null,
        metadata: {
          raw_call_id: call.callId || call.inboundCallId,
          publisher: call.publisherName || null,
          geo: call.callerState || call.callerCity || null,
          zip: call.callerZip || null,
        },
        synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));

      const { error } = await supabase
        .from("ringba_calls")
        .upsert(rows, { onConflict: "client_id,ringba_call_id" });

      if (error) {
        console.error("Upsert error:", error);
      } else {
        upserted += rows.length;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        total_fetched: allCalls.length,
        upserted,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("sync-ringba-calls error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
