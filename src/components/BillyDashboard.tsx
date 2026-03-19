import { useBillyKPIs, type TrendIndicators } from "@/hooks/useBillyKPIs";
import { syncRingbaCalls } from "@/hooks/useRingbaData";
import { useRingbaByVertical } from "@/hooks/useRingbaByVertical";
import { useClient } from "@/contexts/ClientContext";
import { useVertical } from "@/contexts/VerticalContext";
import FlightsForecastCard from "@/components/FlightsForecastCard";
import FlightsRecommendations from "@/components/FlightsRecommendations";
import TrendIndicator from "@/components/TrendIndicator";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowUpRight, ArrowDownRight, MousePointerClick, Eye, DollarSign, BarChart3, Target, Phone, PhoneCall, RefreshCw, TrendingUp } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface FunnelMetricProps {
  label: string;
  value: string;
  change?: number | null;
  invertColor?: boolean;
  icon?: React.ReactNode;
  trends?: TrendIndicators;
}

const FunnelMetric = ({ label, value, change, invertColor, icon, trends }: FunnelMetricProps) => {
  const hasChange = change !== undefined && change !== null;
  const isPositive = invertColor ? (change ?? 0) <= 0 : (change ?? 0) >= 0;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        {icon && <span className="text-muted-foreground">{icon}</span>}
        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{label}</span>
      </div>
      <span className="text-xl font-bold font-mono tracking-tight">{value}</span>
      {hasChange && (
        <div className="flex items-center gap-1">
          {isPositive ? (
            <ArrowUpRight className="w-3 h-3 text-accent" />
          ) : (
            <ArrowDownRight className="w-3 h-3 text-destructive" />
          )}
          <span className={`text-xs font-medium font-mono ${isPositive ? "text-accent" : "text-destructive"}`}>
            {change! >= 0 ? "+" : ""}{change}%
          </span>
          <span className="text-[10px] text-muted-foreground">vs prev</span>
        </div>
      )}
      {trends && <TrendIndicator trends={trends} invertColor={invertColor} />}
    </div>
  );
};

const BillyDashboard = () => {
  const { data: kpis, isLoading } = useBillyKPIs();
  const { data: ringbaByVertical, isLoading: ringbaLoading } = useRingbaByVertical();
  const { activeVertical } = useVertical();
  const verticalRingba = ringbaByVertical?.active;
  const ringba = verticalRingba ? {
    totalCalls: verticalRingba.totalCalls,
    connectedCalls: verticalRingba.connectedCalls,
    convertedCalls: verticalRingba.convertedCalls,
    totalRevenue: verticalRingba.totalRevenue,
    connectRate: verticalRingba.totalCalls > 0 ? (verticalRingba.connectedCalls / verticalRingba.totalCalls) * 100 : 0,
    conversionRate: verticalRingba.totalCalls > 0 ? (verticalRingba.convertedCalls / verticalRingba.totalCalls) * 100 : 0,
    revenuePerCall: verticalRingba.connectedCalls > 0 ? verticalRingba.totalRevenue / verticalRingba.connectedCalls : 0,
    avgDuration: verticalRingba.avgDuration,
  } : null;
  const { activeClient } = useClient();
  const [syncing, setSyncing] = useState(false);

  const totalClicks = kpis?.impressions ? Math.round((kpis.ctr / 100) * kpis.impressions) : 0;
  const visitors = totalClicks;
  const ctaClicks = ringba?.totalCalls ?? 0;
  const lpCvr = visitors > 0 ? (ctaClicks / visitors) * 100 : 0;
  const rpv = visitors > 0 ? (ringba?.totalRevenue ?? 0) / visitors : 0;

  const totalCalls = ringba?.totalCalls ?? 0;
  const connectedCalls = ringba?.connectedCalls ?? 0;
  const convertedCalls = ringba?.convertedCalls ?? 0;
  const callRevenue = ringba?.totalRevenue ?? 0;
  const connectRate = ringba?.connectRate ?? 0;
  const conversionRate = ringba?.conversionRate ?? 0;
  const revenuePerCall = ringba?.revenuePerCall ?? 0;
  const adSpend = kpis?.totalSpend ?? 0;
  const callROAS = adSpend > 0 ? callRevenue / adSpend : 0;
  const costPerCall = totalCalls > 0 ? adSpend / totalCalls : 0;

  const handleSyncRingba = async () => {
    if (!activeClient?.id) return;
    setSyncing(true);
    try {
      await syncRingbaCalls(activeClient.id, 30);
      toast.success("Ringba call data synced successfully");
    } catch (e: any) {
      toast.error("Sync failed: " + (e.message || "Unknown error"));
    } finally {
      setSyncing(false);
    }
  };

  const trends = kpis?.trends;

  return (
    <>
      {/* Revenue Engine Header */}
      <div className="mb-6 flex items-center gap-3">
        <div className="h-8 w-1 rounded-full bg-primary" />
        <div>
          <h2 className="text-lg font-bold tracking-tight">{activeVertical.emoji} {activeVertical.label} — Revenue Engine</h2>
          <p className="text-xs text-muted-foreground">4-step lead-gen funnel: Traffic → Landing Page → Call Processing → Monetization</p>
          {kpis?.activePlatforms && kpis.activePlatforms.length > 0 && (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Platforms: {kpis.activePlatforms.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(" + ")}
            </p>
          )}
        </div>
      </div>

      {/* Step 1: Traffic */}
      <Card className="mb-6 border-primary/20">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-primary" />
            <CardTitle className="text-base">Step 1 — Traffic (Media Buying)</CardTitle>
          </div>
          <p className="text-xs text-muted-foreground">Goal: Get qualified traffic cheaply</p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
            </div>
          ) : (
            <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
              <FunnelMetric label="Spend" value={`$${(kpis?.totalSpend ?? 0).toLocaleString()}`} change={kpis?.changes.spend} invertColor icon={<DollarSign className="w-3 h-3" />} trends={trends?.spend} />
              <FunnelMetric label="Clicks" value={totalClicks.toLocaleString()} trends={trends?.impressions} />
              <FunnelMetric label="CPC" value={`$${kpis?.cpc ?? 0}`} change={kpis?.changes.cpc} invertColor trends={trends?.cpc} />
              <FunnelMetric label="CTR" value={`${kpis?.ctr ?? 0}%`} change={kpis?.changes.ctr} trends={trends?.ctr} />
              <FunnelMetric label="CPM" value={`$${kpis?.cpm ?? 0}`} change={kpis?.changes.cpm} invertColor trends={trends?.cpm} />
              <FunnelMetric label="Impressions" value={(kpis?.impressions ?? 0).toLocaleString()} change={kpis?.changes.impressions} trends={trends?.impressions} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Step 2: Landing Page */}
      <Card className="mb-6 border-primary/20">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <MousePointerClick className="w-4 h-4 text-primary" />
            <CardTitle className="text-base">Step 2 — Landing Page Conversion</CardTitle>
          </div>
          <p className="text-xs text-muted-foreground">Goal: Convert visitors to intent actions</p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <FunnelMetric label="Visitors" value={visitors.toLocaleString()} />
              <FunnelMetric label="CTA Clicks" value={ctaClicks.toLocaleString()} change={kpis?.changes.conversions} trends={trends?.conversions} />
              <FunnelMetric label="LP CVR" value={`${lpCvr.toFixed(1)}%`} />
              <FunnelMetric label="RPV" value={`$${rpv.toFixed(2)}`} icon={<BarChart3 className="w-3 h-3" />} trends={trends?.revenue} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Scalability Indicator */}
      {!isLoading && (
        (() => {
          const cpcVal = Number(kpis?.cpc ?? 0);
          const marginPct = cpcVal > 0 ? ((rpv - cpcVal) / cpcVal) * 100 : 0;
          const isScalable = rpv > cpcVal * 1.25;
          const isPositive = rpv > cpcVal;

          return (
            <Card className={`mb-6 ${isScalable ? "border-accent/40 bg-accent/5" : isPositive ? "border-yellow-500/40 bg-yellow-500/5" : "border-destructive/40 bg-destructive/5"}`}>
              <CardContent className="py-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <Target className="w-5 h-5 text-primary" />
                    <div>
                      <p className="text-sm font-semibold">
                        RPV ${rpv.toFixed(2)} vs CPC ${kpis?.cpc ?? 0} — Margin: {marginPct > 0 ? "+" : ""}{marginPct.toFixed(0)}%
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {isScalable
                          ? "25%+ margin — room to scale aggressively"
                          : isPositive
                            ? "Positive but thin margin — optimize before scaling"
                            : "Negative margin — every visitor costs more than they generate"}
                      </p>
                    </div>
                  </div>
                  <span className={`text-sm font-bold font-mono ${isScalable ? "text-accent" : isPositive ? "text-yellow-500" : "text-destructive"}`}>
                    {isScalable ? "✓ SCALABLE" : isPositive ? "⚠ MARGINAL" : "✗ NOT SCALABLE"}
                  </span>
                </div>
                <div className="flex gap-6 text-xs text-muted-foreground border-t border-border/50 pt-2 mt-1">
                  <span><strong>RPV/CPC</strong> = Revenue per visitor vs cost per click — measures scalability headroom</span>
                  <span><strong>ROAS</strong> = Total revenue ÷ total ad spend — measures overall profitability</span>
                </div>
              </CardContent>
            </Card>
          );
        })()
      )}

      {/* Step 3 — Call Processing */}
      <Card className="mb-6 border-primary/20">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Phone className="w-4 h-4 text-primary" />
              <CardTitle className="text-base">Step 3 — Call Processing (Ringba)</CardTitle>
            </div>
            <Button variant="outline" size="sm" onClick={handleSyncRingba} disabled={syncing} className="gap-1.5">
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Syncing..." : "Sync Calls"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Goal: Connect and convert inbound calls from ads</p>
        </CardHeader>
        <CardContent>
          {ringbaLoading ? (
            <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
            </div>
          ) : (
            <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
              <FunnelMetric label="Total Calls" value={totalCalls.toLocaleString()} icon={<Phone className="w-3 h-3" />} />
              <FunnelMetric label="Connected" value={connectedCalls.toLocaleString()} icon={<PhoneCall className="w-3 h-3" />} />
              <FunnelMetric label="Connect Rate" value={`${connectRate.toFixed(1)}%`} />
              <FunnelMetric label="Converted" value={convertedCalls.toLocaleString()} />
              <FunnelMetric label="Conv. Rate" value={`${conversionRate.toFixed(1)}%`} />
              <FunnelMetric label="Avg Duration" value={`${Math.round(ringba?.avgDuration ?? 0)}s`} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Step 4 — Monetization */}
      <Card className="mb-6 border-primary/20">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            <CardTitle className="text-base">Step 4 — Monetization (Call Revenue)</CardTitle>
          </div>
          <p className="text-xs text-muted-foreground">Goal: Maximize revenue per connected call</p>
        </CardHeader>
        <CardContent>
          {ringbaLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <FunnelMetric label="Call Revenue" value={`$${callRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}`} icon={<DollarSign className="w-3 h-3" />} trends={trends?.revenue} />
              <FunnelMetric label="Rev/Connected Call" value={`$${revenuePerCall.toFixed(2)}`} />
              <FunnelMetric label="Cost/Call" value={`$${costPerCall.toFixed(2)}`} invertColor />
              <FunnelMetric label="Call ROAS" value={`${callROAS.toFixed(2)}x`} trends={trends?.roas} />
              <FunnelMetric label="Net Profit" value={`$${(callRevenue - adSpend).toLocaleString(undefined, { minimumFractionDigits: 2 })}`} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Call ROAS Scalability Indicator */}
      {!ringbaLoading && totalCalls > 0 && (
        <Card className={`mb-6 ${callROAS > 1 ? "border-accent/40 bg-accent/5" : "border-destructive/40 bg-destructive/5"}`}>
          <CardContent className="py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Target className="w-5 h-5 text-primary" />
              <div>
                <p className="text-sm font-semibold">
                  Call ROAS: {callROAS.toFixed(2)}x — Ad Spend ${adSpend.toLocaleString()} → Call Revenue ${callRevenue.toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground">
                  Revenue per Connected Call: ${revenuePerCall.toFixed(2)} | Cost per Call: ${costPerCall.toFixed(2)}
                </p>
              </div>
            </div>
            <span className={`text-sm font-bold font-mono ${callROAS > 1 ? "text-accent" : "text-destructive"}`}>
              {callROAS > 1 ? "✓ PROFITABLE" : "✗ UNPROFITABLE"}
            </span>
          </CardContent>
        </Card>
      )}

      {/* Forecast & Recommendations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <FlightsForecastCard />
        <FlightsRecommendations />
      </div>
    </>
  );
};

export default BillyDashboard;
