import { VarianceItem } from "@/hooks/useOptimizationEngine";
import { AlertTriangle, TrendingUp, TrendingDown, Minus } from "lucide-react";

interface Props {
  variances: VarianceItem[];
}

const VarianceMonitor = ({ variances }: Props) => {
  const severityIcon = (severity: string) => {
    if (severity === "High") return <AlertTriangle className="w-3.5 h-3.5 text-red-500" />;
    if (severity === "Medium") return <AlertTriangle className="w-3.5 h-3.5 text-yellow-500" />;
    return <Minus className="w-3.5 h-3.5 text-muted-foreground" />;
  };

  const severityBadge = (severity: string) => {
    const colors = {
      High: "bg-red-500/10 text-red-500 border-red-500/20",
      Medium: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
      Low: "bg-muted text-muted-foreground border-border",
    };
    return colors[severity as keyof typeof colors] || colors.Low;
  };

  return (
    <div className="glass-card p-6">
      <h3 className="text-lg font-semibold flex items-center gap-2 mb-5">
        <AlertTriangle className="w-5 h-5 text-primary" />
        Variance Monitor (7-Day vs Baseline)
      </h3>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-xs text-muted-foreground border-b border-border/50">
              <th className="text-left pb-3 font-medium">Metric</th>
              <th className="text-right pb-3 font-medium">Forecast</th>
              <th className="text-right pb-3 font-medium">Actual</th>
              <th className="text-right pb-3 font-medium">Variance</th>
              <th className="text-center pb-3 font-medium">Severity</th>
            </tr>
          </thead>
          <tbody>
            {variances.map((v) => (
              <tr key={v.metric} className="border-b border-border/20 last:border-0">
                <td className="py-3 text-sm font-medium flex items-center gap-2">
                  {severityIcon(v.severity)}
                  {v.metric}
                </td>
                <td className="py-3 text-sm font-mono text-right text-muted-foreground">
                  {v.metric === "MER" ? `${v.forecast_value}x` : `$${v.forecast_value.toLocaleString()}`}
                </td>
                <td className="py-3 text-sm font-mono text-right">
                  {v.metric === "MER" ? `${v.actual_value}x` : `$${v.actual_value.toLocaleString()}`}
                </td>
                <td className="py-3 text-right">
                  <span className={`text-sm font-mono font-bold inline-flex items-center gap-1 ${
                    // For CPA, positive variance is bad; for Revenue/MER, positive is good
                    (v.metric === "CPA" ? v.variance_percent < 0 : v.variance_percent > 0) ? "text-green-500" : v.variance_percent === 0 ? "text-muted-foreground" : "text-red-500"
                  }`}>
                    {v.variance_percent > 0 ? <TrendingUp className="w-3 h-3" /> : v.variance_percent < 0 ? <TrendingDown className="w-3 h-3" /> : null}
                    {v.variance_percent > 0 ? "+" : ""}{v.variance_percent}%
                  </span>
                </td>
                <td className="py-3 text-center">
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${severityBadge(v.severity)}`}>
                    {v.severity}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default VarianceMonitor;
