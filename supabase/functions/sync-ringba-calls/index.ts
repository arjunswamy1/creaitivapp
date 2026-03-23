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

/** Fetch individual call detail to get tags (referrer, UTM, etc.) */
async function fetchCallDetail(
  accountId: string,
  token: string,
  callId: string
): Promise<{ referrer: string | null; utm_source: string | null; utm_campaign: string | null }> {
  try {
    const response = await fetch(
      `https://api.ringba.com/v2/${accountId}/calllogs/${callId}`,
      {
        method: "GET",
        headers: {
          Authorization: `Token ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      console.error(`Call detail API ${callId} returned ${response.status}: ${await response.text().catch(() => 'no body')}`);
      return { referrer: null, utm_source: null, utm_campaign: null };
    }

    const data = await response.json();
    
    // Log the entire response structure for debugging
    console.log(`Call detail ${callId} response keys: ${JSON.stringify(Object.keys(data))}`);
    
    // The detail endpoint might return in various structures
    const call = data.call || data.callDetail || data;

    // Log ALL keys at every level
    console.log(`Call detail ${callId} call keys: ${JSON.stringify(Object.keys(call))}`);
    
    // Check for tags in various locations
    const tags = call.tags || call.tagValues || call.callTags || data.tags || [];
    
    // Log raw tags
    if (tags && (Array.isArray(tags) ? tags.length > 0 : Object.keys(tags).length > 0)) {
      console.log(`Call ${callId} tags found: ${JSON.stringify(tags).slice(0, 500)}`);
    } else {
      console.log(`Call ${callId} NO tags found. Checking nested...`);
      // Check if there's a nested structure
      for (const key of Object.keys(call)) {
        const val = call[key];
        if (val && typeof val === "object" && !Array.isArray(val)) {
          console.log(`  ${key} (object): ${JSON.stringify(Object.keys(val))}`);
        } else if (Array.isArray(val) && val.length > 0) {
          console.log(`  ${key} (array[${val.length}]): ${JSON.stringify(val[0]).slice(0, 200)}`);
        }
      }
    }

    let referrer: string | null = null;
    let utm_source: string | null = null;
    let utm_campaign: string | null = null;

    if (Array.isArray(tags)) {
      for (const tag of tags) {
        const key = (tag.key || tag.name || tag.tagName || tag.column || "").toLowerCase();
        const val = tag.value || tag.tagValue || "";
        if (!val) continue;
        if (key === "referrer" || key === "httpreferrer" || key === "http_referrer") referrer = val;
        if (key === "utm_source" || key === "utmsource") utm_source = val;
        if (key === "utm_campaign" || key === "utmcampaign") utm_campaign = val;
      }
    }

    if (!referrer) referrer = call.httpReferrer || call.referrer || call.userHttpReferrer || null;
    if (!utm_source) utm_source = call.userUtmSource || call.utmSource || null;
    if (!utm_campaign) utm_campaign = call.userUtmCampaign || call.utmCampaign || null;

    return { referrer, utm_source, utm_campaign };
  } catch (err) {
    console.error(`Error fetching call detail ${callId}:`, err);
    return { referrer: null, utm_source: null, utm_campaign: null };
  }
}

/** Fetch all calls for a single date chunk, paginating fully */
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

    // Client-side filter: only calls from publisher "CPM"
    // AND matching Billy verticals
    const matching = records.filter(
      (c: any) => {
        const publisher = (c.publisherName || "").toLowerCase();
        if (publisher !== "cpm") return false;
        
        if (!c.campaignName) return false;
        const name = c.campaignName.toLowerCase();
        return name.includes("flights") || name.includes("bath") || name.includes("bathroom") ||
               name.includes("pest") || name.includes("porta") || name.includes("potty") || name.includes("portapotty");
      }
    );

    allCalls = allCalls.concat(matching);

    if (records.length < 1000) break;
    offset += records.length;
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

    // Fetch individual call details for connected calls to get tag data (referrer/UTM)
    const connectedCalls = uniqueCalls.filter(c => c.hasConnected);
    console.log(`Fetching tag details for ${connectedCalls.length} connected calls...`);
    
    const tagMap = new Map<string, { referrer: string | null; utm_source: string | null; utm_campaign: string | null }>();
    
    // Fetch in batches of 5 to avoid rate limiting
    for (let i = 0; i < connectedCalls.length; i += 5) {
      const batch = connectedCalls.slice(i, i + 5);
      const results = await Promise.all(
        batch.map(c => {
          const callId = c.inboundCallId || c.callId;
          return fetchCallDetail(RINGBA_ACCOUNT_ID, RINGBA_API_TOKEN, callId)
            .then(tags => ({ callId, tags }));
        })
      );
      for (const { callId, tags } of results) {
        tagMap.set(callId, tags);
      }
      // Small delay between batches
      if (i + 5 < connectedCalls.length) {
        await new Promise(r => setTimeout(r, 200));
      }
    }

    console.log(`Tag details fetched. Calls with referrer: ${[...tagMap.values()].filter(t => t.referrer).length}`);

    // Upsert in batches
    let upserted = 0;
    const batchSize = 100;

    for (let i = 0; i < uniqueCalls.length; i += batchSize) {
      const batch = uniqueCalls.slice(i, i + batchSize);

      const rows = batch.map((call: any) => {
        const isConnected = call.hasConnected ?? false;
        const isConverted = isConnected && (call.hasConverted ?? false);
        const callRevenue = parseFloat(String(call.revenue ?? call.conversionAmount ?? 0));
        const callId = call.inboundCallId || call.callId || `unknown-${Date.now()}-${Math.random()}`;

        // Merge tag data from individual call detail
        const tags = tagMap.get(callId);

        return {
          client_id: clientId,
          ringba_call_id: callId,
          call_date: call.callDt ? new Date(call.callDt).toISOString() : new Date().toISOString(),
          duration_seconds: call.callLengthInSeconds || 0,
          revenue: callRevenue,
          payout: parseFloat(String(call.payoutAmount || 0)),
          connected: isConnected,
          converted: isConverted,
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
            utm_source: tags?.utm_source || call.userUtmSource || call.utmSource || null,
            utm_campaign: tags?.utm_campaign || call.userUtmCampaign || call.utmCampaign || null,
            referrer: tags?.referrer || call.httpReferrer || call.referrer || call.userHttpReferrer || null,
          },
          synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      });

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
      JSON.stringify({ success: true, total_fetched: allCalls.length, unique: uniqueCalls.length, upserted, tag_details_fetched: tagMap.size }),
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