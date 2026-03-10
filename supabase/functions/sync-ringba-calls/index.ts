import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/** Split a date range into 2-day chunks to avoid pagination limits */
function buildDateChunks(start: Date, end: Date, chunkDays = 2): { from: Date; to: Date }[] {
  const chunks: { from: Date; to: Date }[] = [];
  const cur = new Date(start);
  while (cur < end) {
    const chunkEnd = new Date(cur);
    chunkEnd.setDate(chunkEnd.getDate() + chunkDays);
    if (chunkEnd > end) chunkEnd.setTime(end.getTime());
    chunks.push({ from: new Date(cur), to: new Date(chunkEnd) });
    cur.setDate(cur.getDate() + chunkDays);
  }
  return chunks;
}

/** Fetch all Premium Flights calls for a single date chunk, paginating fully */
async function fetchChunk(
  url: string,
  token: string,
  from: Date,
  to: Date
): Promise<any[]> {
  let allCalls: any[] = [];
  let offset = 0;

  while (true) {
    const requestBody = {
      reportStart: from.toISOString(),
      reportEnd: to.toISOString(),
      size: 1000,
      offset,
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Token ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`Ringba API error for chunk ${from.toISOString()}: ${response.status} ${errText}`);
      break;
    }

    const data = await response.json();
    const records = data.report?.records || [];

    // Client-side filter for Premium Flights
    const matching = records.filter(
      (c: any) => c.campaignName === "Premium Flights Call Flow"
    );

    // Log revenue-related fields from first few matching calls for diagnostics
    if (matching.length > 0 && offset === 0) {
      const sample = matching.slice(0, 3);
      for (const s of sample) {
        console.log(`REVENUE FIELDS for ${s.inboundCallId}: conversionAmount=${s.conversionAmount}, profitGross=${s.profitGross}, totalCost=${s.totalCost}, payoutAmount=${s.payoutAmount}, revenue=${s.revenue}, buyerCallPrice=${s.buyerCallPrice}, forceBilled=${s.forceBilled}, adjustedPayoutAmount=${s.adjustedPayoutAmount}, adjustedRevenue=${s.adjustedRevenue}, hasPayout=${s.hasPayout}, hasConverted=${s.hasConverted}, endCallSource=${s.endCallSource}`);
      }
      // Also log ALL keys from first record to find any force-billing fields
      console.log(`ALL CALL KEYS: ${JSON.stringify(Object.keys(sample[0]))}`);
    }

    allCalls = allCalls.concat(matching);

    if (records.length < 1000) break;
    offset += records.length;
    // Safety: each 2-day chunk shouldn't need more than 5k records
    if (offset > 5000) break;
  }

  return allCalls;
}

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

    const body = await req.json().catch(() => ({}));
    const clientId = body.client_id;
    const daysBack = body.days_back || 30;

    if (!clientId) {
      throw new Error("client_id is required");
    }

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    const url = `https://api.ringba.com/v2/${RINGBA_ACCOUNT_ID}/calllogs`;
    const chunks = buildDateChunks(startDate, endDate, 2);

    console.log(
      `Syncing ${daysBack} days in ${chunks.length} chunks from ${startDate.toISOString()} to ${endDate.toISOString()}`
    );

    // Fetch all chunks sequentially (to avoid rate limiting)
    let allCalls: any[] = [];
    for (const chunk of chunks) {
      const calls = await fetchChunk(url, RINGBA_API_TOKEN, chunk.from, chunk.to);
      console.log(
        `Chunk ${chunk.from.toISOString().slice(0, 10)} → ${chunk.to.toISOString().slice(0, 10)}: ${calls.length} calls`
      );
      allCalls = allCalls.concat(calls);
    }

    // Deduplicate by inboundCallId
    const seen = new Set<string>();
    const uniqueCalls = allCalls.filter((call) => {
      const id = call.inboundCallId || call.callId;
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });

    console.log(`Total fetched: ${allCalls.length}, unique: ${uniqueCalls.length}`);

    // Upsert in batches
    let upserted = 0;
    const batchSize = 100;

    for (let i = 0; i < uniqueCalls.length; i += batchSize) {
      const batch = uniqueCalls.slice(i, i + batchSize);

      const rows = batch.map((call: any) => ({
        client_id: clientId,
        ringba_call_id: call.inboundCallId || call.callId || `unknown-${Date.now()}-${Math.random()}`,
        call_date: call.callDt ? new Date(call.callDt).toISOString() : new Date().toISOString(),
        duration_seconds: call.callLengthInSeconds || 0,
        revenue: parseFloat(String(call.conversionAmount || call.profitGross || call.totalCost || 0)),
        payout: parseFloat(String(call.payoutAmount || 0)),
        connected: call.hasConnected ?? false,
        converted: call.hasConverted ?? false,
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
      JSON.stringify({ success: true, total_fetched: allCalls.length, unique: uniqueCalls.length, upserted }),
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
