import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useClient } from "@/contexts/ClientContext";
import { useDateRange } from "@/contexts/DateRangeContext";
import { useVertical } from "@/contexts/VerticalContext";
import { matchesVertical } from "@/config/billyVerticals";
import { format } from "date-fns";
import { ringbaDayStartUTC, ringbaDayEndUTC } from "@/lib/ringbaDateRange";

export interface RingbaPlatformMetrics {
  conversions: number;
  revenue: number;
  totalCalls: number;
  hasAttribution: boolean;
}

function empty(): RingbaPlatformMetrics {
  return { conversions: 0, revenue: 0, totalCalls: 0, hasAttribution: false };
}

/**
 * Fetches Ringba call conversions for a specific platform (google/meta)
 * by filtering on the utm_source/referrer fields stored in metadata.
 *
 * When no attribution data exists, falls back to splitting calls
 * proportionally based on each platform's ad spend share (not duplicating).
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

      // Fetch Ringba calls and platform spend in parallel
      const [ringbaResult, spendResult] = await Promise.all([
        supabase
          .from("ringba_calls")
          .select("duration_seconds, revenue, connected, converted, campaign_name, metadata")
          .eq("client_id", clientId)
          .gte("call_date", ringbaDayStartUTC(dateRange.from))
          .lte("call_date", ringbaDayEndUTC(dateRange.to)),
        supabase
          .from("ad_daily_metrics")
          .select("platform, spend")
          .eq("client_id", clientId)
          .gte("date", fromStr)
          .lte("date", toStr),
      ]);

      if (ringbaResult.error) {
        console.error("Ringba platform fetch error:", ringbaResult.error);
        return empty();
      }

      const calls = (ringbaResult.data || []) as any[];

      // Filter by vertical
      const verticalCalls = calls.filter((c) =>
        matchesVertical(c.campaign_name, activeVertical, "ringba")
      );

      // Try direct attribution via referrer/UTM
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

      // Check if ANY calls have attribution data
      const hasAnyAttribution = verticalCalls.some((c) => {
        const meta = (c.metadata as any) || {};
        return (meta.referrer && meta.referrer.trim()) || (meta.utm_source && meta.utm_source.trim());
      });

      if (hasAnyAttribution) {
        // Use direct attribution
        const converted = platformCalls.filter(
          (c) => c.connected && Number(c.duration_seconds || 0) > 0 && c.converted
        );
        return {
          totalCalls: platformCalls.length,
          conversions: converted.length,
          revenue: converted.reduce((s: number, c: any) => s + Number(c.revenue || 0), 0),
          hasAttribution: true,
        };
      }

      // No attribution data — split proportionally by ad spend
      const spendData = (spendResult.data || []) as any[];
      let metaSpend = 0;
      let googleSpend = 0;
      for (const row of spendData) {
        if (row.platform === "meta") metaSpend += Number(row.spend || 0);
        else if (row.platform === "google") googleSpend += Number(row.spend || 0);
      }
      const totalSpend = metaSpend + googleSpend;

      // Calculate this platform's share (default 50/50 if no spend data)
      let share: number;
      if (totalSpend > 0) {
        share = platform === "meta" ? metaSpend / totalSpend : googleSpend / totalSpend;
      } else {
        share = 0.5;
      }

      // Apply share to all vertical calls
      const allConverted = verticalCalls.filter(
        (c) => c.connected && Number(c.duration_seconds || 0) > 0 && c.converted
      );
      const totalRevenue = allConverted.reduce((s: number, c: any) => s + Number(c.revenue || 0), 0);

      return {
        totalCalls: Math.round(verticalCalls.length * share),
        conversions: Math.round(allConverted.length * share),
        revenue: Math.round(totalRevenue * share * 100) / 100,
        hasAttribution: false,
      };
    },
  });
}
