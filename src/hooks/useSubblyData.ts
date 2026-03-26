import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useClient } from "@/contexts/ClientContext";
import { useDateRange } from "@/contexts/DateRangeContext";
import { format, addDays, subDays } from "date-fns";

export interface SubblyKPIs {
  newSubscriptions: number;
  activeSubscriptions: number;
  mrr: number;
  totalRevenue: number;
  churnedCount: number;
  churnRate: number;
  avgRevenuePerSub: number;
}

export function useSubblyKPIs() {
  const { activeClient, dashboardConfig } = useClient();
  const { dateRange } = useDateRange();
  const clientId = activeClient?.id;
  const enabled = dashboardConfig?.enabled_platforms?.includes("subbly") ?? false;
  const fromStr = format(dateRange.from, "yyyy-MM-dd");
  const toStr = format(dateRange.to, "yyyy-MM-dd");

  return useQuery({
    queryKey: ["subbly-kpis", clientId, fromStr, toStr],
    enabled: !!clientId && enabled,
    queryFn: async (): Promise<SubblyKPIs> => {
      if (!clientId) throw new Error("No client");

      // Subbly uses US Eastern Time (UTC-5) for date boundaries
      const fromUTC = fromStr + "T05:00:00.000Z";
      const toNextDay = format(addDays(dateRange.to, 1), "yyyy-MM-dd");
      const toUTC = toNextDay + "T04:59:59.999Z";

      // 1. New subscriptions created within date range (all statuses)
      const { data: newSubs, error: newSubErr } = await supabase
        .from("subbly_subscriptions")
        .select("status, quantity, subbly_created_at")
        .eq("client_id", clientId)
        .gte("subbly_created_at", fromUTC)
        .lte("subbly_created_at", toUTC);

      if (newSubErr) throw newSubErr;

      // 2. Active subscriptions — use count query for accuracy (avoids 1000-row limit)
      const { count: activeSubCount, error: activeErr } = await supabase
        .from("subbly_subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("client_id", clientId)
        .eq("status", "active");

      if (activeErr) throw activeErr;

      // 3. Paid invoices in selected date range for revenue
      const { data: invoices, error: invErr } = await supabase
        .from("subbly_invoices")
        .select("amount, invoice_date")
        .eq("client_id", clientId)
        .eq("status", "paid")
        .gte("invoice_date", fromUTC)
        .lte("invoice_date", toUTC);

      if (invErr) throw invErr;

      // 4. MRR: paid invoices from last 30 days (rolling, independent of date range)
      const thirtyDaysAgo = format(subDays(new Date(), 30), "yyyy-MM-dd") + "T00:00:00.000Z";
      const nowUTC = new Date().toISOString();
      const { data: mrrInvoices, error: mrrErr } = await supabase
        .from("subbly_invoices")
        .select("amount")
        .eq("client_id", clientId)
        .eq("status", "paid")
        .gte("invoice_date", thirtyDaysAgo)
        .lte("invoice_date", nowUTC);

      if (mrrErr) throw mrrErr;

      const newSubCount = (newSubs || []).length;
      const activeSubCount = (activeSubs || []).length;
      const cancelledInRange = (newSubs || []).filter((s) => s.status === "cancelled").length;

      // Subbly amounts are in cents, convert to dollars
      const totalRevenue = (invoices || []).reduce((s, i) => s + Number(i.amount), 0) / 100;

      // MRR = sum of paid invoices in last 30 days (already ~1 month window)
      const mrr = Math.round((mrrInvoices || []).reduce((s, i) => s + Number(i.amount), 0) / 100);

      const avgRevenuePerSub = activeSubCount > 0 ? mrr / activeSubCount : 0;

      return {
        newSubscriptions: newSubCount,
        activeSubscriptions: activeSubCount,
        mrr,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        churnedCount: cancelledInRange,
        churnRate: newSubCount > 0 ? Math.round((cancelledInRange / newSubCount) * 10000) / 100 : 0,
        avgRevenuePerSub: Math.round(avgRevenuePerSub * 100) / 100,
      };
    },
  });
}