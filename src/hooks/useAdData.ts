import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDateRange } from "@/contexts/DateRangeContext";
import { useClient } from "@/contexts/ClientContext";
import { format, differenceInDays, subDays } from "date-fns";
import { getClientRevenue } from "@/hooks/useClientRevenue";

export interface KPIData {
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

export interface KPIWithChange extends KPIData {
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
}

export interface DailyMetric {
  date: string;
  metaSpend: number;
  googleSpend: number;
  revenue: number;
}

export interface ChannelSummary {
  channel: string;
  spend: number;
  revenue: number;
  roas: number;
  conversions: number;
  ctr: number;
  color: "meta" | "google" | "shopify";
}

export interface CampaignRow {
  name: string;
  channel: string;
  platform: string;
  spend: number;
  revenue: number;
  roas: number;
  status: string;
  impressions: number;
  clicks: number;
  conversions: number;
  impressionShare: number | null;
  biddingStrategy: string | null;
  campaignType: string | null;
}

function calcKPIs(data: any[]): KPIData {
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
    totalSpend: Math.round(totalSpend),
    totalRevenue: Math.round(totalRevenue),
    blendedROAS: totalSpend > 0 ? Math.round((totalRevenue / totalSpend) * 100) / 100 : 0,
    totalConversions,
    cpc: totalClicks > 0 ? Math.round((totalSpend / totalClicks) * 100) / 100 : 0,
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

function useDateStrings() {
  const { dateRange } = useDateRange();
  const fromStr = format(dateRange.from, "yyyy-MM-dd");
  const toStr = format(dateRange.to, "yyyy-MM-dd");
  const days = differenceInDays(dateRange.to, dateRange.from) + 1;
  const prevFrom = format(subDays(dateRange.from, days), "yyyy-MM-dd");
  const prevTo = format(subDays(dateRange.from, 1), "yyyy-MM-dd");
  return { fromStr, toStr, prevFrom, prevTo, days };
}

export function useKPIs(platform?: string) {
  const { fromStr, toStr, prevFrom, prevTo } = useDateStrings();
  const { activeClient } = useClient();
  const clientId = activeClient?.id;

  return useQuery({
    queryKey: ["kpis", fromStr, toStr, clientId, platform],
    queryFn: async (): Promise<KPIWithChange> => {
      let currentQuery = supabase.from("ad_daily_metrics")
        .select("spend, revenue, impressions, clicks, conversions, add_to_cart")
        .gte("date", fromStr).lte("date", toStr);
      let previousQuery = supabase.from("ad_daily_metrics")
        .select("spend, revenue, impressions, clicks, conversions, add_to_cart")
        .gte("date", prevFrom).lte("date", prevTo);

      if (clientId) {
        currentQuery = currentQuery.eq("client_id", clientId);
        previousQuery = previousQuery.eq("client_id", clientId);
      }
      if (platform) {
        currentQuery = currentQuery.eq("platform", platform);
        previousQuery = previousQuery.eq("platform", platform);
      }

      const [{ data: current, error: e1 }, { data: previous }] = await Promise.all([
        currentQuery,
        previousQuery,
      ]);

      if (e1) throw e1;
      const cur = calcKPIs(current || []);
      const prev = calcKPIs(previous || []);

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
      };
    },
  });
}

export function useDailyMetrics() {
  const { fromStr, toStr } = useDateStrings();
  const { activeClient } = useClient();
  const clientId = activeClient?.id;

  return useQuery({
    queryKey: ["daily-metrics", fromStr, toStr, clientId],
    queryFn: async (): Promise<DailyMetric[]> => {
      let query = supabase
        .from("ad_daily_metrics")
        .select("date, platform, spend, revenue")
        .gte("date", fromStr).lte("date", toStr)
        .order("date", { ascending: true });

      if (clientId) query = query.eq("client_id", clientId);

      const { data, error } = await query;

      if (error) throw error;
      if (!data) return [];

      const byDate = new Map<string, { metaSpend: number; googleSpend: number; revenue: number }>();
      for (const row of data) {
        const key = row.date;
        const existing = byDate.get(key) || { metaSpend: 0, googleSpend: 0, revenue: 0 };
        if (row.platform === "meta") existing.metaSpend += Number(row.spend);
        else if (row.platform === "google") existing.googleSpend += Number(row.spend);
        existing.revenue += Number(row.revenue);
        byDate.set(key, existing);
      }

      return Array.from(byDate.entries()).map(([date, vals]) => ({
        date: new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        metaSpend: Math.round(vals.metaSpend),
        googleSpend: Math.round(vals.googleSpend),
        revenue: Math.round(vals.revenue),
      }));
    },
  });
}

export function useChannelBreakdown() {
  const { fromStr, toStr } = useDateStrings();
  const { activeClient, dashboardConfig } = useClient();
  const clientId = activeClient?.id;
  const platforms = dashboardConfig?.enabled_platforms || ["meta", "google"];

  return useQuery({
    queryKey: ["channel-breakdown", fromStr, toStr, clientId, platforms],
    queryFn: async (): Promise<ChannelSummary[]> => {
      let query = supabase
        .from("ad_daily_metrics")
        .select("platform, spend, revenue, clicks, impressions, conversions")
        .gte("date", fromStr).lte("date", toStr);

      if (clientId) query = query.eq("client_id", clientId);

      const { data, error } = await query;

      if (error) throw error;
      if (!data) return [];

      const byPlatform = new Map<string, { spend: number; revenue: number; clicks: number; impressions: number; conversions: number }>();
      for (const row of data) {
        // Skip platforms not enabled for this client
        if (!platforms.includes(row.platform) && row.platform !== "shopify") continue;
        const existing = byPlatform.get(row.platform) || { spend: 0, revenue: 0, clicks: 0, impressions: 0, conversions: 0 };
        existing.spend += Number(row.spend);
        existing.revenue += Number(row.revenue);
        existing.clicks += Number(row.clicks);
        existing.impressions += Number(row.impressions);
        existing.conversions += Number(row.conversions);
        byPlatform.set(row.platform, existing);
      }

      const colorMap: Record<string, "meta" | "google" | "shopify"> = { meta: "meta", google: "google" };
      const nameMap: Record<string, string> = { meta: "Meta Ads", google: "Google Ads" };

      return Array.from(byPlatform.entries()).map(([platform, vals]) => ({
        channel: nameMap[platform] || platform,
        spend: Math.round(vals.spend),
        revenue: Math.round(vals.revenue),
        roas: vals.spend > 0 ? Math.round((vals.revenue / vals.spend) * 100) / 100 : 0,
        conversions: vals.conversions,
        ctr: vals.impressions > 0 ? Math.round((vals.clicks / vals.impressions) * 10000) / 100 : 0,
        color: colorMap[platform] || ("shopify" as const),
      }));
    },
  });
}

export function useTopCampaigns(platform?: string) {
  const { fromStr, toStr } = useDateStrings();
  const { activeClient } = useClient();
  const clientId = activeClient?.id;

  return useQuery({
    queryKey: ["top-campaigns", fromStr, toStr, clientId, platform],
    queryFn: async (): Promise<CampaignRow[]> => {
      let query = supabase
        .from("ad_campaigns")
        .select("campaign_name, platform, spend, revenue, roas, status, impressions, clicks, conversions, impression_share, bidding_strategy_type, campaign_type")
        .gte("date", fromStr).lte("date", toStr);

      if (clientId) query = query.eq("client_id", clientId);
      if (platform) query = query.eq("platform", platform);

      const { data, error } = await query;

      if (error) throw error;
      if (!data) return [];

      const byCampaign = new Map<string, { platform: string; spend: number; revenue: number; status: string; impressions: number; clicks: number; conversions: number; impressionShareSum: number; impressionShareCount: number; biddingStrategy: string | null; campaignType: string | null }>();
      for (const row of data) {
        const existing = byCampaign.get(row.campaign_name) || { platform: row.platform, spend: 0, revenue: 0, status: row.status || "unknown", impressions: 0, clicks: 0, conversions: 0, impressionShareSum: 0, impressionShareCount: 0, biddingStrategy: (row as any).bidding_strategy_type || null, campaignType: (row as any).campaign_type || null };
        existing.spend += Number(row.spend);
        existing.revenue += Number(row.revenue);
        existing.impressions += Number(row.impressions);
        existing.clicks += Number(row.clicks);
        existing.conversions += Number(row.conversions);
        if ((row as any).impression_share != null) {
          existing.impressionShareSum += Number((row as any).impression_share);
          existing.impressionShareCount++;
        }
        if (row.status === "active") existing.status = "active";
        byCampaign.set(row.campaign_name, existing);
      }

      const channelMap: Record<string, string> = { meta: "Meta", google: "Google" };

      return Array.from(byCampaign.entries())
        .map(([name, vals]) => ({
          name,
          channel: channelMap[vals.platform] || vals.platform,
          platform: vals.platform,
          spend: Math.round(vals.spend),
          revenue: Math.round(vals.revenue),
          roas: vals.spend > 0 ? Math.round((vals.revenue / vals.spend) * 100) / 100 : 0,
          status: vals.status,
          impressions: vals.impressions,
          clicks: vals.clicks,
          conversions: vals.conversions,
          impressionShare: vals.impressionShareCount > 0 ? vals.impressionShareSum / vals.impressionShareCount : null,
          biddingStrategy: vals.biddingStrategy,
          campaignType: vals.campaignType,
        }))
        .sort((a, b) => b.spend - a.spend)
        .slice(0, 15);
    },
  });
}

export function useCampaignAdSets(campaignName: string | null, platform: string | null) {
  const { fromStr, toStr } = useDateStrings();
  const { activeClient } = useClient();
  const clientId = activeClient?.id;

  return useQuery({
    queryKey: ["campaign-adsets", campaignName, fromStr, toStr, clientId],
    enabled: !!campaignName,
    queryFn: async () => {
      if (!campaignName) return [];

      let query = supabase
        .from("ad_sets")
        .select("adset_name, platform_adset_id, spend, revenue, impressions, clicks, conversions, roas, status, date")
        .eq("campaign_name", campaignName)
        .gte("date", fromStr).lte("date", toStr);

      if (clientId) query = query.eq("client_id", clientId);

      const { data, error } = await query;

      if (error) throw error;
      if (!data) return [];

      const byAdSet = new Map<string, { id: string; spend: number; revenue: number; impressions: number; clicks: number; conversions: number; status: string }>();
      for (const row of data) {
        const existing = byAdSet.get(row.adset_name) || { id: row.platform_adset_id, spend: 0, revenue: 0, impressions: 0, clicks: 0, conversions: 0, status: row.status || "unknown" };
        existing.spend += Number(row.spend);
        existing.revenue += Number(row.revenue);
        existing.impressions += Number(row.impressions);
        existing.clicks += Number(row.clicks);
        existing.conversions += Number(row.conversions);
        if (row.status === "active") existing.status = "active";
        byAdSet.set(row.adset_name, existing);
      }

      return Array.from(byAdSet.entries())
        .map(([name, vals]) => ({
          name,
          adsetId: vals.id,
          spend: Math.round(vals.spend),
          revenue: Math.round(vals.revenue),
          roas: vals.spend > 0 ? Math.round((vals.revenue / vals.spend) * 100) / 100 : 0,
          impressions: vals.impressions,
          clicks: vals.clicks,
          conversions: vals.conversions,
          status: vals.status,
        }))
        .sort((a, b) => b.spend - a.spend);
    },
  });
}

export function useAdSetAds(adsetId: string | null) {
  const { fromStr, toStr } = useDateStrings();
  const { activeClient } = useClient();
  const clientId = activeClient?.id;

  return useQuery({
    queryKey: ["adset-ads", adsetId, fromStr, toStr, clientId],
    enabled: !!adsetId,
    queryFn: async () => {
      if (!adsetId) return [];

      let query = supabase
        .from("ads")
        .select("ad_name, spend, revenue, impressions, clicks, conversions, roas, status, date")
        .eq("platform_adset_id", adsetId)
        .gte("date", fromStr).lte("date", toStr);

      if (clientId) query = query.eq("client_id", clientId);

      const { data, error } = await query;

      if (error) throw error;
      if (!data) return [];

      const byAd = new Map<string, { spend: number; revenue: number; impressions: number; clicks: number; conversions: number; status: string }>();
      for (const row of data) {
        const existing = byAd.get(row.ad_name) || { spend: 0, revenue: 0, impressions: 0, clicks: 0, conversions: 0, status: row.status || "unknown" };
        existing.spend += Number(row.spend);
        existing.revenue += Number(row.revenue);
        existing.impressions += Number(row.impressions);
        existing.clicks += Number(row.clicks);
        existing.conversions += Number(row.conversions);
        if (row.status === "active") existing.status = "active";
        byAd.set(row.ad_name, existing);
      }

      return Array.from(byAd.entries())
        .map(([name, vals]) => ({
          name,
          spend: Math.round(vals.spend),
          revenue: Math.round(vals.revenue),
          roas: vals.spend > 0 ? Math.round((vals.revenue / vals.spend) * 100) / 100 : 0,
          impressions: vals.impressions,
          clicks: vals.clicks,
          conversions: vals.conversions,
          status: vals.status,
        }))
        .sort((a, b) => b.spend - a.spend);
    },
  });
}

export function useAdGroupKeywords(adsetId: string | null) {
  const { fromStr, toStr } = useDateStrings();
  const { activeClient } = useClient();
  const clientId = activeClient?.id;

  return useQuery({
    queryKey: ["adgroup-keywords", adsetId, fromStr, toStr, clientId],
    enabled: !!adsetId,
    queryFn: async () => {
      if (!adsetId) return [];

      let query = supabase
        .from("keywords" as any)
        .select("keyword_text, match_type, spend, revenue, impressions, clicks, conversions, roas, status, quality_score, date")
        .eq("platform_adset_id", adsetId)
        .gte("date", fromStr).lte("date", toStr);

      if (clientId) query = query.eq("client_id", clientId);

      const { data, error } = await query;

      if (error) throw error;
      if (!data) return [];

      const byKw = new Map<string, { matchType: string; spend: number; revenue: number; impressions: number; clicks: number; conversions: number; status: string; qualityScore: number | null }>();
      for (const row of data as any[]) {
        const key = `${row.keyword_text}__${row.match_type}`;
        const existing = byKw.get(key) || { matchType: row.match_type || "unknown", spend: 0, revenue: 0, impressions: 0, clicks: 0, conversions: 0, status: row.status || "unknown", qualityScore: row.quality_score };
        existing.spend += Number(row.spend);
        existing.revenue += Number(row.revenue);
        existing.impressions += Number(row.impressions);
        existing.clicks += Number(row.clicks);
        existing.conversions += Number(row.conversions);
        if (row.status === "enabled") existing.status = "enabled";
        if (row.quality_score != null) existing.qualityScore = row.quality_score;
        byKw.set(key, existing);
      }

      return Array.from(byKw.entries())
        .map(([key, vals]) => ({
          keyword: key.split("__")[0],
          matchType: vals.matchType,
          spend: Math.round(vals.spend),
          revenue: Math.round(vals.revenue),
          roas: vals.spend > 0 ? Math.round((vals.revenue / vals.spend) * 100) / 100 : 0,
          impressions: vals.impressions,
          clicks: vals.clicks,
          conversions: vals.conversions,
          ctr: vals.impressions > 0 ? Math.round((vals.clicks / vals.impressions) * 10000) / 100 : 0,
          cpa: vals.conversions > 0 ? Math.round(vals.spend / vals.conversions) : null,
          qualityScore: vals.qualityScore,
          status: vals.status,
        }))
        .sort((a, b) => b.spend - a.spend);
    },
  });
}

export function useKeywordSearchTerms(adsetId: string | null, keywordText: string | null) {
  const { fromStr, toStr } = useDateStrings();
  const { activeClient } = useClient();
  const clientId = activeClient?.id;

  return useQuery({
    queryKey: ["keyword-search-terms", adsetId, keywordText, fromStr, toStr, clientId],
    enabled: !!adsetId && !!keywordText,
    queryFn: async () => {
      if (!adsetId || !keywordText) return [];

      let query = supabase
        .from("search_terms" as any)
        .select("search_term, spend, revenue, impressions, clicks, conversions, roas, date")
        .eq("platform_adset_id", adsetId)
        .eq("keyword_text", keywordText)
        .gte("date", fromStr).lte("date", toStr);

      if (clientId) query = query.eq("client_id", clientId);

      const { data, error } = await query;

      if (error) throw error;
      if (!data) return [];

      const byST = new Map<string, { spend: number; revenue: number; impressions: number; clicks: number; conversions: number }>();
      for (const row of data as any[]) {
        const existing = byST.get(row.search_term) || { spend: 0, revenue: 0, impressions: 0, clicks: 0, conversions: 0 };
        existing.spend += Number(row.spend);
        existing.revenue += Number(row.revenue);
        existing.impressions += Number(row.impressions);
        existing.clicks += Number(row.clicks);
        existing.conversions += Number(row.conversions);
        byST.set(row.search_term, existing);
      }

      return Array.from(byST.entries())
        .map(([term, vals]) => ({
          searchTerm: term,
          spend: Math.round(vals.spend),
          revenue: Math.round(vals.revenue),
          impressions: vals.impressions,
          clicks: vals.clicks,
          conversions: vals.conversions,
          ctr: vals.impressions > 0 ? Math.round((vals.clicks / vals.impressions) * 10000) / 100 : 0,
          cpa: vals.conversions > 0 ? Math.round(vals.spend / vals.conversions) : null,
        }))
        .sort((a, b) => b.spend - a.spend);
    },
  });
}

export function useGoogleKPIsWithSubblyRevenue() {
  const { fromStr, toStr, prevFrom, prevTo } = useDateStrings();
  const { dateRange } = useDateRange();
  const { activeClient, dashboardConfig } = useClient();
  const clientId = activeClient?.id;
  const revenueSource = dashboardConfig?.revenue_source || "subbly";

  return useQuery({
    queryKey: ["google-kpis-revenue", fromStr, toStr, clientId, revenueSource],
    queryFn: async (): Promise<KPIWithChange> => {
      // Fetch Google ad metrics
      let currentAdQuery = supabase.from("ad_daily_metrics")
        .select("spend, impressions, clicks, conversions, add_to_cart")
        .eq("platform", "google")
        .gte("date", fromStr).lte("date", toStr);
      let previousAdQuery = supabase.from("ad_daily_metrics")
        .select("spend, impressions, clicks, conversions, add_to_cart")
        .eq("platform", "google")
        .gte("date", prevFrom).lte("date", prevTo);

      if (clientId) {
        currentAdQuery = currentAdQuery.eq("client_id", clientId);
        previousAdQuery = previousAdQuery.eq("client_id", clientId);
      }

      // Fetch revenue from the correct source
      const prevDateRange = { from: subDays(dateRange.from, differenceInDays(dateRange.to, dateRange.from) + 1), to: subDays(dateRange.from, 1) };
      const [
        { data: currentAd },
        { data: previousAd },
        curRevenue,
        prevRevenue,
      ] = await Promise.all([
        currentAdQuery,
        previousAdQuery,
        clientId ? getClientRevenue(clientId, revenueSource, fromStr, toStr, dateRange) : Promise.resolve(0),
        clientId ? getClientRevenue(clientId, revenueSource, prevFrom, prevTo, prevDateRange) : Promise.resolve(0),
      ]);

      const sumField = (rows: any[] | null, field: string) =>
        (rows || []).reduce((s, r) => s + Number(r[field] || 0), 0);

      const curSpend = sumField(currentAd, "spend");
      const curClicks = sumField(currentAd, "clicks");
      const curImpressions = sumField(currentAd, "impressions");
      const curConversions = sumField(currentAd, "conversions");
      const curATC = sumField(currentAd, "add_to_cart");

      const prevSpend = sumField(previousAd, "spend");
      const prevClicks = sumField(previousAd, "clicks");
      const prevImpressions = sumField(previousAd, "impressions");
      const prevConversions = sumField(previousAd, "conversions");
      const prevATC = sumField(previousAd, "add_to_cart");

      const cur = {
        totalSpend: Math.round(curSpend),
        totalRevenue: Math.round(curRevenue),
        blendedROAS: curSpend > 0 ? Math.round((curRevenue / curSpend) * 100) / 100 : 0,
        totalConversions: curConversions,
        cpc: curClicks > 0 ? Math.round((curSpend / curClicks) * 100) / 100 : 0,
        ctr: curImpressions > 0 ? Math.round((curClicks / curImpressions) * 10000) / 100 : 0,
        cpm: curImpressions > 0 ? Math.round((curSpend / curImpressions) * 1000 * 100) / 100 : 0,
        impressions: curImpressions,
        addToCart: curATC,
        atcRate: curClicks > 0 ? Math.round((curATC / curClicks) * 10000) / 100 : 0,
      };

      const prev = {
        totalSpend: Math.round(prevSpend),
        totalRevenue: Math.round(prevRevenue),
        blendedROAS: prevSpend > 0 ? Math.round((prevRevenue / prevSpend) * 100) / 100 : 0,
        totalConversions: prevConversions,
        cpc: prevClicks > 0 ? Math.round((prevSpend / prevClicks) * 100) / 100 : 0,
        ctr: prevImpressions > 0 ? Math.round((prevClicks / prevImpressions) * 10000) / 100 : 0,
        cpm: prevImpressions > 0 ? Math.round((prevSpend / prevImpressions) * 1000 * 100) / 100 : 0,
        impressions: prevImpressions,
        addToCart: prevATC,
        atcRate: prevClicks > 0 ? Math.round((prevATC / prevClicks) * 10000) / 100 : 0,
      };

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
      };
    },
  });
}

export function useMetaKPIsWithSubblyRevenue() {
  const { fromStr, toStr, prevFrom, prevTo } = useDateStrings();
  const { dateRange } = useDateRange();
  const { activeClient, dashboardConfig } = useClient();
  const clientId = activeClient?.id;
  const revenueSource = dashboardConfig?.revenue_source || "subbly";

  return useQuery({
    queryKey: ["meta-kpis-revenue", fromStr, toStr, clientId, revenueSource],
    queryFn: async () => {
      const prevDateRange = { from: subDays(dateRange.from, differenceInDays(dateRange.to, dateRange.from) + 1), to: subDays(dateRange.from, 1) };

      const [curRevenue, prevRevenue] = await Promise.all([
        clientId ? getClientRevenue(clientId, revenueSource, fromStr, toStr, dateRange) : Promise.resolve(0),
        clientId ? getClientRevenue(clientId, revenueSource, prevFrom, prevTo, prevDateRange) : Promise.resolve(0),
      ]);

      const revenueLabel = revenueSource === "shopify" ? "Shopify" : "Subbly";

      return {
        subblyRevenue: Math.round(curRevenue),
        subblyRevenueChange: pctChange(Math.round(curRevenue), Math.round(prevRevenue)),
        revenueLabel,
      };
    },
  });
}

export function useForecast() {
  const { activeClient, dashboardConfig } = useClient();
  const clientId = activeClient?.id;
  const revenueSource = dashboardConfig?.revenue_source || "subbly";

  return useQuery({
    queryKey: ["forecast-monthly", clientId, revenueSource],
    enabled: !!clientId,
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const { data, error } = await supabase.functions.invoke("forecast", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { client_id: clientId, revenue_source: revenueSource },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    staleTime: 1000 * 60 * 10,
  });
}
