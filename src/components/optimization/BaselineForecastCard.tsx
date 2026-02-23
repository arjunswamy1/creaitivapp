import { BaselineForecast, RiskAssessment, ProfitBreakdown } from "@/hooks/useOptimizationEngine";
import { TrendingUp, DollarSign, Target, Shield, BarChart3, ShoppingCart, Users, Minus } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface Props {
  baseline: BaselineForecast;
  risk: RiskAssessment;
}

const BaselineForecastCard = ({ baseline, risk }: Props) => {
  const riskColor = risk.risk_level === "Low" ? "text-green-500" : risk.risk_level === "Medium" ? "text-yellow-500" : "text-red-500";
  const riskBg = risk.risk_level === "Low" ? "bg-green-500/10 border-green-500/20" : risk.risk_level === "Medium" ? "bg-yellow-500/10 border-yellow-500/20" : "bg-red-500/10 border-red-500/20";

  const monthLabel = baseline.forecast_month || "30-Day";
  const monthProgress = baseline.days_in_month > 0
    ? Math.round((baseline.days_elapsed / baseline.days_in_month) * 100)
    : 0;

  return (
    <div className="glass-card p-6">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Target className="w-5 h-5 text-primary" />
          {monthLabel} Forecast
        </h3>
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${riskBg} ${riskColor}`}>
          <Shield className="w-3 h-3" />
          {risk.risk_level} Risk
        </div>
      </div>

      {/* Profit Hero (Shopify) or standard metrics */}
      {baseline.profit_breakdown ? (
        <ProfitHeroSection breakdown={baseline.profit_breakdown} transactionLabel={baseline.transaction_label} projectedTransactions={baseline.projected_transactions} projectedCPA={baseline.projected_cpa} projectedMER={baseline.projected_mer} />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-5">
          <MetricTile
            icon={<DollarSign className="w-4 h-4" />}
            label="Projected Revenue"
            value={`$${baseline.projected_revenue.toLocaleString()}`}
          />
          <MetricTile
            icon={<DollarSign className="w-4 h-4" />}
            label="Projected Spend"
            value={`$${baseline.projected_spend.toLocaleString()}`}
          />
          <MetricTile
            icon={baseline.transaction_label === "Purchases" ? <ShoppingCart className="w-4 h-4" /> : <Users className="w-4 h-4" />}
            label={`Projected ${baseline.transaction_label}`}
            value={baseline.projected_transactions.toLocaleString()}
            highlight
          />
          <MetricTile
            icon={<Target className="w-4 h-4" />}
            label="Projected CPA"
            value={`$${baseline.projected_cpa}`}
          />
          <MetricTile
            icon={<TrendingUp className="w-4 h-4" />}
            label="Projected MER"
            value={`${baseline.projected_mer}x`}
            highlight={baseline.projected_mer > 1}
          />
        </div>
      )}

      {/* Month Progress */}
      {baseline.days_in_month > 0 && (
        <div className="mb-5">
          <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
            <span>Day {baseline.days_elapsed} of {baseline.days_in_month} ({baseline.days_remaining} days remaining)</span>
            <span>{monthProgress}%</span>
          </div>
          <Progress value={monthProgress} className="h-2" />
        </div>
      )}

      {/* Daily averages */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        <div className="bg-secondary/40 rounded-lg p-3">
          <p className="text-xs text-muted-foreground mb-1">Avg Daily Spend</p>
          <p className="text-base font-bold font-mono">${baseline.avg_daily_spend.toLocaleString()}</p>
        </div>
        <div className="bg-secondary/40 rounded-lg p-3">
          <p className="text-xs text-muted-foreground mb-1">Avg Daily Revenue</p>
          <p className="text-base font-bold font-mono">${baseline.avg_daily_revenue.toLocaleString()}</p>
        </div>
        <div className="bg-secondary/40 rounded-lg p-3">
          <p className="text-xs text-muted-foreground mb-1">Avg Daily Conversions</p>
          <p className="text-base font-bold font-mono">{baseline.avg_daily_conversions}</p>
        </div>
        <div className="bg-secondary/40 rounded-lg p-3">
          <p className="text-xs text-muted-foreground mb-1">Avg Daily {baseline.transaction_label}</p>
          <p className="text-base font-bold font-mono">{baseline.avg_daily_transactions}</p>
        </div>
      </div>

      {/* Confidence Score */}
      <div>
        <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
          <span className="flex items-center gap-1">
            <BarChart3 className="w-3 h-3" />
            Confidence Score
          </span>
          <span>{Math.round(baseline.confidence_score * 100)}%</span>
        </div>
        <Progress value={baseline.confidence_score * 100} className="h-2" />
      </div>

      {/* Risk Factors */}
      <div className="grid grid-cols-4 gap-2 mt-4">
        {Object.entries(risk.factors).map(([key, value]) => (
          <div key={key} className="text-center">
            <p className="text-[10px] text-muted-foreground mb-0.5">{key.replace(/_/g, " ")}</p>
            <p className="text-xs font-bold font-mono">{Math.round(value * 100)}%</p>
          </div>
        ))}
      </div>
    </div>
  );
};

function MetricTile({ icon, label, value, highlight }: { icon: React.ReactNode; label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg p-3 ${highlight ? "bg-primary/10 border border-primary/20" : "bg-secondary/40"}`}>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">{icon}{label}</div>
      <p className={`text-lg font-bold font-mono ${highlight ? "text-primary" : ""}`}>{value}</p>
    </div>
  );
}

function ProfitHeroSection({ breakdown, transactionLabel, projectedTransactions, projectedCPA, projectedMER }: {
  breakdown: ProfitBreakdown;
  transactionLabel: string;
  projectedTransactions: number;
  projectedCPA: number;
  projectedMER: number;
}) {
  const isProfit = breakdown.projected_profit >= 0;
  return (
    <div className="mb-5 space-y-4">
      {/* Profit Hero Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <MetricTile icon={<DollarSign className="w-4 h-4" />} label="Revenue" value={`$${breakdown.projected_revenue.toLocaleString()}`} />
        <MetricTile icon={<Minus className="w-4 h-4" />} label="Ad Spend" value={`$${breakdown.projected_ad_spend.toLocaleString()}`} />
        <MetricTile icon={<Minus className="w-4 h-4" />} label="COGS" value={`$${breakdown.projected_cogs.toLocaleString()}`} />
        <MetricTile icon={<Minus className="w-4 h-4" />} label="Tax + Shipping" value={`$${breakdown.projected_tax_shipping.toLocaleString()}`} />
        <MetricTile icon={<Minus className="w-4 h-4" />} label="Discounts" value={`$${breakdown.projected_discounts.toLocaleString()}`} />
      </div>
      {/* Profit Result + Secondary Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricTile
          icon={<DollarSign className="w-4 h-4" />}
          label="Projected Profit"
          value={`${isProfit ? "" : "-"}$${Math.abs(breakdown.projected_profit).toLocaleString()}`}
          highlight
        />
        <MetricTile
          icon={<ShoppingCart className="w-4 h-4" />}
          label={`Projected ${transactionLabel}`}
          value={projectedTransactions.toLocaleString()}
        />
        <MetricTile icon={<Target className="w-4 h-4" />} label="Projected CPA" value={`$${projectedCPA}`} />
        <MetricTile icon={<TrendingUp className="w-4 h-4" />} label="Projected MER" value={`${projectedMER}x`} highlight={projectedMER > 1} />
      </div>
    </div>
  );
}

export default BaselineForecastCard;
