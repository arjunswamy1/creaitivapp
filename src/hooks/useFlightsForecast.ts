import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useClient } from "@/contexts/ClientContext";
import { useVertical } from "@/contexts/VerticalContext";
import { matchesVertical, matchesVerticalAccount, getAdPlatforms, getVerticalAccountIds } from "@/config/billyVerticals";
import { format, startOfMonth, endOfMonth, differenceInDays, getDaysInMonth } from "date-fns";
import { ringbaDayStartUTC, ringbaDayEndUTC, ringbaDateKey } from "@/lib/ringbaDateRange";

export interface FlightsDailyData {
  date: string;
  spend: number;
  clicks: number;
  impressions: number;
  calls: number;
  connectedCalls: number;
  callRevenue: number;
  cpc: number;
  lpCvr: number;
  rpv: number;
  profit: number;
}

export interface FlightsForecast {
  month: string;
  daysInMonth: number;
  daysElapsed: number;
  daysRemaining: number;
  mtdSpend: number;
  mtdRevenue: number;
  mtdProfit: number;
  mtdVisitors: number;
  mtdCalls: number;
  mtdConnected: number;
  avgDailySpend: number;
  avgDailyVisitors: number;
  avgDailyCalls: number;
  avgDailyRevenue: number;
  trendCpc: number;
  trendLpCvr: number;
  trendRpv: number;
  trendConnectRate: number;
  trendRevenuePerCall: number;
  projectedSpend: number;
  projectedRevenue: number;
  projectedProfit: number;
  projectedVisitors: number;
  projectedCalls: number;
  projectedROAS: number;
  dailyData: FlightsDailyData[];
}

export function useFlightsForecast() {
  const { activeClient } = useClient();
  const { activeVertical } = useVertical();
  const clientId = activeClient?.id;

  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const fromStr = format(monthStart, "yyyy-MM-dd");
  const toStr = format(monthEnd, "yyyy-MM-dd");
  const todayStr = format(now, "yyyy-MM-dd");
  const totalDays = getDaysInMonth(now);
  const completedDays = differenceInDays(now, monthStart);
  const daysRemaining = totalDays - completedDays;
  const monthLabel = format(now, "MMMM yyyy");

  return useQuery({
    queryKey: ["flights-forecast", clientId, fromStr, activeVertical.id],
    enabled: !!clientId,
    queryFn: async (): Promise<FlightsForecast> => {
      if (!clientId) throw new Error("No client");

      const adPlatforms = getAdPlatforms(activeVertical);

      // Fetch campaigns for all configured platforms, scoped by account IDs
      const campaignQueries = adPlatforms.map((platform) => {
        let q = supabase
          .from("ad_campaigns")
          .select("date, spend, clicks, impressions, campaign_name, platform, account_id")
          .eq("platform", platform)
          .eq("client_id", clientId)
          .gte("date", fromStr)
          .lte("date", todayStr);
        const accountIds = getVerticalAccountIds(activeVertical, platform);
        if (accountIds.length === 1) {
          q = q.eq("account_id", accountIds[0]);
        } else if (accountIds.length > 1) {
          q = q.in("account_id", accountIds);
        }
        return q;
      });

      const [callRes, ...campaignResults] = await Promise.all([
        supabase
          .from("ringba_calls" as any)
          .select("call_date, revenue, connected, converted, duration_seconds, campaign_name")
          .eq("client_id", clientId)
          .gte("call_date", ringbaDayStartUTC(monthStart))
          .lte("call_date", ringbaDayEndUTC(monthEnd)),
        ...campaignQueries,
      ]);

      if (callRes.error) throw callRes.error;

      // Aggregate by date
      const byDate = new Map<string, {
        spend: number; clicks: number; impressions: number;
        calls: number; connectedCalls: number; callRevenue: number;
      }>();

      for (let i = 0; i < campaignResults.length; i++) {
        const { data, error } = campaignResults[i];
        if (error) throw error;
        const platform = adPlatforms[i];
        for (const row of (data || [])) {
          if (!matchesVertical(row.campaign_name, activeVertical, platform)) continue;
          if (!matchesVerticalAccount((row as any).account_id, activeVertical, platform)) continue;
          const d = row.date;
          const existing = byDate.get(d) || { spend: 0, clicks: 0, impressions: 0, calls: 0, connectedCalls: 0, callRevenue: 0 };
          existing.spend += Number(row.spend || 0);
          existing.clicks += Number(row.clicks || 0);
          existing.impressions += Number(row.impressions || 0);
          byDate.set(d, existing);
        }
      }

      // Filter ringba calls by vertical
      const verticalCalls = ((callRes.data || []) as any[]).filter(c =>
        matchesVertical(c.campaign_name, activeVertical, "ringba")
      );

      for (const call of verticalCalls) {
        const d = format(new Date(call.call_date), "yyyy-MM-dd");
        const existing = byDate.get(d) || { spend: 0, clicks: 0, impressions: 0, calls: 0, connectedCalls: 0, callRevenue: 0 };
        existing.calls += 1;
        if (call.connected && Number(call.duration_seconds || 0) > 0) {
          existing.connectedCalls += 1;
          existing.callRevenue += Number(call.revenue || 0);
        }
        byDate.set(d, existing);
      }

      const dailyData: FlightsDailyData[] = Array.from(byDate.entries())
        .map(([date, v]) => ({
          date,
          spend: v.spend,
          clicks: v.clicks,
          impressions: v.impressions,
          calls: v.calls,
          connectedCalls: v.connectedCalls,
          callRevenue: v.callRevenue,
          cpc: v.clicks > 0 ? v.spend / v.clicks : 0,
          lpCvr: v.clicks > 0 ? (v.calls / v.clicks) * 100 : 0,
          rpv: v.clicks > 0 ? v.callRevenue / v.clicks : 0,
          profit: v.callRevenue - v.spend,
        }))
        .sort((a, b) => a.date.localeCompare(b.date));

      const completedDayData = dailyData.filter(d => d.date < todayStr);

      const mtdSpend = dailyData.reduce((s, d) => s + d.spend, 0);
      const mtdRevenue = dailyData.reduce((s, d) => s + d.callRevenue, 0);
      const mtdProfit = mtdRevenue - mtdSpend;
      const mtdVisitors = dailyData.reduce((s, d) => s + d.clicks, 0);
      const mtdCalls = dailyData.reduce((s, d) => s + d.calls, 0);
      const mtdConnected = dailyData.reduce((s, d) => s + d.connectedCalls, 0);

      const trendDays = completedDayData.length > 0 ? completedDayData : dailyData;
      const n = trendDays.length || 1;
      const totalTrendSpend = trendDays.reduce((s, d) => s + d.spend, 0);
      const totalTrendClicks = trendDays.reduce((s, d) => s + d.clicks, 0);
      const totalTrendCalls = trendDays.reduce((s, d) => s + d.calls, 0);
      const totalTrendConnected = trendDays.reduce((s, d) => s + d.connectedCalls, 0);
      const totalTrendRevenue = trendDays.reduce((s, d) => s + d.callRevenue, 0);

      const avgDailySpend = totalTrendSpend / n;
      const avgDailyVisitors = totalTrendClicks / n;
      const avgDailyCalls = totalTrendCalls / n;
      const avgDailyRevenue = totalTrendRevenue / n;
      const trendCpc = totalTrendClicks > 0 ? totalTrendSpend / totalTrendClicks : 0;
      const trendLpCvr = totalTrendClicks > 0 ? (totalTrendCalls / totalTrendClicks) * 100 : 0;
      const trendRpv = totalTrendClicks > 0 ? totalTrendRevenue / totalTrendClicks : 0;
      const trendConnectRate = totalTrendCalls > 0 ? (totalTrendConnected / totalTrendCalls) * 100 : 0;
      const trendRevenuePerCall = totalTrendConnected > 0 ? totalTrendRevenue / totalTrendConnected : 0;

      const projectedSpend = mtdSpend + (avgDailySpend * daysRemaining);
      const projectedRevenue = mtdRevenue + (avgDailyRevenue * daysRemaining);
      const projectedProfit = projectedRevenue - projectedSpend;
      const projectedVisitors = mtdVisitors + (avgDailyVisitors * daysRemaining);
      const projectedCalls = mtdCalls + (avgDailyCalls * daysRemaining);
      const projectedROAS = projectedSpend > 0 ? projectedRevenue / projectedSpend : 0;

      return {
        month: monthLabel,
        daysInMonth: totalDays,
        daysElapsed: completedDays,
        daysRemaining,
        mtdSpend, mtdRevenue, mtdProfit, mtdVisitors, mtdCalls, mtdConnected,
        avgDailySpend, avgDailyVisitors, avgDailyCalls, avgDailyRevenue,
        trendCpc, trendLpCvr, trendRpv, trendConnectRate, trendRevenuePerCall,
        projectedSpend, projectedRevenue, projectedProfit, projectedVisitors, projectedCalls, projectedROAS,
        dailyData,
      };
    },
  });
}
