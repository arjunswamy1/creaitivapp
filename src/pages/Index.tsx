import DashboardHeader from "@/components/DashboardHeader";
import KPICard from "@/components/KPICard";
import SpendRevenueChart from "@/components/SpendRevenueChart";
import ChannelBreakdown from "@/components/ChannelBreakdown";
import CampaignTable from "@/components/CampaignTable";
import { useKPIs } from "@/hooks/useAdData";
import { Skeleton } from "@/components/ui/skeleton";

const Index = () => {
  const { data: kpis, isLoading } = useKPIs();

  return (
    <div className="min-h-screen bg-background px-6 pb-12">
      <div className="max-w-7xl mx-auto">
        <DashboardHeader />

        {/* KPI Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
          ) : (
            <>
              <KPICard title="Total Spend" value={`$${(kpis?.totalSpend ?? 0).toLocaleString()}`} />
              <KPICard title="Total Revenue" value={`$${(kpis?.totalRevenue ?? 0).toLocaleString()}`} />
              <KPICard title="Blended ROAS" value={`${kpis?.blendedROAS ?? 0}x`} />
              <KPICard title="Conversions" value={(kpis?.totalConversions ?? 0).toLocaleString()} />
            </>
          )}
        </div>

        {/* Secondary KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
          ) : (
            <>
              <KPICard title="Avg CPC" value={`$${kpis?.cpc ?? 0}`} />
              <KPICard title="CTR" value={`${kpis?.ctr ?? 0}%`} />
              <KPICard title="CPM" value={`$${kpis?.cpm ?? 0}`} />
              <KPICard title="Impressions" value={`${((kpis?.impressions ?? 0) / 1000000).toFixed(1)}M`} />
            </>
          )}
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <div className="lg:col-span-2">
            <SpendRevenueChart />
          </div>
          <ChannelBreakdown />
        </div>

        {/* Campaign Table */}
        <CampaignTable />
      </div>
    </div>
  );
};

export default Index;
