import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useClient } from "@/contexts/ClientContext";
import { useDateRange } from "@/contexts/DateRangeContext";
import { format } from "date-fns";
import { ringbaDayStartUTC, ringbaDayEndUTC } from "@/lib/ringbaDateRange";

export interface RingbaMetrics {
  totalCalls: number;
  connectedCalls: number;
  convertedCalls: number;
  totalRevenue: number;
  totalPayout: number;
  avgDuration: number;
  connectRate: number;
  conversionRate: number;
  revenuePerCall: number;
}

export function useRingbaData() {
  const { activeClient } = useClient();
  const { dateRange } = useDateRange();
  const clientId = activeClient?.id;

  const fromStr = format(dateRange.from, "yyyy-MM-dd");
  const toStr = format(dateRange.to, "yyyy-MM-dd");

  return useQuery({
    queryKey: ["ringba-calls", clientId, fromStr, toStr],
    enabled: !!clientId,
    queryFn: async (): Promise<RingbaMetrics> => {
      if (!clientId) return emptyMetrics();

      const { data, error } = await supabase
        .from("ringba_calls" as any)
        .select("duration_seconds, revenue, payout, connected, converted")
        .eq("client_id", clientId)
        .gte("call_date", ringbaDayStartUTC(dateRange.from))
        .lte("call_date", ringbaDayEndUTC(dateRange.to));

      if (error) {
        console.error("Ringba data fetch error:", error);
        return emptyMetrics();
      }

      const calls = (data || []) as any[];
      // Only count calls with actual duration as valid
      const validCalls = calls.filter((c) => c.connected && Number(c.duration_seconds || 0) > 0);
      const totalCalls = calls.length;
      const connectedCalls = validCalls.length;
      const convertedCalls = validCalls.filter((c) => c.converted).length;
      const totalRevenue = validCalls.reduce((s, c) => s + Number(c.revenue || 0), 0);
      const totalPayout = validCalls.reduce((s, c) => s + Number(c.payout || 0), 0);
      const avgDuration = totalCalls > 0
        ? calls.reduce((s, c) => s + Number(c.duration_seconds || 0), 0) / totalCalls
        : 0;

      return {
        totalCalls,
        connectedCalls,
        convertedCalls,
        totalRevenue,
        totalPayout,
        avgDuration,
        connectRate: totalCalls > 0 ? (connectedCalls / totalCalls) * 100 : 0,
        conversionRate: totalCalls > 0 ? (convertedCalls / totalCalls) * 100 : 0,
        revenuePerCall: connectedCalls > 0 ? totalRevenue / connectedCalls : 0,
      };
    },
  });
}

function emptyMetrics(): RingbaMetrics {
  return {
    totalCalls: 0,
    connectedCalls: 0,
    convertedCalls: 0,
    totalRevenue: 0,
    totalPayout: 0,
    avgDuration: 0,
    connectRate: 0,
    conversionRate: 0,
    revenuePerCall: 0,
  };
}

/** Trigger a manual sync of Ringba data */
export async function syncRingbaCalls(clientId: string, daysBack = 30) {
  const { data, error } = await supabase.functions.invoke("sync-ringba-calls", {
    body: { client_id: clientId, days_back: daysBack },
  });
  if (error) throw error;
  return data;
}
