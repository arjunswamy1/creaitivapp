import { CACTrend } from "@/hooks/useOptimizationEngine";
import { TrendingDown, Pause, ArrowUpCircle, MinusCircle, AlertTriangle, DollarSign, ImageOff, Search, CheckCircle2, XCircle } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

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

const isKilled = (status: string | null) => {
  if (!status) return false;
  const s = status.toLowerCase();
  return s === "paused" || s === "removed" || s === "deleted" || s === "archived" || s === "disabled";
};

const statusStyle = (status: string | null) => {
  if (isKilled(status)) return { bg: "bg-muted/40 border-border/30" };
  return { bg: "bg-secondary/30 border-border/50" };
};

const StatusBadge = ({ status }: { status: string | null }) => {
  if (!status) return null;
  const killed = isKilled(status);
  return (
    <Badge variant={killed ? "secondary" : "outline"} className={`text-[9px] px-1.5 py-0 h-4 shrink-0 ${killed ? "text-muted-foreground" : "text-foreground/70"}`}>
      {killed && <CheckCircle2 className="w-2.5 h-2.5 mr-0.5 text-accent" />}
      {status}
    </Badge>
  );
};

const CACTrendCard = ({ cacTrend }: Props) => {
  const config = signalConfig[cacTrend.signal];
  const SignalIcon = config.icon;

  const hasMetaLosers = cacTrend.losing_creatives.length > 0;
  const hasGoogleLosers = cacTrend.losing_keywords.length > 0;
  const hasAnyLosers = hasMetaLosers || hasGoogleLosers;

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

      {/* Losers section with tabs */}
      {hasAnyLosers && (
        <div>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground mb-2.5">
            <AlertTriangle className="w-3.5 h-3.5 text-yellow-500" />
            Underperformers to Kill
          </div>

          <Tabs defaultValue={hasMetaLosers ? "meta" : "google"} className="w-full">
            <TabsList className="w-full h-8 mb-3">
              {hasMetaLosers && (
                <TabsTrigger value="meta" className="flex-1 text-xs gap-1.5 h-7">
                  <ImageOff className="w-3 h-3" />
                  Meta Creatives ({cacTrend.losing_creatives.length})
                </TabsTrigger>
              )}
              {hasGoogleLosers && (
                <TabsTrigger value="google" className="flex-1 text-xs gap-1.5 h-7">
                  <Search className="w-3 h-3" />
                  Google Keywords ({cacTrend.losing_keywords.length})
                </TabsTrigger>
              )}
            </TabsList>

            {/* Meta Creatives Tab */}
            {hasMetaLosers && (
              <TabsContent value="meta">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {cacTrend.losing_creatives.map((creative, i) => (
                    <div key={i} className={`flex gap-3 rounded-lg p-2.5 border ${statusStyle(creative.status).bg}`}>
                      {/* Thumbnail */}
                      <div className="w-14 h-14 rounded-md overflow-hidden bg-secondary/60 shrink-0 flex items-center justify-center relative">
                        {creative.thumbnail_url ? (
                          <img
                            src={creative.thumbnail_url}
                            alt={creative.name}
                            className={`w-full h-full object-cover ${isKilled(creative.status) ? "opacity-40 grayscale" : ""}`}
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
                        {isKilled(creative.status) && (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <XCircle className="w-5 h-5 text-destructive/70" />
                          </div>
                        )}
                      </div>
                      {/* Details */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className={`text-xs font-medium truncate ${isKilled(creative.status) ? "line-through text-muted-foreground" : "text-foreground/80"}`} title={creative.name}>
                            {creative.name}
                          </p>
                          <StatusBadge status={creative.status} />
                        </div>
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
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>
            )}

            {/* Google Keywords Tab */}
            {hasGoogleLosers && (
              <TabsContent value="google">
                <div className="rounded-lg border border-border/50 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="text-[10px] h-8 px-2.5">Keyword</TableHead>
                        <TableHead className="text-[10px] h-8 px-2.5">Ad Group</TableHead>
                        <TableHead className="text-[10px] h-8 px-2.5">Match</TableHead>
                        <TableHead className="text-[10px] h-8 px-2.5">Status</TableHead>
                        <TableHead className="text-[10px] h-8 px-2.5 text-right">CPA</TableHead>
                        <TableHead className="text-[10px] h-8 px-2.5 text-right">Spend</TableHead>
                        <TableHead className="text-[10px] h-8 px-2.5 text-right">Conv</TableHead>
                        <TableHead className="text-[10px] h-8 px-2.5 text-right">CTR</TableHead>
                        <TableHead className="text-[10px] h-8 px-2.5 text-right">QS</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cacTrend.losing_keywords.map((kw, i) => (
                        <TableRow key={i} className={`hover:bg-secondary/30 ${isKilled(kw.status) ? "opacity-50" : ""}`}>
                          <TableCell className={`text-xs px-2.5 py-2 font-medium max-w-[140px] truncate ${isKilled(kw.status) ? "line-through" : ""}`} title={kw.keyword}>
                            {kw.keyword}
                          </TableCell>
                          <TableCell className="text-[10px] px-2.5 py-2 text-muted-foreground max-w-[100px] truncate" title={kw.ad_group}>
                            {kw.ad_group || "—"}
                          </TableCell>
                          <TableCell className="text-[10px] px-2.5 py-2">
                            <span className="bg-secondary px-1.5 py-0.5 rounded text-muted-foreground capitalize">
                              {kw.match_type || "—"}
                            </span>
                          </TableCell>
                          <TableCell className="text-[10px] px-2.5 py-2">
                            <StatusBadge status={kw.status} />
                          </TableCell>
                          <TableCell className="text-xs px-2.5 py-2 text-right font-mono font-semibold text-destructive">
                            {kw.cpa === -1 ? "∞" : `$${kw.cpa}`}
                          </TableCell>
                          <TableCell className="text-xs px-2.5 py-2 text-right font-mono">
                            ${kw.spend}
                          </TableCell>
                          <TableCell className="text-xs px-2.5 py-2 text-right font-mono">
                            {kw.conversions}
                          </TableCell>
                          <TableCell className="text-xs px-2.5 py-2 text-right font-mono">
                            {kw.ctr}%
                          </TableCell>
                          <TableCell className="text-xs px-2.5 py-2 text-right font-mono">
                            {kw.quality_score != null ? (
                              <span className={kw.quality_score < 5 ? "text-destructive font-semibold" : kw.quality_score >= 7 ? "text-green-500" : ""}>
                                {kw.quality_score}
                              </span>
                            ) : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>
            )}
          </Tabs>
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
