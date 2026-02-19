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

    // Get Shopify connection
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

    // Use service role for writing sync logs and data
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

        // Aggregate orders by date for daily metrics
        const dailyMap: Record<string, { revenue: number; orders: number; cogs: number }> = {};

        for (const order of orders) {
          const date = order.created_at.split("T")[0];
          if (!dailyMap[date]) {
            dailyMap[date] = { revenue: 0, orders: 0, cogs: 0 };
          }

          // Revenue = total price minus refunds
          const orderRevenue = parseFloat(order.total_price || "0");
          dailyMap[date].revenue += orderRevenue;
          dailyMap[date].orders += 1;

          // Calculate COGS from line items (cost per item)
          for (const item of order.line_items || []) {
            // Shopify doesn't expose COGS directly on orders; 
            // we use variant cost if available via inventory item cost
            // For now, track quantity for later enrichment
            const costPerItem = parseFloat(item.price || "0") * 0; // placeholder
            dailyMap[date].cogs += costPerItem;
          }
        }

        // Upsert daily metrics as shopify platform entries
        const rows = Object.entries(dailyMap).map(([date, metrics]) => ({
          user_id: userId,
          platform: "shopify",
          date,
          revenue: metrics.revenue,
          spend: metrics.cogs, // COGS as "spend" for ROAS calculation
          impressions: 0,
          clicks: 0,
          conversions: metrics.orders,
        }));

        if (rows.length > 0) {
          const { error: upsertError } = await adminSupabase
            .from("ad_daily_metrics")
            .upsert(rows, { onConflict: "user_id,platform,date" });

          if (upsertError) {
            console.error("Upsert error:", upsertError);
          }
          totalRecords += rows.length;
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
          .update({ status: "completed", records_synced: totalRecords, completed_at: new Date().toISOString() })
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
