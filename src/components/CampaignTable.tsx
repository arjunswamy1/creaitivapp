import { useState } from "react";
import { useTopCampaigns, useCampaignAdSets } from "@/hooks/useAdData";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronDown, ChevronRight, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

const CampaignTable = () => {
  const { data: campaigns, isLoading } = useTopCampaigns();
  const [expandedCampaign, setExpandedCampaign] = useState<string | null>(null);
  const [expandedPlatform, setExpandedPlatform] = useState<string | null>(null);

  const toggleExpand = (name: string, platform: string) => {
    if (expandedCampaign === name) {
      setExpandedCampaign(null);
      setExpandedPlatform(null);
    } else {
      setExpandedCampaign(name);
      setExpandedPlatform(platform);
    }
  };

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
                <th className="text-left py-3 text-muted-foreground font-medium w-8"></th>
                <th className="text-left py-3 text-muted-foreground font-medium">Campaign</th>
                <th className="text-left py-3 text-muted-foreground font-medium">Channel</th>
                <th className="text-right py-3 text-muted-foreground font-medium">Spend</th>
                <th className="text-right py-3 text-muted-foreground font-medium">Revenue</th>
                <th className="text-right py-3 text-muted-foreground font-medium">ROAS</th>
                <th className="text-right py-3 text-muted-foreground font-medium">Conv.</th>
                <th className="text-right py-3 text-muted-foreground font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <>
                  <tr
                    key={c.name}
                    className="border-b border-border/50 hover:bg-secondary/30 transition-colors cursor-pointer"
                    onClick={() => toggleExpand(c.name, c.platform)}
                  >
                    <td className="py-3 pl-2">
                      {expandedCampaign === c.name ? (
                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      )}
                    </td>
                    <td className="py-3 font-medium max-w-[280px] truncate">{c.name}</td>
                    <td className="py-3">
                      <Badge variant="outline" className={c.channel === "Meta" ? "border-meta/50 text-meta" : "border-google/50 text-google"}>
                        {c.channel}
                      </Badge>
                    </td>
                    <td className="py-3 text-right font-mono">${c.spend.toLocaleString()}</td>
                    <td className="py-3 text-right font-mono">${c.revenue.toLocaleString()}</td>
                    <td className="py-3 text-right font-mono">{c.roas}x</td>
                    <td className="py-3 text-right font-mono">{c.conversions.toLocaleString()}</td>
                    <td className="py-3 text-right">
                      <Badge variant={c.status === "active" ? "default" : "secondary"} className={c.status === "active" ? "bg-accent/20 text-accent border-accent/30" : ""}>
                        {c.status}
                      </Badge>
                    </td>
                  </tr>
                  {expandedCampaign === c.name && (
                    <tr key={`${c.name}-detail`}>
                      <td colSpan={8} className="p-0">
                        <AdSetDetail campaignName={c.name} platform={c.platform} />
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

function AdSetDetail({ campaignName, platform }: { campaignName: string; platform: string }) {
  const { data: adSets, isLoading } = useCampaignAdSets(campaignName, platform);

  if (isLoading) {
    return <div className="p-4"><Skeleton className="h-20 rounded-lg" /></div>;
  }

  if (!adSets || adSets.length === 0) {
    return (
      <div className="px-8 py-4 bg-secondary/20 text-sm text-muted-foreground">
        No ad set data available for this campaign.
      </div>
    );
  }

  return (
    <div className="bg-secondary/20 border-t border-border/30">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/30">
            <th className="w-8"></th>
            <th className="text-left py-2 pl-10 text-muted-foreground font-medium text-xs">Ad Set</th>
            <th className="text-left py-2 text-muted-foreground font-medium text-xs"></th>
            <th className="text-right py-2 text-muted-foreground font-medium text-xs">Spend</th>
            <th className="text-right py-2 text-muted-foreground font-medium text-xs">Revenue</th>
            <th className="text-right py-2 text-muted-foreground font-medium text-xs">ROAS</th>
            <th className="text-right py-2 text-muted-foreground font-medium text-xs">Conv.</th>
            <th className="text-right py-2 text-muted-foreground font-medium text-xs">Status</th>
          </tr>
        </thead>
        <tbody>
          {adSets.map((as) => (
            <tr key={as.name} className="border-b border-border/20 hover:bg-secondary/30 transition-colors">
              <td className="w-8"></td>
              <td className="py-2 pl-10 font-medium text-xs max-w-[260px] truncate">{as.name}</td>
              <td></td>
              <td className="py-2 text-right font-mono text-xs">${as.spend.toLocaleString()}</td>
              <td className="py-2 text-right font-mono text-xs">${as.revenue.toLocaleString()}</td>
              <td className="py-2 text-right font-mono text-xs">{as.roas}x</td>
              <td className="py-2 text-right font-mono text-xs">{as.conversions.toLocaleString()}</td>
              <td className="py-2 text-right">
                <Badge variant="secondary" className="text-xs">{as.status}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default CampaignTable;
