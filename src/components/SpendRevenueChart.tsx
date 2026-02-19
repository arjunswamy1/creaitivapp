import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Bar, ComposedChart } from "recharts";
import { useSpendSubsDaily } from "@/hooks/useCrossChannelData";
import { Skeleton } from "@/components/ui/skeleton";

const SpendRevenueChart = () => {
  const { data: dailyData, isLoading } = useSpendSubsDaily();

  if (isLoading) {
    return <Skeleton className="h-[380px] rounded-xl" />;
  }

  const hasGoogle = dailyData?.some((d) => d.googleSpend > 0);

  return (
    <div className="glass-card p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold">Spend vs New Subscribers</h3>
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-meta" />
            <span className="text-muted-foreground">Meta Spend</span>
          </div>
          {hasGoogle && (
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-google" />
              <span className="text-muted-foreground">Google Spend</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-accent" />
            <span className="text-muted-foreground">New Subs</span>
          </div>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={dailyData || []} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
          <defs>
            <linearGradient id="metaGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(214, 89%, 52%)" stopOpacity={0.3} />
              <stop offset="95%" stopColor="hsl(214, 89%, 52%)" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="googleGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(36, 100%, 55%)" stopOpacity={0.3} />
              <stop offset="95%" stopColor="hsl(36, 100%, 55%)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 14%, 18%)" />
          <XAxis dataKey="date" stroke="hsl(215, 12%, 52%)" fontSize={12} tickLine={false} />
          <YAxis yAxisId="spend" stroke="hsl(215, 12%, 52%)" fontSize={12} tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
          <YAxis yAxisId="subs" orientation="right" stroke="hsl(150, 62%, 48%)" fontSize={12} tickLine={false} allowDecimals={false} />
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(220, 18%, 12%)",
              border: "1px solid hsl(220, 14%, 18%)",
              borderRadius: "8px",
              color: "hsl(210, 20%, 92%)",
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: "12px",
            }}
            formatter={(value: number, name: string) => {
              if (name === "newSubs") return [value, "New Subs"];
              return [`$${value.toLocaleString()}`, name === "metaSpend" ? "Meta Spend" : "Google Spend"];
            }}
          />
          <Area yAxisId="spend" type="monotone" dataKey="metaSpend" stroke="hsl(214, 89%, 52%)" fill="url(#metaGradient)" strokeWidth={2} />
          {hasGoogle && <Area yAxisId="spend" type="monotone" dataKey="googleSpend" stroke="hsl(36, 100%, 55%)" fill="url(#googleGradient)" strokeWidth={2} />}
          <Bar yAxisId="subs" dataKey="newSubs" fill="hsl(150, 62%, 48%)" opacity={0.7} barSize={16} radius={[3, 3, 0, 0]} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};

export default SpendRevenueChart;
