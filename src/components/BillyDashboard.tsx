import { useBillyKPIs, useBillyTopCampaigns } from "@/hooks/useBillyKPIs";
import { useRingbaData, syncRingbaCalls } from "@/hooks/useRingbaData";
import { useClient } from "@/contexts/ClientContext";
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
}

const FunnelMetric = ({ label, value, change, invertColor, icon }: FunnelMetricProps) => {
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
        </div>
      )}
    </div>
  );
};

interface CampaignFunnelRowProps {
  name: string;
  spend: number;
  clicks: number;
  impressions: number;
  conversions: number;
  revenue: number;
}

const CampaignFunnelRow = ({ name, spend, clicks, impressions, conversions, revenue }: CampaignFunnelRowProps) => {
  const cpc = clicks > 0 ? spend / clicks : 0;
  const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
  const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;

  // Step 2: Landing Page — using conversions as "CTA Clicks" proxy
  const visitors = clicks;
  const ctaClicks = conversions;
  const lpCvr = visitors > 0 ? (ctaClicks / visitors) * 100 : 0;

  // Derived metrics
  const rpv = visitors > 0 ? revenue / visitors : 0;
  const maxCpc = rpv; // If RPV > CPC, we can scale

  return (
    <Card className="border-border/50 bg-card/50">
      <CardHeader className="pb-3 pt-4 px-5">
        <CardTitle className="text-sm font-semibold truncate">{name}</CardTitle>
      </CardHeader>
      <CardContent className="px-5 pb-4">
        <div className="grid grid-cols-2 gap-x-8 gap-y-4">
          {/* Step 1: Traffic */}
          <div className="space-y-3">
            <div className="flex items-center gap-1.5 pb-1 border-b border-border/50">
              <Eye className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-semibold text-primary uppercase tracking-wider">Step 1 — Traffic</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FunnelMetric label="Spend" value={`$${spend.toLocaleString()}`} />
              <FunnelMetric label="Clicks" value={clicks.toLocaleString()} />
              <FunnelMetric label="CPC" value={`$${cpc.toFixed(2)}`} invertColor />
              <FunnelMetric label="CTR" value={`${ctr.toFixed(1)}%`} />
              <FunnelMetric label="CPM" value={`$${cpm.toFixed(2)}`} invertColor />
              <FunnelMetric label="Impressions" value={impressions.toLocaleString()} />
            </div>
          </div>

          {/* Step 2: Landing Page */}
          <div className="space-y-3">
            <div className="flex items-center gap-1.5 pb-1 border-b border-border/50">
              <MousePointerClick className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-semibold text-primary uppercase tracking-wider">Step 2 — Landing Page</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FunnelMetric label="Visitors" value={visitors.toLocaleString()} />
              <FunnelMetric label="CTA Clicks" value={ctaClicks.toLocaleString()} />
              <FunnelMetric label="LP CVR" value={`${lpCvr.toFixed(1)}%`} />
              <FunnelMetric label="RPV" value={`$${rpv.toFixed(2)}`} />
            </div>
          </div>
        </div>

        {/* Key Metric Bar */}
        <div className="mt-4 pt-3 border-t border-border/50 flex items-center gap-6">
          <div className="flex items-center gap-2">
            <Target className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs text-muted-foreground font-medium">Max CPC (RPV):</span>
            <span className={`text-sm font-bold font-mono ${rpv > cpc ? "text-accent" : "text-destructive"}`}>
              ${maxCpc.toFixed(2)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <DollarSign className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs text-muted-foreground font-medium">CPC vs RPV:</span>
            <span className={`text-sm font-bold font-mono ${rpv > cpc ? "text-accent" : "text-destructive"}`}>
              {rpv > cpc ? "✓ Scalable" : "✗ Not Scalable"}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const BillyDashboard = () => {
  const { data: kpis, isLoading } = useBillyKPIs();
  const { data: campaigns, isLoading: campaignsLoading } = useBillyTopCampaigns();
  const { data: ringba, isLoading: ringbaLoading } = useRingbaData();
  const { activeClient } = useClient();
  const [syncing, setSyncing] = useState(false);

  const totalClicks = kpis?.impressions ? Math.round((kpis.ctr / 100) * kpis.impressions) : 0;
  const visitors = totalClicks;
  const ctaClicks = kpis?.totalConversions ?? 0;
  const lpCvr = visitors > 0 ? (ctaClicks / visitors) * 100 : 0;
  const rpv = visitors > 0 ? (ringba?.totalRevenue ?? 0) / visitors : 0;

  // Ringba-derived metrics
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

  return (
    <>
      {/* Aggregate KPI Row — Step 1: Traffic */}
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
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
            </div>
          ) : (
            <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
              <FunnelMetric label="Spend" value={`$${(kpis?.totalSpend ?? 0).toLocaleString()}`} change={kpis?.changes.spend} invertColor icon={<DollarSign className="w-3 h-3" />} />
              <FunnelMetric label="Clicks" value={totalClicks.toLocaleString()} />
              <FunnelMetric label="CPC" value={`$${kpis?.cpc ?? 0}`} change={kpis?.changes.cpc} invertColor />
              <FunnelMetric label="CTR" value={`${kpis?.ctr ?? 0}%`} change={kpis?.changes.ctr} />
              <FunnelMetric label="CPM" value={`$${kpis?.cpm ?? 0}`} change={kpis?.changes.cpm} invertColor />
              <FunnelMetric label="Impressions" value={(kpis?.impressions ?? 0).toLocaleString()} change={kpis?.changes.impressions} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Aggregate KPI Row — Step 2: Landing Page */}
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
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <FunnelMetric label="Visitors" value={visitors.toLocaleString()} />
              <FunnelMetric label="CTA Clicks" value={ctaClicks.toLocaleString()} change={kpis?.changes.conversions} />
              <FunnelMetric label="LP CVR" value={`${lpCvr.toFixed(1)}%`} />
              <FunnelMetric label="RPV" value={`$${rpv.toFixed(2)}`} icon={<BarChart3 className="w-3 h-3" />} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Scalability Indicator */}
      {!isLoading && (
        <Card className={`mb-6 ${rpv > (kpis?.cpc ?? 0) ? "border-accent/40 bg-accent/5" : "border-destructive/40 bg-destructive/5"}`}>
          <CardContent className="py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Target className="w-5 h-5 text-primary" />
              <div>
                <p className="text-sm font-semibold">
                  RPV ${rpv.toFixed(2)} vs CPC ${kpis?.cpc ?? 0}
                </p>
                <p className="text-xs text-muted-foreground">
                  Max CPC (RPV): ${rpv.toFixed(2)} — {rpv > (kpis?.cpc ?? 0) ? "Room to scale" : "Optimize before scaling"}
                </p>
              </div>
            </div>
            <span className={`text-sm font-bold font-mono ${rpv > (kpis?.cpc ?? 0) ? "text-accent" : "text-destructive"}`}>
              {rpv > (kpis?.cpc ?? 0) ? "✓ SCALABLE" : "✗ NOT SCALABLE"}
            </span>
          </CardContent>
        </Card>
      )}

      {/* Step 3 — Call Processing (Ringba) */}
      <Card className="mb-6 border-primary/20">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Phone className="w-4 h-4 text-primary" />
              <CardTitle className="text-base">Step 3 — Call Processing (Ringba)</CardTitle>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSyncRingba}
              disabled={syncing}
              className="gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Syncing..." : "Sync Calls"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Goal: Connect and convert inbound calls from Meta ads</p>
        </CardHeader>
        <CardContent>
          {ringbaLoading ? (
            <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
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

      {/* Step 4 — Monetization (Ringba Revenue) */}
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
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <FunnelMetric label="Call Revenue" value={`$${callRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}`} icon={<DollarSign className="w-3 h-3" />} />
              <FunnelMetric label="Rev/Connected Call" value={`$${revenuePerCall.toFixed(2)}`} />
              <FunnelMetric label="Cost/Call" value={`$${costPerCall.toFixed(2)}`} invertColor />
              <FunnelMetric label="Call ROAS" value={`${callROAS.toFixed(2)}x`} />
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
              {callROAS > 1 ? "✓ PROFITABLE" : "✗ NOT PROFITABLE"}
            </span>
          </CardContent>
        </Card>
      )}

      {/* Per-Campaign Funnel Breakdown */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Per Campaign Breakdown</h3>
        {campaignsLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-64 rounded-xl" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(campaigns || []).map((c) => (
              <CampaignFunnelRow
                key={c.name}
                name={c.name}
                spend={c.spend}
                clicks={c.clicks}
                impressions={c.impressions}
                conversions={c.conversions}
                revenue={c.revenue}
              />
            ))}
            {(!campaigns || campaigns.length === 0) && (
              <Card className="col-span-2 border-dashed">
                <CardContent className="py-12 text-center text-muted-foreground">
                  No campaign data yet. Connect the Billy.com Meta ad account in Settings to begin syncing.
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </>
  );
};

export default BillyDashboard;
