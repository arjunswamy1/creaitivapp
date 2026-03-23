import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useClient } from "@/contexts/ClientContext";
import { useDateRange } from "@/contexts/DateRangeContext";
import { useVertical } from "@/contexts/VerticalContext";
import { matchesVertical } from "@/config/billyVerticals";
import { format } from "date-fns";

export interface RingbaPlatformMetrics {
  conversions: number;
  revenue: number;
  totalCalls: number;
}

function empty(): RingbaPlatformMetrics {
  return { conversions: 0, revenue: 0, totalCalls: 0 };
}

/**
 * Fetches Ringba call conversions for a specific platform (google/meta)
 * by filtering on the utm_source field stored in metadata.
 * "fb" → meta, "google" → google
 */
export function useRingbaByPlatform(platform: "google" | "meta") {
  const { activeClient } = useClient();
  const { dateRange } = useDateRange();
  const { activeVertical } = useVertical();
  const clientId = activeClient?.id;
  const fromStr = format(dateRange.from, "yyyy-MM-dd");
  const toStr = format(dateRange.to, "yyyy-MM-dd");

  return useQuery({
    queryKey: ["ringba-by-platform", clientId, fromStr, toStr, activeVertical.id, platform],
    enabled: !!clientId,
    queryFn: async (): Promise<RingbaPlatformMetrics> => {
      if (!clientId) return empty();

      const { data, error } = await supabase
        .from("ringba_calls")
        .select("duration_seconds, revenue, connected, converted, campaign_name, metadata")
        .eq("client_id", clientId)
        .gte("call_date", fromStr + "T00:00:00.000Z")
        .lte("call_date", toStr + "T23:59:59.999Z");

      if (error) {
        console.error("Ringba platform fetch error:", error);
        return empty();
      }

      const calls = (data || []) as any[];

      // Filter by vertical
      const verticalCalls = calls.filter((c) =>
        matchesVertical(c.campaign_name, activeVertical, "ringba")
      );

      // Filter by referrer URL first, then fallback to UTM source
      const platformCalls = verticalCalls.filter((c) => {
        const meta = (c.metadata as any) || {};
        const referrer = (meta.referrer || "").toLowerCase();
        const utmSource = (meta.utm_source || "").toLowerCase();
        
        if (platform === "meta") {
          if (referrer.includes("facebook.com") || referrer.includes("fb.com") || referrer.includes("instagram.com")) return true;
          return utmSource === "fb" || utmSource === "facebook" || utmSource === "meta";
        }
        // Google
        if (referrer.includes("google.com") || referrer.includes("google.co")) return true;
        return utmSource === "google" || utmSource === "gads" || utmSource === "google_ads";
      });

      // If no calls have referrer/UTM data at all, fall back to showing all vertical calls
      // (better than showing 0 when attribution data isn't available)
      const hasAnyAttribution = verticalCalls.some((c) => {
        const meta = (c.metadata as any) || {};
        return (meta.referrer && meta.referrer.trim()) || (meta.utm_source && meta.utm_source.trim());
      });

      const relevantCalls = hasAnyAttribution ? platformCalls : verticalCalls;

      // Only connected calls with duration count as conversions
      const converted = relevantCalls.filter(
        (c) => c.connected && Number(c.duration_seconds || 0) > 0 && c.converted
      );

      return {
        totalCalls: relevantCalls.length,
        conversions: converted.length,
        revenue: converted.reduce((s: number, c: any) => s + Number(c.revenue || 0), 0),
        hasAttribution: hasAnyAttribution,
      };
    },
  });
}
