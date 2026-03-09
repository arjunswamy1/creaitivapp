const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// In-memory token store with 5-min expiry
const tokenStore = new Map<string, { token: string; workspace: string; expiresAt: number }>();

function cleanupExpired() {
  const now = Date.now();
  for (const [key, val] of tokenStore) {
    if (now > val.expiresAt) tokenStore.delete(key);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Accept POST with JSON body { code, state }
    const { code, state } = await req.json();

    if (!code || !state) {
      return new Response(JSON.stringify({ error: "Missing code or state" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const clientId = Deno.env.get("NOTION_CLIENT_ID")!;
    const clientSecret = Deno.env.get("NOTION_CLIENT_SECRET")!;
    const basicAuth = btoa(`${clientId}:${clientSecret}`);

    const tokenRes = await fetch("https://api.notion.com/v1/oauth/token", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${basicAuth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code,
        redirect_uri: "https://creaitivapp.com/notion/redirect",
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error("Notion token exchange failed:", errText);
      return new Response(JSON.stringify({ error: "Failed to exchange token with Notion" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;
    const workspaceName = tokenData.workspace_name || "Unknown Workspace";

    // Store token in memory with 5-min expiry
    cleanupExpired();
    tokenStore.set(state, {
      token: accessToken,
      workspace: workspaceName,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });

    return new Response(JSON.stringify({ success: true, workspace: workspaceName }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Notion OAuth error:", err);
    return new Response(JSON.stringify({ error: err.message || "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

export { tokenStore };
