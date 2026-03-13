import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useClient } from "@/contexts/ClientContext";
import { useDateRange } from "@/contexts/DateRangeContext";
import { format, addDays } from "date-fns";

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

      // 2. Active subscriptions — current snapshot (no date filter)
      const { data: activeSubs, error: activeErr } = await supabase
        .from("subbly_subscriptions")
        .select("id, quantity")
        .eq("client_id", clientId)
        .eq("status", "active");

      if (activeErr) throw activeErr;

      // 3. Paid invoices in date range for revenue
      const { data: invoices, error: invErr } = await supabase
        .from("subbly_invoices")
        .select("amount, invoice_date")
        .eq("client_id", clientId)
        .eq("status", "paid")
        .gte("invoice_date", fromUTC)
        .lte("invoice_date", toUTC);

      if (invErr) throw invErr;

      const newSubCount = (newSubs || []).length;
      const activeSubCount = (activeSubs || []).length;
      const cancelledInRange = (newSubs || []).filter((s) => s.status === "cancelled").length;

      // Subbly amounts are in cents, convert to dollars
      const totalRevenue = (invoices || []).reduce((s, i) => s + Number(i.amount), 0) / 100;

      // MRR = total revenue from active subs' most recent invoices
      // Simple approximation: revenue in period / months in period, or use active sub count * avg invoice
      const avgRevenuePerSub = newSubCount > 0 ? totalRevenue / newSubCount : 0;
      const mrr = Math.round(activeSubCount * avgRevenuePerSub);

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
