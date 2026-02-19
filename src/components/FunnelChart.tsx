import { useKPIs } from "@/hooks/useAdData";
import { Skeleton } from "@/components/ui/skeleton";

interface FunnelStep {
  label: string;
  value: number;
  formatted: string;
}

const FunnelChart = () => {
  const { data: kpis, isLoading } = useKPIs();

  if (isLoading) {
    return <Skeleton className="h-[260px] rounded-xl" />;
  }

  if (!kpis || kpis.impressions === 0) {
    return (
      <div className="glass-card p-6">
        <h3 className="text-lg font-semibold mb-4">Conversion Funnel</h3>
        <p className="text-sm text-muted-foreground">No funnel data available yet.</p>
      </div>
    );
  }

  const clicks = Math.round(kpis.impressions * (kpis.ctr / 100));
  const steps: FunnelStep[] = [
    { label: "Impressions", value: kpis.impressions, formatted: kpis.impressions > 1_000_000 ? `${(kpis.impressions / 1_000_000).toFixed(1)}M` : kpis.impressions.toLocaleString() },
    { label: "Clicks", value: clicks, formatted: clicks.toLocaleString() },
    { label: "Conversions", value: kpis.totalConversions, formatted: kpis.totalConversions.toLocaleString() },
    { label: "Revenue", value: kpis.totalRevenue, formatted: `$${kpis.totalRevenue.toLocaleString()}` },
  ];

  const maxValue = steps[0].value;

  return (
    <div className="glass-card p-6">
      <h3 className="text-lg font-semibold mb-5">Conversion Funnel</h3>
      <div className="space-y-3">
        {steps.map((step, i) => {
          const widthPct = maxValue > 0 ? Math.max((step.value / maxValue) * 100, 8) : 8;
          const dropOff = i > 0 && steps[i - 1].value > 0
            ? ((1 - step.value / steps[i - 1].value) * 100).toFixed(1)
            : null;

          return (
            <div key={step.label} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground font-medium">{step.label}</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-semibold">{step.formatted}</span>
                  {dropOff && (
                    <span className="text-xs text-destructive font-medium">
                      −{dropOff}%
                    </span>
                  )}
                </div>
              </div>
              <div className="h-8 bg-secondary/50 rounded-lg overflow-hidden relative">
                <div
                  className="h-full rounded-lg transition-all duration-700 ease-out"
                  style={{
                    width: `${widthPct}%`,
                    background: i === 0
                      ? "hsl(var(--primary))"
                      : i === 1
                      ? "hsl(var(--primary) / 0.75)"
                      : i === 2
                      ? "hsl(var(--accent) / 0.85)"
                      : "hsl(var(--accent))",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Rate summary */}
      <div className="grid grid-cols-3 gap-3 mt-5 pt-4 border-t border-border/50">
        <RatePill label="CTR" value={`${kpis.ctr}%`} />
        <RatePill label="CVR" value={clicks > 0 ? `${((kpis.totalConversions / clicks) * 100).toFixed(2)}%` : "0%"} />
        <RatePill label="CPA" value={kpis.totalConversions > 0 ? `$${Math.round(kpis.totalSpend / kpis.totalConversions)}` : "N/A"} />
      </div>
    </div>
  );
};

function RatePill({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center bg-secondary/40 rounded-lg py-2">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="text-sm font-mono font-semibold mt-0.5">{value}</p>
    </div>
  );
}

export default FunnelChart;
