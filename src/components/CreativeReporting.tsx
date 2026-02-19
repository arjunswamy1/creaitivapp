import { useState } from "react";
import { useCreativePerformance, useFormatComparison, useFatigueAlerts } from "@/hooks/useCreativeData";
import type { CreativeRow } from "@/hooks/useCreativeData";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, TrendingDown, Film, Image, LayoutGrid, Layers } from "lucide-react";

const formatIcons: Record<string, React.ReactNode> = {
  video: <Film className="w-3.5 h-3.5" />,
  static: <Image className="w-3.5 h-3.5" />,
  carousel: <LayoutGrid className="w-3.5 h-3.5" />,
};

const formatLabels: Record<string, string> = {
  video: "Video",
  static: "Static",
  carousel: "Carousel",
  responsive_search: "RSA",
  shopping: "Shopping",
  pmax: "PMax",
  unknown: "Other",
};

const CreativeReporting = ({ platformFilter: initialPlatform }: { platformFilter?: string }) => {
  const { data: creatives, isLoading } = useCreativePerformance();
  const formatData = useFormatComparison(creatives);
  const fatigueAlerts = useFatigueAlerts(creatives);
  const [platformFilter, setPlatformFilter] = useState<string>(initialPlatform || "all");

  if (isLoading) {
    return <Skeleton className="h-[400px] rounded-xl" />;
  }

  const filtered = platformFilter === "all"
    ? creatives
    : creatives?.filter(c => c.platform === platformFilter);

  return (
    <div className="glass-card p-6">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Layers className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-semibold">Creative Performance</h3>
        </div>
        {!initialPlatform && (
          <div className="flex gap-1.5">
            {["all", "meta", "google"].map(p => (
              <button
                key={p}
                onClick={() => setPlatformFilter(p)}
                className={`px-3 py-1 text-xs rounded-lg transition-colors font-medium ${
                  platformFilter === p
                    ? "bg-primary/20 text-primary"
                    : "bg-secondary/60 text-muted-foreground hover:bg-secondary"
                }`}
              >
                {p === "all" ? "All" : p === "meta" ? "Meta" : "Google"}
              </button>
            ))}
          </div>
        )}
      </div>

      <Tabs defaultValue="formats" className="w-full">
        <TabsList className="bg-secondary/50 mb-4">
          <TabsTrigger value="formats">Format Comparison</TabsTrigger>
          <TabsTrigger value="creatives">Top Creatives</TabsTrigger>
          <TabsTrigger value="fatigue">
            Fatigue Alerts
            {fatigueAlerts.length > 0 && (
              <Badge variant="destructive" className="ml-1.5 text-[10px] px-1.5 py-0">
                {fatigueAlerts.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="formats">
          <FormatComparisonView data={formatData} />
        </TabsContent>

        <TabsContent value="creatives">
          <CreativeTable creatives={filtered || []} />
        </TabsContent>

        <TabsContent value="fatigue">
          <FatigueAlertsView alerts={fatigueAlerts} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

function FormatComparisonView({ data }: { data: ReturnType<typeof useFormatComparison> }) {
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">No format data available. Sync ads to populate creative formats.</p>;
  }

  const maxSpend = Math.max(...data.map(d => d.spend));

  return (
    <div className="space-y-3">
      {data.map(f => (
        <div key={f.format} className="bg-secondary/30 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              {formatIcons[f.format] || <Layers className="w-3.5 h-3.5" />}
              <span className="font-medium text-sm">{formatLabels[f.format] || f.format}</span>
              <Badge variant="outline" className="text-[10px]">{f.count} ads</Badge>
            </div>
            <div className="flex items-center gap-4 text-xs font-mono">
              <span>ROAS <strong className={f.roas >= 2 ? "text-accent" : f.roas < 1 ? "text-destructive" : ""}>{f.roas}x</strong></span>
              <span>CPA <strong>${f.cpa}</strong></span>
              <span>CTR <strong>{f.ctr}%</strong></span>
            </div>
          </div>
          <div className="flex gap-3 text-xs text-muted-foreground">
            <span>Spend: <strong className="text-foreground font-mono">${f.spend.toLocaleString()}</strong></span>
            <span>Revenue: <strong className="text-foreground font-mono">${f.revenue.toLocaleString()}</strong></span>
            <span>Conversions: <strong className="text-foreground font-mono">{f.conversions}</strong></span>
          </div>
          <div className="mt-2 h-2 bg-secondary/60 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-primary/70 transition-all duration-500"
              style={{ width: `${maxSpend > 0 ? (f.spend / maxSpend) * 100 : 0}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function CreativeTable({ creatives }: { creatives: CreativeRow[] }) {
  if (creatives.length === 0) {
    return <p className="text-sm text-muted-foreground">No creative data available yet.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-2 text-muted-foreground font-medium">Creative</th>
            <th className="text-left py-2 text-muted-foreground font-medium">Format</th>
            <th className="text-right py-2 text-muted-foreground font-medium">Spend</th>
            <th className="text-right py-2 text-muted-foreground font-medium">Revenue</th>
            <th className="text-right py-2 text-muted-foreground font-medium">ROAS</th>
            <th className="text-right py-2 text-muted-foreground font-medium">Conv.</th>
            <th className="text-right py-2 text-muted-foreground font-medium">CPA</th>
            <th className="text-right py-2 text-muted-foreground font-medium">CTR</th>
            <th className="text-right py-2 text-muted-foreground font-medium">Freq.</th>
            <th className="text-right py-2 text-muted-foreground font-medium">TSR</th>
          </tr>
        </thead>
        <tbody>
          {creatives.slice(0, 25).map(c => (
            <tr key={c.adId} className="border-b border-border/30 hover:bg-secondary/30 transition-colors">
              <td className="py-2 max-w-[220px]">
                <p className="font-medium truncate">{c.name}</p>
                <p className="text-muted-foreground text-[10px] truncate">{c.campaignName}</p>
              </td>
              <td className="py-2">
                <Badge variant="outline" className="text-[10px] gap-1">
                  {formatIcons[c.format]}
                  {formatLabels[c.format] || c.format}
                </Badge>
              </td>
              <td className="py-2 text-right font-mono">${c.spend.toLocaleString()}</td>
              <td className="py-2 text-right font-mono">${c.revenue.toLocaleString()}</td>
              <td className="py-2 text-right font-mono">
                <span className={c.roas >= 2 ? "text-accent" : c.roas < 1 ? "text-destructive" : ""}>{c.roas}x</span>
              </td>
              <td className="py-2 text-right font-mono">{c.conversions}</td>
              <td className="py-2 text-right font-mono">{c.conversions > 0 ? `$${c.cpa}` : "—"}</td>
              <td className="py-2 text-right font-mono">{c.ctr}%</td>
              <td className="py-2 text-right font-mono">
                {c.frequency != null ? (
                  <span className={c.frequency > 2.5 ? "text-destructive" : ""}>{c.frequency}</span>
                ) : "—"}
              </td>
              <td className="py-2 text-right font-mono">
                {c.thumbStopRate != null ? `${c.thumbStopRate}%` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FatigueAlertsView({ alerts }: { alerts: ReturnType<typeof useFatigueAlerts> }) {
  if (alerts.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-accent font-medium">✓ No fatigue alerts</p>
        <p className="text-xs text-muted-foreground mt-1">All creatives are performing within healthy thresholds.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 max-h-[400px] overflow-y-auto">
      {alerts.map((a, i) => (
        <div
          key={`${a.adId}-${i}`}
          className={`flex items-start gap-3 p-3 rounded-lg ${
            a.severity === "critical" ? "bg-destructive/10 border border-destructive/20" : "bg-secondary/40 border border-border/40"
          }`}
        >
          {a.severity === "critical" ? (
            <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
          ) : (
            <TrendingDown className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{a.adName}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{a.reason}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[10px] text-muted-foreground">{a.metric}</p>
            <p className={`text-sm font-mono font-semibold ${a.severity === "critical" ? "text-destructive" : ""}`}>{a.value}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export default CreativeReporting;
