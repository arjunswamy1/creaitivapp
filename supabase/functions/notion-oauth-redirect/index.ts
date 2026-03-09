const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// In-memory token store with 5-min expiry
const tokenStore = new Map<string, { token: string; workspace: string; expiresAt: number }>();

// Cleanup expired tokens
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
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const error = url.searchParams.get("error");
    const state = url.searchParams.get("state");

    if (error) {
      return new Response(errorHtml(error), {
        headers: { "Content-Type": "text/html" },
      });
    }

    if (!code || !state) {
      return new Response(errorHtml("Missing code or state parameter"), {
        headers: { "Content-Type": "text/html" },
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
        redirect_uri: `${Deno.env.get("SUPABASE_URL")}/functions/v1/notion-oauth-redirect`,
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error("Notion token exchange failed:", errText);
      return new Response(errorHtml("Failed to exchange token with Notion"), {
        headers: { "Content-Type": "text/html" },
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

    return new Response(successHtml(workspaceName), {
      headers: { "Content-Type": "text/html" },
    });
  } catch (err) {
    console.error("Notion OAuth error:", err);
    return new Response(errorHtml(err.message || "Unknown error"), {
      headers: { "Content-Type": "text/html" },
    });
  }
});

// Export tokenStore for the check-token function
export { tokenStore };

function successHtml(workspace: string) {
  return `<!DOCTYPE html>
<html>
<head><title>Notion Connected</title></head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#667eea,#764ba2);font-family:system-ui,sans-serif;">
<div style="background:#fff;border-radius:16px;padding:48px;text-align:center;max-width:400px;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
<div style="font-size:48px;margin-bottom:16px;">✅</div>
<h1 style="margin:0 0 8px;color:#1a1a2e;">Connected!</h1>
<p style="color:#666;margin:0 0 16px;">Workspace: <strong>${workspace}</strong></p>
<p style="color:#999;font-size:14px;">You can close this window now.</p>
</div>
</body>
</html>`;
}

function errorHtml(message: string) {
  return `<!DOCTYPE html>
<html>
<head><title>Notion Error</title></head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#667eea,#764ba2);font-family:system-ui,sans-serif;">
<div style="background:#fff;border-radius:16px;padding:48px;text-align:center;max-width:400px;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
<div style="font-size:48px;margin-bottom:16px;">❌</div>
<h1 style="margin:0 0 8px;color:#1a1a2e;">Connection Failed</h1>
<p style="color:#e74c3c;">${message}</p>
<p style="color:#999;font-size:14px;">Please close this window and try again.</p>
</div>
</body>
</html>`;
}
