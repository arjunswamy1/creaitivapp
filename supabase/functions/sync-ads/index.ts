import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Orchestrator: calls sync-meta-ads and sync-google-ads
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Forward auth header if present (for manual triggers)
  const authHeader = req.headers.get("Authorization");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (authHeader) {
    headers["Authorization"] = authHeader;
  } else {
    // Cron mode - use service role
    headers["Authorization"] = `Bearer ${serviceRoleKey}`;
  }

  // Parse client_id from request body and forward to sub-functions
  let bodyClientId: string | null = null;
  try {
    const body = await req.json();
    bodyClientId = body?.client_id || body?.clientId || null;
  } catch { /* no body */ }

  const bodyPayload = bodyClientId ? JSON.stringify({ client_id: bodyClientId }) : "{}";

  const results: Record<string, any> = {};

  try {
    const metaRes = await fetch(`${supabaseUrl}/functions/v1/sync-meta-ads`, {
      method: "POST",
      headers,
      body: bodyPayload,
    });
    results.meta = await metaRes.json();
  } catch (err) {
    results.meta = { error: err.message };
  }

  try {
    const googleRes = await fetch(`${supabaseUrl}/functions/v1/sync-google-ads`, {
      method: "POST",
      headers,
      body: bodyPayload,
    });
    results.google = await googleRes.json();
  } catch (err) {
    results.google = { error: err.message };
  }

  return new Response(JSON.stringify(results), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
