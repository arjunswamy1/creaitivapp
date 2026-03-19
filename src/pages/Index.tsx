import DashboardHeader from "@/components/DashboardHeader";
import CrossChannelView from "@/components/CrossChannelView";
import GoogleDashboard from "@/components/GoogleDashboard";
import MetaDashboard from "@/components/MetaDashboard";
import BillyDashboard from "@/components/BillyDashboard";
import BillyMetaDashboard from "@/components/BillyMetaDashboard";
import BillyGoogleDashboard from "@/components/BillyGoogleDashboard";
import BillyDailyTrends from "@/components/BillyDailyTrends";
import BillyTrendAnalysis from "@/components/BillyTrendAnalysis";
import { DateRangeProvider } from "@/contexts/DateRangeContext";
import { useClient } from "@/contexts/ClientContext";
import { VerticalProvider, useVertical } from "@/contexts/VerticalContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, Chrome, Facebook, Zap, TrendingUp, LineChart } from "lucide-react";

const VerticalSelector = () => {
  const { activeVertical, setActiveVertical, verticals } = useVertical();

  return (
    <div className="flex gap-2 mb-4 flex-wrap">
      {verticals.map((v) => (
        <button
          key={v.id}
          onClick={() => setActiveVertical(v)}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all border ${
            activeVertical.id === v.id
              ? "bg-primary text-primary-foreground border-primary shadow-sm"
              : "bg-secondary/50 text-muted-foreground border-border hover:bg-secondary hover:text-foreground"
          }`}
        >
          {v.emoji} {v.label}
        </button>
      ))}
    </div>
  );
};

const BillyDashboardContent = () => {
  const { dashboardConfig, activeClient } = useClient();
  const platforms = dashboardConfig?.enabled_platforms || ["meta", "google"];
  const showMeta = platforms.includes("meta");

  return (
    <div className="min-h-screen bg-background px-6 pb-12">
      <div className="max-w-7xl mx-auto">
        <DashboardHeader />

        {/* Vertical selector */}
        <VerticalSelector />

        {/* Sub-tabs for the active vertical */}
        <Tabs key={activeClient?.id} defaultValue="revenue-engine" className="w-full">
          <TabsList className="bg-secondary/50 mb-6">
            <TabsTrigger value="revenue-engine" className="gap-1.5">
              <Zap className="w-3.5 h-3.5" />
              Revenue Engine
            </TabsTrigger>
            <TabsTrigger value="daily-trends" className="gap-1.5">
              <TrendingUp className="w-3.5 h-3.5" />
              Daily Trends
            </TabsTrigger>
            <TabsTrigger value="trend-analysis" className="gap-1.5">
              <LineChart className="w-3.5 h-3.5" />
              Trend Analysis
            </TabsTrigger>
            {showMeta && (
              <TabsTrigger value="meta" className="gap-1.5">
                <Facebook className="w-3.5 h-3.5" />
                Meta Ads
              </TabsTrigger>
            )}
          </TabsList>
          <TabsContent value="revenue-engine">
            <BillyDashboard />
          </TabsContent>
          <TabsContent value="daily-trends">
            <BillyDailyTrends />
          </TabsContent>
          <TabsContent value="trend-analysis">
            <BillyTrendAnalysis />
          </TabsContent>
          {showMeta && (
            <TabsContent value="meta">
              <BillyMetaDashboard />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  );
};

const DashboardContent = () => {
  const { dashboardConfig, activeClient } = useClient();
  const platforms = dashboardConfig?.enabled_platforms || ["meta", "google"];
  const showGoogle = platforms.includes("google");
  const showMeta = platforms.includes("meta");
  const isBilly = activeClient?.slug === "billy";

  if (isBilly) {
    return (
      <VerticalProvider>
        <BillyDashboardContent />
      </VerticalProvider>
    );
  }

  return (
    <div className="min-h-screen bg-background px-6 pb-12">
      <div className="max-w-7xl mx-auto">
        <DashboardHeader />
        <Tabs key={activeClient?.id} defaultValue="cross-channel" className="w-full">
          <TabsList className="bg-secondary/50 mb-6">
            <TabsTrigger value="cross-channel" className="gap-1.5">
              <BarChart3 className="w-3.5 h-3.5" />
              Cross-Channel
            </TabsTrigger>
            {showGoogle && (
              <TabsTrigger value="google" className="gap-1.5">
                <Chrome className="w-3.5 h-3.5" />
                Google Ads
              </TabsTrigger>
            )}
            {showMeta && (
              <TabsTrigger value="meta" className="gap-1.5">
                <Facebook className="w-3.5 h-3.5" />
                Meta Ads
              </TabsTrigger>
            )}
          </TabsList>
          <TabsContent value="cross-channel">
            <CrossChannelView />
          </TabsContent>
          {showGoogle && (
            <TabsContent value="google">
              <GoogleDashboard />
            </TabsContent>
          )}
          {showMeta && (
            <TabsContent value="meta">
              <MetaDashboard />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  );
};

const Index = () => (
  <DateRangeProvider>
    <DashboardContent />
  </DateRangeProvider>
);

export default Index;
