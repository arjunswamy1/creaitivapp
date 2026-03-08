import { useForecast } from "@/hooks/useAdData";
import { useClient } from "@/contexts/ClientContext";
import { Skeleton } from "@/components/ui/skeleton";
import { DollarSign, Target, Sparkles, CalendarDays, Users, TrendingUp, TrendingDown } from "lucide-react";
import { Progress } from "@/components/ui/progress";

const ForecastCard = () => {
  const { data: forecast, isLoading, error } = useForecast();
  const { dashboardConfig } = useClient();
  const revenueSource = dashboardConfig?.revenue_source || "subbly";
  const subsLabel = revenueSource === "shopify" ? "Customers" : "Subs";
  const isShopify = revenueSource === "shopify";

  if (error) {
    return (
      <div className="glass-card p-6">
        <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Target className="w-5 h-5 text-primary" />
          Monthly Forecast
        </h3>
        <p className="text-sm text-muted-foreground">Not enough data to generate forecast. Sync more data first.</p>
      </div>
    );
  }

  if (isLoading) {
    return <Skeleton className="h-[320px] rounded-xl" />;
  }

  if (!forecast) return null;

  const monthProgress = forecast.total_days > 0
    ? Math.round(((forecast.completed_days || forecast.days_elapsed - 1) / forecast.total_days) * 100)
    : 0;

  const profitIsPositive = (forecast.month_total_profit || 0) >= 0;

  return (
    <div className="glass-card p-6">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Target className="w-5 h-5 text-primary" />
          {forecast.month} Forecast
        </h3>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <CalendarDays className="w-3.5 h-3.5" />
          Day {forecast.days_elapsed} of {forecast.total_days}
        </div>
      </div>

      {/* Month progress */}
      <div className="mb-5">
        <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
          <span>Month Progress</span>
          <span>{monthProgress}%</span>
        </div>
        <Progress value={monthProgress} className="h-2" />
      </div>

      {/* Profit Hero Section - Shopify only */}
      {isShopify && forecast.actual_profit !== undefined && (
        <div className="grid grid-cols-2 gap-4 mb-5">
          <div className="bg-secondary/40 rounded-lg p-4">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              {forecast.actual_profit >= 0 ? <TrendingUp className="w-3.5 h-3.5 text-green-500" /> : <TrendingDown className="w-3.5 h-3.5 text-red-500" />}
              MTD Profit
            </div>
            <p className={`text-xl font-bold font-mono ${forecast.actual_profit >= 0 ? "text-green-500" : "text-red-500"}`}>
              ${Math.abs(forecast.actual_profit).toLocaleString()}
              {forecast.actual_profit < 0 && <span className="text-xs ml-1">loss</span>}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Rev ${Math.round(forecast.actual_revenue || 0).toLocaleString()} − Costs ${Math.round((forecast.actual_spend || 0) + (forecast.actual_cogs || 0) + (forecast.actual_taxes_shipping || 0) + (forecast.actual_discounts || 0)).toLocaleString()}
            </p>
          </div>
          <div className={`rounded-lg p-4 border ${profitIsPositive ? "bg-green-500/10 border-green-500/20" : "bg-red-500/10 border-red-500/20"}`}>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              {profitIsPositive ? <TrendingUp className="w-3.5 h-3.5 text-green-500" /> : <TrendingDown className="w-3.5 h-3.5 text-red-500" />}
              Projected Month Profit
            </div>
            <p className={`text-xl font-bold font-mono ${profitIsPositive ? "text-green-500" : "text-red-500"}`}>
              ${Math.abs(forecast.month_total_profit || 0).toLocaleString()}
              {!profitIsPositive && <span className="text-xs ml-1">loss</span>}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Rev ${Math.round(forecast.month_total_revenue || 0).toLocaleString()} − Costs ${Math.round((forecast.month_total_spend || 0) + (forecast.month_total_cogs || 0) + (forecast.month_total_taxes_shipping || 0) + (forecast.month_total_discounts || 0)).toLocaleString()}
            </p>
          </div>
        </div>
      )}

      {/* Profit Breakdown - Shopify only */}
      {isShopify && forecast.month_total_revenue !== undefined && (
        <div className="grid grid-cols-5 gap-2 mb-5">
          <BreakdownItem label="Revenue" value={forecast.month_total_revenue} positive />
          <BreakdownItem label="Ad Spend" value={forecast.month_total_spend} />
          <BreakdownItem label="COGS" value={forecast.month_total_cogs} />
          <BreakdownItem label="Tax/Ship" value={forecast.month_total_taxes_shipping} />
          <BreakdownItem label="Discounts" value={forecast.month_total_discounts} />
        </div>
      )}

      {/* Actuals vs Projected */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
        <MetricCard
          icon={<Users className="w-3.5 h-3.5" />}
          label={`MTD New ${subsLabel}`}
          value={forecast.actual_subs}
          sublabel={`${forecast.avg_daily_subs}/day avg`}
        />
        <MetricCard
          icon={<Users className="w-3.5 h-3.5" />}
          label={`Projected Month ${subsLabel}`}
          value={forecast.month_total_subs}
          sublabel={`+${forecast.projected_remaining_subs} remaining`}
          highlight
        />
        <MetricCard
          icon={<DollarSign className="w-3.5 h-3.5" />}
          label="MTD CAC"
          value={`$${forecast.actual_cac}`}
          sublabel={`$${forecast.actual_spend?.toLocaleString()} spend`}
        />
        <MetricCard
          icon={<DollarSign className="w-3.5 h-3.5" />}
          label="Projected Month CAC"
          value={`$${forecast.month_cac}`}
          sublabel={`$${forecast.month_total_spend?.toLocaleString()} spend`}
          highlight
        />
      </div>

      {/* Spend summary */}
      <div className="grid grid-cols-3 gap-4 mb-5">
        <div className="bg-secondary/40 rounded-lg p-3">
          <p className="text-xs text-muted-foreground mb-1">MTD Spend</p>
          <p className="text-base font-bold font-mono">${forecast.actual_spend?.toLocaleString()}</p>
        </div>
        <div className="bg-secondary/40 rounded-lg p-3">
          <p className="text-xs text-muted-foreground mb-1">Avg Daily Spend</p>
          <p className="text-base font-bold font-mono">${forecast.avg_daily_spend?.toLocaleString()}</p>
        </div>
        <div className="bg-primary/10 rounded-lg p-3 border border-primary/20">
          <p className="text-xs text-muted-foreground mb-1">Projected Month Spend</p>
          <p className="text-base font-bold font-mono text-primary">${forecast.month_total_spend?.toLocaleString()}</p>
        </div>
      </div>

      {/* AI Insight */}
      {forecast.ai_insight && (
        <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-primary mb-2">
            <Sparkles className="w-3.5 h-3.5" />
            AI Insight
          </div>
          <p className="text-sm text-foreground/80 leading-relaxed">{forecast.ai_insight}</p>
        </div>
      )}
    </div>
  );
};

function BreakdownItem({ label, value, positive }: { label: string; value: number; positive?: boolean }) {
  return (
    <div className="bg-secondary/30 rounded-lg p-2 text-center">
      <p className="text-[10px] text-muted-foreground mb-0.5">{label}</p>
      <p className={`text-sm font-bold font-mono ${positive ? "text-green-500" : ""}`}>
        {positive ? "" : "−"}${Math.round(Math.abs(value || 0)).toLocaleString()}
      </p>
    </div>
  );
}

function MetricCard({ icon, label, value, sublabel, highlight }: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sublabel?: string;
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-lg p-3 ${highlight ? "bg-primary/10 border border-primary/20" : "bg-secondary/40"}`}>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
        {icon}
        {label}
      </div>
      <p className={`text-lg font-bold font-mono ${highlight ? "text-primary" : ""}`}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
      {sublabel && (
        <p className="text-xs text-muted-foreground mt-0.5">{sublabel}</p>
      )}
    </div>
  );
}

export default ForecastCard;