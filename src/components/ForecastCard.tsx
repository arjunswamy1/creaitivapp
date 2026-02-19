import { useForecast } from "@/hooks/useAdData";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, DollarSign, ShoppingCart, Target, Sparkles, CalendarDays } from "lucide-react";
import { Progress } from "@/components/ui/progress";

const ForecastCard = () => {
  const { data: forecast, isLoading, error } = useForecast();

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
    ? Math.round((forecast.days_elapsed / forecast.total_days) * 100)
    : 0;

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

      {/* Actuals vs Projected */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
        <MetricCard
          icon={<ShoppingCart className="w-3.5 h-3.5" />}
          label="MTD Purchases"
          value={forecast.actual_purchases}
          sublabel={`${forecast.avg_daily_purchases}/day avg`}
        />
        <MetricCard
          icon={<ShoppingCart className="w-3.5 h-3.5" />}
          label="Projected Month Total"
          value={forecast.month_total_purchases}
          sublabel={`+${forecast.projected_remaining_purchases} remaining`}
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
          sublabel={`${forecast.month_roas}x ROAS`}
          highlight
        />
      </div>

      {/* Spend & Revenue summary */}
      <div className="grid grid-cols-3 gap-4 mb-5">
        <div className="bg-secondary/40 rounded-lg p-3">
          <p className="text-xs text-muted-foreground mb-1">MTD Spend</p>
          <p className="text-base font-bold font-mono">${forecast.actual_spend?.toLocaleString()}</p>
        </div>
        <div className="bg-secondary/40 rounded-lg p-3">
          <p className="text-xs text-muted-foreground mb-1">MTD Revenue</p>
          <p className="text-base font-bold font-mono">${forecast.actual_revenue?.toLocaleString()}</p>
        </div>
        <div className="bg-primary/10 rounded-lg p-3 border border-primary/20">
          <p className="text-xs text-muted-foreground mb-1">Projected Month Revenue</p>
          <p className="text-base font-bold font-mono text-primary">${forecast.month_total_revenue?.toLocaleString()}</p>
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
