import KPICard from "@/components/KPICard";
import CampaignTable from "@/components/CampaignTable";
import FunnelChart from "@/components/FunnelChart";
import CreativeReporting from "@/components/CreativeReporting";
import { useKPIs, useMetaKPIsWithSubblyRevenue } from "@/hooks/useAdData";
import { useTripleWhaleEnabled, useTripleWhaleSummary } from "@/hooks/useTripleWhaleData";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

const MetaDashboard = () => {
  const { data: kpis, isLoading } = useKPIs("meta");
  const { data: revenueData, isLoading: revenueLoading } = useMetaKPIsWithSubblyRevenue();
  const twEnabled = useTripleWhaleEnabled();
  const { data: twData, isLoading: twLoading } = useTripleWhaleSummary();
  const revenueLabel = (revenueData as any)?.revenueLabel || "Subbly";

  const metaSpend = kpis?.totalSpend ?? 0;
  const actualROAS = metaSpend > 0 && revenueData
    ? Math.round(((revenueData.subblyRevenue) / metaSpend) * 100) / 100
    : 0;

  // When TW is enabled, use TW-attributed metrics as primary
  const showTw = twEnabled && twData;

  return (
    <>
      {/* TW Attribution Badge */}
      {twEnabled && (
        <div className="flex items-center gap-2 mb-4">
          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
            🐳 TripleWhale Attribution Active
          </Badge>
          <span className="text-xs text-muted-foreground">
            Revenue & ROAS powered by Triple Pixel attribution
          </span>
        </div>
      )}

      {/* Meta KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        {isLoading || revenueLoading || (twEnabled && twLoading) ? (
          Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
        ) : showTw ? (
          <>
            <KPICard title="Meta Spend" value={`$${(kpis?.totalSpend ?? 0).toLocaleString()}`} change={kpis?.changes.spend} invertColor />
            <KPICard title="TW Revenue" value={`$${(twData.metaTwRevenue).toLocaleString()}`} change={twData.changes.metaTwRevenue} subtitle="Triple Pixel attributed" />
            <KPICard title={`${revenueLabel} Revenue`} value={`$${(revenueData?.subblyRevenue ?? 0).toLocaleString()}`} change={revenueData?.subblyRevenueChange} subtitle="Shopify orders" />
            <KPICard title="TW ROAS" value={`${twData.metaTwRoas}x`} change={twData.changes.metaTwRoas} subtitle="Triple Pixel" />
            <KPICard title="TW Purchases" value={(twData.metaTwPurchases).toLocaleString()} change={twData.changes.metaTwPurchases} subtitle="TW-attributed" />
            <KPICard title="Conv. Rate" value={`${(kpis?.impressions ?? 0) > 0 ? ((twData.metaTwPurchases / (kpis?.impressions ?? 1)) * 100).toFixed(3) : 0}%`} subtitle="TW Sales ÷ Impressions" />
          </>
        ) : (
          <>
            <KPICard title="Meta Spend" value={`$${(kpis?.totalSpend ?? 0).toLocaleString()}`} change={kpis?.changes.spend} invertColor />
            <KPICard title="Meta Revenue" value={`$${(kpis?.totalRevenue ?? 0).toLocaleString()}`} change={kpis?.changes.revenue} subtitle="Meta-reported" />
            <KPICard title={`${revenueLabel} Revenue`} value={`$${(revenueData?.subblyRevenue ?? 0).toLocaleString()}`} change={revenueData?.subblyRevenueChange} subtitle="Actual orders" />
            <KPICard title="Meta ROAS" value={`${kpis?.blendedROAS ?? 0}x`} change={kpis?.changes.roas} subtitle="Meta-reported" />
            <KPICard title={`${revenueLabel} ROAS`} value={`${actualROAS}x`} subtitle="Spend vs actual" />
          </>
        )}
      </div>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-6">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
        ) : (
          <>
            <KPICard title="Add to Cart" value={(kpis?.addToCart ?? 0).toLocaleString()} change={kpis?.changes.addToCart} />
            <KPICard title="ATC Rate" value={`${kpis?.atcRate ?? 0}%`} change={kpis?.changes.atcRate} subtitle="Clicks → ATC" />
            <KPICard title="Purchases" value={(kpis?.totalConversions ?? 0).toLocaleString()} change={kpis?.changes.conversions} subtitle={showTw ? "Meta-reported" : undefined} />
            <KPICard title="CPC" value={`$${kpis?.cpc ?? 0}`} change={kpis?.changes.cpc} invertColor />
            <KPICard title="CTR" value={`${kpis?.ctr ?? 0}%`} change={kpis?.changes.ctr} />
            <KPICard title="CPM" value={`$${kpis?.cpm ?? 0}`} change={kpis?.changes.cpm} invertColor />
          </>
        )}
      </div>

      {/* Funnel */}
      <div className="mb-6">
        <FunnelChart platform="meta" />
      </div>

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

export default MetaDashboard;
