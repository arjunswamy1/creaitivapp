import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDateRange } from "@/contexts/DateRangeContext";
import { useClient } from "@/contexts/ClientContext";
import { format, differenceInDays, subDays } from "date-fns";

const FLIGHTS_PATTERN = "Flight";

interface BillyKPIData {
  totalSpend: number;
  totalRevenue: number;
  blendedROAS: number;
  totalConversions: number;
  cpc: number;
  ctr: number;
  cpm: number;
  impressions: number;
  addToCart: number;
  atcRate: number;
}

export interface TrendIndicators {
  dod: number | null;
  wow: number | null;
  mom: number | null;
}

export interface BillyKPIWithChange extends BillyKPIData {
  changes: {
    spend: number | null;
    revenue: number | null;
    roas: number | null;
    conversions: number | null;
    cpc: number | null;
    ctr: number | null;
    cpm: number | null;
    impressions: number | null;
    addToCart: number | null;
    atcRate: number | null;
  };
  trends: {
    spend: TrendIndicators;
    revenue: TrendIndicators;
    roas: TrendIndicators;
    conversions: TrendIndicators;
    cpc: TrendIndicators;
    ctr: TrendIndicators;
    cpm: TrendIndicators;
    impressions: TrendIndicators;
    addToCart: TrendIndicators;
    atcRate: TrendIndicators;
  };
}

function calcKPIs(data: any[]): BillyKPIData {
  if (!data || data.length === 0) {
    return { totalSpend: 0, totalRevenue: 0, blendedROAS: 0, totalConversions: 0, cpc: 0, ctr: 0, cpm: 0, impressions: 0, addToCart: 0, atcRate: 0 };
  }
  const totalSpend = data.reduce((s, r) => s + Number(r.spend), 0);
  const totalRevenue = data.reduce((s, r) => s + Number(r.revenue), 0);
  const totalClicks = data.reduce((s, r) => s + Number(r.clicks), 0);
  const totalImpressions = data.reduce((s, r) => s + Number(r.impressions), 0);
  const totalConversions = data.reduce((s, r) => s + Number(r.conversions), 0);
  const addToCart = data.reduce((s, r) => s + Number(r.add_to_cart || 0), 0);

  return {
    totalSpend: Math.round(totalSpend * 100) / 100,
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    blendedROAS: totalSpend > 0 ? Math.round((totalRevenue / totalSpend) * 100) / 100 : 0,
    totalConversions,
    cpc: totalClicks > 0 ? Math.round((totalSpend / totalClicks) * 1000) / 1000 : 0,
    ctr: totalImpressions > 0 ? Math.round((totalClicks / totalImpressions) * 10000) / 100 : 0,
    cpm: totalImpressions > 0 ? Math.round((totalSpend / totalImpressions) * 1000 * 100) / 100 : 0,
    impressions: totalImpressions,
    addToCart,
    atcRate: totalClicks > 0 ? Math.round((addToCart / totalClicks) * 10000) / 100 : 0,
  };
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function buildTrends(cur: BillyKPIData, dod: BillyKPIData, wow: BillyKPIData, mom: BillyKPIData): BillyKPIWithChange["trends"] {
  const keys: (keyof BillyKPIData)[] = [
    "totalSpend", "totalRevenue", "blendedROAS", "totalConversions",
    "cpc", "ctr", "cpm", "impressions", "addToCart", "atcRate",
  ];
  const trendKeys: (keyof BillyKPIWithChange["trends"])[] = [
    "spend", "revenue", "roas", "conversions",
    "cpc", "ctr", "cpm", "impressions", "addToCart", "atcRate",
  ];

  const result: any = {};
  for (let i = 0; i < keys.length; i++) {
    result[trendKeys[i]] = {
      dod: pctChange(cur[keys[i]] as number, dod[keys[i]] as number),
      wow: pctChange(cur[keys[i]] as number, wow[keys[i]] as number),
      mom: pctChange(cur[keys[i]] as number, mom[keys[i]] as number),
    };
  }
  return result;
}

export function useBillyKPIs() {
  const { dateRange } = useDateRange();
  const fromStr = format(dateRange.from, "yyyy-MM-dd");
  const toStr = format(dateRange.to, "yyyy-MM-dd");
  const days = differenceInDays(dateRange.to, dateRange.from) + 1;
  const prevFrom = format(subDays(dateRange.from, days), "yyyy-MM-dd");
  const prevTo = format(subDays(dateRange.from, 1), "yyyy-MM-dd");
  const { activeClient } = useClient();
  const clientId = activeClient?.id;

  // For DoD/WoW/MoM we use fixed comparisons based on "today"
  const today = new Date();
  const todayStr = format(today, "yyyy-MM-dd");
  const yesterdayStr = format(subDays(today, 1), "yyyy-MM-dd");
  const lastWeekStr = format(subDays(today, 7), "yyyy-MM-dd");
  const lastMonthStr = format(subDays(today, 30), "yyyy-MM-dd");

  return useQuery({
    queryKey: ["billy-kpis", fromStr, toStr, clientId],
    queryFn: async (): Promise<BillyKPIWithChange> => {
      const baseFilters = (q: any) => {
        q = q.eq("platform", "meta").ilike("campaign_name", `%${FLIGHTS_PATTERN}%`);
        if (clientId) q = q.eq("client_id", clientId);
        return q;
      };

      // Main range + previous range + DoD/WoW/MoM single-day queries
      const [
        { data: current, error: e1 },
        { data: previous },
        { data: todayData },
        { data: yesterdayData },
        { data: lastWeekData },
        { data: lastMonthData },
      ] = await Promise.all([
        baseFilters(supabase.from("ad_campaigns").select("spend, revenue, impressions, clicks, conversions, add_to_cart").gte("date", fromStr).lte("date", toStr)),
        baseFilters(supabase.from("ad_campaigns").select("spend, revenue, impressions, clicks, conversions, add_to_cart").gte("date", prevFrom).lte("date", prevTo)),
        baseFilters(supabase.from("ad_campaigns").select("spend, revenue, impressions, clicks, conversions, add_to_cart").eq("date", todayStr)),
        baseFilters(supabase.from("ad_campaigns").select("spend, revenue, impressions, clicks, conversions, add_to_cart").eq("date", yesterdayStr)),
        baseFilters(supabase.from("ad_campaigns").select("spend, revenue, impressions, clicks, conversions, add_to_cart").eq("date", lastWeekStr)),
        baseFilters(supabase.from("ad_campaigns").select("spend, revenue, impressions, clicks, conversions, add_to_cart").eq("date", lastMonthStr)),
      ]);

      if (e1) throw e1;
      const cur = calcKPIs(current || []);
      const prev = calcKPIs(previous || []);

      const todayKPIs = calcKPIs(todayData || []);
      const yesterdayKPIs = calcKPIs(yesterdayData || []);
      const lastWeekKPIs = calcKPIs(lastWeekData || []);
      const lastMonthKPIs = calcKPIs(lastMonthData || []);

      return {
        ...cur,
        changes: {
          spend: pctChange(cur.totalSpend, prev.totalSpend),
          revenue: pctChange(cur.totalRevenue, prev.totalRevenue),
          roas: pctChange(cur.blendedROAS, prev.blendedROAS),
          conversions: pctChange(cur.totalConversions, prev.totalConversions),
          cpc: pctChange(cur.cpc, prev.cpc),
          ctr: pctChange(cur.ctr, prev.ctr),
          cpm: pctChange(cur.cpm, prev.cpm),
          impressions: pctChange(cur.impressions, prev.impressions),
          addToCart: pctChange(cur.addToCart, prev.addToCart),
          atcRate: pctChange(cur.atcRate, prev.atcRate),
        },
        trends: buildTrends(todayKPIs, yesterdayKPIs, lastWeekKPIs, lastMonthKPIs),
      };
    },
  });
}

/** Billy-specific top campaigns — only flights campaigns */
export function useBillyTopCampaigns() {
  const { dateRange } = useDateRange();
  const fromStr = format(dateRange.from, "yyyy-MM-dd");
  const toStr = format(dateRange.to, "yyyy-MM-dd");
  const { activeClient } = useClient();
  const clientId = activeClient?.id;

  return useQuery({
    queryKey: ["billy-top-campaigns", fromStr, toStr, clientId],
    queryFn: async () => {
      let query = supabase
        .from("ad_campaigns")
        .select("campaign_name, platform, spend, revenue, roas, status, impressions, clicks, conversions, impression_share, bidding_strategy_type, campaign_type")
        .eq("platform", "meta")
        .ilike("campaign_name", `%${FLIGHTS_PATTERN}%`)
        .gte("date", fromStr)
        .lte("date", toStr);

      if (clientId) query = query.eq("client_id", clientId);

      const { data, error } = await query;
      if (error) throw error;
      if (!data) return [];

      const byCampaign = new Map<string, { spend: number; revenue: number; impressions: number; clicks: number; conversions: number }>();
      for (const row of data) {
        const existing = byCampaign.get(row.campaign_name) || { spend: 0, revenue: 0, impressions: 0, clicks: 0, conversions: 0 };
        existing.spend += Number(row.spend);
        existing.revenue += Number(row.revenue);
        existing.impressions += Number(row.impressions);
        existing.clicks += Number(row.clicks);
        existing.conversions += Number(row.conversions);
        byCampaign.set(row.campaign_name, existing);
      }

      return Array.from(byCampaign.entries())
        .map(([name, vals]) => ({
          name,
          spend: vals.spend,
          clicks: vals.clicks,
          impressions: vals.impressions,
          conversions: vals.conversions,
          revenue: vals.revenue,
        }))
        .sort((a, b) => b.spend - a.spend);
    },
  });
}
