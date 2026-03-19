import { useFlightsForecast, FlightsDailyData } from "@/hooks/useFlightsForecast";
import { useVertical } from "@/contexts/VerticalContext";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Target, CalendarDays, TrendingUp, TrendingDown, DollarSign,
  Users, BarChart3, Phone,
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  LineChart, Line, Legend,
} from "recharts";

const FlightsForecastCard = () => {
  const { data: fc, isLoading, error } = useFlightsForecast();
  const { activeVertical } = useVertical();

  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Not enough data to generate forecast. Sync more data first.
        </CardContent>
      </Card>
    );
  }

  if (isLoading) return <Skeleton className="h-[500px] rounded-xl" />;
  if (!fc) return null;

  const monthProgress = fc.daysInMonth > 0
    ? Math.round((fc.daysElapsed / fc.daysInMonth) * 100)
    : 0;

  const profitPositive = fc.projectedProfit >= 0;
  const mtdProfitPositive = fc.mtdProfit >= 0;

  // Chart data — format dates nicely
  const chartData = fc.dailyData.map(d => ({
    ...d,
    label: new Date(d.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }),
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-8 w-1 rounded-full bg-primary" />
        <div>
          <h2 className="text-lg font-bold tracking-tight flex items-center gap-2">
            <Target className="w-5 h-5 text-primary" />
            {activeVertical.emoji} {activeVertical.label} — {fc.month} Profit Forecast
          </h2>
          <p className="text-xs text-muted-foreground">
            Projecting monthly profit using 4-step funnel: Daily Budget × LP CVR × RPV = Revenue − Spend
          </p>
        </div>
      </div>

      {/* Month Progress */}
      <Card className="border-primary/20">
        <CardContent className="pt-5 pb-4">
          <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
            <span className="flex items-center gap-1.5">
              <CalendarDays className="w-3.5 h-3.5" />
              Day {fc.daysElapsed} of {fc.daysInMonth} ({fc.daysRemaining} remaining)
            </span>
            <span>{monthProgress}%</span>
          </div>
          <Progress value={monthProgress} className="h-2" />
        </CardContent>
      </Card>

      {/* Profit Hero */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="border-primary/20">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              {mtdProfitPositive ? <TrendingUp className="w-3.5 h-3.5 text-accent" /> : <TrendingDown className="w-3.5 h-3.5 text-destructive" />}
              MTD Profit
            </div>
            <p className={`text-2xl font-bold font-mono ${mtdProfitPositive ? "text-accent" : "text-destructive"}`}>
              {mtdProfitPositive ? "" : "−"}${Math.abs(fc.mtdProfit).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Rev ${fc.mtdRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })} − Spend ${fc.mtdSpend.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
          </CardContent>
        </Card>
        <Card className={`border ${profitPositive ? "border-accent/40 bg-accent/5" : "border-destructive/40 bg-destructive/5"}`}>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              {profitPositive ? <TrendingUp className="w-3.5 h-3.5 text-accent" /> : <TrendingDown className="w-3.5 h-3.5 text-destructive" />}
              Projected Month Profit
            </div>
            <p className={`text-2xl font-bold font-mono ${profitPositive ? "text-accent" : "text-destructive"}`}>
              {profitPositive ? "" : "−"}${Math.abs(fc.projectedProfit).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Rev ${fc.projectedRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })} − Spend ${fc.projectedSpend.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Funnel Projection Breakdown */}
      <Card className="border-primary/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary" />
            Projected Month Totals
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
            <MiniMetric label="Proj. Spend" value={`$${Math.round(fc.projectedSpend).toLocaleString()}`} icon={<DollarSign className="w-3 h-3" />} />
            <MiniMetric label="Proj. Revenue" value={`$${Math.round(fc.projectedRevenue).toLocaleString()}`} icon={<DollarSign className="w-3 h-3" />} />
            <MiniMetric label="Proj. ROAS" value={`${fc.projectedROAS.toFixed(2)}x`} icon={<Target className="w-3 h-3" />} />
            <MiniMetric label="Proj. Visitors" value={Math.round(fc.projectedVisitors).toLocaleString()} icon={<Users className="w-3 h-3" />} />
            <MiniMetric label="Proj. Calls" value={Math.round(fc.projectedCalls).toLocaleString()} icon={<Phone className="w-3 h-3" />} />
            <MiniMetric
              label="Proj. Profit"
              value={`${profitPositive ? "" : "−"}$${Math.abs(Math.round(fc.projectedProfit)).toLocaleString()}`}
              icon={profitPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              highlight={profitPositive}
            />
          </div>
        </CardContent>
      </Card>

      {/* Trend Inputs — the "levers" */}
      <Card className="border-primary/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary" />
            Funnel Trend Inputs (Daily Averages)
          </CardTitle>
          <p className="text-xs text-muted-foreground">These trailing averages drive the projection for remaining days</p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <TrendCard label="Avg Daily Budget" value={`$${Math.round(fc.avgDailySpend).toLocaleString()}`} />
            <TrendCard label="Avg Daily Visitors" value={Math.round(fc.avgDailyVisitors).toLocaleString()} />
            <TrendCard label="LP CVR (Calls/Visitors)" value={`${fc.trendLpCvr.toFixed(2)}%`} />
            <TrendCard label="RPV (Rev/Visitor)" value={`$${fc.trendRpv.toFixed(2)}`} />
            <TrendCard label="Rev/Connected Call" value={`$${fc.trendRevenuePerCall.toFixed(2)}`} />
          </div>
        </CardContent>
      </Card>

      {/* Daily Profit Chart */}
      {chartData.length > 1 && (
        <Card className="border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Daily Profit Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `$${v}`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                    formatter={(value: number, name: string) => [`$${value.toFixed(2)}`, name]}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                  <Area type="monotone" dataKey="profit" stroke="hsl(var(--accent))" fill="hsl(var(--accent) / 0.15)" name="Profit" />
                  <Area type="monotone" dataKey="callRevenue" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.1)" name="Revenue" />
                  <Area type="monotone" dataKey="spend" stroke="hsl(var(--destructive))" fill="hsl(var(--destructive) / 0.08)" name="Spend" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* CVR & RPV Daily Trends */}
      {chartData.length > 1 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="border-primary/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">LP CVR Trend (%)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[180px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `${v}%`} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                      formatter={(value: number) => [`${value.toFixed(2)}%`, "LP CVR"]}
                    />
                    <Line type="monotone" dataKey="lpCvr" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="LP CVR" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="border-primary/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">RPV Trend ($)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[180px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `$${v}`} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                      formatter={(value: number) => [`$${value.toFixed(2)}`, "RPV"]}
                    />
                    <Line type="monotone" dataKey="rpv" stroke="hsl(var(--accent))" strokeWidth={2} dot={false} name="RPV" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

function MiniMetric({ label, value, icon, highlight }: {
  label: string; value: string; icon?: React.ReactNode; highlight?: boolean;
}) {
  return (
    <div className={`rounded-lg p-3 ${highlight ? "bg-accent/10 border border-accent/20" : "bg-secondary/40"}`}>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
        {icon}
        {label}
      </div>
      <p className={`text-base font-bold font-mono ${highlight ? "text-accent" : ""}`}>{value}</p>
    </div>
  );
}

function TrendCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-secondary/40 rounded-lg p-3">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className="text-base font-bold font-mono">{value}</p>
    </div>
  );
}

export default FlightsForecastCard;
