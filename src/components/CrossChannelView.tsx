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

  // Conversion rate: TW purchases / Meta impressions
  const twPurchases = twData?.metaTwPurchases ?? 0;
  const metaImpressions = metaKpis?.impressions ?? 0;
  const convRate = metaImpressions > 0 ? Math.round((twPurchases / metaImpressions) * 100000) / 1000 : 0;

  // Determine how many primary KPI cards to show
  const primaryCards = [
    { show: true, title: "Total Spend", value: `$${(kpis?.totalSpend ?? 0).toLocaleString()}`, change: kpis?.changes.totalSpend, invert: true },
    { show: showGoogle, title: "Google Spend", value: `$${(kpis?.googleSpend ?? 0).toLocaleString()}`, change: kpis?.changes.googleSpend, invert: true },
    { show: true, title: "Meta Spend", value: `$${(kpis?.metaSpend ?? 0).toLocaleString()}`, change: kpis?.changes.metaSpend, invert: true },
    { show: true, title: "Total CAC", value: kpis?.totalCAC ? `$${kpis.totalCAC.toLocaleString()}` : "—", change: kpis?.changes.totalCAC, invert: true },
  ].filter(c => c.show);

  return (
    <>
      {/* Primary KPI Row */}
      <div className={`grid grid-cols-2 md:grid-cols-${primaryCards.length} gap-4 mb-6`}>
        {isLoading ? (
          Array.from({ length: primaryCards.length }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
        ) : (
          primaryCards.map((card) => (
            <KPICard key={card.title} title={card.title} value={card.value} change={card.change} invertColor={card.invert} />
          ))
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
          </>
        )}
      </div>

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
