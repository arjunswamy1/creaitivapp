import { Recommendation } from "@/hooks/useOptimizationEngine";
import { Lightbulb, Shield, BarChart3, ArrowRight, RefreshCw, AlertTriangle, DollarSign } from "lucide-react";

interface Props {
  recommendations: Recommendation[];
}

const RecommendationFeed = ({ recommendations }: Props) => {
  if (recommendations.length === 0) {
    return (
      <div className="glass-card p-6">
        <h3 className="text-lg font-semibold flex items-center gap-2 mb-3">
          <Lightbulb className="w-5 h-5 text-primary" />
          Recommendations
        </h3>
        <p className="text-sm text-muted-foreground">No actionable recommendations at this time. Performance is within expected ranges.</p>
      </div>
    );
  }

  const typeIcon = (type: string) => {
    switch (type) {
      case "Budget Reallocation": return <DollarSign className="w-4 h-4" />;
      case "Creative Refresh": return <RefreshCw className="w-4 h-4" />;
      case "Efficiency Alert": return <AlertTriangle className="w-4 h-4" />;
      default: return <Lightbulb className="w-4 h-4" />;
    }
  };

  const riskBadge = (risk: string) => {
    const colors: Record<string, string> = {
      Low: "bg-green-500/10 text-green-500 border-green-500/20",
      Medium: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
      High: "bg-red-500/10 text-red-500 border-red-500/20",
    };
    return colors[risk] || colors.Medium;
  };

  return (
    <div className="glass-card p-6">
      <h3 className="text-lg font-semibold flex items-center gap-2 mb-5">
        <Lightbulb className="w-5 h-5 text-primary" />
        Recommendations ({recommendations.length})
      </h3>

      <div className="space-y-4">
        {recommendations.map((rec, i) => (
          <div key={i} className="bg-secondary/30 rounded-lg p-4 border border-border/40">
            {/* Header */}
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-md bg-primary/10 text-primary">
                  {typeIcon(rec.type)}
                </div>
                <div>
                  <span className="text-xs font-medium text-primary">{rec.type}</span>
                  <p className="text-xs text-muted-foreground">{rec.entity}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${riskBadge(rec.risk_score)}`}>
                  {rec.risk_score} Risk
                </span>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Shield className="w-3 h-3" />
                  {Math.round(rec.confidence_score * 100)}%
                </div>
              </div>
            </div>

            {/* Action */}
            <p className="text-sm mb-3">{rec.action}</p>

            {/* Evidence */}
            <div className="mb-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Evidence</p>
              <ul className="space-y-1">
                {rec.evidence.map((e, j) => (
                  <li key={j} className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <ArrowRight className="w-3 h-3 mt-0.5 shrink-0 text-primary/60" />
                    {e}
                  </li>
                ))}
              </ul>
            </div>

            {/* Impact */}
            {rec.projected_impact && (
              <div className="flex items-center gap-2 bg-primary/5 border border-primary/10 rounded-md px-3 py-2">
                <BarChart3 className="w-3.5 h-3.5 text-primary shrink-0" />
                <p className="text-xs text-foreground/80">{rec.projected_impact}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default RecommendationFeed;
