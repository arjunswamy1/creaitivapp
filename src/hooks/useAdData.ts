import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface KPIData {
  totalSpend: number;
  totalRevenue: number;
  blendedROAS: number;
  totalConversions: number;
  cpc: number;
  ctr: number;
  cpm: number;
  impressions: number;
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
  spend: number;
  revenue: number;
  roas: number;
  status: string;
}

export function useKPIs() {
  return useQuery({
    queryKey: ["kpis"],
    queryFn: async (): Promise<KPIData> => {
      const { data, error } = await supabase
        .from("ad_daily_metrics")
        .select("spend, revenue, impressions, clicks, conversions, cpc, ctr, cpm");

      if (error) throw error;
      if (!data || data.length === 0) {
        return { totalSpend: 0, totalRevenue: 0, blendedROAS: 0, totalConversions: 0, cpc: 0, ctr: 0, cpm: 0, impressions: 0 };
      }

      const totalSpend = data.reduce((s, r) => s + Number(r.spend), 0);
      const totalRevenue = data.reduce((s, r) => s + Number(r.revenue), 0);
      const totalClicks = data.reduce((s, r) => s + Number(r.clicks), 0);
      const totalImpressions = data.reduce((s, r) => s + Number(r.impressions), 0);
      const totalConversions = data.reduce((s, r) => s + Number(r.conversions), 0);

      return {
        totalSpend: Math.round(totalSpend),
        totalRevenue: Math.round(totalRevenue),
        blendedROAS: totalSpend > 0 ? Math.round((totalRevenue / totalSpend) * 100) / 100 : 0,
        totalConversions,
        cpc: totalClicks > 0 ? Math.round((totalSpend / totalClicks) * 100) / 100 : 0,
        ctr: totalImpressions > 0 ? Math.round((totalClicks / totalImpressions) * 10000) / 100 : 0,
        cpm: totalImpressions > 0 ? Math.round((totalSpend / totalImpressions) * 1000 * 100) / 100 : 0,
        impressions: totalImpressions,
      };
    },
  });
}

export function useDailyMetrics() {
  return useQuery({
    queryKey: ["daily-metrics"],
    queryFn: async (): Promise<DailyMetric[]> => {
      const { data, error } = await supabase
        .from("ad_daily_metrics")
        .select("date, platform, spend, revenue")
        .order("date", { ascending: true });

      if (error) throw error;
      if (!data) return [];

      // Group by date
      const byDate = new Map<string, { metaSpend: number; googleSpend: number; revenue: number }>();
      for (const row of data) {
        const key = row.date;
        const existing = byDate.get(key) || { metaSpend: 0, googleSpend: 0, revenue: 0 };
        if (row.platform === "meta") {
          existing.metaSpend += Number(row.spend);
        } else if (row.platform === "google") {
          existing.googleSpend += Number(row.spend);
        }
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
  return useQuery({
    queryKey: ["channel-breakdown"],
    queryFn: async (): Promise<ChannelSummary[]> => {
      const { data, error } = await supabase
        .from("ad_daily_metrics")
        .select("platform, spend, revenue, clicks, impressions, conversions");

      if (error) throw error;
      if (!data) return [];

      const byPlatform = new Map<string, { spend: number; revenue: number; clicks: number; impressions: number; conversions: number }>();
      for (const row of data) {
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
        color: colorMap[platform] || "shopify" as const,
      }));
    },
  });
}

export function useTopCampaigns() {
  return useQuery({
    queryKey: ["top-campaigns"],
    queryFn: async (): Promise<CampaignRow[]> => {
      const { data, error } = await supabase
        .from("ad_campaigns")
        .select("campaign_name, platform, spend, revenue, roas, status");

      if (error) throw error;
      if (!data) return [];

      // Aggregate by campaign name (across dates)
      const byCampaign = new Map<string, { platform: string; spend: number; revenue: number; status: string }>();
      for (const row of data) {
        const existing = byCampaign.get(row.campaign_name) || { platform: row.platform, spend: 0, revenue: 0, status: row.status || "unknown" };
        existing.spend += Number(row.spend);
        existing.revenue += Number(row.revenue);
        if (row.status === "active") existing.status = "active";
        byCampaign.set(row.campaign_name, existing);
      }

      const channelMap: Record<string, string> = { meta: "Meta", google: "Google" };

      return Array.from(byCampaign.entries())
        .map(([name, vals]) => ({
          name,
          channel: channelMap[vals.platform] || vals.platform,
          spend: Math.round(vals.spend),
          revenue: Math.round(vals.revenue),
          roas: vals.spend > 0 ? Math.round((vals.revenue / vals.spend) * 100) / 100 : 0,
          status: vals.status,
        }))
        .sort((a, b) => b.spend - a.spend)
        .slice(0, 10);
    },
  });
}
