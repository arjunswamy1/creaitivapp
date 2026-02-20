import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// This endpoint handles GET requests from Shopify's install flow.
// Set your Shopify App URL to: https://<supabase-project>.supabase.co/functions/v1/shopify-install

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const shop = url.searchParams.get("shop");

  if (!shop) {
    return new Response("Missing shop parameter. Please install from Shopify admin.", {
      status: 400,
      headers: { "Content-Type": "text/plain" },
    });
  }

  const clientId = Deno.env.get("SHOPIFY_CLIENT_ID")!;
  const redirectUri = `${Deno.env.get("SUPABASE_URL")}/functions/v1/shopify-oauth-callback`;
  const scopes = "read_orders,read_products,read_inventory";

  // State without user_id since this is initiated from Shopify side
  const state = btoa(JSON.stringify({ shop, client_id: null }));

  const authUrl =
    `https://${shop}/admin/oauth/authorize` +
    `?client_id=${encodeURIComponent(clientId)}` +
    `&scope=${encodeURIComponent(scopes)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${encodeURIComponent(state)}`;

  return new Response(null, {
    status: 302,
    headers: { Location: authUrl },
  });
});
