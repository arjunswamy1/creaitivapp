import { useBillyDailyTrends, DailyFunnelRow } from "@/hooks/useBillyDailyTrends";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, TrendingUp, Calendar } from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";

// Aggregate rows by week (ISO week start = Monday)
function aggregateByWeek(rows: DailyFunnelRow[]) {
  const weeks = new Map<string, { label: string; spend: number; clicks: number; totalCalls: number; connectedCalls: number; callRevenue: number; profit: number; impressions: number; days: number }>();
  for (const r of rows) {
    const d = new Date(r.date + "T12:00:00");
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const weekStart = new Date(d.setDate(diff));
    const key = weekStart.toISOString().split("T")[0];
    const existing = weeks.get(key) || { label: `Wk ${key.slice(5)}`, spend: 0, clicks: 0, totalCalls: 0, connectedCalls: 0, callRevenue: 0, profit: 0, impressions: 0, days: 0 };
    existing.spend += r.spend;
    existing.clicks += r.clicks;
    existing.totalCalls += r.totalCalls;
    existing.connectedCalls += r.connectedCalls;
    existing.callRevenue += r.callRevenue;
    existing.profit += r.profit;
    existing.impressions += r.impressions;
    existing.days++;
    weeks.set(key, existing);
  }
  return Array.from(weeks.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => ({
      ...v,
      cpc: v.clicks > 0 ? v.spend / v.clicks : 0,
      connectRate: v.totalCalls > 0 ? (v.connectedCalls / v.totalCalls) * 100 : 0,
      roas: v.spend > 0 ? v.callRevenue / v.spend : 0,
    }));
}

// Aggregate rows by month
function aggregateByMonth(rows: DailyFunnelRow[]) {
  const months = new Map<string, { label: string; spend: number; clicks: number; totalCalls: number; connectedCalls: number; callRevenue: number; profit: number; impressions: number; days: number }>();
  for (const r of rows) {
    const key = r.date.slice(0, 7);
    const existing = months.get(key) || { label: key, spend: 0, clicks: 0, totalCalls: 0, connectedCalls: 0, callRevenue: 0, profit: 0, impressions: 0, days: 0 };
    existing.spend += r.spend;
    existing.clicks += r.clicks;
    existing.totalCalls += r.totalCalls;
    existing.connectedCalls += r.connectedCalls;
    existing.callRevenue += r.callRevenue;
    existing.profit += r.profit;
    existing.impressions += r.impressions;
    existing.days++;
    months.set(key, existing);
  }
  return Array.from(months.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => ({
      ...v,
      cpc: v.clicks > 0 ? v.spend / v.clicks : 0,
      connectRate: v.totalCalls > 0 ? (v.connectedCalls / v.totalCalls) * 100 : 0,
      roas: v.spend > 0 ? v.callRevenue / v.spend : 0,
    }));
}

function ChartGrid({ data, labelKey }: { data: any[]; labelKey: string }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Spend & Revenue */}
      <Card className="border-border/50">
        <CardHeader className="pb-1"><CardTitle className="text-sm">Spend vs Revenue</CardTitle></CardHeader>
        <CardContent>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey={labelKey} tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" tickFormatter={v => `$${v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}`} />
                <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="spend" name="Spend" fill="hsl(var(--destructive))" radius={[2, 2, 0, 0]} />
                <Bar dataKey="callRevenue" name="Revenue" fill="hsl(var(--accent))" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Profit */}
      <Card className="border-border/50">
        <CardHeader className="pb-1"><CardTitle className="text-sm">Profit</CardTitle></CardHeader>
        <CardContent>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey={labelKey} tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" tickFormatter={v => `$${v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}`} />
                <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="profit" name="Profit" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* CPC Trend */}
      <Card className="border-border/50">
        <CardHeader className="pb-1"><CardTitle className="text-sm">CPC Trend</CardTitle></CardHeader>
        <CardContent>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey={labelKey} tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" tickFormatter={v => `$${v.toFixed(2)}`} />
                <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                <Line type="monotone" dataKey="cpc" name="CPC" stroke="hsl(var(--destructive))" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* ROAS & Connect Rate */}
      <Card className="border-border/50">
        <CardHeader className="pb-1"><CardTitle className="text-sm">ROAS & Connect Rate</CardTitle></CardHeader>
        <CardContent>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey={labelKey} tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="roas" name="ROAS" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="connectRate" name="Connect %" stroke="hsl(var(--accent))" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// KPI summary table
function KPISummaryTable({ data, labelKey }: { data: any[]; labelKey: string }) {
  return (
    <Card className="border-primary/20">
      <CardContent className="pt-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/50">
                <th className="text-left pb-2 text-xs text-muted-foreground font-medium">Period</th>
                <th className="text-right pb-2 text-xs text-muted-foreground font-medium">Spend</th>
                <th className="text-right pb-2 text-xs text-muted-foreground font-medium">Revenue</th>
                <th className="text-right pb-2 text-xs text-muted-foreground font-medium">Profit</th>
                <th className="text-right pb-2 text-xs text-muted-foreground font-medium">CPC</th>
                <th className="text-right pb-2 text-xs text-muted-foreground font-medium">ROAS</th>
                <th className="text-right pb-2 text-xs text-muted-foreground font-medium">Calls</th>
                <th className="text-right pb-2 text-xs text-muted-foreground font-medium">Connect %</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => (
                <tr key={i} className="border-b border-border/20 last:border-0">
                  <td className="py-2 text-xs font-medium">{row[labelKey]}</td>
                  <td className="py-2 text-right text-xs font-mono">${Math.round(row.spend).toLocaleString()}</td>
                  <td className="py-2 text-right text-xs font-mono">${Math.round(row.callRevenue).toLocaleString()}</td>
                  <td className={`py-2 text-right text-xs font-mono ${row.profit >= 0 ? "text-accent" : "text-destructive"}`}>
                    {row.profit < 0 ? "−" : ""}${Math.abs(Math.round(row.profit)).toLocaleString()}
                  </td>
                  <td className="py-2 text-right text-xs font-mono">${row.cpc.toFixed(2)}</td>
                  <td className="py-2 text-right text-xs font-mono">{row.roas.toFixed(2)}x</td>
                  <td className="py-2 text-right text-xs font-mono">{row.totalCalls.toLocaleString()}</td>
                  <td className="py-2 text-right text-xs font-mono">{row.connectRate.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

const BillyTrendAnalysis = () => {
  const { data: rows, isLoading } = useBillyDailyTrends();

  if (isLoading) return <Skeleton className="h-[400px] rounded-xl" />;
  if (!rows || rows.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground text-sm">
          No trend data available for the selected date range.
        </CardContent>
      </Card>
    );
  }

  const weeklyData = aggregateByWeek(rows);
  const monthlyData = aggregateByMonth(rows);

  // Daily chart data
  const dailyChartData = rows.map(r => ({
    label: r.label,
    spend: Math.round(r.spend),
    callRevenue: Math.round(r.callRevenue),
    profit: Math.round(r.profit),
    cpc: Math.round(r.cpc * 1000) / 1000,
    roas: Math.round(r.callROAS * 100) / 100,
    connectRate: Math.round(r.connectRate * 10) / 10,
    totalCalls: r.totalCalls,
    connectedCalls: r.connectedCalls,
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-8 w-1 rounded-full bg-primary" />
        <div>
          <h2 className="text-lg font-bold tracking-tight flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            📈 Trend Analysis
          </h2>
          <p className="text-xs text-muted-foreground">
            Daily, weekly, and monthly performance trends for the Flights vertical
          </p>
        </div>
      </div>

      <Tabs defaultValue="daily" className="w-full">
        <TabsList className="bg-secondary/50">
          <TabsTrigger value="daily" className="gap-1.5">
            <BarChart3 className="w-3.5 h-3.5" />
            Daily
          </TabsTrigger>
          <TabsTrigger value="weekly" className="gap-1.5">
            <Calendar className="w-3.5 h-3.5" />
            Weekly
          </TabsTrigger>
          <TabsTrigger value="monthly" className="gap-1.5">
            <TrendingUp className="w-3.5 h-3.5" />
            Monthly
          </TabsTrigger>
        </TabsList>

        <TabsContent value="daily" className="space-y-4">
          <ChartGrid data={dailyChartData} labelKey="label" />
          <KPISummaryTable data={dailyChartData} labelKey="label" />
        </TabsContent>

        <TabsContent value="weekly" className="space-y-4">
          <ChartGrid data={weeklyData} labelKey="label" />
          <KPISummaryTable data={weeklyData} labelKey="label" />
        </TabsContent>

        <TabsContent value="monthly" className="space-y-4">
          <ChartGrid data={monthlyData} labelKey="label" />
          <KPISummaryTable data={monthlyData} labelKey="label" />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default BillyTrendAnalysis;
