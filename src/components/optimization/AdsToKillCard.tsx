import { AdToKill } from "@/hooks/useOptimizationEngine";
import { Skull, ImageOff, XCircle, CheckCircle2, DollarSign, TrendingDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

interface Props {
  adsToKill: AdToKill[];
  blendedROAS: number;
}

const isKilled = (status: string | null) => {
  if (!status) return false;
  const s = status.toLowerCase();
  return s === "paused" || s === "removed" || s === "deleted" || s === "archived" || s === "disabled";
};

const AdsToKillCard = ({ adsToKill, blendedROAS }: Props) => {
  if (adsToKill.length === 0) return null;

  const totalWasted = adsToKill.reduce((s, a) => s + a.wasted_spend, 0);
  const activeAds = adsToKill.filter(a => !isKilled(a.status));
  const killedAds = adsToKill.filter(a => isKilled(a.status));

  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Skull className="w-4 h-4 text-destructive" />
          Ads to Kill — Shopify ROAS Impact
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-secondary/50 text-muted-foreground">
            Blended ROAS: {blendedROAS}x
          </span>
          {totalWasted > 0 && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-destructive/10 text-destructive border border-destructive/20">
              ${totalWasted.toLocaleString()} wasted
            </span>
          )}
        </div>
      </div>

      {/* Active losers */}
      {activeAds.length > 0 && (
        <div className="mb-4">
          <div className="rounded-lg border border-destructive/20 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent bg-destructive/5">
                  <TableHead className="text-[10px] h-8 px-2.5">Ad</TableHead>
                  <TableHead className="text-[10px] h-8 px-2.5">Platform</TableHead>
                  <TableHead className="text-[10px] h-8 px-2.5 text-right">Spend</TableHead>
                  <TableHead className="text-[10px] h-8 px-2.5 text-right">Conv</TableHead>
                  <TableHead className="text-[10px] h-8 px-2.5 text-right">CPA</TableHead>
                  <TableHead className="text-[10px] h-8 px-2.5 text-right">Spend %</TableHead>
                  <TableHead className="text-[10px] h-8 px-2.5 text-right">Wasted</TableHead>
                  <TableHead className="text-[10px] h-8 px-2.5">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeAds.map((ad, i) => (
                  <TableRow key={i} className="hover:bg-destructive/5">
                    <TableCell className="px-2.5 py-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded overflow-hidden bg-secondary/60 shrink-0 flex items-center justify-center">
                          {ad.thumbnail_url ? (
                            <img
                              src={ad.thumbnail_url}
                              alt={ad.name}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = "none";
                              }}
                            />
                          ) : (
                            <ImageOff className="w-3 h-3 text-muted-foreground/40" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-medium truncate max-w-[140px]" title={ad.name}>
                            {ad.name}
                          </p>
                          <p className="text-[10px] text-muted-foreground truncate max-w-[140px]" title={ad.campaign}>
                            {ad.campaign}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-[10px] px-2.5 py-2">
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 capitalize">
                        {ad.platform}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs px-2.5 py-2 text-right font-mono">
                      ${ad.spend.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-xs px-2.5 py-2 text-right font-mono">
                      {ad.conversions}
                    </TableCell>
                    <TableCell className="text-xs px-2.5 py-2 text-right font-mono font-semibold text-destructive">
                      {ad.cpa === -1 ? "∞" : `$${ad.cpa}`}
                    </TableCell>
                    <TableCell className="text-xs px-2.5 py-2 text-right font-mono">
                      {ad.spend_share_pct}%
                    </TableCell>
                    <TableCell className="text-xs px-2.5 py-2 text-right font-mono font-semibold text-destructive">
                      ${ad.wasted_spend.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-[10px] px-2.5 py-2">
                      <span className="text-destructive font-medium">{ad.recommendation}</span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Already killed */}
      {killedAds.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mb-2">
            <CheckCircle2 className="w-3 h-3 text-accent" />
            Already paused / removed ({killedAds.length})
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {killedAds.map((ad, i) => (
              <div key={i} className="flex items-center gap-2 bg-muted/30 rounded-lg p-2 border border-border/30 opacity-60">
                <div className="w-7 h-7 rounded overflow-hidden bg-secondary/40 shrink-0 flex items-center justify-center relative">
                  {ad.thumbnail_url ? (
                    <img src={ad.thumbnail_url} alt={ad.name} className="w-full h-full object-cover grayscale opacity-40" />
                  ) : (
                    <ImageOff className="w-3 h-3 text-muted-foreground/30" />
                  )}
                  <XCircle className="w-3.5 h-3.5 text-destructive/50 absolute" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-medium truncate line-through text-muted-foreground" title={ad.name}>{ad.name}</p>
                  <p className="text-[9px] text-muted-foreground">
                    ${ad.spend} · {ad.conversions} conv · {ad.status}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ROAS impact summary */}
      {activeAds.length > 0 && (
        <div className="mt-4 bg-primary/5 border border-primary/10 rounded-lg p-3 flex items-center gap-2">
          <TrendingDown className="w-4 h-4 text-primary shrink-0" />
          <p className="text-xs text-foreground/80">
            Killing these {activeAds.length} ads would save <span className="font-semibold text-destructive">${activeAds.reduce((s, a) => s + a.wasted_spend, 0).toLocaleString()}</span> in wasted spend, improving blended Shopify ROAS.
          </p>
        </div>
      )}
    </div>
  );
};

export default AdsToKillCard;
