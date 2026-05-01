import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useClient } from "@/contexts/ClientContext";
import { useDateRange } from "@/contexts/DateRangeContext";
import { useVertical } from "@/contexts/VerticalContext";
import { matchesVertical } from "@/config/billyVerticals";
import { format } from "date-fns";
import { ringbaDayStartUTC, ringbaDayEndUTC } from "@/lib/ringbaDateRange";

export interface VerticalRingbaMetrics {
  totalCalls: number;
  connectedCalls: number;
  convertedCalls: number;
  totalRevenue: number;
  avgDuration: number;
}

function emptyVertical(): VerticalRingbaMetrics {
  return { totalCalls: 0, connectedCalls: 0, convertedCalls: 0, totalRevenue: 0, avgDuration: 0 };
}

function calcVertical(calls: any[]): VerticalRingbaMetrics {
  const validCalls = calls.filter((c) => c.connected && Number(c.duration_seconds || 0) > 0);
  const totalDuration = calls.reduce((s, c) => s + Number(c.duration_seconds || 0), 0);
  return {
    totalCalls: calls.length,
    connectedCalls: validCalls.length,
    convertedCalls: validCalls.filter((c) => c.converted).length,
    totalRevenue: validCalls.reduce((s, c) => s + Number(c.revenue || 0), 0),
    avgDuration: calls.length > 0 ? totalDuration / calls.length : 0,
  };
}

export interface RingbaByVertical {
  /** Ringba metrics for the active vertical */
  active: VerticalRingbaMetrics;
  /** All calls (unfiltered) */
  all: VerticalRingbaMetrics;
}

export function useRingbaByVertical() {
  const { activeClient } = useClient();
  const { dateRange } = useDateRange();
  const { activeVertical } = useVertical();
  const clientId = activeClient?.id;
  const fromStr = format(dateRange.from, "yyyy-MM-dd");
  const toStr = format(dateRange.to, "yyyy-MM-dd");

  return useQuery({
    queryKey: ["ringba-by-vertical", clientId, fromStr, toStr, activeVertical.id],
    enabled: !!clientId,
    queryFn: async (): Promise<RingbaByVertical> => {
      if (!clientId) return { active: emptyVertical(), all: emptyVertical() };

      const { data, error } = await supabase
        .from("ringba_calls")
        .select("duration_seconds, revenue, payout, connected, converted, campaign_name")
        .eq("client_id", clientId)
        .gte("call_date", ringbaDayStartUTC(dateRange.from))
        .lte("call_date", ringbaDayEndUTC(dateRange.to));

      if (error) {
        console.error("Ringba vertical fetch error:", error);
        return { active: emptyVertical(), all: emptyVertical() };
      }

      const calls = (data || []) as any[];
      const verticalCalls = calls.filter((c) =>
        matchesVertical(c.campaign_name, activeVertical, "ringba")
      );

      return {
        active: calcVertical(verticalCalls),
        all: calcVertical(calls),
      };
    },
  });
}
