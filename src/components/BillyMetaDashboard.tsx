import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useClient } from "@/contexts/ClientContext";
import { useDateRange } from "@/contexts/DateRangeContext";
import { useRingbaByVertical } from "@/hooks/useRingbaByVertical";
import { format, differenceInDays, subDays } from "date-fns";
import KPICard from "@/components/KPICard";
import CampaignTable from "@/components/CampaignTable";
import CreativeReporting from "@/components/CreativeReporting";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plane, Bath, DollarSign } from "lucide-react";

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
  const atcRate = v.clicks > 0 ? Math.round((v.addToCart / v.clicks) * 10000) / 100 : 0;
  return { ...v, cpc, ctr, cpm, roas, atcRate };
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

const FLIGHTS_PATTERN = "Flight";
const BATH_PATTERN = "Bath";

function categorize(name: string): "flights" | "bath" | "other" {
  const lower = name.toLowerCase();
  if (lower.includes(FLIGHTS_PATTERN.toLowerCase())) return "flights";
  if (lower.includes(BATH_PATTERN.toLowerCase())) return "bath";
  return "other";
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

function useBillyVerticalKPIs() {
  const { dateRange } = useDateRange();
  const fromStr = format(dateRange.from, "yyyy-MM-dd");
  const toStr = format(dateRange.to, "yyyy-MM-dd");
  const days = differenceInDays(dateRange.to, dateRange.from) + 1;
  const prevFrom = format(subDays(dateRange.from, days), "yyyy-MM-dd");
  const prevTo = format(subDays(dateRange.from, 1), "yyyy-MM-dd");
  const { activeClient } = useClient();
  const clientId = activeClient?.id;

  return useQuery({
    queryKey: ["billy-vertical-kpis", fromStr, toStr, clientId],
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

      const curFlights = (curData || []).filter(r => categorize(r.campaign_name) === "flights");
      const curBath = (curData || []).filter(r => categorize(r.campaign_name) === "bath");
      const curOther = (curData || []).filter(r => categorize(r.campaign_name) === "other");
      const prevFlights = (prevData || []).filter(r => categorize(r.campaign_name) === "flights");
      const prevBath = (prevData || []).filter(r => categorize(r.campaign_name) === "bath");

      const fCur = calcDerived(aggregate(curFlights));
      const fPrev = calcDerived(aggregate(prevFlights));
      const bCur = calcDerived(aggregate(curBath));
      const bPrev = calcDerived(aggregate(prevBath));
      const allCur = calcDerived(aggregate(curData || []));
      const oCur = calcDerived(aggregate(curOther));

      const changes = (cur: ReturnType<typeof calcDerived>, prev: ReturnType<typeof calcDerived>) => ({
        spend: pctChange(cur.spend, prev.spend),
        revenue: pctChange(cur.revenue, prev.revenue),
        roas: pctChange(cur.roas, prev.roas),
        cpc: pctChange(cur.cpc, prev.cpc),
        ctr: pctChange(cur.ctr, prev.ctr),
        cpm: pctChange(cur.cpm, prev.cpm),
      });

      return {
        flights: { ...fCur, changes: changes(fCur, fPrev) },
        bath: { ...bCur, changes: changes(bCur, bPrev) },
        other: oCur,
        total: allCur,
      };
    },
  });
}

const BillyMetaDashboard = () => {
  const { data, isLoading } = useBillyVerticalKPIs();
  const { data: ringba, isLoading: ringbaLoading } = useRingbaByVertical();

  const flights = data?.flights;
  const bath = data?.bath;
  const total = data?.total;

  // Per-vertical Ringba metrics
  const flightsRingba = ringba?.allFlights;
  const bathRingba = ringba?.bath;
  const allRingba = ringba?.all;

  const flightsSpend = flights?.spend ?? 0;
  const flightsRevenue = flightsRingba?.totalRevenue ?? 0;
  const flightsConversions = flightsRingba?.convertedCalls ?? 0;
  const flightsRoas = flightsSpend > 0 ? Math.round((flightsRevenue / flightsSpend) * 100) / 100 : 0;
  const flightsCpa = flightsConversions > 0 ? Math.round((flightsSpend / flightsConversions) * 100) / 100 : 0;

  const bathSpend = bath?.spend ?? 0;
  const bathRevenue = bathRingba?.totalRevenue ?? 0;
  const bathConversions = bathRingba?.convertedCalls ?? 0;
  const bathRoas = bathSpend > 0 ? Math.round((bathRevenue / bathSpend) * 100) / 100 : 0;
  const bathCpa = bathConversions > 0 ? Math.round((bathSpend / bathConversions) * 100) / 100 : 0;

  const totalSpend = total?.spend ?? 0;
  const totalRevenue = allRingba?.totalRevenue ?? 0;
  const totalConversions = allRingba?.convertedCalls ?? 0;
  const blendedRoas = totalSpend > 0 ? Math.round((totalRevenue / totalSpend) * 100) / 100 : 0;

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

      {/* ✈️ Flights Vertical */}
      <Card className="mb-6 border-primary/20">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Plane className="w-4 h-4 text-primary" />
            <CardTitle className="text-base">✈️ Flights Campaigns</CardTitle>
          </div>
          <p className="text-xs text-muted-foreground">
            Premium + Mixed Flights — revenue from Ringba Flights campaigns
          </p>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="grid grid-cols-3 md:grid-cols-7 gap-4">
              {Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
            </div>
          ) : (
            <div className="grid grid-cols-3 md:grid-cols-7 gap-4">
              <KPICard title="Spend" value={`$${flightsSpend.toLocaleString()}`} change={flights?.changes.spend} invertColor />
              <KPICard title="Revenue" value={`$${flightsRevenue.toLocaleString()}`} subtitle="Ringba" />
              <KPICard title="ROAS" value={`${flightsRoas}x`} subtitle="Ringba rev ÷ spend" />
              <KPICard title="CPA" value={`$${flightsCpa}`} subtitle={`${flightsConversions} conv.`} invertColor />
              <KPICard title="CPC" value={`$${flights?.cpc ?? 0}`} change={flights?.changes.cpc} invertColor />
              <KPICard title="CTR" value={`${flights?.ctr ?? 0}%`} change={flights?.changes.ctr} />
              <KPICard title="CPM" value={`$${flights?.cpm ?? 0}`} change={flights?.changes.cpm} invertColor />
            </div>
          )}
        </CardContent>
      </Card>

      {/* 🛁 Bath / Home Services Vertical */}
      <Card className="mb-6 border-primary/20">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Bath className="w-4 h-4 text-primary" />
            <CardTitle className="text-base">🛁 Bath / Home Services Campaigns</CardTitle>
          </div>
          <p className="text-xs text-muted-foreground">
            Campaigns matching "Bath" — revenue from Ringba Bath campaigns
          </p>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="grid grid-cols-3 md:grid-cols-7 gap-4">
              {Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
            </div>
          ) : (
            <div className="grid grid-cols-3 md:grid-cols-7 gap-4">
              <KPICard title="Spend" value={`$${bathSpend.toLocaleString()}`} change={bath?.changes.spend} invertColor />
              <KPICard title="Revenue" value={`$${bathRevenue.toLocaleString()}`} subtitle="Ringba" />
              <KPICard title="ROAS" value={`${bathRoas}x`} subtitle="Ringba rev ÷ spend" />
              <KPICard title="CPA" value={bathConversions > 0 ? `$${bathCpa}` : "–"} subtitle={`${bathConversions} conv.`} invertColor />
              <KPICard title="CPC" value={`$${bath?.cpc ?? 0}`} change={bath?.changes.cpc} invertColor />
              <KPICard title="CTR" value={`${bath?.ctr ?? 0}%`} change={bath?.changes.ctr} />
              <KPICard title="CPM" value={`$${bath?.cpm ?? 0}`} change={bath?.changes.cpm} invertColor />
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
