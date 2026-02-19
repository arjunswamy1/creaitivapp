import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const stateParam = url.searchParams.get("state");
    const errorParam = url.searchParams.get("error");

    // Build a redirect helper
    const frontendUrl = Deno.env.get("FRONTEND_URL") || "https://id-preview--774dbaa2-6e13-44bc-8448-7d4764315a98.lovable.app";
    const redirect = (path: string) =>
      new Response(null, {
        status: 302,
        headers: { Location: `${frontendUrl}${path}` },
      });

    if (errorParam) {
      return redirect(`/settings?error=${encodeURIComponent(errorParam)}`);
    }

    if (!code || !stateParam) {
      return redirect("/settings?error=missing_params");
    }

    // Decode state
    let state: { user_id: string; client_id?: string | null };
    try {
      state = JSON.parse(atob(stateParam));
    } catch {
      return redirect("/settings?error=invalid_state");
    }

    const appId = Deno.env.get("META_APP_ID")!;
    const appSecret = Deno.env.get("META_APP_SECRET")!;
    const redirectUri = `${Deno.env.get("SUPABASE_URL")}/functions/v1/meta-oauth-callback`;

    // Exchange code for short-lived token
    const tokenUrl =
      `https://graph.facebook.com/v21.0/oauth/access_token` +
      `?client_id=${appId}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&client_secret=${appSecret}` +
      `&code=${code}`;

    const tokenRes = await fetch(tokenUrl);
    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      return redirect(`/settings?error=${encodeURIComponent(tokenData.error.message)}`);
    }

    // Exchange for long-lived token
    const longLivedUrl =
      `https://graph.facebook.com/v21.0/oauth/access_token` +
      `?grant_type=fb_exchange_token` +
      `&client_id=${appId}` +
      `&client_secret=${appSecret}` +
      `&fb_exchange_token=${tokenData.access_token}`;

    const longRes = await fetch(longLivedUrl);
    const longData = await longRes.json();

    const accessToken = longData.access_token || tokenData.access_token;
    const expiresIn = longData.expires_in || tokenData.expires_in;

    // Get user's ad accounts
    const meRes = await fetch(
      `https://graph.facebook.com/v21.0/me?fields=id,name&access_token=${accessToken}`
    );
    const meData = await meRes.json();

    // Get ad accounts
    const adAccountsRes = await fetch(
      `https://graph.facebook.com/v21.0/me/adaccounts?fields=id,name,account_id&access_token=${accessToken}`
    );
    const adAccountsData = await adAccountsRes.json();

    // Store connection using service role
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const tokenExpiresAt = expiresIn
      ? new Date(Date.now() + expiresIn * 1000).toISOString()
      : null;

    const { error: upsertError } = await supabase
      .from("platform_connections")
      .upsert(
        {
          user_id: state.user_id,
          platform: "meta",
          access_token: accessToken,
          account_id: meData.id,
          account_name: meData.name,
          token_expires_at: tokenExpiresAt,
          client_id: state.client_id || null,
          metadata: {
            ad_accounts: adAccountsData.data || [],
          },
        },
        { onConflict: "user_id,platform,client_id" }
      );

    if (upsertError) {
      console.error("Upsert error:", upsertError);
      return redirect(`/settings?error=db_error`);
    }

    return redirect("/settings?connected=meta");
  } catch (err) {
    console.error("Callback error:", err);
    const frontendUrl = Deno.env.get("FRONTEND_URL") || "https://id-preview--774dbaa2-6e13-44bc-8448-7d4764315a98.lovable.app";
    return new Response(null, {
      status: 302,
      headers: { Location: `${frontendUrl}/settings?error=server_error` },
    });
  }
});
