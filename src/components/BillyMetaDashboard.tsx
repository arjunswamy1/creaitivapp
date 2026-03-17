import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useClient } from "@/contexts/ClientContext";
import { useDateRange } from "@/contexts/DateRangeContext";
import { useRingbaByVertical } from "@/hooks/useRingbaByVertical";
import { useVertical } from "@/contexts/VerticalContext";
import { matchesVertical } from "@/config/billyVerticals";
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

      // Filter by active vertical patterns
      const curVertical = (curData || []).filter(r => matchesVertical(r.campaign_name, activeVertical, "meta"));
      const prevVertical = (prevData || []).filter(r => matchesVertical(r.campaign_name, activeVertical, "meta"));

      const vCur = calcDerived(aggregate(curVertical));
      const vPrev = calcDerived(aggregate(prevVertical));
      const allCur = calcDerived(aggregate(curData || []));

      const changes = (cur: ReturnType<typeof calcDerived>, prev: ReturnType<typeof calcDerived>) => ({
        spend: pctChange(cur.spend, prev.spend),
        revenue: pctChange(cur.revenue, prev.revenue),
        roas: pctChange(cur.roas, prev.roas),
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
  const { data: ringba, isLoading: ringbaLoading } = useRingbaByVertical();
  const { activeVertical } = useVertical();

  const vertical = data?.vertical;
  const total = data?.total;
  const activeRingba = ringba?.active;
  const allRingba = ringba?.all;

  const totalSpend = total?.spend ?? 0;
  const totalRevenue = allRingba?.totalRevenue ?? 0;
  const totalConversions = allRingba?.convertedCalls ?? 0;
  const blendedRoas = totalSpend > 0 ? Math.round((totalRevenue / totalSpend) * 100) / 100 : 0;

  const vSpend = vertical?.spend ?? 0;
  const vRevenue = activeRingba?.totalRevenue ?? 0;
  const vConversions = activeRingba?.convertedCalls ?? 0;
  const vRoas = vSpend > 0 ? Math.round((vRevenue / vSpend) * 100) / 100 : 0;
  const vCpa = vConversions > 0 ? Math.round((vSpend / vConversions) * 100) / 100 : 0;

  const loading = isLoading || ringbaLoading;

  return (
    <>
      {/* Total Account Spend/Revenue Summary */}
      <Card className="mb-6 border-primary/20">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-primary" />
            <CardTitle className="text-base">Meta Account Totals</CardTitle>
          </div>
          <p className="text-xs text-muted-foreground">All campaigns combined — revenue from Ringba</p>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KPICard title="Total Meta Spend" value={`$${totalSpend.toLocaleString()}`} />
              <KPICard title="Ringba Revenue" value={`$${totalRevenue.toLocaleString()}`} subtitle="All verticals" />
              <KPICard title="Blended ROAS" value={`${blendedRoas}x`} subtitle="Ringba rev ÷ all spend" />
              <KPICard title="Conversions" value={totalConversions.toLocaleString()} subtitle="Ringba converted" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Active Vertical */}
      <Card className="mb-6 border-primary/20">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">{activeVertical.emoji} {activeVertical.label} — Meta Campaigns</CardTitle>
          </div>
          <p className="text-xs text-muted-foreground">
            {activeVertical.description} — revenue from Ringba
          </p>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="grid grid-cols-3 md:grid-cols-7 gap-4">
              {Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
            </div>
          ) : (
            <div className="grid grid-cols-3 md:grid-cols-7 gap-4">
              <KPICard title="Spend" value={`$${vSpend.toLocaleString()}`} change={vertical?.changes.spend} invertColor />
              <KPICard title="Revenue" value={`$${vRevenue.toLocaleString()}`} subtitle="Ringba" />
              <KPICard title="ROAS" value={`${vRoas}x`} subtitle="Ringba rev ÷ spend" />
              <KPICard title="CPA" value={vConversions > 0 ? `$${vCpa}` : "–"} subtitle={`${vConversions} conv.`} invertColor />
              <KPICard title="CPC" value={`$${vertical?.cpc ?? 0}`} change={vertical?.changes.cpc} invertColor />
              <KPICard title="CTR" value={`${vertical?.ctr ?? 0}%`} change={vertical?.changes.ctr} />
              <KPICard title="CPM" value={`$${vertical?.cpm ?? 0}`} change={vertical?.changes.cpm} invertColor />
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

export default BillyMetaDashboard;
