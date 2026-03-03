import KPICard from "@/components/KPICard";
import CampaignTable from "@/components/CampaignTable";
import { useGoogleKPIsWithSubblyRevenue } from "@/hooks/useAdData";
import { Skeleton } from "@/components/ui/skeleton";

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
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-6">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
        ) : (
          <>
            <KPICard title="Add to Cart" value={(kpis?.addToCart ?? 0).toLocaleString()} change={kpis?.changes.addToCart} />
            <KPICard title="ATC Rate" value={`${kpis?.atcRate ?? 0}%`} change={kpis?.changes.atcRate} subtitle="Clicks → ATC" />
            <KPICard title="Avg CPC" value={`$${kpis?.cpc ?? 0}`} change={kpis?.changes.cpc} invertColor />
            <KPICard title="CTR" value={`${kpis?.ctr ?? 0}%`} change={kpis?.changes.ctr} />
            <KPICard title="CPM" value={`$${kpis?.cpm ?? 0}`} change={kpis?.changes.cpm} invertColor />
            <KPICard title="Impressions" value={`${((kpis?.impressions ?? 0) / 1000000).toFixed(1)}M`} change={kpis?.changes.impressions} />
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