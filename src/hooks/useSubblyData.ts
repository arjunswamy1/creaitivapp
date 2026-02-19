import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useClient } from "@/contexts/ClientContext";
import { useDateRange } from "@/contexts/DateRangeContext";
import { format } from "date-fns";

export interface SubblyKPIs {
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

      // Fetch subscriptions
      const { data: subs, error: subErr } = await supabase
        .from("subbly_subscriptions")
        .select("status, quantity, successful_charges_count")
        .eq("client_id", clientId);

      if (subErr) throw subErr;

      const activeSubs = (subs || []).filter((s) =>
        ["active", "trial", "pre_order"].includes(s.status)
      );
      const cancelledSubs = (subs || []).filter((s) => s.status === "cancelled");

      // Fetch paid invoices filtered by date range
      const { data: invoices, error: invErr } = await supabase
        .from("subbly_invoices")
        .select("amount, status, invoice_date")
        .eq("client_id", clientId)
        .eq("status", "paid")
        .gte("invoice_date", fromStr)
        .lte("invoice_date", toStr + "T23:59:59.999Z");

      if (invErr) throw invErr;

      // Subbly amounts are in cents, convert to dollars
      const totalRevenue = (invoices || []).reduce((s, i) => s + Number(i.amount), 0) / 100;
      const activeCount = activeSubs.length;
      const totalCount = (subs || []).length;

      return {
        activeSubscriptions: activeCount,
        mrr: totalCount > 0 ? Math.round(totalRevenue / Math.max(1, (subs || []).reduce((s, sub) => s + (sub.successful_charges_count || 1), 0)) * activeCount) : 0,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        churnedCount: cancelledSubs.length,
        churnRate: totalCount > 0 ? Math.round((cancelledSubs.length / totalCount) * 10000) / 100 : 0,
        avgRevenuePerSub: activeCount > 0 ? Math.round((totalRevenue / activeCount) * 100) / 100 : 0,
      };
    },
  });
}
