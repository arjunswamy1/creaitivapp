import { useState } from "react";
import { useTopCampaigns, useCampaignAdSets, useAdSetAds, useAdGroupKeywords } from "@/hooks/useAdData";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronDown, ChevronRight } from "lucide-react";

const CampaignTable = ({ platform }: { platform?: string }) => {
  const { data: campaigns, isLoading } = useTopCampaigns(platform);
  const [expandedCampaign, setExpandedCampaign] = useState<string | null>(null);
  const [expandedPlatform, setExpandedPlatform] = useState<string | null>(null);

  const toggleExpand = (name: string, plat: string) => {
    if (expandedCampaign === name) {
      setExpandedCampaign(null);
      setExpandedPlatform(null);
    } else {
      setExpandedCampaign(name);
      setExpandedPlatform(plat);
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
                <th className="text-right py-3 text-muted-foreground font-medium">CPA</th>
                <th className="text-right py-3 text-muted-foreground font-medium">IS%</th>
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
                    <td className="py-3 text-right font-mono">{c.conversions > 0 ? `$${Math.round(c.spend / c.conversions)}` : "—"}</td>
                    <td className="py-3 text-right font-mono">
                      {c.impressionShare != null ? (
                        <span className={c.impressionShare < 0.5 ? "text-destructive" : ""}>{(c.impressionShare * 100).toFixed(0)}%</span>
                      ) : "—"}
                    </td>
                    <td className="py-3 text-right">
                      <Badge variant={c.status === "active" ? "default" : "secondary"} className={c.status === "active" ? "bg-accent/20 text-accent border-accent/30" : ""}>
                        {c.status}
                      </Badge>
                    </td>
                  </tr>
                  {expandedCampaign === c.name && (
                    <tr key={`${c.name}-detail`}>
                       <td colSpan={10} className="p-0">
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
  const [expandedAdSet, setExpandedAdSet] = useState<{ name: string; id: string } | null>(null);

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
            <>
              <tr
                key={as.name}
                className="border-b border-border/20 hover:bg-secondary/30 transition-colors cursor-pointer"
                onClick={() => setExpandedAdSet(expandedAdSet?.name === as.name ? null : { name: as.name, id: as.adsetId })}
              >
                <td className="w-8 pl-4">
                  {expandedAdSet?.name === as.name ? (
                    <ChevronDown className="w-3 h-3 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="w-3 h-3 text-muted-foreground" />
                  )}
                </td>
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
              {expandedAdSet?.name === as.name && (
                <tr key={`${as.name}-detail`}>
                  <td colSpan={10} className="p-0">
                    {platform === "google" ? (
                      <KeywordDetail adsetId={expandedAdSet.id} />
                    ) : (
                      <AdsDetail adsetId={expandedAdSet.id} />
                    )}
                  </td>
                </tr>
              )}
            </>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function KeywordDetail({ adsetId }: { adsetId: string }) {
  const { data: keywords, isLoading } = useAdGroupKeywords(adsetId);

  if (isLoading) {
    return <div className="p-4 pl-16"><Skeleton className="h-16 rounded-lg" /></div>;
  }

  if (!keywords || keywords.length === 0) {
    return (
      <div className="px-16 py-3 bg-secondary/30 text-xs text-muted-foreground">
        No keyword data available for this ad group.
      </div>
    );
  }

  return (
    <div className="bg-secondary/30 border-t border-border/20">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border/20">
            <th className="w-8"></th>
            <th className="text-left py-1.5 pl-16 text-muted-foreground font-medium">Keyword</th>
            <th className="text-left py-1.5 text-muted-foreground font-medium">Match</th>
            <th className="text-right py-1.5 text-muted-foreground font-medium">Spend</th>
            <th className="text-right py-1.5 text-muted-foreground font-medium">Revenue</th>
            <th className="text-right py-1.5 text-muted-foreground font-medium">ROAS</th>
            <th className="text-right py-1.5 text-muted-foreground font-medium">Conv.</th>
            <th className="text-right py-1.5 text-muted-foreground font-medium">CTR</th>
            <th className="text-right py-1.5 text-muted-foreground font-medium">CPA</th>
            <th className="text-right py-1.5 text-muted-foreground font-medium">QS</th>
          </tr>
        </thead>
        <tbody>
          {keywords.map((kw) => (
            <tr key={`${kw.keyword}-${kw.matchType}`} className="border-b border-border/10 hover:bg-secondary/40 transition-colors">
              <td className="w-8"></td>
              <td className="py-1.5 pl-16 font-medium max-w-[240px] truncate">{kw.keyword}</td>
              <td className="py-1.5">
                <Badge variant="outline" className="text-[10px] capitalize">{kw.matchType}</Badge>
              </td>
              <td className="py-1.5 text-right font-mono">${kw.spend.toLocaleString()}</td>
              <td className="py-1.5 text-right font-mono">${kw.revenue.toLocaleString()}</td>
              <td className="py-1.5 text-right font-mono">{kw.roas}x</td>
              <td className="py-1.5 text-right font-mono">{kw.conversions.toLocaleString()}</td>
              <td className="py-1.5 text-right font-mono">{kw.ctr}%</td>
              <td className="py-1.5 text-right font-mono">{kw.cpa != null ? `$${kw.cpa}` : "—"}</td>
              <td className="py-1.5 text-right font-mono">
                {kw.qualityScore != null ? (
                  <span className={kw.qualityScore < 5 ? "text-destructive" : kw.qualityScore >= 7 ? "text-accent" : ""}>
                    {kw.qualityScore}/10
                  </span>
                ) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AdsDetail({ adsetId }: { adsetId: string }) {
  const { data: ads, isLoading } = useAdSetAds(adsetId);

  if (isLoading) {
    return <div className="p-4 pl-16"><Skeleton className="h-16 rounded-lg" /></div>;
  }

  if (!ads || ads.length === 0) {
    return (
      <div className="px-16 py-3 bg-secondary/30 text-xs text-muted-foreground">
        No ad data available for this ad set.
      </div>
    );
  }

  return (
    <div className="bg-secondary/30 border-t border-border/20">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border/20">
            <th className="w-8"></th>
            <th className="text-left py-1.5 pl-16 text-muted-foreground font-medium">Ad</th>
            <th></th>
            <th className="text-right py-1.5 text-muted-foreground font-medium">Spend</th>
            <th className="text-right py-1.5 text-muted-foreground font-medium">Revenue</th>
            <th className="text-right py-1.5 text-muted-foreground font-medium">ROAS</th>
            <th className="text-right py-1.5 text-muted-foreground font-medium">Conv.</th>
            <th className="text-right py-1.5 text-muted-foreground font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {ads.map((ad) => (
            <tr key={ad.name} className="border-b border-border/10 hover:bg-secondary/40 transition-colors">
              <td className="w-8"></td>
              <td className="py-1.5 pl-16 font-medium max-w-[240px] truncate">{ad.name}</td>
              <td></td>
              <td className="py-1.5 text-right font-mono">${ad.spend.toLocaleString()}</td>
              <td className="py-1.5 text-right font-mono">${ad.revenue.toLocaleString()}</td>
              <td className="py-1.5 text-right font-mono">{ad.roas}x</td>
              <td className="py-1.5 text-right font-mono">{ad.conversions.toLocaleString()}</td>
              <td className="py-1.5 text-right">
                <Badge variant="secondary" className="text-[10px]">{ad.status}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default CampaignTable;
