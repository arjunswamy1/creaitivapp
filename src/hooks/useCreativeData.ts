import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDateRange } from "@/contexts/DateRangeContext";
import { useClient } from "@/contexts/ClientContext";
import { format } from "date-fns";

function useDateStrings() {
  const { dateRange } = useDateRange();
  return {
    fromStr: format(dateRange.from, "yyyy-MM-dd"),
    toStr: format(dateRange.to, "yyyy-MM-dd"),
  };
}

export interface CreativeRow {
  adId: string;
  name: string;
  platform: string;
  campaignName: string;
  format: string;
  spend: number;
  revenue: number;
  roas: number;
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number;
  cpa: number;
  frequency: number | null;
  videoViews3s: number | null;
  videoViews25: number | null;
  videoViews50: number | null;
  videoViews95: number | null;
  thumbStopRate: number | null;
}

export interface FormatSummary {
  format: string;
  count: number;
  spend: number;
  revenue: number;
  roas: number;
  conversions: number;
  ctr: number;
  cpa: number;
}

export interface FatigueAlert {
  adName: string;
  adId: string;
  reason: string;
  severity: "warning" | "critical";
  metric: string;
  value: string;
}

export function useCreativePerformance() {
  const { fromStr, toStr } = useDateStrings();
  const { activeClient } = useClient();
  const clientId = activeClient?.id;

  return useQuery({
    queryKey: ["creative-performance", fromStr, toStr, clientId],
    queryFn: async (): Promise<CreativeRow[]> => {
      let query = supabase
        .from("ads")
        .select("platform_ad_id, ad_name, platform, campaign_name, format, spend, revenue, impressions, clicks, conversions, frequency, video_views_3s, video_views_25, video_views_50, video_views_95, date")
        .gte("date", fromStr)
        .lte("date", toStr);

      if (clientId) query = query.eq("client_id", clientId);

      const { data, error } = await query;
      if (error) throw error;
      if (!data) return [];

      // Aggregate by ad_id across dates
      const byAd = new Map<string, {
        name: string; platform: string; campaignName: string; format: string;
        spend: number; revenue: number; impressions: number; clicks: number; conversions: number;
        frequencySum: number; frequencyCount: number;
        v3s: number; v25: number; v50: number; v95: number;
      }>();

      for (const row of data) {
        const key = row.platform_ad_id;
        const existing = byAd.get(key) || {
          name: row.ad_name, platform: row.platform, campaignName: row.campaign_name || "",
          format: (row as any).format || "unknown",
          spend: 0, revenue: 0, impressions: 0, clicks: 0, conversions: 0,
          frequencySum: 0, frequencyCount: 0, v3s: 0, v25: 0, v50: 0, v95: 0,
        };
        existing.spend += Number(row.spend);
        existing.revenue += Number(row.revenue);
        existing.impressions += Number(row.impressions);
        existing.clicks += Number(row.clicks);
        existing.conversions += Number(row.conversions);
        if ((row as any).frequency != null) {
          existing.frequencySum += Number((row as any).frequency);
          existing.frequencyCount++;
        }
        if ((row as any).video_views_3s != null) existing.v3s += Number((row as any).video_views_3s);
        if ((row as any).video_views_25 != null) existing.v25 += Number((row as any).video_views_25);
        if ((row as any).video_views_50 != null) existing.v50 += Number((row as any).video_views_50);
        if ((row as any).video_views_95 != null) existing.v95 += Number((row as any).video_views_95);
        byAd.set(key, existing);
      }

      return Array.from(byAd.entries())
        .map(([adId, v]) => ({
          adId,
          name: v.name,
          platform: v.platform,
          campaignName: v.campaignName,
          format: v.format,
          spend: Math.round(v.spend),
          revenue: Math.round(v.revenue),
          roas: v.spend > 0 ? Math.round((v.revenue / v.spend) * 100) / 100 : 0,
          impressions: v.impressions,
          clicks: v.clicks,
          conversions: v.conversions,
          ctr: v.impressions > 0 ? Math.round((v.clicks / v.impressions) * 10000) / 100 : 0,
          cpa: v.conversions > 0 ? Math.round(v.spend / v.conversions) : 0,
          frequency: v.frequencyCount > 0 ? Math.round((v.frequencySum / v.frequencyCount) * 100) / 100 : null,
          videoViews3s: v.v3s || null,
          videoViews25: v.v25 || null,
          videoViews50: v.v50 || null,
          videoViews95: v.v95 || null,
          thumbStopRate: v.v3s && v.impressions > 0 ? Math.round((v.v3s / v.impressions) * 10000) / 100 : null,
        }))
        .sort((a, b) => b.spend - a.spend);
    },
  });
}

export function useFormatComparison(creatives: CreativeRow[] | undefined): FormatSummary[] {
  if (!creatives) return [];

  const byFormat = new Map<string, { count: number; spend: number; revenue: number; impressions: number; clicks: number; conversions: number }>();
  for (const c of creatives) {
    const f = c.format || "unknown";
    const existing = byFormat.get(f) || { count: 0, spend: 0, revenue: 0, impressions: 0, clicks: 0, conversions: 0 };
    existing.count++;
    existing.spend += c.spend;
    existing.revenue += c.revenue;
    existing.impressions += c.impressions;
    existing.clicks += c.clicks;
    existing.conversions += c.conversions;
    byFormat.set(f, existing);
  }

  return Array.from(byFormat.entries())
    .map(([format, v]) => ({
      format,
      count: v.count,
      spend: v.spend,
      revenue: v.revenue,
      roas: v.spend > 0 ? Math.round((v.revenue / v.spend) * 100) / 100 : 0,
      conversions: v.conversions,
      ctr: v.impressions > 0 ? Math.round((v.clicks / v.impressions) * 10000) / 100 : 0,
      cpa: v.conversions > 0 ? Math.round(v.spend / v.conversions) : 0,
    }))
    .sort((a, b) => b.spend - a.spend);
}

export function useFatigueAlerts(creatives: CreativeRow[] | undefined): FatigueAlert[] {
  if (!creatives) return [];

  const alerts: FatigueAlert[] = [];

  for (const c of creatives) {
    if (c.spend < 50) continue; // Skip low-spend ads

    // Frequency > 2.5
    if (c.frequency && c.frequency > 2.5) {
      alerts.push({
        adName: c.name, adId: c.adId,
        reason: "High frequency — audience fatigue likely",
        severity: c.frequency > 4 ? "critical" : "warning",
        metric: "Frequency", value: `${c.frequency}`,
      });
    }

    // CTR below 0.5% for ads with significant impressions
    if (c.impressions > 5000 && c.ctr < 0.5) {
      alerts.push({
        adName: c.name, adId: c.adId,
        reason: "Very low CTR — creative not engaging",
        severity: "warning",
        metric: "CTR", value: `${c.ctr}%`,
      });
    }

    // CPA more than 2x the average
    const avgCpa = creatives.filter(x => x.conversions > 0).reduce((s, x) => s + x.cpa, 0) /
      (creatives.filter(x => x.conversions > 0).length || 1);
    if (c.conversions > 0 && c.cpa > avgCpa * 2) {
      alerts.push({
        adName: c.name, adId: c.adId,
        reason: `CPA is ${Math.round((c.cpa / avgCpa) * 100)}% of average — underperforming`,
        severity: c.cpa > avgCpa * 3 ? "critical" : "warning",
        metric: "CPA", value: `$${c.cpa}`,
      });
    }

    // High spend, zero conversions
    if (c.spend > 200 && c.conversions === 0) {
      alerts.push({
        adName: c.name, adId: c.adId,
        reason: "Spending with zero conversions",
        severity: "critical",
        metric: "Conversions", value: "0",
      });
    }
  }

  return alerts.sort((a, b) => (a.severity === "critical" ? -1 : 1) - (b.severity === "critical" ? -1 : 1));
}
