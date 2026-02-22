import { CACTrend } from "@/hooks/useOptimizationEngine";
import { TrendingUp, TrendingDown, Pause, ArrowUpCircle, MinusCircle, AlertTriangle, DollarSign } from "lucide-react";

interface Props {
  cacTrend: CACTrend;
}

const signalConfig = {
  increase: {
    icon: ArrowUpCircle,
    color: "text-green-500",
    bg: "bg-green-500/10 border-green-500/20",
    badgeBg: "bg-green-500/20 text-green-600",
  },
  hold: {
    icon: MinusCircle,
    color: "text-muted-foreground",
    bg: "bg-secondary/50 border-border",
    badgeBg: "bg-secondary text-muted-foreground",
  },
  reduce: {
    icon: TrendingDown,
    color: "text-yellow-500",
    bg: "bg-yellow-500/10 border-yellow-500/20",
    badgeBg: "bg-yellow-500/20 text-yellow-600",
  },
  pause_losers: {
    icon: Pause,
    color: "text-red-500",
    bg: "bg-red-500/10 border-red-500/20",
    badgeBg: "bg-red-500/20 text-red-600",
  },
};

const CACTrendCard = ({ cacTrend }: Props) => {
  const config = signalConfig[cacTrend.signal];
  const SignalIcon = config.icon;

  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-primary" />
          CAC Efficiency Monitor
        </h3>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${config.badgeBg}`}>
          {cacTrend.signal.replace("_", " ").toUpperCase()}
        </span>
      </div>

      {/* Signal Banner */}
      <div className={`rounded-lg border p-4 mb-4 ${config.bg}`}>
        <div className="flex items-start gap-2.5">
          <SignalIcon className={`w-5 h-5 mt-0.5 shrink-0 ${config.color}`} />
          <div>
            <p className={`text-sm font-semibold ${config.color}`}>{cacTrend.signal_label}</p>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{cacTrend.signal_detail}</p>
          </div>
        </div>
      </div>

      {/* 3d vs 7d vs Baseline metrics */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <MetricBox
          label="3-Day CAC"
          value={`$${cacTrend.cac_3d}`}
          delta={cacTrend.cac_3d_vs_baseline_pct}
          deltaLabel="vs baseline"
          invertColor
        />
        <MetricBox
          label="7-Day CAC"
          value={`$${cacTrend.cac_7d}`}
          delta={null}
          deltaLabel=""
        />
        <MetricBox
          label="Baseline CAC"
          value={`$${cacTrend.cac_baseline}`}
          delta={null}
          deltaLabel=""
        />
      </div>

      {/* Volume context */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-secondary/30 rounded-lg p-2.5">
          <p className="text-[10px] text-muted-foreground">3d: {cacTrend.conversions_3d} conv · ${cacTrend.spend_3d} spend</p>
        </div>
        <div className="bg-secondary/30 rounded-lg p-2.5">
          <p className="text-[10px] text-muted-foreground">7d: {cacTrend.conversions_7d} conv · ${cacTrend.spend_7d} spend</p>
        </div>
      </div>

      {/* Losing Creatives */}
      {cacTrend.losing_creatives.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground mb-2">
            <AlertTriangle className="w-3.5 h-3.5 text-yellow-500" />
            Underperforming Creatives
          </div>
          <div className="space-y-1.5">
            {cacTrend.losing_creatives.map((creative, i) => (
              <div key={i} className="flex items-center justify-between bg-secondary/30 rounded-lg px-3 py-2 text-xs">
                <span className="truncate max-w-[55%] text-foreground/80" title={creative.name}>
                  {creative.name}
                </span>
                <div className="flex items-center gap-3 text-muted-foreground shrink-0">
                  <span>
                    CPA: <span className="font-mono text-red-500">{creative.cpa === -1 ? "∞" : `$${creative.cpa}`}</span>
                  </span>
                  <span>
                    Spend: <span className="font-mono">${creative.spend}</span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

function MetricBox({ label, value, delta, deltaLabel, invertColor }: {
  label: string;
  value: string;
  delta: number | null;
  deltaLabel: string;
  invertColor?: boolean;
}) {
  const hasDelta = delta !== null && delta !== undefined;
  const isGood = invertColor ? delta! <= 0 : delta! >= 0;

  return (
    <div className="bg-secondary/40 rounded-lg p-3 text-center">
      <p className="text-[10px] text-muted-foreground mb-1">{label}</p>
      <p className="text-base font-bold font-mono">{value}</p>
      {hasDelta && (
        <p className={`text-[10px] font-mono mt-0.5 ${isGood ? "text-green-500" : "text-red-500"}`}>
          {delta! > 0 ? "+" : ""}{delta}% {deltaLabel}
        </p>
      )}
    </div>
  );
}

export default CACTrendCard;
