import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const stateParam = url.searchParams.get("state");
    const errorParam = url.searchParams.get("error");

    const frontendUrl =
      Deno.env.get("FRONTEND_URL") ||
      "https://id-preview--774dbaa2-6e13-44bc-8448-7d4764315a98.lovable.app";
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

    let state: { user_id: string; client_id?: string };
    try {
      state = JSON.parse(atob(stateParam));
    } catch {
      return redirect("/settings?error=invalid_state");
    }

    const clientId = Deno.env.get("GOOGLE_CLIENT_ID")!;
    const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
    const redirectUri = `${Deno.env.get("SUPABASE_URL")}/functions/v1/google-oauth-callback`;

    // Exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      return redirect(
        `/settings?error=${encodeURIComponent(tokenData.error_description || tokenData.error)}`
      );
    }

    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;
    const expiresIn = tokenData.expires_in;

    // Fetch accessible Google Ads customer accounts
    const developerToken = Deno.env.get("GOOGLE_DEVELOPER_TOKEN");
    let customers: any[] = [];
    let accountName = "Google Ads";
    let validationError: string | null = null;
    let validationDetail: string | null = null;

    if (developerToken) {
      try {
        const customersRes = await fetch(
          "https://googleads.googleapis.com/v23/customers:listAccessibleCustomers",
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "developer-token": developerToken,
            },
          }
        );
        const responseText = await customersRes.text();
        console.log(`[google-oauth-callback] listAccessibleCustomers status=${customersRes.status} body=${responseText.substring(0, 500)}`);
        try {
          const customersData = JSON.parse(responseText);
          if (!customersRes.ok || customersData.error) {
            const gErr = customersData.error || {};
            const inner = gErr.details?.[0]?.errors?.[0];
            const code = inner?.errorCode?.authorizationError
              || inner?.errorCode?.authenticationError
              || gErr.status
              || `http_${customersRes.status}`;
            validationDetail = inner?.message || gErr.message || "Google Ads API rejected the request";

            if (code === "DEVELOPER_TOKEN_PROHIBITED") {
              // Extract the OAuth client project number from the error message if present
              const projMatch = /project '(\d+)'/.exec(validationDetail || "");
              const projectNum = projMatch?.[1];
              validationError = "developer_token_project_mismatch";
              console.error(
                `[google-oauth-callback] Developer token is not authorized for OAuth client project ${projectNum ?? "unknown"}. ` +
                `Either (a) re-apply for Google Ads API access on that Google Cloud project, or ` +
                `(b) set GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET to credentials from the project where the developer token was approved.`
              );
            } else if (
              code === "DEVELOPER_TOKEN_NOT_APPROVED" ||
              code === "DEVELOPER_TOKEN_NOT_ALLOWLISTED_FOR_PROJECT_IN_TEST_MODE"
            ) {
              validationError = "developer_token_not_approved";
            } else {
              validationError = `google_ads_${String(code).toLowerCase()}`;
            }
          } else {
            customers = customersData.resourceNames || [];
            console.log(`[google-oauth-callback] Found ${customers.length} accessible customers for user ${state.user_id} client ${state.client_id}`);
            if (customers.length > 0) {
              const firstCustomerId = customers[0].replace("customers/", "");
              accountName = `Google Ads (${firstCustomerId})`;
            } else {
              validationError = "no_accessible_customers";
              validationDetail =
                "The Google account you authorized has no directly accessible Google Ads customer accounts. If access is via a Manager (MCC), invite this account directly or add MCC support.";
            }
          }
        } catch {
          console.error("Google Ads API returned non-JSON:", responseText.substring(0, 200));
          validationError = "google_ads_invalid_response";
        }
      } catch (err) {
        console.error("Failed to fetch Google Ads customers:", err);
        validationError = "google_ads_fetch_failed";
      }
    } else {
      console.warn("GOOGLE_DEVELOPER_TOKEN not set, skipping customer discovery");
      validationError = "missing_developer_token";
    }

    // Store connection
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
          platform: "google",
          access_token: accessToken,
          refresh_token: refreshToken || null,
          account_name: accountName,
          token_expires_at: tokenExpiresAt,
          metadata: {
            customers,
            validation_error: validationError,
            validation_detail: validationDetail,
            validated_at: new Date().toISOString(),
          },
          client_id: state.client_id || null,
        },
        { onConflict: "user_id,platform,client_id" }
      );

    if (upsertError) {
      console.error("Upsert error:", upsertError);
      return redirect("/settings?error=db_error");
    }

    const clientParam = state.client_id ? `&client_id=${state.client_id}` : "";
    if (validationError) {
      const detailParam = validationDetail
        ? `&detail=${encodeURIComponent(validationDetail.substring(0, 240))}`
        : "";
      return redirect(
        `/settings?connected=google&warning=${encodeURIComponent(validationError)}${detailParam}${clientParam}`
      );
    }
    return redirect(`/settings?connected=google${clientParam}`);
  } catch (err) {
    console.error("Callback error:", err);
    const frontendUrl =
      Deno.env.get("FRONTEND_URL") ||
      "https://id-preview--774dbaa2-6e13-44bc-8448-7d4764315a98.lovable.app";
    return new Response(null, {
      status: 302,
      headers: { Location: `${frontendUrl}/settings?error=server_error` },
    });
  }
});
