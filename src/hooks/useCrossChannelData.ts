import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDateRange } from "@/contexts/DateRangeContext";
import { useClient } from "@/contexts/ClientContext";
import { format, differenceInDays, subDays, addDays } from "date-fns";
import { getClientRevenue, getClientOrders } from "@/hooks/useClientRevenue";

function useDateStrings() {
  const { dateRange } = useDateRange();
  const fromStr = format(dateRange.from, "yyyy-MM-dd");
  const toStr = format(dateRange.to, "yyyy-MM-dd");
  const days = differenceInDays(dateRange.to, dateRange.from) + 1;
  const prevFrom = format(subDays(dateRange.from, days), "yyyy-MM-dd");
  const prevTo = format(subDays(dateRange.from, 1), "yyyy-MM-dd");
  return { fromStr, toStr, prevFrom, prevTo, days, dateRange };
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export interface CrossChannelKPIs {
  totalSpend: number;
  googleSpend: number;
  metaSpend: number;
  newSubscriptions: number;
  totalCAC: number;
  totalRevenue: number;
  blendedROAS: number;
  profit: number;
  totalCOGS: number;
  totalTaxes: number;
  totalDiscounts: number;
  changes: {
    totalSpend: number | null;
    googleSpend: number | null;
    metaSpend: number | null;
    newSubscriptions: number | null;
    totalCAC: number | null;
    totalRevenue: number | null;
    blendedROAS: number | null;
    profit: number | null;
  };
}

async function fetchAdSpendByPlatform(clientId: string | undefined, fromStr: string, toStr: string) {
  let query = supabase
    .from("ad_daily_metrics")
    .select("platform, spend")
    .gte("date", fromStr)
    .lte("date", toStr)
    .neq("platform", "shopify"); // Exclude shopify from ad spend

  if (clientId) query = query.eq("client_id", clientId);
  const { data, error } = await query;
  if (error) throw error;

  let googleSpend = 0, metaSpend = 0;
  for (const row of data || []) {
    const spend = Number(row.spend);
    if (row.platform === "google") googleSpend += spend;
    else if (row.platform === "meta") metaSpend += spend;
  }
  return { googleSpend: Math.round(googleSpend), metaSpend: Math.round(metaSpend), totalSpend: Math.round(googleSpend + metaSpend) };
}

async function fetchShopifyCosts(clientId: string, fromStr: string, toStr: string) {
  const { data, error } = await supabase
    .from("shopify_orders" as any)
    .select("total_cost, total_tax, total_shipping, total_discounts")
    .eq("client_id", clientId)
    .in("financial_status", ["paid", "partially_refunded"])
    .gte("order_date", fromStr + "T00:00:00.000Z")
    .lte("order_date", toStr + "T23:59:59.999Z");

  if (error) throw error;
  const rows = (data || []) as any[];
  const cogs = rows.reduce((s: number, o: any) => s + Number(o.total_cost || 0), 0);
  const taxes = rows.reduce((s: number, o: any) => s + Number(o.total_tax || 0) + Number(o.total_shipping || 0), 0);
  const discounts = rows.reduce((s: number, o: any) => s + Number(o.total_discounts || 0), 0);
  return { cogs, taxes, discounts };
}

export function useCrossChannelKPIs() {
  const { fromStr, toStr, prevFrom, prevTo, dateRange } = useDateStrings();
  const { activeClient, dashboardConfig } = useClient();
  const clientId = activeClient?.id;
  const revenueSource = dashboardConfig?.revenue_source || "subbly";

  return useQuery({
    queryKey: ["cross-channel-kpis", fromStr, toStr, clientId, revenueSource],
    enabled: !!clientId,
    queryFn: async (): Promise<CrossChannelKPIs> => {
      if (!clientId) throw new Error("No client");

      // Current period
      const [currentAds, currentOrders, currentRevenue] = await Promise.all([
        fetchAdSpendByPlatform(clientId, fromStr, toStr),
        getClientOrders(clientId, revenueSource, fromStr, toStr, dateRange),
        getClientRevenue(clientId, revenueSource, fromStr, toStr, dateRange),
      ]);

      // Fetch COGS and taxes for Shopify clients
      let currentCOGS = 0, currentTaxes = 0, currentDiscounts = 0;
      let prevCOGS = 0, prevTaxes = 0, prevDiscounts = 0;

      if (revenueSource === "shopify") {
        const [currentCosts, prevCosts] = await Promise.all([
          fetchShopifyCosts(clientId, fromStr, toStr),
          fetchShopifyCosts(clientId, prevFrom, prevTo),
        ]);
        currentCOGS = currentCosts.cogs;
        currentTaxes = currentCosts.taxes;
        currentDiscounts = currentCosts.discounts;
        prevCOGS = prevCosts.cogs;
        prevTaxes = prevCosts.taxes;
        prevDiscounts = prevCosts.discounts;
      }

      // Previous period
      const prevDateRange = { from: subDays(dateRange.from, differenceInDays(dateRange.to, dateRange.from) + 1), to: subDays(dateRange.from, 1) };
      const [prevAds, prevOrders, prevRevenue] = await Promise.all([
        fetchAdSpendByPlatform(clientId, prevFrom, prevTo),
        getClientOrders(clientId, revenueSource, prevFrom, prevTo, prevDateRange),
        getClientRevenue(clientId, revenueSource, prevFrom, prevTo, prevDateRange),
      ]);

      const currentCAC = currentOrders > 0 ? Math.round((currentAds.totalSpend / currentOrders) * 100) / 100 : 0;
      const prevCAC = prevOrders > 0 ? Math.round((prevAds.totalSpend / prevOrders) * 100) / 100 : 0;
      const currentROAS = currentAds.totalSpend > 0 ? Math.round((currentRevenue / currentAds.totalSpend) * 100) / 100 : 0;
      const prevROAS = prevAds.totalSpend > 0 ? Math.round((prevRevenue / prevAds.totalSpend) * 100) / 100 : 0;

      const currentProfit = Math.round((currentRevenue - currentAds.totalSpend - currentCOGS - currentTaxes - currentDiscounts) * 100) / 100;
      const prevProfit = Math.round((prevRevenue - prevAds.totalSpend - prevCOGS - prevTaxes - prevDiscounts) * 100) / 100;

      return {
        totalSpend: currentAds.totalSpend,
        googleSpend: currentAds.googleSpend,
        metaSpend: currentAds.metaSpend,
        newSubscriptions: currentOrders,
        totalCAC: currentCAC,
        totalRevenue: Math.round(currentRevenue * 100) / 100,
        blendedROAS: currentROAS,
        profit: currentProfit,
        totalCOGS: Math.round(currentCOGS * 100) / 100,
        totalTaxes: Math.round(currentTaxes * 100) / 100,
        totalDiscounts: Math.round(currentDiscounts * 100) / 100,
        changes: {
          totalSpend: pctChange(currentAds.totalSpend, prevAds.totalSpend),
          googleSpend: pctChange(currentAds.googleSpend, prevAds.googleSpend),
          metaSpend: pctChange(currentAds.metaSpend, prevAds.metaSpend),
          newSubscriptions: pctChange(currentOrders, prevOrders),
          totalCAC: pctChange(currentCAC, prevCAC),
          totalRevenue: pctChange(currentRevenue, prevRevenue),
          blendedROAS: pctChange(currentROAS, prevROAS),
          profit: pctChange(currentProfit, prevProfit),
        },
      };
    },
  });
}

export function useSpendSubsDaily() {
  const { fromStr, toStr, dateRange } = useDateStrings();
  const { activeClient, dashboardConfig } = useClient();
  const clientId = activeClient?.id;
  const revenueSource = dashboardConfig?.revenue_source || "subbly";

  return useQuery({
    queryKey: ["spend-subs-daily", fromStr, toStr, clientId, revenueSource],
    enabled: !!clientId,
    queryFn: async () => {
      if (!clientId) return [];

      // Fetch ad spend by day (exclude shopify platform)
      const { data: adData, error: adErr } = await supabase
        .from("ad_daily_metrics")
        .select("date, platform, spend")
        .eq("client_id", clientId)
        .neq("platform", "shopify")
        .gte("date", fromStr)
        .lte("date", toStr)
        .order("date", { ascending: true });

      if (adErr) throw adErr;

      // Fetch daily orders/subscriptions based on revenue source
      let ordersByDay = new Map<string, number>();
      if (revenueSource === "shopify") {
        const { data: orders, error: ordErr } = await supabase
          .from("shopify_orders" as any)
          .select("order_date")
          .eq("client_id", clientId)
          .in("financial_status", ["paid", "partially_refunded"])
          .gte("order_date", fromStr + "T00:00:00.000Z")
          .lte("order_date", toStr + "T23:59:59.999Z");

        if (ordErr) throw ordErr;
        for (const row of (orders || []) as any[]) {
          if (!row.order_date) continue;
          const day = row.order_date.split("T")[0];
          ordersByDay.set(day, (ordersByDay.get(day) || 0) + 1);
        }
      } else {
        const fromUTC = fromStr + "T00:00:00.000Z";
        const toNextDay = format(addDays(dateRange.to, 1), "yyyy-MM-dd");
        const toUTC = toNextDay + "T23:59:59.999Z";

        const { data: subsData, error: subsErr } = await supabase
          .from("subbly_subscriptions")
          .select("subbly_created_at")
          .eq("client_id", clientId)
          .gte("subbly_created_at", fromUTC)
          .lte("subbly_created_at", toUTC);

        if (subsErr) throw subsErr;
        for (const row of subsData || []) {
          if (!row.subbly_created_at) continue;
          // Supabase returns timestamps with space separator, not "T"
          const day = row.subbly_created_at.substring(0, 10);
          ordersByDay.set(day, (ordersByDay.get(day) || 0) + 1);
        }
      }

      // Merge by date
      const byDate = new Map<string, { metaSpend: number; googleSpend: number; newSubs: number }>();
      let d = new Date(dateRange.from);
      while (d <= dateRange.to) {
        const key = format(d, "yyyy-MM-dd");
        byDate.set(key, { metaSpend: 0, googleSpend: 0, newSubs: ordersByDay.get(key) || 0 });
        d = addDays(d, 1);
      }

      for (const row of adData || []) {
        const existing = byDate.get(row.date) || { metaSpend: 0, googleSpend: 0, newSubs: ordersByDay.get(row.date) || 0 };
        if (row.platform === "meta") existing.metaSpend += Number(row.spend);
        else if (row.platform === "google") existing.googleSpend += Number(row.spend);
        byDate.set(row.date, existing);
      }

      return Array.from(byDate.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, vals]) => ({
          date: new Date(date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }),
          metaSpend: Math.round(vals.metaSpend),
          googleSpend: Math.round(vals.googleSpend),
          newSubs: vals.newSubs,
        }));
    },
  });
}
