import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useClient } from "@/contexts/ClientContext";
import { useDateRange } from "@/contexts/DateRangeContext";
import { format, addDays } from "date-fns";

/**
 * Unified revenue hook that fetches from the correct source based on client config.
 * - TFC: subbly_invoices (amounts in cents, status=paid)
 * - Phantasmagorical: shopify_orders (amounts in dollars, financial_status=paid)
 */
export function useClientRevenue(fromStr: string, toStr: string, dateRange: { from: Date; to: Date }) {
  const { activeClient, dashboardConfig } = useClient();
  const clientId = activeClient?.id;
  const revenueSource = (dashboardConfig as any)?.revenue_source || "subbly";

  return useQuery({
    queryKey: ["client-revenue", clientId, fromStr, toStr, revenueSource],
    enabled: !!clientId,
    queryFn: async () => {
      if (!clientId) return { revenue: 0, orders: 0 };

      if (revenueSource === "shopify") {
        return fetchShopifyRevenue(clientId, fromStr, toStr);
      } else {
        return fetchSubblyRevenue(clientId, fromStr, toStr, dateRange);
      }
    },
  });
}

async function fetchSubblyRevenue(clientId: string, fromStr: string, toStr: string, dateRange: { from: Date; to: Date }) {
  const fromUTC = fromStr + "T05:00:00.000Z";
  const toNextDay = format(addDays(dateRange.to, 1), "yyyy-MM-dd");
  const toUTC = toNextDay + "T04:59:59.999Z";

  const { data, error } = await supabase
    .from("subbly_invoices")
    .select("amount")
    .eq("client_id", clientId)
    .eq("status", "paid")
    .gte("invoice_date", fromUTC)
    .lte("invoice_date", toUTC);

  if (error) throw error;
  // Subbly amounts are in cents
  const revenue = (data || []).reduce((s, i) => s + Number(i.amount), 0) / 100;
  return { revenue, orders: (data || []).length };
}

async function fetchShopifyRevenue(clientId: string, fromStr: string, toStr: string) {
  const { data, error } = await supabase
    .from("shopify_orders" as any)
    .select("total_price, financial_status")
    .eq("client_id", clientId)
    .in("financial_status", ["paid", "partially_refunded"])
    .gte("order_date", fromStr + "T00:00:00.000Z")
    .lte("order_date", toStr + "T23:59:59.999Z");

  if (error) throw error;
  // Shopify amounts are already in dollars
  const revenue = (data || []).reduce((s: number, o: any) => s + Number(o.total_price || 0), 0);
  return { revenue, orders: (data || []).length };
}

/** Standalone revenue fetch function for use in other hooks */
export async function getClientRevenue(
  clientId: string,
  revenueSource: string,
  fromStr: string,
  toStr: string,
  dateRange: { from: Date; to: Date }
): Promise<number> {
  if (revenueSource === "shopify") {
    const result = await fetchShopifyRevenue(clientId, fromStr, toStr);
    return result.revenue;
  } else {
    const result = await fetchSubblyRevenue(clientId, fromStr, toStr, dateRange);
    return result.revenue;
  }
}

/** Standalone orders/subscriptions count fetch */
export async function getClientOrders(
  clientId: string,
  revenueSource: string,
  fromStr: string,
  toStr: string,
  dateRange: { from: Date; to: Date }
): Promise<number> {
  if (revenueSource === "shopify") {
    const result = await fetchShopifyRevenue(clientId, fromStr, toStr);
    return result.orders;
  } else {
    // Subbly subscriptions count
    const fromUTC = fromStr + "T05:00:00.000Z";
    const toNextDay = format(addDays(dateRange.to, 1), "yyyy-MM-dd");
    const toUTC = toNextDay + "T04:59:59.999Z";

    const { data, error } = await supabase
      .from("subbly_subscriptions")
      .select("id")
      .eq("client_id", clientId)
      .gte("subbly_created_at", fromUTC)
      .lte("subbly_created_at", toUTC);

    if (error) throw error;
    return (data || []).length;
  }
}
