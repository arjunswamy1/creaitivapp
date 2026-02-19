import { useChannelBreakdown } from "@/hooks/useAdData";
import { Skeleton } from "@/components/ui/skeleton";

const ChannelBreakdown = () => {
  const { data: channelData, isLoading } = useChannelBreakdown();

  if (isLoading) {
    return <Skeleton className="h-[300px] rounded-xl" />;
  }

  const totalSpend = (channelData || []).reduce((sum, c) => sum + c.spend, 0);

  return (
    <div className="glass-card p-6">
      <h3 className="text-lg font-semibold mb-5">Channel Breakdown</h3>
      {(!channelData || channelData.length === 0) ? (
        <p className="text-muted-foreground text-sm">No channel data available yet.</p>
      ) : (
        <div className="space-y-5">
          {channelData.map((ch) => {
            const pct = totalSpend > 0 ? ((ch.spend / totalSpend) * 100).toFixed(0) : "0";
            const platformClass = ch.color === "meta" ? "platform-meta" : ch.color === "google" ? "platform-google" : "platform-shopify";
            const glowClass = ch.color === "meta" ? "glow-meta" : ch.color === "google" ? "glow-google" : "glow-shopify";

            return (
              <div key={ch.channel} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-2.5 h-2.5 rounded-full ${platformClass} ${glowClass}`} />
                    <span className="font-medium text-sm">{ch.channel}</span>
                  </div>
                  <span className="font-mono text-sm text-muted-foreground">{pct}% of spend</span>
                </div>
                <div className="h-2 rounded-full bg-secondary overflow-hidden">
                  <div
                    className={`h-full rounded-full ${platformClass} transition-all duration-700`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="flex gap-6 text-xs text-muted-foreground">
                  <span>Spend: <span className="font-mono text-foreground">${ch.spend.toLocaleString()}</span></span>
                  <span>Revenue: <span className="font-mono text-foreground">${ch.revenue.toLocaleString()}</span></span>
                  <span>ROAS: <span className="font-mono text-foreground">{ch.roas}x</span></span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ChannelBreakdown;
