import KPICard from "@/components/KPICard";
import SpendRevenueChart from "@/components/SpendRevenueChart";
import ChannelBreakdown from "@/components/ChannelBreakdown";
import ForecastCard from "@/components/ForecastCard";
import SubblyKPIRow from "@/components/SubblyKPIRow";

import { useCrossChannelKPIs } from "@/hooks/useCrossChannelData";
import { useClient } from "@/contexts/ClientContext";
import { Skeleton } from "@/components/ui/skeleton";

const CrossChannelView = () => {
  const { data: kpis, isLoading } = useCrossChannelKPIs();
  const { dashboardConfig } = useClient();
  const revenueSource = dashboardConfig?.revenue_source || "subbly";
  const ordersLabel = revenueSource === "shopify" ? "New Orders" : "New Subscriptions";

  return (
    <>
      {/* Primary KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
        ) : (
          <>
            <KPICard title="Total Spend" value={`$${(kpis?.totalSpend ?? 0).toLocaleString()}`} change={kpis?.changes.totalSpend} invertColor />
            <KPICard title="Google Spend" value={`$${(kpis?.googleSpend ?? 0).toLocaleString()}`} change={kpis?.changes.googleSpend} invertColor />
            <KPICard title="Meta Spend" value={`$${(kpis?.metaSpend ?? 0).toLocaleString()}`} change={kpis?.changes.metaSpend} invertColor />
            <KPICard title="Total CAC" value={kpis?.totalCAC ? `$${kpis.totalCAC.toLocaleString()}` : "—"} change={kpis?.changes.totalCAC} invertColor />
          </>
        )}
      </div>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
        ) : (
          <>
            <KPICard title={ordersLabel} value={(kpis?.newSubscriptions ?? 0).toLocaleString()} change={kpis?.changes.newSubscriptions} />
            <KPICard title="Total Revenue" value={`$${(kpis?.totalRevenue ?? 0).toLocaleString()}`} change={kpis?.changes.totalRevenue} />
            <KPICard title="Blended ROAS" value={`${kpis?.blendedROAS ?? 0}x`} change={kpis?.changes.blendedROAS} />
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

      {/* Forecast */}
      <div className="mb-6">
        <ForecastCard />
      </div>
    </>
  );
};

export default CrossChannelView;
