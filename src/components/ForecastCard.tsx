import { useForecast } from "@/hooks/useAdData";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, DollarSign, ShoppingCart, Target, Sparkles } from "lucide-react";
import { useState } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const ForecastCard = () => {
  const [days, setDays] = useState(30);
  const { data: forecast, isLoading, error } = useForecast(days);

  if (error) {
    return (
      <div className="glass-card p-6">
        <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Target className="w-5 h-5 text-primary" />
          Forecast
        </h3>
        <p className="text-sm text-muted-foreground">Not enough data to generate forecast. Sync more data first.</p>
      </div>
    );
  }

  if (isLoading) {
    return <Skeleton className="h-[400px] rounded-xl" />;
  }

  if (!forecast) return null;

  const chartData = forecast.daily_forecast?.slice(0, days).map((d: any) => ({
    date: new Date(d.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    revenue: d.projected_revenue,
    conversions: d.projected_conversions,
    spend: d.projected_spend,
  })) || [];

  return (
    <div className="glass-card p-6">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Target className="w-5 h-5 text-primary" />
          Forecast
        </h3>
        <div className="flex gap-1">
          {[7, 14, 30].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                days === d ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              {d}D
            </button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4 mb-5">
        <div className="bg-secondary/40 rounded-lg p-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
            <DollarSign className="w-3.5 h-3.5" />
            Projected Revenue
          </div>
          <p className="text-lg font-bold font-mono">${forecast.total_projected_revenue?.toLocaleString()}</p>
          <TrendIndicator value={forecast.revenue_trend} />
        </div>
        <div className="bg-secondary/40 rounded-lg p-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
            <ShoppingCart className="w-3.5 h-3.5" />
            Projected Sales
          </div>
          <p className="text-lg font-bold font-mono">{forecast.total_projected_conversions?.toLocaleString()}</p>
          <TrendIndicator value={forecast.conversions_trend} />
        </div>
        <div className="bg-secondary/40 rounded-lg p-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
            <Target className="w-3.5 h-3.5" />
            Projected ROAS
          </div>
          <p className="text-lg font-bold font-mono">{forecast.projected_roas}x</p>
        </div>
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <div className="h-[200px] mb-5">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} className="text-muted-foreground" />
              <YAxis tick={{ fontSize: 10 }} className="text-muted-foreground" />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
              />
              <Area type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.1} name="Revenue" />
              <Area type="monotone" dataKey="spend" stroke="hsl(var(--destructive))" fill="hsl(var(--destructive))" fillOpacity={0.05} name="Spend" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

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

function TrendIndicator({ value }: { value: number | undefined }) {
  if (value === undefined || value === 0) return null;
  const isUp = value > 0;
  return (
    <div className={`flex items-center gap-1 text-xs ${isUp ? "text-accent" : "text-destructive"}`}>
      {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {isUp ? "+" : ""}{value}% trend
    </div>
  );
}

export default ForecastCard;
