import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useClient } from "@/contexts/ClientContext";
import { useDateRange } from "@/contexts/DateRangeContext";
import { useVertical } from "@/contexts/VerticalContext";
import { matchesVertical } from "@/config/billyVerticals";
import { useRingbaByPlatform } from "@/hooks/useRingbaByPlatform";
import { format, differenceInDays, subDays } from "date-fns";
import KPICard from "@/components/KPICard";
import CampaignTable from "@/components/CampaignTable";
import CreativeReporting from "@/components/CreativeReporting";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign } from "lucide-react";

interface VerticalKPIs {
  spend: number;
  revenue: number;
  impressions: number;
  clicks: number;
  conversions: number;
  addToCart: number;
}

function calcDerived(v: VerticalKPIs) {
  const cpc = v.clicks > 0 ? Math.round((v.spend / v.clicks) * 100) / 100 : 0;
  const ctr = v.impressions > 0 ? Math.round((v.clicks / v.impressions) * 10000) / 100 : 0;
  const cpm = v.impressions > 0 ? Math.round((v.spend / v.impressions) * 1000 * 100) / 100 : 0;
  const roas = v.spend > 0 ? Math.round((v.revenue / v.spend) * 100) / 100 : 0;
  return { ...v, cpc, ctr, cpm, roas };
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function aggregate(rows: any[]): VerticalKPIs {
  return {
    spend: rows.reduce((s, r) => s + Number(r.spend || 0), 0),
    revenue: rows.reduce((s, r) => s + Number(r.revenue || 0), 0),
    impressions: rows.reduce((s, r) => s + Number(r.impressions || 0), 0),
    clicks: rows.reduce((s, r) => s + Number(r.clicks || 0), 0),
    conversions: rows.reduce((s, r) => s + Number(r.conversions || 0), 0),
    addToCart: rows.reduce((s, r) => s + Number(r.add_to_cart || 0), 0),
  };
}

function useBillyVerticalMetaKPIs() {
  const { dateRange } = useDateRange();
  const fromStr = format(dateRange.from, "yyyy-MM-dd");
  const toStr = format(dateRange.to, "yyyy-MM-dd");
  const days = differenceInDays(dateRange.to, dateRange.from) + 1;
  const prevFrom = format(subDays(dateRange.from, days), "yyyy-MM-dd");
  const prevTo = format(subDays(dateRange.from, 1), "yyyy-MM-dd");
  const { activeClient } = useClient();
  const { activeVertical } = useVertical();
  const clientId = activeClient?.id;

  return useQuery({
    queryKey: ["billy-meta-vertical-kpis", fromStr, toStr, clientId, activeVertical.id],
    queryFn: async () => {
      const baseSelect = "campaign_name, spend, revenue, impressions, clicks, conversions, add_to_cart";

      let curQ = supabase.from("ad_campaigns").select(baseSelect)
        .eq("platform", "meta").gte("date", fromStr).lte("date", toStr);
      let prevQ = supabase.from("ad_campaigns").select(baseSelect)
        .eq("platform", "meta").gte("date", prevFrom).lte("date", prevTo);

      if (clientId) {
        curQ = curQ.eq("client_id", clientId);
        prevQ = prevQ.eq("client_id", clientId);
      }

      const [{ data: curData, error }, { data: prevData }] = await Promise.all([curQ, prevQ]);
      if (error) throw error;

      const curVertical = (curData || []).filter(r => matchesVertical(r.campaign_name, activeVertical, "meta"));
      const prevVertical = (prevData || []).filter(r => matchesVertical(r.campaign_name, activeVertical, "meta"));

      const vCur = calcDerived(aggregate(curVertical));
      const vPrev = calcDerived(aggregate(prevVertical));
      const allCur = calcDerived(aggregate(curData || []));

      const changes = (cur: ReturnType<typeof calcDerived>, prev: ReturnType<typeof calcDerived>) => ({
        spend: pctChange(cur.spend, prev.spend),
        conversions: pctChange(cur.conversions, prev.conversions),
        cpc: pctChange(cur.cpc, prev.cpc),
        ctr: pctChange(cur.ctr, prev.ctr),
        cpm: pctChange(cur.cpm, prev.cpm),
      });

      return {
        vertical: { ...vCur, changes: changes(vCur, vPrev) },
        total: allCur,
      };
    },
  });
}

const BillyMetaDashboard = () => {
  const { data, isLoading } = useBillyVerticalMetaKPIs();
  const { activeVertical } = useVertical();
  const { data: ringba } = useRingbaByPlatform("meta");

  const vertical = data?.vertical;
  const total = data?.total;

  const totalSpend = total?.spend ?? 0;
  const totalConversions = total?.conversions ?? 0;
  const totalCpa = totalConversions > 0 ? Math.round((totalSpend / totalConversions) * 100) / 100 : 0;

  const vSpend = vertical?.spend ?? 0;
  const ringbaConversions = ringba?.conversions ?? 0;
  const ringbaRevenue = ringba?.revenue ?? 0;
  const hasAttribution = ringba?.hasAttribution ?? false;
  const ringbaSubtitle = hasAttribution ? "UTM: fb" : "All vertical calls";
  const vConversions = vertical?.conversions ?? 0;
  const vCpa = ringbaConversions > 0 ? Math.round((vSpend / ringbaConversions) * 100) / 100 : 0;

  return (
    <>

      {/* Active Vertical */}
      <Card className="mb-6 border-primary/20">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">{activeVertical.emoji} {activeVertical.label} — Meta Campaigns</CardTitle>
          </div>
          <p className="text-xs text-muted-foreground">
            {activeVertical.description} — platform-reported metrics
          </p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="grid grid-cols-3 md:grid-cols-7 gap-4">
              {Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
            </div>
          ) : (
            <div className="grid grid-cols-3 md:grid-cols-8 gap-4">
              <KPICard title="Spend" value={`$${vSpend.toLocaleString()}`} change={vertical?.changes.spend} invertColor />
              <KPICard title="Ringba Conv." value={ringbaConversions.toLocaleString()} subtitle={ringbaSubtitle} />
              <KPICard title="Ringba Revenue" value={`$${ringbaRevenue.toLocaleString()}`} subtitle={ringbaSubtitle} />
              <KPICard title="CPA (Ringba)" value={ringbaConversions > 0 ? `$${vCpa}` : "–"} subtitle="Spend ÷ Ringba conv." invertColor />
              <KPICard title="Platform Conv." value={vConversions.toLocaleString()} change={vertical?.changes.conversions} subtitle="Meta reported" />
              <KPICard title="CPC" value={`$${vertical?.cpc ?? 0}`} change={vertical?.changes.cpc} invertColor />
              <KPICard title="CTR" value={`${vertical?.ctr ?? 0}%`} change={vertical?.changes.ctr} />
              <KPICard title="Impressions" value={formatImpressions(vertical?.impressions ?? 0)} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Creative Performance */}
      <div className="mb-6">
        <CreativeReporting platformFilter="meta" />
      </div>

      {/* Campaign Table */}
      <div className="mb-6">
        <CampaignTable platform="meta" />
      </div>
    </>
  );
};

function formatImpressions(val: number): string {
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(1)}K`;
  return val.toLocaleString();
}

export default BillyMetaDashboard;
