import { CACTrend } from "@/hooks/useOptimizationEngine";
import { TrendingDown, Pause, ArrowUpCircle, MinusCircle, AlertTriangle, DollarSign, ImageOff } from "lucide-react";

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
    color: "text-destructive",
    bg: "bg-destructive/10 border-destructive/20",
    badgeBg: "bg-destructive/20 text-destructive",
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

      {/* Losing Creatives with Thumbnails */}
      {cacTrend.losing_creatives.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground mb-2.5">
            <AlertTriangle className="w-3.5 h-3.5 text-yellow-500" />
            Creatives to Kill ({cacTrend.losing_creatives.length})
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {cacTrend.losing_creatives.map((creative, i) => (
              <div key={i} className="flex gap-3 bg-secondary/30 rounded-lg p-2.5 border border-border/50">
                {/* Thumbnail */}
                <div className="w-14 h-14 rounded-md overflow-hidden bg-secondary/60 shrink-0 flex items-center justify-center">
                  {creative.thumbnail_url ? (
                    <img
                      src={creative.thumbnail_url}
                      alt={creative.name}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        const el = e.target as HTMLImageElement;
                        el.style.display = "none";
                        const parent = el.parentElement;
                        if (parent) {
                          const fallback = document.createElement("div");
                          fallback.className = "flex items-center justify-center w-full h-full";
                          fallback.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-muted-foreground/40"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>';
                          parent.appendChild(fallback);
                        }
                      }}
                    />
                  ) : (
                    <ImageOff className="w-4 h-4 text-muted-foreground/40" />
                  )}
                </div>
                {/* Details */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate text-foreground/80" title={creative.name}>
                    {creative.name}
                  </p>
                  <p className="text-[10px] text-muted-foreground truncate mt-0.5" title={creative.campaign}>
                    {creative.campaign}
                  </p>
                  <div className="flex items-center gap-3 mt-1.5 text-[10px]">
                    <span className="text-muted-foreground">
                      CPA: <span className="font-mono text-destructive font-semibold">{creative.cpa === -1 ? "∞ (no conv)" : `$${creative.cpa}`}</span>
                    </span>
                    <span className="text-muted-foreground">
                      Spend: <span className="font-mono">${creative.spend}</span>
                    </span>
                  </div>
                  {creative.platform && (
                    <span className="text-[9px] bg-secondary px-1.5 py-0.5 rounded mt-1 inline-block capitalize text-muted-foreground">
                      {creative.platform}
                    </span>
                  )}
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
        <p className={`text-[10px] font-mono mt-0.5 ${isGood ? "text-accent" : "text-destructive"}`}>
          {delta! > 0 ? "+" : ""}{delta}% {deltaLabel}
        </p>
      )}
    </div>
  );
}

export default CACTrendCard;
