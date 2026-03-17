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
    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
    console.log("Auth header present:", !!authHeader, "starts with Bearer:", authHeader?.startsWith("Bearer "));
    
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const cronSecret = Deno.env.get("SUBBLY_CRON_SECRET");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const isCron = (serviceRoleKey && token === serviceRoleKey) 
      || (cronSecret && token === cronSecret)
      || (anonKey && token === anonKey);
    
    console.log("isCron:", isCron, "token length:", token?.length, "anonKey length:", anonKey?.length, "token first 20:", token?.substring(0, 20), "anonKey first 20:", anonKey?.substring(0, 20), "match:", token === anonKey);

    // Use service role for writing data
    const adminSupabaseForAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let userId: string;

    if (isCron) {
      // For cron jobs, pick the first user associated with a Shopify connection
      const { data: connCheck } = await adminSupabaseForAuth
        .from("platform_connections")
        .select("user_id")
        .eq("platform", "shopify")
        .limit(1)
        .single();
      userId = connCheck?.user_id || "cron";
    } else {
      const supabaseUser = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: claimsData, error: claimsError } = await supabaseUser.auth.getClaims(token);
      if (claimsError || !claimsData?.claims) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userId = claimsData.claims.sub as string;
    }

    // Get Shopify connection using admin client (works for both cron and user calls)
    const { data: conn, error: connError } = await adminSupabaseForAuth
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

        // Collect unique product IDs to fetch variant costs
        const productIds = new Set<number>();
        for (const order of orders) {
          for (const item of order.line_items || []) {
            if (item.product_id) productIds.add(item.product_id);
          }
        }

        // Batch fetch products to get variants with inventory_item_ids
        const variantCosts = new Map<number, number>();
        const productIdArray = Array.from(productIds);
        for (let i = 0; i < productIdArray.length; i += 250) {
          const batch = productIdArray.slice(i, i + 250);
          const prodUrl = `https://${shopDomain}/admin/api/2024-01/products.json?ids=${batch.join(",")}&fields=id,variants`;
          const prodRes = await fetch(prodUrl, {
            headers: { "X-Shopify-Access-Token": accessToken },
          });
          if (!prodRes.ok) {
            console.error("Products fetch error:", prodRes.status, await prodRes.text());
            continue;
          }
          const prodData = await prodRes.json();
          const invItemIds: number[] = [];
          const variantInvMap = new Map<number, number>(); // inventory_item_id -> variant_id
          for (const product of prodData.products || []) {
            for (const v of product.variants || []) {
              if (v.inventory_item_id) {
                invItemIds.push(v.inventory_item_id);
                variantInvMap.set(v.inventory_item_id, v.id);
              }
            }
          }

          // Fetch inventory items in batches of 100 (Shopify limit)
          for (let j = 0; j < invItemIds.length; j += 100) {
            const invBatch = invItemIds.slice(j, j + 100);
            const invUrl = `https://${shopDomain}/admin/api/2024-01/inventory_items.json?ids=${invBatch.join(",")}&fields=id,cost`;
            const invRes = await fetch(invUrl, {
              headers: { "X-Shopify-Access-Token": accessToken },
            });
            if (!invRes.ok) {
              console.error("Inventory fetch error:", invRes.status, await invRes.text());
              continue;
            }
            const invData = await invRes.json();
            for (const inv of invData.inventory_items || []) {
              const variantId = variantInvMap.get(inv.id);
              if (variantId) {
                variantCosts.set(variantId, parseFloat(inv.cost || "0"));
              }
            }
          }
        }
        
        console.log(`Fetched costs for ${variantCosts.size} variants from ${productIds.size} products`);

        // Fallback: collect variant_ids that weren't resolved via product lookup
        const missingVariantIds = new Set<number>();
        for (const order of orders) {
          for (const item of order.line_items || []) {
            if (item.variant_id && !variantCosts.has(item.variant_id)) {
              missingVariantIds.add(item.variant_id);
            }
          }
        }

        // Fetch missing variants individually (handles deleted/draft products)
        if (missingVariantIds.size > 0) {
          console.log(`Fetching ${missingVariantIds.size} missing variants via GraphQL`);
          const missingArr = Array.from(missingVariantIds);
          
          // Use GraphQL nodes query to batch-fetch variant costs (up to 250 per query)
          for (let k = 0; k < missingArr.length; k += 100) {
            const batch = missingArr.slice(k, k + 100);
            const gids = batch.map(id => `"gid://shopify/ProductVariant/${id}"`).join(", ");
            const graphqlQuery = `{
              nodes(ids: [${gids}]) {
                ... on ProductVariant {
                  id
                  legacyResourceId
                  inventoryItem {
                    unitCost {
                      amount
                    }
                  }
                }
              }
            }`;

            try {
              const gqlRes = await fetch(
                `https://${shopDomain}/admin/api/2024-01/graphql.json`,
                {
                  method: "POST",
                  headers: {
                    "X-Shopify-Access-Token": accessToken,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({ query: graphqlQuery }),
                }
              );
              if (gqlRes.ok) {
                const gqlData = await gqlRes.json();
                for (const node of gqlData.data?.nodes || []) {
                  if (node?.legacyResourceId && node?.inventoryItem?.unitCost?.amount) {
                    const varId = parseInt(node.legacyResourceId);
                    const cost = parseFloat(node.inventoryItem.unitCost.amount);
                    variantCosts.set(varId, cost);
                  }
                }
              } else {
                console.error("GraphQL error:", gqlRes.status, await gqlRes.text());
              }
            } catch (e) {
              console.error("GraphQL fetch error:", e);
            }
          }
          console.log(`After fallback: ${variantCosts.size} total variant costs`);
        }

        // Calculate COGS per order and prepare rows
        const orderRows = orders.map((order: any) => {
          let orderCOGS = 0;
          for (const item of order.line_items || []) {
            const unitCost = variantCosts.get(item.variant_id) || 0;
            orderCOGS += unitCost * (item.quantity || 1);
          }

          const totalShipping = (order.shipping_lines || []).reduce(
            (s: number, sl: any) => s + parseFloat(sl.price || "0"), 0
          );

          return {
            client_id: clientId,
            shopify_order_id: order.id,
            order_number: order.name || `#${order.order_number}`,
            total_price: parseFloat(order.total_price || "0"),
            subtotal_price: parseFloat(order.subtotal_price || "0"),
            total_tax: parseFloat(order.total_tax || "0"),
            total_discounts: parseFloat(order.total_discounts || "0"),
            total_cost: orderCOGS,
            total_shipping: totalShipping,
            currency: order.currency || "USD",
            financial_status: order.financial_status || "unknown",
            fulfillment_status: order.fulfillment_status || null,
            order_date: order.created_at,
            customer_id: order.customer?.id || null,
            line_items_count: (order.line_items || []).length,
          };
        });

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
