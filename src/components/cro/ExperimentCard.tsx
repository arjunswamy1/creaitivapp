import type { StellarExperiment } from "@/types/stellar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ExternalLink, Trophy } from "lucide-react";

function statusBadge(status: string) {
  const map: Record<string, string> = {
    running: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
    completed: "bg-blue-500/10 text-blue-600 border-blue-500/20",
    paused: "bg-amber-500/10 text-amber-600 border-amber-500/20",
    draft: "bg-muted text-muted-foreground border-border",
  };
  return (
    <Badge variant="outline" className={map[status] || map.draft}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
}

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

interface Props {
  experiment: StellarExperiment;
}

export default function ExperimentCard({ experiment: exp }: Props) {
  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <CardTitle className="text-base font-semibold text-foreground truncate">
              {exp.experimentName}
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2 mt-1.5">
              {statusBadge(exp.status)}
              {exp.type && (
                <Badge variant="secondary" className="text-xs">
                  {exp.type}
                </Badge>
              )}
              {exp.statisticalSignificance != null && (
                <Badge
                  variant="outline"
                  className={
                    exp.statisticalSignificance >= 0.95
                      ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                      : "bg-muted text-muted-foreground border-border"
                  }
                >
                  {(exp.statisticalSignificance * 100).toFixed(1)}% sig.
                </Badge>
              )}
              {exp.inferredWinner && (
                <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20 gap-1">
                  <Trophy className="w-3 h-3" />
                  {exp.inferredWinner}
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Meta row */}
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground mt-2">
          {exp.mainGoal && <span>Goal: <strong className="text-foreground">{exp.mainGoal}</strong></span>}
          <span>Started: {formatDate(exp.startedAt)}</span>
          {exp.endedAt && <span>Ended: {formatDate(exp.endedAt)}</span>}
          {exp.pausedAt && <span>Paused: {formatDate(exp.pausedAt)}</span>}
          {exp.url && (
            <a
              href={exp.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              <ExternalLink className="w-3 h-3" /> URL
            </a>
          )}
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {exp.variants.length > 0 ? (
          <div className="rounded-md border border-border overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Variant</TableHead>
                  <TableHead className="text-xs text-center">Control</TableHead>
                  <TableHead className="text-xs text-right">Split</TableHead>
                  <TableHead className="text-xs text-right">Visitors</TableHead>
                  <TableHead className="text-xs text-right">Conv.</TableHead>
                  <TableHead className="text-xs text-right">Conv. Rate</TableHead>
                  <TableHead className="text-xs text-right">Sq. Conv.</TableHead>
                  <TableHead className="text-xs text-right">Sq. Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {exp.variants.map((v) => (
                  <TableRow
                    key={v.id}
                    className={
                      exp.inferredWinner === v.name
                        ? "bg-emerald-500/5"
                        : undefined
                    }
                  >
                    <TableCell className="font-medium text-sm">
                      <div className="flex items-center gap-1.5">
                        {v.name}
                        {v.url && (
                          <a
                            href={v.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-muted-foreground hover:text-primary"
                          >
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center text-xs">
                      {v.isControl ? "✓" : ""}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {v.trafficSplit != null ? `${v.trafficSplit}%` : "—"}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {v.uniqueVisitors.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {v.conversions.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right text-sm font-medium">
                      {v.conversionRate.toFixed(2)}%
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {v.squashedConversions.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {(v.squashedConversionRate * 100).toFixed(2)}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No variant data available.</p>
        )}
      </CardContent>
    </Card>
  );
}
