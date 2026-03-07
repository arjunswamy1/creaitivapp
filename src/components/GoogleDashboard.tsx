import KPICard from "@/components/KPICard";
import CampaignTable from "@/components/CampaignTable";
import { useGoogleKPIsWithSubblyRevenue } from "@/hooks/useAdData";
import { Skeleton } from "@/components/ui/skeleton";

function formatImpressions(val: number): string {
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(1)}K`;
  return val.toLocaleString();
}

const GoogleDashboard = () => {
  const { data: kpis, isLoading } = useGoogleKPIsWithSubblyRevenue();

  return (
    <>
      {/* Google KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
        ) : (
          <>
            <KPICard title="Google Spend" value={`$${(kpis?.totalSpend ?? 0).toLocaleString()}`} change={kpis?.changes.spend} invertColor />
            <KPICard title="Subbly Revenue" value={`$${(kpis?.totalRevenue ?? 0).toLocaleString()}`} change={kpis?.changes.revenue} />
            <KPICard title="Blended ROAS" value={`${kpis?.blendedROAS ?? 0}x`} change={kpis?.changes.roas} />
            <KPICard title="Conversions" value={(kpis?.totalConversions ?? 0).toLocaleString()} change={kpis?.changes.conversions} />
          </>
        )}
      </div>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
        ) : (
          <>
            <KPICard title="Avg CPC" value={`$${kpis?.cpc ?? 0}`} change={kpis?.changes.cpc} invertColor />
            <KPICard title="CTR" value={`${kpis?.ctr ?? 0}%`} change={kpis?.changes.ctr} />
            <KPICard title="CPM" value={`$${kpis?.cpm ?? 0}`} change={kpis?.changes.cpm} invertColor />
            <KPICard title="Impressions" value={formatImpressions(kpis?.impressions ?? 0)} change={kpis?.changes.impressions} />
          </>
        )}
      </div>

      {/* Campaign Table */}
      <div className="mb-6">
        <CampaignTable platform="google" />
      </div>
    </>
  );
};

export default GoogleDashboard;