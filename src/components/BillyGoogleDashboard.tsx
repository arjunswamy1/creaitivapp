import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useClient } from "@/contexts/ClientContext";
import { useDateRange } from "@/contexts/DateRangeContext";
import { useVertical } from "@/contexts/VerticalContext";
import { matchesVertical, matchesVerticalAccount, getVerticalAccountIds } from "@/config/billyVerticals";
import { format, differenceInDays, subDays } from "date-fns";
import KPICard from "@/components/KPICard";
import CampaignTable from "@/components/CampaignTable";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";


interface VerticalKPIs {
  spend: number;
  revenue: number;
  impressions: number;
  clicks: number;
  conversions: number;
}

function calcDerived(v: VerticalKPIs) {
  const cpc = v.clicks > 0 ? Math.round((v.spend / v.clicks) * 100) / 100 : 0;
  const ctr = v.impressions > 0 ? Math.round((v.clicks / v.impressions) * 10000) / 100 : 0;
  const cpm = v.impressions > 0 ? Math.round((v.spend / v.impressions) * 1000 * 100) / 100 : 0;
  return { ...v, cpc, ctr, cpm };
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
  };
}

function useBillyVerticalGoogleKPIs() {
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
    queryKey: ["billy-google-vertical-kpis", fromStr, toStr, clientId, activeVertical.id],
    queryFn: async () => {
      const baseSelect = "campaign_name, account_id, spend, revenue, impressions, clicks, conversions";

      let curQ = supabase.from("ad_campaigns").select(baseSelect)
        .eq("platform", "google").gte("date", fromStr).lte("date", toStr);
      let prevQ = supabase.from("ad_campaigns").select(baseSelect)
        .eq("platform", "google").gte("date", prevFrom).lte("date", prevTo);

      if (clientId) {
        curQ = curQ.eq("client_id", clientId);
        prevQ = prevQ.eq("client_id", clientId);
      }

      const accountIds = getVerticalAccountIds(activeVertical, "google");
      if (accountIds.length === 1) {
        curQ = curQ.eq("account_id", accountIds[0]);
        prevQ = prevQ.eq("account_id", accountIds[0]);
      } else if (accountIds.length > 1) {
        curQ = curQ.in("account_id", accountIds);
        prevQ = prevQ.in("account_id", accountIds);
      }

      const [{ data: curData, error }, { data: prevData }] = await Promise.all([curQ, prevQ]);
      if (error) throw error;

      const curVertical = (curData || []).filter(r =>
        matchesVertical(r.campaign_name, activeVertical, "google") &&
        matchesVerticalAccount(r.account_id, activeVertical, "google")
      );
      const prevVertical = (prevData || []).filter(r =>
        matchesVertical(r.campaign_name, activeVertical, "google") &&
        matchesVerticalAccount(r.account_id, activeVertical, "google")
      );

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

function formatImpressions(val: number): string {
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(1)}K`;
  return val.toLocaleString();
}

const BillyGoogleDashboard = () => {
  const { data, isLoading } = useBillyVerticalGoogleKPIs();
  const { activeVertical } = useVertical();

  const vertical = data?.vertical;
  const total = data?.total;

  const totalSpend = total?.spend ?? 0;
  const totalConversions = total?.conversions ?? 0;
  const totalCpa = totalConversions > 0 ? Math.round((totalSpend / totalConversions) * 100) / 100 : 0;

  const vSpend = vertical?.spend ?? 0;
  const vConversions = vertical?.conversions ?? 0;
  const vCpa = vConversions > 0 ? Math.round((vSpend / vConversions) * 100) / 100 : 0;

  return (
    <>
      {/* Active Vertical */}
      <Card className="mb-6 border-primary/20">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">{activeVertical.emoji} {activeVertical.label} — Google Campaigns</CardTitle>
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
            <div className="grid grid-cols-3 md:grid-cols-7 gap-4">
              <KPICard title="Spend" value={`$${vSpend.toLocaleString()}`} change={vertical?.changes.spend} invertColor />
              <KPICard title="Conversions" value={vConversions.toLocaleString()} change={vertical?.changes.conversions} subtitle="Platform reported" />
              <KPICard title="CPA" value={vConversions > 0 ? `$${vCpa}` : "–"} subtitle="Spend ÷ conv." invertColor />
              <KPICard title="CPC" value={`$${vertical?.cpc ?? 0}`} change={vertical?.changes.cpc} invertColor />
              <KPICard title="CTR" value={`${vertical?.ctr ?? 0}%`} change={vertical?.changes.ctr} />
              <KPICard title="CPM" value={`$${vertical?.cpm ?? 0}`} change={vertical?.changes.cpm} invertColor />
              <KPICard title="Impressions" value={formatImpressions(vertical?.impressions ?? 0)} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Campaign Table — filtered to active vertical */}
      <div className="mb-6">
        <CampaignTable platform="google" verticalFilter={activeVertical} />
      </div>
    </>
  );
};

export default BillyGoogleDashboard;
