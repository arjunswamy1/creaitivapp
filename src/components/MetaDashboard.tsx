import KPICard from "@/components/KPICard";
import CampaignTable from "@/components/CampaignTable";
import FunnelChart from "@/components/FunnelChart";
import CreativeReporting from "@/components/CreativeReporting";
import { useKPIs } from "@/hooks/useAdData";
import { Skeleton } from "@/components/ui/skeleton";

const MetaDashboard = () => {
  const { data: kpis, isLoading } = useKPIs("meta");

  return (
    <>
      {/* Meta KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
        ) : (
          <>
            <KPICard title="Meta Spend" value={`$${(kpis?.totalSpend ?? 0).toLocaleString()}`} change={kpis?.changes.spend} invertColor />
            <KPICard title="Revenue" value={`$${(kpis?.totalRevenue ?? 0).toLocaleString()}`} change={kpis?.changes.revenue} />
            <KPICard title="ROAS" value={`${kpis?.blendedROAS ?? 0}x`} change={kpis?.changes.roas} />
            <KPICard title="Purchases" value={(kpis?.totalConversions ?? 0).toLocaleString()} change={kpis?.changes.conversions} />
          </>
        )}
      </div>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
        ) : (
          <>
            <KPICard title="CPC" value={`$${kpis?.cpc ?? 0}`} change={kpis?.changes.cpc} invertColor />
            <KPICard title="CTR" value={`${kpis?.ctr ?? 0}%`} change={kpis?.changes.ctr} />
            <KPICard title="CPM" value={`$${kpis?.cpm ?? 0}`} change={kpis?.changes.cpm} invertColor />
            <KPICard title="Impressions" value={`${((kpis?.impressions ?? 0) / 1000000).toFixed(1)}M`} change={kpis?.changes.impressions} />
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
