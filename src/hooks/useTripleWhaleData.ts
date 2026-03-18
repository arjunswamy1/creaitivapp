import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDateRange } from "@/contexts/DateRangeContext";
import { useClient } from "@/contexts/ClientContext";
import { format, differenceInDays, subDays } from "date-fns";

function useDateStrings() {
  const { dateRange } = useDateRange();
  const fromStr = format(dateRange.from, "yyyy-MM-dd");
  const toStr = format(dateRange.to, "yyyy-MM-dd");
  const days = differenceInDays(dateRange.to, dateRange.from) + 1;
  const prevFrom = format(subDays(dateRange.from, days), "yyyy-MM-dd");
  const prevTo = format(subDays(dateRange.from, 1), "yyyy-MM-dd");
  return { fromStr, toStr, prevFrom, prevTo, days };
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

/** Check if the active client has TripleWhale enabled */
export function useTripleWhaleEnabled() {
  const { dashboardConfig } = useClient();
  return (dashboardConfig as any)?.triplewhale_enabled === true;
}

/** Fetch TW summary metrics for the active client (replaces Meta-reported metrics) */
export function useTripleWhaleSummary() {
  const { fromStr, toStr, prevFrom, prevTo } = useDateStrings();
  const { activeClient } = useClient();
  const clientId = activeClient?.id;
  const twEnabled = useTripleWhaleEnabled();

  return useQuery({
    queryKey: ["tw-summary", fromStr, toStr, clientId],
    enabled: !!clientId && twEnabled,
    queryFn: async () => {
      if (!clientId) return null;

      const [{ data: current, error: e1 }, { data: previous }] = await Promise.all([
        supabase
          .from("triplewhale_summary" as any)
          .select("*")
          .eq("client_id", clientId)
          .gte("date", fromStr)
          .lte("date", toStr),
        supabase
          .from("triplewhale_summary" as any)
          .select("*")
          .eq("client_id", clientId)
          .gte("date", prevFrom)
          .lte("date", prevTo),
      ]);

      if (e1) throw e1;

      const sum = (rows: any[], field: string) =>
        (rows || []).reduce((s: number, r: any) => s + Number(r[field] || 0), 0);

      const curMetaSpend = sum(current, "meta_spend");
      const curMetaRevenue = sum(current, "meta_tw_revenue");
      const curMetaPurchases = sum(current, "meta_tw_purchases");
      const prevMetaSpend = sum(previous, "meta_spend");
      const prevMetaRevenue = sum(previous, "meta_tw_revenue");
      const prevMetaPurchases = sum(previous, "meta_tw_purchases");

      const curMetaRoas = curMetaSpend > 0 ? Math.round((curMetaRevenue / curMetaSpend) * 100) / 100 : 0;
      const prevMetaRoas = prevMetaSpend > 0 ? Math.round((prevMetaRevenue / prevMetaSpend) * 100) / 100 : 0;
      const curMetaCpa = curMetaPurchases > 0 ? Math.round((curMetaSpend / curMetaPurchases) * 100) / 100 : 0;

      return {
        metaSpend: Math.round(curMetaSpend),
        metaTwRevenue: Math.round(curMetaRevenue),
        metaTwRoas: curMetaRoas,
        metaTwPurchases: curMetaPurchases,
        metaTwCpa: curMetaCpa,
        metaClicks: sum(current, "meta_clicks"),
        metaImpressions: sum(current, "meta_impressions"),
        totalRevenue: Math.round(sum(current, "total_revenue")),
        totalOrders: sum(current, "total_orders"),
        totalSpend: Math.round(sum(current, "total_spend")),
        blendedRoas: sum(current, "total_spend") > 0
          ? Math.round((sum(current, "total_revenue") / sum(current, "total_spend")) * 100) / 100 : 0,
        changes: {
          metaSpend: pctChange(curMetaSpend, prevMetaSpend),
          metaTwRevenue: pctChange(curMetaRevenue, prevMetaRevenue),
          metaTwRoas: pctChange(curMetaRoas, prevMetaRoas),
          metaTwPurchases: pctChange(curMetaPurchases, prevMetaPurchases),
        },
      };
    },
  });
}

/** Fetch TW ad-level attribution for Meta ads */
export function useTripleWhaleAdAttribution(platform = "meta") {
  const { fromStr, toStr } = useDateStrings();
  const { activeClient } = useClient();
  const clientId = activeClient?.id;
  const twEnabled = useTripleWhaleEnabled();

  return useQuery({
    queryKey: ["tw-ad-attribution", fromStr, toStr, clientId, platform],
    enabled: !!clientId && twEnabled,
    queryFn: async () => {
      if (!clientId) return [];

      const { data, error } = await supabase
        .from("triplewhale_ad_attribution" as any)
        .select("*")
        .eq("client_id", clientId)
        .eq("platform", platform)
        .gte("date", fromStr)
        .lte("date", toStr);

      if (error) throw error;

      // Aggregate by ad_id across dates
      const byAd = new Map<string, any>();
      for (const row of (data || []) as any[]) {
        const key = row.ad_id;
        const existing = byAd.get(key) || {
          adId: row.ad_id,
          adName: row.ad_name,
          campaignId: row.campaign_id,
          campaignName: row.campaign_name,
          adsetId: row.adset_id,
          adsetName: row.adset_name,
          platform: row.platform,
          twRevenue: 0,
          twPurchases: 0,
          spend: 0,
        };
        existing.twRevenue += Number(row.tw_revenue || 0);
        existing.twPurchases += Number(row.tw_purchases || 0);
        existing.spend += Number(row.spend || 0);
        byAd.set(key, existing);
      }

      return Array.from(byAd.values()).map(ad => ({
        ...ad,
        twRevenue: Math.round(ad.twRevenue * 100) / 100,
        twRoas: ad.spend > 0 ? Math.round((ad.twRevenue / ad.spend) * 100) / 100 : 0,
        twCpa: ad.twPurchases > 0 ? Math.round((ad.spend / ad.twPurchases) * 100) / 100 : 0,
      }));
    },
  });
}

/** Trigger a manual TW sync */
export async function triggerTripleWhaleSync(clientId: string, startDate?: string, endDate?: string) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  const { data, error } = await supabase.functions.invoke("sync-triplewhale", {
    headers: { Authorization: `Bearer ${session.access_token}` },
    body: { client_id: clientId, start_date: startDate, end_date: endDate },
  });

  if (error) throw error;
  return data;
}
