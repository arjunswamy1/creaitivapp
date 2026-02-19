import { useTopCampaigns } from "@/hooks/useAdData";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

const CampaignTable = () => {
  const { data: campaigns, isLoading } = useTopCampaigns();

  if (isLoading) {
    return <Skeleton className="h-[300px] rounded-xl" />;
  }

  return (
    <div className="glass-card p-6">
      <h3 className="text-lg font-semibold mb-5">Top Campaigns</h3>
      {(!campaigns || campaigns.length === 0) ? (
        <p className="text-muted-foreground text-sm">No campaign data available yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-3 text-muted-foreground font-medium">Campaign</th>
                <th className="text-left py-3 text-muted-foreground font-medium">Channel</th>
                <th className="text-right py-3 text-muted-foreground font-medium">Spend</th>
                <th className="text-right py-3 text-muted-foreground font-medium">Revenue</th>
                <th className="text-right py-3 text-muted-foreground font-medium">ROAS</th>
                <th className="text-right py-3 text-muted-foreground font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c, i) => (
                <tr key={i} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                  <td className="py-3 font-medium max-w-[300px] truncate">{c.name}</td>
                  <td className="py-3">
                    <Badge variant="outline" className={c.channel === "Meta" ? "border-meta/50 text-meta" : "border-google/50 text-google"}>
                      {c.channel}
                    </Badge>
                  </td>
                  <td className="py-3 text-right font-mono">${c.spend.toLocaleString()}</td>
                  <td className="py-3 text-right font-mono">${c.revenue.toLocaleString()}</td>
                  <td className="py-3 text-right font-mono">{c.roas}x</td>
                  <td className="py-3 text-right">
                    <Badge variant={c.status === "active" ? "default" : "secondary"} className={c.status === "active" ? "bg-accent/20 text-accent border-accent/30" : ""}>
                      {c.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default CampaignTable;
