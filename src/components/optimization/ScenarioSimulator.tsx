import { useState } from "react";
import { SpendScenario, EfficiencyScenario, BaselineForecast } from "@/hooks/useOptimizationEngine";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendingUp, TrendingDown, DollarSign, Zap, Users, ShoppingCart } from "lucide-react";

interface Props {
  baseline: BaselineForecast;
  spendScenarios: SpendScenario[];
  efficiencyScenarios: EfficiencyScenario[];
  onRunScenario?: (params: any) => void;
  isRunning?: boolean;
}

const ScenarioSimulator = ({ baseline, spendScenarios, efficiencyScenarios, onRunScenario, isRunning }: Props) => {
  const [customSpend, setCustomSpend] = useState(0);

  const transactionLabel = spendScenarios[0]?.transaction_label || baseline.transaction_label || "Subscribers";
  const TransactionIcon = transactionLabel === "Purchases" ? ShoppingCart : Users;

  const customScenario = customSpend !== 0 ? {
    spend_change_pct: customSpend,
    projected_spend: Math.round(baseline.projected_spend * (1 + customSpend / 100)),
    projected_revenue: Math.round(baseline.projected_revenue * Math.pow(1 + customSpend / 100, 0.7)),
    delta_revenue: Math.round(baseline.projected_revenue * (Math.pow(1 + customSpend / 100, 0.7) - 1)),
    delta_revenue_pct: Math.round((Math.pow(1 + customSpend / 100, 0.7) - 1) * 1000) / 10,
    projected_transactions: Math.round(baseline.projected_transactions * Math.pow(1 + customSpend / 100, 0.7)),
  } : null;

  return (
    <div className="glass-card p-6">
      <h3 className="text-lg font-semibold flex items-center gap-2 mb-5">
        <Zap className="w-5 h-5 text-primary" />
        Scenario Simulator
      </h3>

      <Tabs defaultValue="spend" className="w-full">
        <TabsList className="bg-secondary/50 mb-4">
          <TabsTrigger value="spend" className="gap-1.5 text-xs">
            <DollarSign className="w-3.5 h-3.5" />
            Spend Adjustment
          </TabsTrigger>
          <TabsTrigger value="efficiency" className="gap-1.5 text-xs">
            <TrendingUp className="w-3.5 h-3.5" />
            Efficiency
          </TabsTrigger>
        </TabsList>

        <TabsContent value="spend">
          {/* Preset scenarios */}
          <div className="grid grid-cols-3 gap-3 mb-5">
            {spendScenarios.map((s) => (
              <div
                key={s.spend_change_pct}
                className={`rounded-lg p-3 border transition-colors ${
                  s.delta_revenue > 0 ? "bg-green-500/5 border-green-500/20" : "bg-red-500/5 border-red-500/20"
                }`}
              >
                <div className="flex items-center gap-1 text-xs font-medium mb-2">
                  {s.spend_change_pct > 0 ? (
                    <TrendingUp className="w-3 h-3 text-green-500" />
                  ) : (
                    <TrendingDown className="w-3 h-3 text-red-500" />
                  )}
                  {s.spend_change_pct > 0 ? "+" : ""}{s.spend_change_pct}% Spend
                </div>
                <p className="text-sm font-bold font-mono mb-1">${s.projected_revenue.toLocaleString()}</p>
                <p className={`text-xs font-mono ${s.delta_revenue > 0 ? "text-green-500" : "text-red-500"}`}>
                  {s.delta_revenue > 0 ? "+" : ""}{s.delta_revenue_pct}% rev
                </p>
                <div className="mt-2 grid grid-cols-2 gap-1 text-[10px] text-muted-foreground">
                  <span>CPA: ${s.projected_cpa}</span>
                  <span>MER: {s.projected_mer}x</span>
                </div>
                <div className="mt-1.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                  <TransactionIcon className="w-3 h-3" />
                  <span>{s.projected_transactions} {transactionLabel}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Custom slider */}
          <div className="bg-secondary/30 rounded-lg p-4">
            <div className="flex justify-between text-xs text-muted-foreground mb-3">
              <span>Custom Spend Change</span>
              <span className="font-mono font-bold text-foreground">
                {customSpend > 0 ? "+" : ""}{customSpend}%
              </span>
            </div>
            <Slider
              value={[customSpend]}
              onValueChange={([v]) => setCustomSpend(v)}
              min={-50}
              max={100}
              step={5}
              className="mb-3"
            />
            {customScenario && (
              <div className="flex items-center gap-4 text-xs flex-wrap">
                <span className="text-muted-foreground">
                  Spend: <span className="font-mono text-foreground">${customScenario.projected_spend.toLocaleString()}</span>
                </span>
                <span className="text-muted-foreground">
                  Revenue: <span className="font-mono text-foreground">${customScenario.projected_revenue.toLocaleString()}</span>
                </span>
                <span className="text-muted-foreground flex items-center gap-1">
                  <TransactionIcon className="w-3 h-3" />
                  <span className="font-mono text-foreground">{customScenario.projected_transactions}</span> {transactionLabel}
                </span>
                <span className={`font-mono ${customScenario.delta_revenue > 0 ? "text-green-500" : "text-red-500"}`}>
                  {customScenario.delta_revenue > 0 ? "+" : ""}{customScenario.delta_revenue_pct}%
                </span>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="efficiency">
          <div className="space-y-3">
            {efficiencyScenarios.map((s) => (
              <div key={s.metric} className="bg-secondary/30 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium">{s.metric}</span>
                    <span className="text-xs text-muted-foreground">
                      {s.improvement_pct > 0 ? "+" : ""}{s.improvement_pct}% improvement
                    </span>
                  </div>
                  <span className={`text-xs font-mono font-bold ${s.delta_revenue > 0 ? "text-green-500" : "text-red-500"}`}>
                    {s.delta_revenue > 0 ? "+" : ""}${s.delta_revenue.toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
                  <span>Projected Revenue: <span className="font-mono">${s.projected_revenue.toLocaleString()}</span></span>
                  <span>Sensitivity: <span className="font-mono">{s.sensitivity_score}</span></span>
                  {s.break_even_lift > 0 && <span>Break-even lift: <span className="font-mono">{s.break_even_lift}%</span></span>}
                </div>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ScenarioSimulator;
