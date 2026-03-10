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

    const formatDate = (d: Date) => d.toISOString();

    // Fetch call logs from Ringba API
    // The Ringba API v2 calllogs endpoint
    const url = `https://api.ringba.com/v2/${RINGBA_ACCOUNT_ID}/calllogs`;

    const requestBody: any = {
      reportStart: formatDate(startDate),
      reportEnd: formatDate(endDate),
      size: 1000,
      offset: 0,
      filters: [
        { column: "campaignName", operand: "Is", value: "Premium Flights Call Flow" }
      ],
    };

    console.log("Fetching Ringba call logs:", JSON.stringify(requestBody));

    let allCalls: any[] = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      requestBody.offset = offset;

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
      
      const records = data.report?.records || [];
      
      // On first page, log all campaign names containing "flight" or "premium" (case-insensitive)
      if (offset === 0) {
        const allNames = [...new Set(records.map((r: any) => r.campaignName))];
        const flightNames = allNames.filter((n: string) => /flight|premium/i.test(n));
        console.log("Flight/Premium campaigns found:", JSON.stringify(flightNames));
        console.log("All campaign names:", JSON.stringify(allNames));
        
        // Log date range of records
        const dates = records.map((r: any) => r.callDt).filter(Boolean).sort();
        if (dates.length) {
          console.log("Date range in response:", dates[0], "to", dates[dates.length - 1]);
        }
      }
      
      // Filter to only "Premium Flights Call Flow"
      const calls = records.filter((c: any) => 
        c.campaignName === "Premium Flights Call Flow"
      );

      console.log(`Offset ${offset}: got ${records.length} total records, ${calls.length} matching`);

      allCalls = allCalls.concat(calls);
      
      if (records.length < 500) {
        hasMore = false;
      } else {
        offset += records.length;
        if (offset > 20000) hasMore = false;
      }
    }

    // Deduplicate by inboundCallId before upserting
    const seen = new Set<string>();
    const uniqueCalls = allCalls.filter((call) => {
      const id = call.inboundCallId || call.callId;
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });

    console.log(`Total calls fetched: ${allCalls.length}, unique: ${uniqueCalls.length}`);

    // Map and upsert calls
    let upserted = 0;
    const batchSize = 50; // Smaller batches to avoid conflicts

    for (let i = 0; i < uniqueCalls.length; i += batchSize) {
      const batch = uniqueCalls.slice(i, i + batchSize);

      const rows = batch.map((call: any) => ({
        client_id: clientId,
        ringba_call_id: call.inboundCallId || call.callId || `unknown-${i}-${Math.random()}`,
        call_date: call.callDt ? new Date(call.callDt).toISOString() : new Date().toISOString(),
        duration_seconds: call.callLengthInSeconds || 0,
        revenue: parseFloat(String(call.conversionAmount || call.profitGross || call.totalCost || 0)),
        payout: parseFloat(String(call.payoutAmount || 0)),
        connected: call.hasConnected ?? false,
        converted: call.hasConverted ?? call.hasPayout ?? false,
        caller_number: call.inboundPhoneNumber || null,
        target_name: call.targetName || null,
        campaign_name: call.campaignName || "Premium Flights Call Flow",
        campaign_id: call.campaignId || null,
        call_status: call.endCallSource || call.callCompletedStatus || null,
        metadata: {
          raw_call_id: call.inboundCallId,
          publisher: call.publisherName || null,
          buyer: call.buyer || null,
          target_number: call.targetNumber || null,
          connected_duration: call.connectedCallLengthInSeconds || 0,
          is_duplicate: call.isDuplicate || false,
          number: call.number || null,
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
