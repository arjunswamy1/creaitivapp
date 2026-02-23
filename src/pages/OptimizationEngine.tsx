import { useOptimizationEngine } from "@/hooks/useOptimizationEngine";
import { useClient } from "@/contexts/ClientContext";
import { useBranding } from "@/contexts/BrandingContext";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { ArrowLeft, Sparkles, Cpu, RefreshCw } from "lucide-react";
import BaselineForecastCard from "@/components/optimization/BaselineForecastCard";
import ScenarioSimulator from "@/components/optimization/ScenarioSimulator";
import VarianceMonitor from "@/components/optimization/VarianceMonitor";
import RecommendationFeed from "@/components/optimization/RecommendationFeed";
import AdsToKillCard from "@/components/optimization/AdsToKillCard";
import CACTrendCard from "@/components/optimization/CACTrendCard";
import { useQueryClient } from "@tanstack/react-query";

const OptimizationEngine = () => {
  const { data, isLoading, error, isFetching } = useOptimizationEngine();
  const { activeClient, isAgencyAdmin } = useClient();
  const { logoUrl, clientName } = useBranding();
  const queryClient = useQueryClient();

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["optimization-engine"] });
  };

  return (
    <div className="min-h-screen bg-background px-6 pb-12">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <header className="flex items-center justify-between py-6">
          <div className="flex items-center gap-4">
            <Link to="/">
              <Button variant="ghost" size="icon" className="mr-1">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            {logoUrl && <img src={logoUrl} alt={clientName} className="h-10 w-auto rounded-lg" />}
            <div>
              <h1 className="text-xl font-bold tracking-tight flex items-center gap-2" style={{ fontFamily: "var(--font-heading)" }}>
                <Cpu className="w-5 h-5 text-primary" />
                Optimization Engine
              </h1>
              <p className="text-sm text-muted-foreground">{clientName} — Forecasting & Recommendations</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              disabled={isFetching}
              className="gap-1.5 text-xs text-muted-foreground"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </header>

        {/* Loading state */}
        {isLoading && (
          <div className="space-y-6">
            <Skeleton className="h-[280px] rounded-xl" />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Skeleton className="h-[350px] rounded-xl" />
              <Skeleton className="h-[250px] rounded-xl" />
            </div>
            <Skeleton className="h-[200px] rounded-xl" />
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="glass-card p-8 text-center">
            <Cpu className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <h3 className="text-lg font-semibold mb-2">Insufficient Data</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              {(error as any)?.message || "The optimization engine needs at least 7 days of performance data. Sync more data and try again."}
            </p>
          </div>
        )}

        {/* Main content */}
        {data && data.baseline && (
          <div className="space-y-6">
            {/* AI Insight Banner */}
            {data.ai_insight && (
              <div className="bg-primary/5 border border-primary/20 rounded-xl p-5">
                <div className="flex items-center gap-2 text-xs font-semibold text-primary mb-2">
                  <Sparkles className="w-4 h-4" />
                  AI Strategy Insight
                </div>
                <p className="text-sm text-foreground/80 leading-relaxed">{data.ai_insight}</p>
              </div>
            )}

            {/* Data Quality Badge */}
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="bg-secondary/50 px-2.5 py-1 rounded-full">
                {data.data_quality.days_with_data} days analyzed
              </span>
              <span className="bg-secondary/50 px-2.5 py-1 rounded-full capitalize">
                Revenue: {data.data_quality.revenue_source}
              </span>
              <span className="bg-secondary/50 px-2.5 py-1 rounded-full">
                v1 — Read + Recommend Only
              </span>
            </div>

            {/* Row 1: Baseline + Scenario */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <BaselineForecastCard baseline={data.baseline} risk={data.risk} />
              <ScenarioSimulator
                baseline={data.baseline}
                spendScenarios={data.spend_adjusted}
                efficiencyScenarios={data.efficiency_adjusted}
              />
            </div>

            {/* Row 2: CAC Trend */}
            {data.cac_trend && (
              <CACTrendCard cacTrend={data.cac_trend} />
            )}

            {/* Row 2.5: Ads to Kill (Shopify only) */}
            {data.ads_to_kill && data.ads_to_kill.length > 0 && (
              <AdsToKillCard
                adsToKill={data.ads_to_kill}
                blendedROAS={data.baseline.projected_mer}
              />
            )}

            {/* Row 3: Variance + Recommendations */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <VarianceMonitor variances={data.variances} />
              <RecommendationFeed recommendations={data.recommendations} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default OptimizationEngine;
