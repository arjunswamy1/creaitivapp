import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDateRange } from "@/contexts/DateRangeContext";
import { useClient } from "@/contexts/ClientContext";
import { useVertical } from "@/contexts/VerticalContext";
import { matchesVertical, getAdPlatforms, getVerticalAccountIds, matchesVerticalAccount, type VerticalConfig } from "@/config/billyVerticals";
import { format, differenceInDays, subDays } from "date-fns";

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
  /** Which ad platforms contributed data */
  activePlatforms: string[];
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

/**
 * Fetch ad_campaigns rows for all platforms in the vertical's config,
 * then filter by campaign name patterns client-side.
 */
async function fetchVerticalCampaigns(
  vertical: VerticalConfig,
  clientId: string | undefined,
  fromDate: string,
  toDate: string
) {
  const adPlatforms = getAdPlatforms(vertical);
  if (adPlatforms.length === 0) return [];

  // Query all configured platforms
  const queries = adPlatforms.map((platform) => {
    let q = supabase
      .from("ad_campaigns")
      .select("platform, campaign_name, spend, revenue, impressions, clicks, conversions, add_to_cart, account_id")
      .eq("platform", platform)
      .gte("date", fromDate)
      .lte("date", toDate);
    if (clientId) q = q.eq("client_id", clientId);
    // Filter by account IDs if configured for this vertical+platform
    const accountIds = getVerticalAccountIds(vertical, platform);
    if (accountIds.length === 1) {
      q = q.eq("account_id", accountIds[0]);
    } else if (accountIds.length > 1) {
      q = q.in("account_id", accountIds);
    }
    return q;
  });

  const results = await Promise.all(queries);
  const allRows: any[] = [];
  for (let i = 0; i < results.length; i++) {
    const { data, error } = results[i];
    if (error) throw error;
    const platform = adPlatforms[i];
    // Filter by vertical patterns (and account if configured)
    const matched = (data || []).filter((r: any) =>
      matchesVertical(r.campaign_name, vertical, platform) &&
      matchesVerticalAccount(r.account_id, vertical, platform)
    );
    allRows.push(...matched);
  }
  return allRows;
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
  const { activeVertical } = useVertical();

  const today = new Date();
  const todayStr = format(today, "yyyy-MM-dd");
  const yesterdayStr = format(subDays(today, 1), "yyyy-MM-dd");
  const lastWeekStr = format(subDays(today, 7), "yyyy-MM-dd");
  const lastMonthStr = format(subDays(today, 30), "yyyy-MM-dd");

  return useQuery({
    queryKey: ["billy-kpis", fromStr, toStr, clientId, activeVertical.id],
    queryFn: async (): Promise<BillyKPIWithChange> => {
      const [current, previous, todayData, yesterdayData, lastWeekData, lastMonthData] = await Promise.all([
        fetchVerticalCampaigns(activeVertical, clientId, fromStr, toStr),
        fetchVerticalCampaigns(activeVertical, clientId, prevFrom, prevTo),
        fetchVerticalCampaigns(activeVertical, clientId, todayStr, todayStr),
        fetchVerticalCampaigns(activeVertical, clientId, yesterdayStr, yesterdayStr),
        fetchVerticalCampaigns(activeVertical, clientId, lastWeekStr, lastWeekStr),
        fetchVerticalCampaigns(activeVertical, clientId, lastMonthStr, lastMonthStr),
      ]);

      const cur = calcKPIs(current);
      const prev = calcKPIs(previous);
      const todayKPIs = calcKPIs(todayData);
      const yesterdayKPIs = calcKPIs(yesterdayData);
      const lastWeekKPIs = calcKPIs(lastWeekData);
      const lastMonthKPIs = calcKPIs(lastMonthData);

      // Determine which platforms had data
      const platformsWithData = new Set(current.map((r: any) => r.platform));

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
        activePlatforms: Array.from(platformsWithData),
      };
    },
  });
}

/** Billy-specific top campaigns — filtered by active vertical, all platforms */
export function useBillyTopCampaigns() {
  const { dateRange } = useDateRange();
  const fromStr = format(dateRange.from, "yyyy-MM-dd");
  const toStr = format(dateRange.to, "yyyy-MM-dd");
  const { activeClient } = useClient();
  const clientId = activeClient?.id;
  const { activeVertical } = useVertical();

  return useQuery({
    queryKey: ["billy-top-campaigns", fromStr, toStr, clientId, activeVertical.id],
    queryFn: async () => {
      const adPlatforms = getAdPlatforms(activeVertical);
      const allData: any[] = [];

      for (const platform of adPlatforms) {
        let query = supabase
          .from("ad_campaigns")
          .select("campaign_name, platform, spend, revenue, roas, status, impressions, clicks, conversions, impression_share, bidding_strategy_type, campaign_type")
          .eq("platform", platform)
          .gte("date", fromStr)
          .lte("date", toStr);
        if (clientId) query = query.eq("client_id", clientId);
        const { data, error } = await query;
        if (error) throw error;
        const matched = (data || []).filter((r: any) =>
          matchesVertical(r.campaign_name, activeVertical, platform)
        );
        allData.push(...matched);
      }

      const byCampaign = new Map<string, { spend: number; revenue: number; impressions: number; clicks: number; conversions: number; platform: string }>();
      for (const row of allData) {
        const key = `${row.platform}:${row.campaign_name}`;
        const existing = byCampaign.get(key) || { spend: 0, revenue: 0, impressions: 0, clicks: 0, conversions: 0, platform: row.platform };
        existing.spend += Number(row.spend);
        existing.revenue += Number(row.revenue);
        existing.impressions += Number(row.impressions);
        existing.clicks += Number(row.clicks);
        existing.conversions += Number(row.conversions);
        byCampaign.set(key, existing);
      }

      return Array.from(byCampaign.entries())
        .map(([key, vals]) => ({
          name: key.split(":").slice(1).join(":"),
          platform: vals.platform,
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
