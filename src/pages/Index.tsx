import DashboardHeader from "@/components/DashboardHeader";
import CrossChannelView from "@/components/CrossChannelView";
import GoogleDashboard from "@/components/GoogleDashboard";
import MetaDashboard from "@/components/MetaDashboard";
import BillyDashboard from "@/components/BillyDashboard";
import { DateRangeProvider } from "@/contexts/DateRangeContext";
import { useClient } from "@/contexts/ClientContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, Chrome, Facebook, Zap } from "lucide-react";

const DashboardContent = () => {
  const { dashboardConfig, activeClient } = useClient();
  const platforms = dashboardConfig?.enabled_platforms || ["meta", "google"];
  const showGoogle = platforms.includes("google");
  const showMeta = platforms.includes("meta");
  const isBilly = activeClient?.slug === "billy";

  // Billy.com gets its own dedicated funnel dashboard
  if (isBilly) {
    return (
      <div className="min-h-screen bg-background px-6 pb-12">
        <div className="max-w-7xl mx-auto">
          <DashboardHeader />
          <Tabs key={activeClient?.id} defaultValue="revenue-engine" className="w-full">
            <TabsList className="bg-secondary/50 mb-6">
              <TabsTrigger value="revenue-engine" className="gap-1.5">
                <Zap className="w-3.5 h-3.5" />
                Revenue Engine
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
            {showMeta && (
              <TabsContent value="meta">
                <MetaDashboard />
              </TabsContent>
            )}
          </Tabs>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-6 pb-12">
      <div className="max-w-7xl mx-auto">
        <DashboardHeader />

        <Tabs defaultValue="cross-channel" className="w-full">
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
