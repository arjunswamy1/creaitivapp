import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { dailyPerformance } from "@/data/mockData";

const SpendRevenueChart = () => {
  return (
    <div className="glass-card p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold">Spend vs Revenue</h3>
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-meta" />
            <span className="text-muted-foreground">Meta Spend</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-google" />
            <span className="text-muted-foreground">Google Spend</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-accent" />
            <span className="text-muted-foreground">Revenue</span>
          </div>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={dailyPerformance} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
          <defs>
            <linearGradient id="metaGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(214, 89%, 52%)" stopOpacity={0.3} />
              <stop offset="95%" stopColor="hsl(214, 89%, 52%)" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="googleGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(36, 100%, 55%)" stopOpacity={0.3} />
              <stop offset="95%" stopColor="hsl(36, 100%, 55%)" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(150, 62%, 48%)" stopOpacity={0.3} />
              <stop offset="95%" stopColor="hsl(150, 62%, 48%)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 14%, 18%)" />
          <XAxis dataKey="date" stroke="hsl(215, 12%, 52%)" fontSize={12} tickLine={false} />
          <YAxis stroke="hsl(215, 12%, 52%)" fontSize={12} tickLine={false} tickFormatter={(v) => `$${v}`} />
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(220, 18%, 12%)",
              border: "1px solid hsl(220, 14%, 18%)",
              borderRadius: "8px",
              color: "hsl(210, 20%, 92%)",
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: "12px",
            }}
            formatter={(value: number) => [`$${value.toLocaleString()}`, undefined]}
          />
          <Area type="monotone" dataKey="metaSpend" stroke="hsl(214, 89%, 52%)" fill="url(#metaGradient)" strokeWidth={2} />
          <Area type="monotone" dataKey="googleSpend" stroke="hsl(36, 100%, 55%)" fill="url(#googleGradient)" strokeWidth={2} />
          <Area type="monotone" dataKey="revenue" stroke="hsl(150, 62%, 48%)" fill="url(#revenueGradient)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

export default SpendRevenueChart;
