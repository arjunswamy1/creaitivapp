import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useClient } from "@/contexts/ClientContext";
import { useDateRange } from "@/contexts/DateRangeContext";
import { format } from "date-fns";

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
  return {
    totalCalls: calls.length,
    connectedCalls: validCalls.length,
    convertedCalls: validCalls.filter((c) => c.converted).length,
    totalRevenue: validCalls.reduce((s, c) => s + Number(c.revenue || 0), 0),
  };
}

type VerticalKey = "premiumFlights" | "mixedFlights" | "bath" | "allFlights" | "all";

function categorizeRingba(campaignName: string): "premiumFlights" | "mixedFlights" | "bath" | "other" {
  const lower = (campaignName || "").toLowerCase();
  if (lower.includes("mixed") && lower.includes("flight")) return "mixedFlights";
  if (lower.includes("premium") && lower.includes("flight")) return "premiumFlights";
  // Fallback: any "flight" that isn't mixed
  if (lower.includes("flight")) return "premiumFlights";
  if (lower.includes("bath") || lower.includes("bathroom")) return "bath";
  return "other";
}

export interface RingbaByVertical {
  premiumFlights: VerticalRingbaMetrics;
  mixedFlights: VerticalRingbaMetrics;
  allFlights: VerticalRingbaMetrics;
  bath: VerticalRingbaMetrics;
  all: VerticalRingbaMetrics;
}

export function useRingbaByVertical() {
  const { activeClient } = useClient();
  const { dateRange } = useDateRange();
  const clientId = activeClient?.id;
  const fromStr = format(dateRange.from, "yyyy-MM-dd");
  const toStr = format(dateRange.to, "yyyy-MM-dd");

  return useQuery({
    queryKey: ["ringba-by-vertical", clientId, fromStr, toStr],
    enabled: !!clientId,
    queryFn: async (): Promise<RingbaByVertical> => {
      if (!clientId) return { premiumFlights: emptyVertical(), mixedFlights: emptyVertical(), allFlights: emptyVertical(), bath: emptyVertical(), all: emptyVertical() };

      const { data, error } = await supabase
        .from("ringba_calls")
        .select("duration_seconds, revenue, payout, connected, converted, campaign_name")
        .eq("client_id", clientId)
        .gte("call_date", fromStr + "T00:00:00.000Z")
        .lte("call_date", toStr + "T23:59:59.999Z");

      if (error) {
        console.error("Ringba vertical fetch error:", error);
        return { premiumFlights: emptyVertical(), mixedFlights: emptyVertical(), allFlights: emptyVertical(), bath: emptyVertical(), all: emptyVertical() };
      }

      const calls = (data || []) as any[];
      const premium = calls.filter(c => categorizeRingba(c.campaign_name) === "premiumFlights");
      const mixed = calls.filter(c => categorizeRingba(c.campaign_name) === "mixedFlights");
      const bathCalls = calls.filter(c => categorizeRingba(c.campaign_name) === "bath");
      const allFlightsCalls = [...premium, ...mixed];

      return {
        premiumFlights: calcVertical(premium),
        mixedFlights: calcVertical(mixed),
        allFlights: calcVertical(allFlightsCalls),
        bath: calcVertical(bathCalls),
        all: calcVertical(calls),
      };
    },
  });
}
