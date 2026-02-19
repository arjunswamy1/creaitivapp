import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const shopParam = url.searchParams.get("shop");

    if (!code || !state) {
      return redirectWithError("Missing code or state parameter");
    }

    let parsedState: { user_id: string; shop: string; client_id?: string | null };
    try {
      parsedState = JSON.parse(atob(state));
    } catch {
      return redirectWithError("Invalid state parameter");
    }

    const shopDomain = shopParam || parsedState.shop;
    if (!shopDomain) {
      return redirectWithError("Missing shop domain");
    }

    // Exchange code for access token
    const clientId = Deno.env.get("SHOPIFY_CLIENT_ID")!;
    const clientSecret = Deno.env.get("SHOPIFY_CLIENT_SECRET")!;

    const tokenRes = await fetch(`https://${shopDomain}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error("Shopify token exchange failed:", errText);
      return redirectWithError("Failed to exchange token with Shopify");
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    // Fetch shop info
    const shopInfoRes = await fetch(`https://${shopDomain}/admin/api/2024-01/shop.json`, {
      headers: { "X-Shopify-Access-Token": accessToken },
    });

    let shopName = shopDomain;
    if (shopInfoRes.ok) {
      const shopInfo = await shopInfoRes.json();
      shopName = shopInfo.shop?.name || shopDomain;
    }

    // Save connection using service role
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { error: dbError } = await supabase
      .from("platform_connections")
      .upsert(
        {
          user_id: parsedState.user_id,
          platform: "shopify",
          access_token: accessToken,
          account_id: shopDomain,
          account_name: shopName,
          client_id: parsedState.client_id || null,
          metadata: { shop_domain: shopDomain, scope: tokenData.scope },
          connected_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,platform,client_id" }
      );

    if (dbError) {
      console.error("DB upsert error:", dbError);
      return redirectWithError("Failed to save connection");
    }

    // Redirect back to settings
    const appUrl = Deno.env.get("SITE_URL") || Deno.env.get("PUBLIC_SITE_URL") || "https://id-preview--774dbaa2-6e13-44bc-8448-7d4764315a98.lovable.app";
    return new Response(null, {
      status: 302,
      headers: { Location: `${appUrl}/settings?connected=shopify` },
    });
  } catch (err) {
    console.error("Shopify callback error:", err);
    return redirectWithError(err.message || "Unknown error");
  }
});

function redirectWithError(message: string) {
  const appUrl = Deno.env.get("SITE_URL") || Deno.env.get("PUBLIC_SITE_URL") || "https://id-preview--774dbaa2-6e13-44bc-8448-7d4764315a98.lovable.app";
  return new Response(null, {
    status: 302,
    headers: { Location: `${appUrl}/settings?error=${encodeURIComponent(message)}` },
  });
}
