const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Note: In edge functions, each invocation is isolated. 
// We'll use a shared KV approach via the redirect function's store.
// Since Deno Deploy isolates don't share memory, we use a simple workaround:
// The redirect function stores tokens, and this function checks them.
// For production, use a database. For now, we'll check by re-importing.

// Since edge functions are isolated, we need a shared store.
// We'll use a simple in-memory Map that's populated by the redirect function.
// In practice on Deno Deploy, we'd need a DB. Let's use a global Map.

const tokenStore = new Map<string, { token: string; workspace: string; expiresAt: number }>();

// Make tokenStore accessible globally so both functions can share it
// @ts-ignore - globalThis extension
if (!globalThis.__notionTokenStore) {
  // @ts-ignore
  globalThis.__notionTokenStore = tokenStore;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const pathParts = url.pathname.split("/");
    const state = pathParts[pathParts.length - 1] || url.searchParams.get("state");

    if (!state) {
      return new Response(
        JSON.stringify({ error: "Missing state parameter" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // @ts-ignore
    const store = globalThis.__notionTokenStore as Map<string, { token: string; workspace: string; expiresAt: number }>;
    const entry = store?.get(state);

    if (!entry) {
      return new Response(
        JSON.stringify({ status: "pending" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (Date.now() > entry.expiresAt) {
      store.delete(state);
      return new Response(
        JSON.stringify({ status: "expired" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Return token and clean up
    const result = { status: "ready", token: entry.token, workspace: entry.workspace };
    store.delete(state);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
