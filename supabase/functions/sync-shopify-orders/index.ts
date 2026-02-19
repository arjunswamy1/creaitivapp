import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub as string;

    // Get Shopify connection (scoped to user's clients)
    const { data: conn, error: connError } = await supabase
      .from("platform_connections")
      .select("*")
      .eq("platform", "shopify")
      .single();

    if (connError || !conn) {
      return new Response(JSON.stringify({ error: "Shopify not connected" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const shopDomain = conn.account_id;
    const accessToken = conn.access_token;
    const clientId = conn.client_id;

    // Use service role for writing data
    const adminSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Create sync log
    const { data: syncLog } = await adminSupabase
      .from("ad_sync_log")
      .insert({ user_id: userId, platform: "shopify", status: "running" })
      .select("id")
      .single();

    let totalRecords = 0;

    try {
      // Fetch orders from the last 12 months
      const sinceDate = new Date();
      sinceDate.setMonth(sinceDate.getMonth() - 12);

      let pageInfo: string | null = null;
      let hasMore = true;

      while (hasMore) {
        let url: string;
        if (pageInfo) {
          url = `https://${shopDomain}/admin/api/2024-01/orders.json?limit=250&page_info=${pageInfo}`;
        } else {
          url = `https://${shopDomain}/admin/api/2024-01/orders.json?limit=250&status=any&created_at_min=${sinceDate.toISOString()}`;
        }

        const res = await fetch(url, {
          headers: { "X-Shopify-Access-Token": accessToken },
        });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`Shopify API error ${res.status}: ${errText}`);
        }

        const data = await res.json();
        const orders = data.orders || [];

        if (orders.length === 0) break;

        // Upsert individual orders into shopify_orders table
        const orderRows = orders.map((order: any) => ({
          client_id: clientId,
          shopify_order_id: order.id,
          order_number: order.name || `#${order.order_number}`,
          total_price: parseFloat(order.total_price || "0"),
          subtotal_price: parseFloat(order.subtotal_price || "0"),
          total_tax: parseFloat(order.total_tax || "0"),
          total_discounts: parseFloat(order.total_discounts || "0"),
          currency: order.currency || "USD",
          financial_status: order.financial_status || "unknown",
          fulfillment_status: order.fulfillment_status || null,
          order_date: order.created_at,
          customer_id: order.customer?.id || null,
          line_items_count: (order.line_items || []).length,
        }));

        if (orderRows.length > 0) {
          const { error: upsertError } = await adminSupabase
            .from("shopify_orders")
            .upsert(orderRows, { onConflict: "shopify_order_id,client_id" });

          if (upsertError) {
            console.error("Shopify orders upsert error:", upsertError);
          }
          totalRecords += orderRows.length;
        }

        // Also aggregate daily metrics for ad_daily_metrics
        const dailyMap: Record<string, { revenue: number; orders: number }> = {};
        for (const order of orders) {
          const date = order.created_at.split("T")[0];
          if (!dailyMap[date]) dailyMap[date] = { revenue: 0, orders: 0 };
          dailyMap[date].revenue += parseFloat(order.total_price || "0");
          dailyMap[date].orders += 1;
        }

        const metricRows = Object.entries(dailyMap).map(([date, metrics]) => ({
          user_id: userId,
          client_id: clientId,
          platform: "shopify",
          date,
          revenue: metrics.revenue,
          spend: 0,
          impressions: 0,
          clicks: 0,
          conversions: metrics.orders,
        }));

        if (metricRows.length > 0) {
          const { error: metricsErr } = await adminSupabase
            .from("ad_daily_metrics")
            .upsert(metricRows, { onConflict: "user_id,platform,date" });

          if (metricsErr) console.error("Metrics upsert error:", metricsErr);
        }

        // Check for next page
        const linkHeader = res.headers.get("link");
        if (linkHeader && linkHeader.includes('rel="next"')) {
          const match = linkHeader.match(/page_info=([^>&]*)/);
          pageInfo = match ? match[1] : null;
          hasMore = !!pageInfo;
        } else {
          hasMore = false;
        }
      }

      // Update sync log
      if (syncLog) {
        await adminSupabase
          .from("ad_sync_log")
          .update({ status: "success", records_synced: totalRecords, completed_at: new Date().toISOString() })
          .eq("id", syncLog.id);
      }

      return new Response(JSON.stringify({ success: true, records_synced: totalRecords }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (err) {
      if (syncLog) {
        await adminSupabase
          .from("ad_sync_log")
          .update({ status: "failed", error_message: err.message, completed_at: new Date().toISOString() })
          .eq("id", syncLog.id);
      }
      throw err;
    }
  } catch (err) {
    console.error("Shopify sync error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
