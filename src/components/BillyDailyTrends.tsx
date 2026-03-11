import { useState, useEffect } from "react";
import { useBillyDailyTrends, DailyFunnelRow } from "@/hooks/useBillyDailyTrends";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowUpRight, ArrowDownRight, AlertTriangle, BarChart3, Sparkles, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";

const ALERT_THRESHOLD = 10; // Flag any metric with >10% day-over-day change

interface MetricDef {
  key: string;
  label: string;
  format: (v: number) => string;
  invertColor?: boolean; // true = decrease is good (cost metrics)
}

const STEP1_METRICS: MetricDef[] = [
  { key: "spend", label: "Spend", format: v => `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, invertColor: true },
  { key: "clicks", label: "Clicks", format: v => v.toLocaleString() },
  { key: "cpc", label: "CPC", format: v => `$${v.toFixed(3)}`, invertColor: true },
  { key: "ctr", label: "CTR", format: v => `${v.toFixed(1)}%` },
  { key: "cpm", label: "CPM", format: v => `$${v.toFixed(2)}`, invertColor: true },
  { key: "impressions", label: "Impr.", format: v => v.toLocaleString() },
];

const STEP2_METRICS: MetricDef[] = [
  { key: "visitors", label: "Visitors", format: v => v.toLocaleString() },
  { key: "ctaClicks", label: "CTA Clicks", format: v => v.toLocaleString() },
  { key: "lpCvr", label: "LP CVR", format: v => `${v.toFixed(1)}%` },
  { key: "rpv", label: "RPV", format: v => `$${v.toFixed(2)}` },
];

const STEP3_METRICS: MetricDef[] = [
  { key: "totalCalls", label: "Calls", format: v => v.toLocaleString() },
  { key: "connectedCalls", label: "Connected", format: v => v.toLocaleString() },
  { key: "connectRate", label: "Connect %", format: v => `${v.toFixed(1)}%` },
  { key: "convertedCalls", label: "Converted", format: v => v.toLocaleString() },
  { key: "conversionRate", label: "Conv %", format: v => `${v.toFixed(1)}%` },
  { key: "avgDuration", label: "Avg Dur.", format: v => `${Math.round(v)}s` },
];

const STEP4_METRICS: MetricDef[] = [
  { key: "callRevenue", label: "Revenue", format: v => `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}` },
  { key: "revenuePerCall", label: "Rev/Call", format: v => `$${v.toFixed(2)}` },
  { key: "costPerCall", label: "Cost/Call", format: v => `$${v.toFixed(2)}`, invertColor: true },
  { key: "callROAS", label: "ROAS", format: v => `${v.toFixed(2)}x` },
  { key: "profit", label: "Profit", format: v => `${v < 0 ? "−" : ""}$${Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}` },
];

const ALL_STEPS = [
  { title: "Step 1 — Traffic", metrics: STEP1_METRICS },
  { title: "Step 2 — Landing Page", metrics: STEP2_METRICS },
  { title: "Step 3 — Call Processing", metrics: STEP3_METRICS },
  { title: "Step 4 — Monetization", metrics: STEP4_METRICS },
];

function DeltaBadge({ value, invertColor, isAlert }: { value: number | null; invertColor?: boolean; isAlert: boolean }) {
  if (value === null || value === undefined) return <span className="text-muted-foreground">—</span>;
  const isPositive = invertColor ? value <= 0 : value >= 0;
  const absVal = Math.abs(value);

  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-mono font-medium ${
      isAlert
        ? isPositive ? "text-accent" : "text-destructive"
        : "text-muted-foreground"
    }`}>
      {isAlert && (
        isPositive
          ? <ArrowUpRight className="w-3 h-3" />
          : <ArrowDownRight className="w-3 h-3" />
      )}
      {value >= 0 ? "+" : "−"}{absVal.toFixed(1)}%
      {isAlert && absVal >= ALERT_THRESHOLD && (
        <AlertTriangle className="w-2.5 h-2.5 ml-0.5" />
      )}
    </span>
  );
}

function DailyTable({ rows, metrics }: { rows: DailyFunnelRow[]; metrics: MetricDef[] }) {
  // Show most recent first
  const reversed = [...rows].reverse();

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/50">
            <th className="text-left pb-2 text-xs text-muted-foreground font-medium sticky left-0 bg-card z-10 pr-4">Date</th>
            {metrics.map(m => (
              <th key={m.key} className="text-right pb-2 text-xs text-muted-foreground font-medium px-2 whitespace-nowrap">
                {m.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {reversed.map((row, rowIdx) => {
            // Count alerts for this row
            const alertCount = metrics.filter(m => {
              const d = row.deltas[m.key];
              return d !== null && d !== undefined && Math.abs(d) >= ALERT_THRESHOLD;
            }).length;

            return (
              <tr
                key={row.date}
                className={`border-b border-border/20 last:border-0 ${alertCount >= 2 ? "bg-destructive/5" : ""}`}
              >
                <td className="py-2 text-xs font-medium sticky left-0 bg-card z-10 pr-4 whitespace-nowrap">
                  {row.label}
                  {alertCount >= 2 && (
                    <AlertTriangle className="inline w-3 h-3 text-destructive ml-1" />
                  )}
                </td>
                {metrics.map(m => {
                  const val = (row as any)[m.key] ?? 0;
                  const delta = row.deltas[m.key];
                  const isAlert = delta !== null && delta !== undefined && Math.abs(delta) >= ALERT_THRESHOLD;

                  return (
                    <td key={m.key} className="py-2 text-right px-2">
                      <div className="font-mono text-xs">{m.format(val)}</div>
                      {Object.keys(row.deltas).length > 0 && (
                        <DeltaBadge value={delta ?? null} invertColor={m.invertColor} isAlert={isAlert} />
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Key metrics chart for overview
function TrendCharts({ rows }: { rows: DailyFunnelRow[] }) {
  const chartData = rows.map(r => ({
    label: r.label,
    CPC: Math.round(r.cpc * 1000) / 1000,
    RPV: Math.round(r.rpv * 100) / 100,
    "LP CVR": Math.round(r.lpCvr * 100) / 100,
    "Connect %": Math.round(r.connectRate * 10) / 10,
    ROAS: Math.round(r.callROAS * 100) / 100,
    Profit: Math.round(r.profit),
  }));

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* CPC vs RPV */}
      <Card className="border-border/50">
        <CardHeader className="pb-1">
          <CardTitle className="text-sm">CPC vs RPV (Scalability)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" tickFormatter={v => `$${v}`} />
                <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="CPC" stroke="hsl(var(--destructive))" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="RPV" stroke="hsl(var(--accent))" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* LP CVR & Connect Rate */}
      <Card className="border-border/50">
        <CardHeader className="pb-1">
          <CardTitle className="text-sm">Conversion Rates (%)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" tickFormatter={v => `${v}%`} />
                <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="LP CVR" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Connect %" stroke="hsl(var(--accent))" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* ROAS */}
      <Card className="border-border/50">
        <CardHeader className="pb-1">
          <CardTitle className="text-sm">Daily Call ROAS</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" tickFormatter={v => `${v}x`} />
                <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                <Line type="monotone" dataKey="ROAS" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Daily Profit */}
      <Card className="border-border/50">
        <CardHeader className="pb-1">
          <CardTitle className="text-sm">Daily Profit ($)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" tickFormatter={v => `$${v}`} />
                <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                <Line type="monotone" dataKey="Profit" stroke="hsl(var(--accent))" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// AI-powered insight summary per funnel step
function AlertSummary({ rows }: { rows: DailyFunnelRow[] }) {
  const [insights, setInsights] = useState<{ title: string; bullets: string[] }[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const latest = rows.length >= 2 ? rows[rows.length - 1] : null;

  useEffect(() => {
    if (!latest || Object.keys(latest.deltas).length === 0) return;

    const fetchInsights = async () => {
      setLoading(true);
      setError(null);
      try {
        const stepsPayload = ALL_STEPS.map(step => ({
          title: step.title,
          metrics: step.metrics.map(m => ({
            label: m.label,
            value: m.format((latest as any)[m.key] ?? 0),
            delta: latest.deltas[m.key] ?? null,
          })),
        }));

        const { data, error: fnError } = await supabase.functions.invoke("billy-daily-insights", {
          body: { steps: stepsPayload },
        });

        if (fnError) throw fnError;
        setInsights(data?.steps || []);
      } catch (e: any) {
        console.error("AI insights error:", e);
        setError("Could not generate insights");
      } finally {
        setLoading(false);
      }
    };

    fetchInsights();
  }, [latest?.date]);

  if (rows.length < 2 || !latest || Object.keys(latest.deltas).length === 0) return null;

  // Also compute raw alert counts per step for the badge
  const stepAlerts = ALL_STEPS.map(step => {
    const alerts = step.metrics.filter(m => {
      const d = latest.deltas[m.key];
      return d !== null && d !== undefined && Math.abs(d) >= ALERT_THRESHOLD;
    });
    return { title: step.title, count: alerts.length, alerts };
  });

  const totalAlerts = stepAlerts.reduce((sum, s) => sum + s.count, 0);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold">AI Performance Summary — {latest.label}</h3>
        {totalAlerts > 0 && (
          <span className="text-xs bg-destructive/10 text-destructive px-2 py-0.5 rounded-full font-medium">
            {totalAlerts} alert{totalAlerts > 1 ? "s" : ""}
          </span>
        )}
      </div>

      {loading && (
        <Card className="border-primary/20">
          <CardContent className="py-6 flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Analyzing funnel trends…</span>
          </CardContent>
        </Card>
      )}

      {error && !loading && (
        <Card className="border-destructive/20">
          <CardContent className="py-4 text-sm text-muted-foreground">{error}</CardContent>
        </Card>
      )}

      {!loading && insights && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {insights.map((step, i) => {
            const alertInfo = stepAlerts[i];
            const hasAlerts = alertInfo && alertInfo.count > 0;

            return (
              <Card key={step.title} className={`border-border/50 ${hasAlerts ? "border-l-2 border-l-destructive/60" : "border-l-2 border-l-accent/60"}`}>
                <CardHeader className="pb-1 pt-3 px-4">
                  <CardTitle className="text-xs font-semibold flex items-center gap-2">
                    {step.title}
                    {hasAlerts && (
                      <span className="flex items-center gap-1 text-destructive">
                        <AlertTriangle className="w-3 h-3" />
                        <span className="text-[10px]">{alertInfo.count}</span>
                      </span>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-3">
                  <ul className="space-y-1.5">
                    {step.bullets.map((bullet, j) => (
                      <li key={j} className="text-xs text-muted-foreground leading-relaxed flex gap-2">
                        <span className="text-primary mt-0.5 shrink-0">•</span>
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>

                  {/* Key delta badges inline */}
                  {hasAlerts && (
                    <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-border/30">
                      {alertInfo.alerts.map(m => {
                        const d = latest.deltas[m.key]!;
                        const isPositive = m.invertColor ? d <= 0 : d >= 0;
                        return (
                          <span key={m.key} className={`inline-flex items-center gap-0.5 text-[10px] font-mono font-medium px-1.5 py-0.5 rounded ${
                            isPositive ? "bg-accent/10 text-accent" : "bg-destructive/10 text-destructive"
                          }`}>
                            {d >= 0 ? <ArrowUpRight className="w-2.5 h-2.5" /> : <ArrowDownRight className="w-2.5 h-2.5" />}
                            {m.label} {d >= 0 ? "+" : ""}{d.toFixed(1)}%
                          </span>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

const BillyDailyTrends = () => {
  const { data: rows, isLoading } = useBillyDailyTrends();

  if (isLoading) return <Skeleton className="h-[400px] rounded-xl" />;
  if (!rows || rows.length === 0) return null;

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div className="flex items-center gap-3">
        <div className="h-8 w-1 rounded-full bg-primary" />
        <div>
          <h2 className="text-lg font-bold tracking-tight flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            📊 Daily Trends & Alerts
          </h2>
          <p className="text-xs text-muted-foreground">
            Day-over-day delta tracking across all funnel steps — flags metrics with &gt;10% change
          </p>
        </div>
      </div>

      {/* Alert Summary */}
      <AlertSummary rows={rows} />

      {/* Trend Charts */}
      <TrendCharts rows={rows} />

      {/* Detailed Tables by Step */}
      <Tabs defaultValue="all" className="w-full">
        <TabsList className="bg-secondary/50">
          <TabsTrigger value="all">All Steps</TabsTrigger>
          <TabsTrigger value="step1">Traffic</TabsTrigger>
          <TabsTrigger value="step2">Landing Page</TabsTrigger>
          <TabsTrigger value="step3">Calls</TabsTrigger>
          <TabsTrigger value="step4">Revenue</TabsTrigger>
        </TabsList>

        <TabsContent value="all">
          <div className="space-y-4">
            {ALL_STEPS.map((step, i) => (
              <Card key={i} className="border-primary/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">{step.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <DailyTable rows={rows} metrics={step.metrics} />
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {ALL_STEPS.map((step, i) => (
          <TabsContent key={i} value={`step${i + 1}`}>
            <Card className="border-primary/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{step.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <DailyTable rows={rows} metrics={step.metrics} />
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
};

export default BillyDailyTrends;
