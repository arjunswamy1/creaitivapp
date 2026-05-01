import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDateRange } from "@/contexts/DateRangeContext";
import { useClient } from "@/contexts/ClientContext";
import { useVertical } from "@/contexts/VerticalContext";
import { matchesVertical, getAdPlatforms, getVerticalAccountIds, matchesVerticalAccount } from "@/config/billyVerticals";
import { format, eachDayOfInterval } from "date-fns";
import { ringbaDayStartUTC, ringbaDayEndUTC, ringbaDateKey } from "@/lib/ringbaDateRange";

export interface DailyFunnelRow {
  date: string;
  label: string;
  // Step 1 — Traffic
  spend: number;
  clicks: number;
  impressions: number;
  cpc: number;
  ctr: number;
  cpm: number;
  // Step 2 — Landing Page
  visitors: number;
  ctaClicks: number;
  lpCvr: number;
  rpv: number;
  // Step 3 — Call Processing
  totalCalls: number;
  connectedCalls: number;
  connectRate: number;
  convertedCalls: number;
  conversionRate: number;
  avgDuration: number;
  // Step 4 — Monetization
  callRevenue: number;
  revenuePerCall: number;
  costPerCall: number;
  callROAS: number;
  profit: number;
  // Deltas (day-over-day)
  deltas: Record<string, number | null>;
}

function pctDelta(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export function useBillyDailyTrends() {
  const { dateRange } = useDateRange();
  const { activeClient } = useClient();
  const { activeVertical } = useVertical();
  const clientId = activeClient?.id;
  const fromStr = format(dateRange.from, "yyyy-MM-dd");
  const toStr = format(dateRange.to, "yyyy-MM-dd");

  return useQuery({
    queryKey: ["billy-daily-trends", clientId, fromStr, toStr, activeVertical.id],
    enabled: !!clientId,
    queryFn: async (): Promise<DailyFunnelRow[]> => {
      if (!clientId) return [];

      const adPlatforms = getAdPlatforms(activeVertical);

      // Fetch ad campaigns for all configured platforms + Ringba calls in parallel
      const campaignQueries = adPlatforms.map((platform) => {
        let q = supabase
          .from("ad_campaigns")
          .select("date, spend, impressions, clicks, conversions, campaign_name, platform, account_id")
          .eq("platform", platform)
          .eq("client_id", clientId)
          .gte("date", fromStr)
          .lte("date", toStr);
        const accountIds = getVerticalAccountIds(activeVertical, platform);
        if (accountIds.length === 1) {
          q = q.eq("account_id", accountIds[0]);
        } else if (accountIds.length > 1) {
          q = q.in("account_id", accountIds);
        }
        return q;
      });

      const [ringbaRes, ...campaignResults] = await Promise.all([
        supabase
          .from("ringba_calls")
          .select("call_date, duration_seconds, revenue, connected, converted, campaign_name")
          .eq("client_id", clientId)
          .gte("call_date", ringbaDayStartUTC(dateRange.from))
          .lte("call_date", ringbaDayEndUTC(dateRange.to)),
        ...campaignQueries,
      ]);

      // Aggregate campaigns by date (filtered by vertical patterns)
      const adByDate = new Map<string, { spend: number; impressions: number; clicks: number; conversions: number }>();
      for (let i = 0; i < campaignResults.length; i++) {
        const { data, error } = campaignResults[i];
        if (error) throw error;
        const platform = adPlatforms[i];
        for (const r of (data || [])) {
          if (!matchesVertical(r.campaign_name, activeVertical, platform)) continue;
          if (!matchesVerticalAccount((r as any).account_id, activeVertical, platform)) continue;
          const d = adByDate.get(r.date) || { spend: 0, impressions: 0, clicks: 0, conversions: 0 };
          d.spend += Number(r.spend);
          d.impressions += Number(r.impressions);
          d.clicks += Number(r.clicks);
          d.conversions += Number(r.conversions);
          adByDate.set(r.date, d);
        }
      }

      // Filter ringba to active vertical and aggregate by date
      const verticalCalls = ((ringbaRes.data || []) as any[]).filter(c =>
        matchesVertical(c.campaign_name, activeVertical, "ringba")
      );

      const ringbaByDate = new Map<string, { totalCalls: number; connected: number; converted: number; revenue: number; totalDuration: number }>();
      for (const c of verticalCalls) {
        const dateKey = c.call_date.split("T")[0];
        const d = ringbaByDate.get(dateKey) || { totalCalls: 0, connected: 0, converted: 0, revenue: 0, totalDuration: 0 };
        d.totalCalls++;
        const dur = Number(c.duration_seconds || 0);
        d.totalDuration += dur;
        if (c.connected && dur > 0) {
          d.connected++;
          d.revenue += Number(c.revenue || 0);
          if (c.converted) d.converted++;
        }
        ringbaByDate.set(dateKey, d);
      }

      // Build daily rows
      const allDates = eachDayOfInterval({ start: dateRange.from, end: dateRange.to })
        .map(d => format(d, "yyyy-MM-dd"))
        .sort();

      const rows: DailyFunnelRow[] = [];

      for (let i = 0; i < allDates.length; i++) {
        const date = allDates[i];
        const ad = adByDate.get(date) || { spend: 0, impressions: 0, clicks: 0, conversions: 0 };
        const rb = ringbaByDate.get(date) || { totalCalls: 0, connected: 0, converted: 0, revenue: 0, totalDuration: 0 };

        const spend = ad.spend;
        const clicks = ad.clicks;
        const impressions = ad.impressions;
        const cpc = clicks > 0 ? spend / clicks : 0;
        const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
        const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;

        const visitors = clicks;
        const ctaClicks = rb.totalCalls;
        const lpCvr = visitors > 0 ? (ctaClicks / visitors) * 100 : 0;
        const rpv = visitors > 0 ? rb.revenue / visitors : 0;

        const connectRate = rb.totalCalls > 0 ? (rb.connected / rb.totalCalls) * 100 : 0;
        const conversionRate = rb.totalCalls > 0 ? (rb.converted / rb.totalCalls) * 100 : 0;
        const avgDuration = rb.totalCalls > 0 ? rb.totalDuration / rb.totalCalls : 0;

        const revenuePerCall = rb.connected > 0 ? rb.revenue / rb.connected : 0;
        const costPerCall = rb.totalCalls > 0 ? spend / rb.totalCalls : 0;
        const callROAS = spend > 0 ? rb.revenue / spend : 0;
        const profit = rb.revenue - spend;

        const current: Record<string, number> = {
          spend, clicks, impressions, cpc, ctr, cpm,
          visitors, ctaClicks, lpCvr, rpv,
          totalCalls: rb.totalCalls, connectedCalls: rb.connected, connectRate,
          convertedCalls: rb.converted, conversionRate, avgDuration,
          callRevenue: rb.revenue, revenuePerCall, costPerCall, callROAS, profit,
        };

        const deltas: Record<string, number | null> = {};
        if (i > 0) {
          const prev = rows[i - 1];
          for (const key of Object.keys(current)) {
            const prevVal = (prev as any)[key] ?? 0;
            deltas[key] = pctDelta(current[key], prevVal);
          }
        }

        rows.push({
          date,
          label: new Date(date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
          spend, clicks, impressions, cpc, ctr, cpm,
          visitors, ctaClicks, lpCvr, rpv,
          totalCalls: rb.totalCalls, connectedCalls: rb.connected, connectRate,
          convertedCalls: rb.converted, conversionRate, avgDuration,
          callRevenue: rb.revenue, revenuePerCall, costPerCall, callROAS, profit,
          deltas,
        });
      }

      return rows;
    },
  });
}
