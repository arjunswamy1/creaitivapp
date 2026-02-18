import DashboardHeader from "@/components/DashboardHeader";
import KPICard from "@/components/KPICard";
import SpendRevenueChart from "@/components/SpendRevenueChart";
import ChannelBreakdown from "@/components/ChannelBreakdown";
import CampaignTable from "@/components/CampaignTable";
import { mockKPIs } from "@/data/mockData";

const Index = () => {
  return (
    <div className="min-h-screen bg-background px-6 pb-12">
      <div className="max-w-7xl mx-auto">
        <DashboardHeader />

        {/* KPI Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <KPICard title="Total Spend" value={`$${mockKPIs.totalSpend.toLocaleString()}`} change={-2.4} />
          <KPICard title="Total Revenue" value={`$${mockKPIs.totalRevenue.toLocaleString()}`} change={12.8} />
          <KPICard title="Blended ROAS" value={`${mockKPIs.blendedROAS}x`} change={8.3} />
          <KPICard title="Conversions" value={mockKPIs.totalConversions.toLocaleString()} change={5.1} />
        </div>

        {/* Secondary KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <KPICard title="Avg CPC" value={`$${mockKPIs.cpc}`} change={-5.2} />
          <KPICard title="CTR" value={`${mockKPIs.ctr}%`} change={1.7} />
          <KPICard title="CPM" value={`$${mockKPIs.cpm}`} change={-3.1} />
          <KPICard title="Impressions" value={`${(mockKPIs.impressions / 1000000).toFixed(1)}M`} change={9.4} />
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
