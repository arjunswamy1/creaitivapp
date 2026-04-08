import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useClient } from "@/contexts/ClientContext";
import { useDateRange } from "@/contexts/DateRangeContext";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

function useConversionRateTrend() {
  const { dateRange } = useDateRange();
  const fromStr = format(dateRange.from, "yyyy-MM-dd");
  const toStr = format(dateRange.to, "yyyy-MM-dd");
  const { activeClient } = useClient();
  const clientId = activeClient?.id;

  return useQuery({
    queryKey: ["conv-rate-trend", fromStr, toStr, clientId],
    enabled: !!clientId,
    queryFn: async () => {
      if (!clientId) return [];

      const [{ data: twData, error }, { data: adData }] = await Promise.all([
        supabase
          .from("triplewhale_summary")
          .select("date, meta_tw_purchases, meta_spend, meta_tw_revenue")
          .eq("client_id", clientId)
          .gte("date", fromStr)
          .lte("date", toStr)
          .order("date", { ascending: true }),
        supabase
          .from("ad_daily_metrics")
          .select("date, clicks")
          .eq("platform", "meta")
          .eq("client_id", clientId)
          .gte("date", fromStr)
          .lte("date", toStr),
      ]);

      if (error) throw error;

      // Sum clicks by date from ad platform
      const clicksByDate = new Map<string, number>();
      for (const row of (adData || [])) {
        const d = row.date;
        clicksByDate.set(d, (clicksByDate.get(d) || 0) + Number(row.clicks || 0));
      }

      return (twData || []).map((row: any) => {
        const clicks = clicksByDate.get(row.date) || 0;
        const purchases = Number(row.meta_tw_purchases || 0);
        const convRate = clicks > 0 ? (purchases / clicks) * 100 : 0;
        return {
          date: row.date,
          label: format(new Date(row.date + "T00:00:00"), "MMM d"),
          convRate: Math.round(convRate * 1000) / 1000,
          purchases,
          clicks,
          spend: Math.round(Number(row.meta_spend || 0)),
          revenue: Math.round(Number(row.meta_tw_revenue || 0)),
        };
      });
    },
  });
}

const ConversionRateTrend = () => {
  const { data, isLoading } = useConversionRateTrend();

  if (isLoading) {
    return <Skeleton className="h-[360px] rounded-xl" />;
  }

  if (!data || data.length === 0) {
    return null;
  }

  const avgRate =
    data.reduce((s, d) => s + d.convRate, 0) / data.length;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          Site Conversion Rate Trend
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          TW Purchases ÷ Meta Clicks — daily conversion rate (%)
        </p>
      </CardHeader>
      <CardContent>
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11 }}
                className="fill-muted-foreground"
              />
              <YAxis
                tickFormatter={(v) => `${v}%`}
                tick={{ fontSize: 11 }}
                className="fill-muted-foreground"
                width={50}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.[0]) return null;
                  const d = payload[0].payload;
                  return (
                    <div className="rounded-lg border bg-popover p-3 shadow-md text-sm">
                      <p className="font-medium text-foreground mb-1">{d.label}</p>
                      <p className="text-primary">Conv. Rate: {d.convRate}%</p>
                      <p className="text-muted-foreground">Purchases: {d.purchases}</p>
                      <p className="text-muted-foreground">Clicks: {d.clicks.toLocaleString()}</p>
                      <p className="text-muted-foreground">Spend: ${d.spend.toLocaleString()}</p>
                      <p className="text-muted-foreground">TW Revenue: ${d.revenue.toLocaleString()}</p>
                    </div>
                  );
                }}
              />
              <ReferenceLine
                y={Math.round(avgRate * 1000) / 1000}
                stroke="hsl(var(--muted-foreground))"
                strokeDasharray="4 4"
                label={{
                  value: `Avg ${(Math.round(avgRate * 1000) / 1000)}%`,
                  position: "right",
                  fontSize: 11,
                  fill: "hsl(var(--muted-foreground))",
                }}
              />
              <Line
                type="monotone"
                dataKey="convRate"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={{ r: 3, fill: "hsl(var(--primary))" }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};

export default ConversionRateTrend;
