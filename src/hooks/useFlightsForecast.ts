import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useClient } from "@/contexts/ClientContext";
import { format, startOfMonth, endOfMonth, differenceInDays, getDaysInMonth } from "date-fns";

const FLIGHTS_PATTERN = "Flight";

export interface FlightsDailyData {
  date: string;
  spend: number;
  clicks: number;
  impressions: number;
  calls: number;
  connectedCalls: number;
  callRevenue: number;
  // Derived
  cpc: number;
  lpCvr: number; // calls / clicks
  rpv: number;   // callRevenue / clicks
  profit: number; // callRevenue - spend
}

export interface FlightsForecast {
  month: string;
  daysInMonth: number;
  daysElapsed: number;
  daysRemaining: number;

  // MTD actuals
  mtdSpend: number;
  mtdRevenue: number;
  mtdProfit: number;
  mtdVisitors: number;
  mtdCalls: number;
  mtdConnected: number;

  // Trailing averages (last 7 completed days for trends)
  avgDailySpend: number;
  avgDailyVisitors: number;
  avgDailyCalls: number;
  avgDailyRevenue: number;
  trendCpc: number;
  trendLpCvr: number;  // %
  trendRpv: number;
  trendConnectRate: number;
  trendRevenuePerCall: number;

  // Projections for full month
  projectedSpend: number;
  projectedRevenue: number;
  projectedProfit: number;
  projectedVisitors: number;
  projectedCalls: number;
  projectedROAS: number;

  // Daily data for charts
  dailyData: FlightsDailyData[];
}

export function useFlightsForecast() {
  const { activeClient } = useClient();
  const clientId = activeClient?.id;

  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const fromStr = format(monthStart, "yyyy-MM-dd");
  const toStr = format(monthEnd, "yyyy-MM-dd");
  const todayStr = format(now, "yyyy-MM-dd");
  const totalDays = getDaysInMonth(now);
  // Completed days = days before today
  const completedDays = differenceInDays(now, monthStart);
  const daysRemaining = totalDays - completedDays;
  const monthLabel = format(now, "MMMM yyyy");

  return useQuery({
    queryKey: ["flights-forecast", clientId, fromStr],
    enabled: !!clientId,
    queryFn: async (): Promise<FlightsForecast> => {
      if (!clientId) throw new Error("No client");

      // Fetch Flights campaigns daily data for this month
      const { data: campaignData, error: campErr } = await supabase
        .from("ad_campaigns")
        .select("date, spend, clicks, impressions")
        .eq("platform", "meta")
        .eq("client_id", clientId)
        .ilike("campaign_name", `%${FLIGHTS_PATTERN}%`)
        .gte("date", fromStr)
        .lte("date", todayStr);

      if (campErr) throw campErr;

      // Fetch Ringba calls for this month
      const { data: callData, error: callErr } = await supabase
        .from("ringba_calls" as any)
        .select("call_date, revenue, connected, converted, duration_seconds")
        .eq("client_id", clientId)
        .gte("call_date", fromStr + "T00:00:00.000Z")
        .lte("call_date", toStr + "T23:59:59.999Z");

      if (callErr) throw callErr;

      // Aggregate by date
      const byDate = new Map<string, {
        spend: number; clicks: number; impressions: number;
        calls: number; connectedCalls: number; callRevenue: number;
      }>();

      for (const row of (campaignData || [])) {
        const d = row.date;
        const existing = byDate.get(d) || { spend: 0, clicks: 0, impressions: 0, calls: 0, connectedCalls: 0, callRevenue: 0 };
        existing.spend += Number(row.spend || 0);
        existing.clicks += Number(row.clicks || 0);
        existing.impressions += Number(row.impressions || 0);
        byDate.set(d, existing);
      }

      for (const call of ((callData || []) as any[])) {
        const d = format(new Date(call.call_date), "yyyy-MM-dd");
        const existing = byDate.get(d) || { spend: 0, clicks: 0, impressions: 0, calls: 0, connectedCalls: 0, callRevenue: 0 };
        existing.calls += 1;
        if (call.connected) existing.connectedCalls += 1;
        existing.callRevenue += Number(call.revenue || 0);
        byDate.set(d, existing);
      }

      // Build daily array sorted by date
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

      // Exclude today (partial) for trend calculation
      const completedDayData = dailyData.filter(d => d.date < todayStr);

      // MTD totals (all data including today)
      const mtdSpend = dailyData.reduce((s, d) => s + d.spend, 0);
      const mtdRevenue = dailyData.reduce((s, d) => s + d.callRevenue, 0);
      const mtdProfit = mtdRevenue - mtdSpend;
      const mtdVisitors = dailyData.reduce((s, d) => s + d.clicks, 0);
      const mtdCalls = dailyData.reduce((s, d) => s + d.calls, 0);
      const mtdConnected = dailyData.reduce((s, d) => s + d.connectedCalls, 0);

      // Trailing averages from completed days (or all if < 3 completed)
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

      // Project remaining days using trailing averages
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
        mtdSpend,
        mtdRevenue,
        mtdProfit,
        mtdVisitors,
        mtdCalls,
        mtdConnected,
        avgDailySpend,
        avgDailyVisitors,
        avgDailyCalls,
        avgDailyRevenue,
        trendCpc,
        trendLpCvr,
        trendRpv,
        trendConnectRate,
        trendRevenuePerCall,
        projectedSpend,
        projectedRevenue,
        projectedProfit,
        projectedVisitors,
        projectedCalls,
        projectedROAS,
        dailyData,
      };
    },
  });
}
