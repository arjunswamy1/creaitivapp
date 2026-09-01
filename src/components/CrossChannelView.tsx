import KPICard from "@/components/KPICard";
import SpendRevenueChart from "@/components/SpendRevenueChart";
import ChannelBreakdown from "@/components/ChannelBreakdown";
import ForecastCard from "@/components/ForecastCard";
import BaselineForecastCard from "@/components/optimization/BaselineForecastCard";
import SubblyKPIRow from "@/components/SubblyKPIRow";
import ConversionRateTrend from "@/components/ConversionRateTrend";

import { useCrossChannelKPIs } from "@/hooks/useCrossChannelData";
import { useOptimizationEngine } from "@/hooks/useOptimizationEngine";
import { useTripleWhaleEnabled, useTripleWhaleSummary } from "@/hooks/useTripleWhaleData";
import { useKPIs } from "@/hooks/useAdData";
import { useClient } from "@/contexts/ClientContext";
import { Skeleton } from "@/components/ui/skeleton";

const CrossChannelView = () => {
  const { data: kpis, isLoading } = useCrossChannelKPIs();
  const { data: optData, isLoading: optLoading } = useOptimizationEngine();
  const { dashboardConfig } = useClient();
  const revenueSource = dashboardConfig?.revenue_source || "subbly";
  const platforms = dashboardConfig?.enabled_platforms || ["meta", "google"];
  const showGoogle = platforms.includes("google");
  const ordersLabel = revenueSource === "shopify" ? "New Customers" : "New Subscriptions";
  const twEnabled = useTripleWhaleEnabled();
  const { data: twData } = useTripleWhaleSummary();
  const { data: metaKpis } = useKPIs("meta");

  // Conversion rate: TW purchases / Meta clicks (from ad platform)
  const twPurchases = twData?.metaTwPurchases ?? 0;
  const metaClicks = metaKpis?.clicks ?? 0;
  const convRate = metaClicks > 0 ? Math.round((twPurchases / metaClicks) * 100000) / 1000 : 0;

  // Determine how many primary KPI cards to show
  const primaryCards = [
    { show: true, title: "Total Spend", value: `$${(kpis?.totalSpend ?? 0).toLocaleString()}`, change: kpis?.changes.totalSpend, invert: true },
    { show: showGoogle, title: "Google Spend", value: `$${(kpis?.googleSpend ?? 0).toLocaleString()}`, change: kpis?.changes.googleSpend, invert: true },
    { show: true, title: "Meta Spend", value: `$${(kpis?.metaSpend ?? 0).toLocaleString()}`, change: kpis?.changes.metaSpend, invert: true },
    { show: true, title: "Paid CAC", value: kpis?.paidCAC ? `$${kpis.paidCAC.toLocaleString()}` : "—", change: kpis?.changes.paidCAC, invert: true, subtitle: "Spend ÷ paid conversions" },
    { show: true, title: "Blended CAC", value: kpis?.totalCAC ? `$${kpis.totalCAC.toLocaleString()}` : "—", change: kpis?.changes.totalCAC, invert: true, subtitle: "Spend ÷ all new sales" },
  ].filter(c => c.show);

  const totalNew = kpis?.newSubscriptions ?? 0;
  const paid = kpis?.paidConversions ?? 0;
  const organic = kpis?.organicSubscriptions ?? 0;
  const paidShare = totalNew > 0 ? Math.round((paid / totalNew) * 1000) / 10 : 0;
  const paidLabel = revenueSource === "shopify" ? "Paid Orders" : "Paid Subscriptions";
  const organicLabel = revenueSource === "shopify" ? "Organic Orders" : "Organic Subscriptions";

  return (
    <>
      {/* Primary KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4 mb-6">
        {isLoading ? (
          Array.from({ length: primaryCards.length }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
        ) : (
          primaryCards.map((card) => (
            <KPICard key={card.title} title={card.title} value={card.value} change={card.change} invertColor={card.invert} subtitle={(card as any).subtitle} />
          ))
        )}
      </div>

      {/* Paid vs Organic */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
        ) : (
          <>
            <KPICard title={paidLabel} value={paid.toLocaleString()} change={kpis?.changes.paidConversions} subtitle="Meta + Google reported conversions" />
            <KPICard title={organicLabel} value={organic.toLocaleString()} change={kpis?.changes.organicSubscriptions} subtitle="Total new minus paid" />
            <KPICard title="Paid Share of New Sales" value={`${paidShare}%`} subtitle={`${paid.toLocaleString()} of ${totalNew.toLocaleString()}`} />
          </>
        )}
      </div>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
        ) : (
          <>
            <KPICard title={ordersLabel} value={(kpis?.newSubscriptions ?? 0).toLocaleString()} change={kpis?.changes.newSubscriptions} />
            <KPICard title="Total Revenue" value={`$${(kpis?.totalRevenue ?? 0).toLocaleString()}`} change={kpis?.changes.totalRevenue} />
            <KPICard title="Blended ROAS" value={`${kpis?.blendedROAS ?? 0}x`} change={kpis?.changes.blendedROAS} />
            {revenueSource === "shopify" && (
              <KPICard
                title="Profit"
                value={`$${(kpis?.profit ?? 0).toLocaleString()}`}
                change={kpis?.changes.profit}
              />
            )}
            {twEnabled && (
              <KPICard title="Conv. Rate" value={`${convRate}%`} subtitle="TW Sales ÷ Clicks" />
            )}
          </>
        )}
      </div>


      {/* Conversion Rate Trend (TW-enabled clients only) */}
      {twEnabled && (
        <div className="mb-6">
          <ConversionRateTrend />
        </div>
      )}

      {/* Subscription Metrics (only for Subbly clients) */}
      {revenueSource === "subbly" && <SubblyKPIRow />}

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="lg:col-span-2">
          <SpendRevenueChart />
        </div>
        <ChannelBreakdown />
      </div>

      {/* Baseline Forecast from Optimization Engine */}
      <div className="mb-6">
        {optLoading ? (
          <Skeleton className="h-[320px] rounded-xl" />
        ) : optData?.baseline && optData?.risk ? (
          <BaselineForecastCard baseline={optData.baseline} risk={optData.risk} />
        ) : (
          <ForecastCard />
        )}
      </div>
    </>
  );
};

export default CrossChannelView;
