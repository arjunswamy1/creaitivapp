import { useState, useMemo } from "react";
import { useTopCampaigns, useCampaignAdSets, useAdSetAds, useAdGroupKeywords, useKeywordSearchTerms, useAdSetSearchTerms } from "@/hooks/useAdData";
import { useRingbaByVertical } from "@/hooks/useRingbaByVertical";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { type VerticalConfig, matchesVertical } from "@/config/billyVerticals";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { BidStrategyDetails } from "@/hooks/useAdData";

interface RingbaEnriched {
  ringbaRevenue: number;
  ringbaConversions: number;
  ringbaRoas: number;
}

function BidStrategyBadge({ strategy, details }: { strategy: string; details: BidStrategyDetails | null }) {
  const hasDetails = details && Object.keys(details).length > 0;

  if (!hasDetails) {
    return <Badge variant="secondary" className="text-xs font-normal">{strategy}</Badge>;
  }

  return (
    <Popover>
      <PopoverTrigger asChild onClick={(e) => e.stopPropagation()}>
        <Badge variant="secondary" className="text-xs font-normal cursor-pointer hover:bg-secondary/80 transition-colors border border-dashed border-primary/30">
          {strategy} ▾
        </Badge>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-4" align="start" onClick={(e) => e.stopPropagation()}>
        <h4 className="font-semibold text-sm mb-3">Bid Strategy Details</h4>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Strategy</span>
            <span className="font-medium">{strategy}</span>
          </div>
          {details.maxCpcBidCeiling != null && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Max CPC Bid</span>
              <span className="font-mono font-medium">${details.maxCpcBidCeiling.toFixed(2)}</span>
            </div>
          )}
          {details.targetCpa != null && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Target CPA</span>
              <span className="font-mono font-medium">${details.targetCpa.toFixed(2)}</span>
            </div>
          )}
          {details.targetRoas != null && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Target ROAS</span>
              <span className="font-mono font-medium">{details.targetRoas.toFixed(2)}x</span>
            </div>
          )}
          {details.targetSpend != null && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Target Spend</span>
              <span className="font-mono font-medium">${details.targetSpend.toFixed(2)}</span>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

const CampaignTable = ({ platform, verticalFilter }: { platform?: string; verticalFilter?: VerticalConfig }) => {
  const { data: rawCampaigns, isLoading } = useTopCampaigns(platform);
  const { data: ringba } = useRingbaByVertical();

  // Filter campaigns by vertical if provided
  const campaigns = useMemo(() => {
    if (!verticalFilter || !rawCampaigns) return rawCampaigns;
    return rawCampaigns.filter(c => {
      const plat = (c.platform || platform || "") as "meta" | "google" | "ringba";
      return matchesVertical(c.name, verticalFilter, plat);
    });
  }, [rawCampaigns, verticalFilter, platform]);
  const [expandedCampaign, setExpandedCampaign] = useState<string | null>(null);
  const [expandedPlatform, setExpandedPlatform] = useState<string | null>(null);
  const isGoogle = platform === "google";
  const isMeta = platform === "meta";

  // Use active vertical Ringba data for proportional attribution
  const ringbaEnrichment = useMemo(() => {
    if (!isMeta || !campaigns || !ringba) return new Map<string, RingbaEnriched>();

    const totalSpend = campaigns.reduce((s, c) => s + c.spend, 0);
    const activeRevenue = ringba.active?.totalRevenue ?? 0;
    const activeConversions = ringba.active?.convertedCalls ?? 0;

    const result = new Map<string, RingbaEnriched>();
    for (const c of campaigns) {
      const spendShare = totalSpend > 0 ? c.spend / totalSpend : 0;
      const rev = Math.round(activeRevenue * spendShare);
      const conv = Math.round(activeConversions * spendShare);
      const roas = c.spend > 0 ? Math.round((rev / c.spend) * 100) / 100 : 0;
      result.set(c.name, { ringbaRevenue: rev, ringbaConversions: conv, ringbaRoas: roas });
    }
    return result;
  }, [isMeta, campaigns, ringba]);

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
                <th className="text-left py-3 text-muted-foreground font-medium">Type</th>
                <th className="text-left py-3 text-muted-foreground font-medium">Bid Strategy</th>
                <th className="text-right py-3 text-muted-foreground font-medium">Spend</th>
                {isGoogle && <th className="text-right py-3 text-muted-foreground font-medium">Budget/Day</th>}
                {!isGoogle && <th className="text-right py-3 text-muted-foreground font-medium">Revenue{isMeta ? " (Ringba)" : ""}</th>}
                {!isGoogle && <th className="text-right py-3 text-muted-foreground font-medium">ROAS</th>}
                <th className="text-right py-3 text-muted-foreground font-medium">Conv.</th>
                <th className="text-right py-3 text-muted-foreground font-medium">CPA</th>
                {isGoogle && <th className="text-right py-3 text-muted-foreground font-medium">Clicks</th>}
                {isGoogle && <th className="text-right py-3 text-muted-foreground font-medium">Impr.</th>}
                {isGoogle && <th className="text-right py-3 text-muted-foreground font-medium">CPC</th>}
                {isGoogle && <th className="text-right py-3 text-muted-foreground font-medium">IS%</th>}
                <th className="text-right py-3 text-muted-foreground font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => {
                const enriched = ringbaEnrichment.get(c.name);
                const displayRevenue = isMeta && enriched ? enriched.ringbaRevenue : c.revenue;
                const displayRoas = isMeta && enriched ? enriched.ringbaRoas : c.roas;
                const displayConversions = isMeta && enriched ? enriched.ringbaConversions : c.conversions;
                const displayCpa = displayConversions > 0 ? Math.round(c.spend / displayConversions) : null;

                return (
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
                    <td className="py-3 text-xs text-muted-foreground">{c.campaignType || "—"}</td>
                    <td className="py-3">
                      {c.biddingStrategy ? (
                        <BidStrategyBadge strategy={c.biddingStrategy} details={c.bidStrategyDetails} />
                      ) : "—"}
                    </td>
                    <td className="py-3 text-right font-mono">${c.spend.toLocaleString()}</td>
                    {!isGoogle && <td className="py-3 text-right font-mono">${displayRevenue.toLocaleString()}</td>}
                    {!isGoogle && <td className="py-3 text-right font-mono">{displayRoas}x</td>}
                    <td className="py-3 text-right font-mono">{displayConversions.toLocaleString()}</td>
                    <td className="py-3 text-right font-mono">{displayCpa != null ? `$${displayCpa}` : "—"}</td>
                    {isGoogle && <td className="py-3 text-right font-mono">{c.clicks.toLocaleString()}</td>}
                    {isGoogle && <td className="py-3 text-right font-mono">{c.impressions >= 1000 ? `${(c.impressions / 1000).toFixed(1)}K` : c.impressions.toLocaleString()}</td>}
                    {isGoogle && <td className="py-3 text-right font-mono">{c.clicks > 0 ? `$${(c.spend / c.clicks).toFixed(2)}` : "—"}</td>}
                    {isGoogle && (
                      <td className="py-3 text-right font-mono">
                        {c.impressionShare != null ? (
                          <span className={c.impressionShare < 0.5 ? "text-destructive" : ""}>{(c.impressionShare * 100).toFixed(0)}%</span>
                        ) : "—"}
                      </td>
                    )}
                    <td className="py-3 text-right">
                      <Badge variant={c.status === "active" || c.status === "enabled" ? "default" : "secondary"} className={c.status === "active" || c.status === "enabled" ? "bg-accent/20 text-accent border-accent/30" : ""}>
                        {c.status}
                      </Badge>
                    </td>
                  </tr>
                  {expandedCampaign === c.name && (
                    <tr key={`${c.name}-detail`}>
                       <td colSpan={isGoogle ? 13 : 11} className="p-0">
                        <AdSetDetail campaignName={c.name} platform={c.platform} />
                      </td>
                    </tr>
                  )}
                </>
                );
              })}
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
  const isGoogle = platform === "google";

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
            <th className="text-left py-2 text-muted-foreground font-medium text-xs"></th>
            <th className="text-left py-2 text-muted-foreground font-medium text-xs"></th>
            <th className="text-right py-2 text-muted-foreground font-medium text-xs">Spend</th>
            {!isGoogle && <th className="text-right py-2 text-muted-foreground font-medium text-xs">Revenue</th>}
            {!isGoogle && <th className="text-right py-2 text-muted-foreground font-medium text-xs">ROAS</th>}
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
                <td></td>
                <td></td>
                <td className="py-2 text-right font-mono text-xs">${as.spend.toLocaleString()}</td>
                {!isGoogle && <td className="py-2 text-right font-mono text-xs">${as.revenue.toLocaleString()}</td>}
                {!isGoogle && <td className="py-2 text-right font-mono text-xs">{as.roas}x</td>}
                <td className="py-2 text-right font-mono text-xs">{as.conversions.toLocaleString()}</td>
                <td className="py-2 text-right">
                  <Badge variant="secondary" className="text-xs">{as.status}</Badge>
                </td>
              </tr>
              {expandedAdSet?.name === as.name && (
                <tr key={`${as.name}-detail`}>
                  <td colSpan={isGoogle ? 8 : 10} className="p-0">
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
  const [expandedKeyword, setExpandedKeyword] = useState<string | null>(null);

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
            <th className="text-right py-1.5 text-muted-foreground font-medium">Conv.</th>
            <th className="text-right py-1.5 text-muted-foreground font-medium">CTR</th>
            <th className="text-right py-1.5 text-muted-foreground font-medium">CPC</th>
            <th className="text-right py-1.5 text-muted-foreground font-medium">CPA</th>
            <th className="text-right py-1.5 text-muted-foreground font-medium">QS</th>
          </tr>
        </thead>
        <tbody>
          {keywords.map((kw) => {
            const kwKey = `${kw.keyword}__${kw.matchType}`;
            return (
              <>
                <tr
                  key={kwKey}
                  className="border-b border-border/10 hover:bg-secondary/40 transition-colors cursor-pointer"
                  onClick={() => setExpandedKeyword(expandedKeyword === kwKey ? null : kwKey)}
                >
                  <td className="w-8 pl-6">
                    {expandedKeyword === kwKey ? (
                      <ChevronDown className="w-3 h-3 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="w-3 h-3 text-muted-foreground" />
                    )}
                  </td>
                  <td className="py-1.5 pl-16 font-medium max-w-[240px] truncate">{kw.keyword}</td>
                  <td className="py-1.5">
                    <Badge variant="outline" className="text-[10px] capitalize">{kw.matchType}</Badge>
                  </td>
                  <td className="py-1.5 text-right font-mono">${kw.spend.toLocaleString()}</td>
                  <td className="py-1.5 text-right font-mono">{kw.conversions.toLocaleString()}</td>
                  <td className="py-1.5 text-right font-mono">{kw.ctr}%</td>
                  <td className="py-1.5 text-right font-mono">{kw.cpc != null ? `$${kw.cpc.toFixed(2)}` : "—"}</td>
                  <td className="py-1.5 text-right font-mono">{kw.cpa != null ? `$${kw.cpa}` : "—"}</td>
                  <td className="py-1.5 text-right font-mono">
                    {kw.qualityScore != null ? (
                      <span className={kw.qualityScore < 5 ? "text-destructive" : kw.qualityScore >= 7 ? "text-accent" : ""}>
                        {kw.qualityScore}/10
                      </span>
                    ) : "—"}
                  </td>
                </tr>
                {expandedKeyword === kwKey && (
                  <tr key={`${kwKey}-st`}>
                    <td colSpan={9} className="p-0">
                      <SearchTermDetail adsetId={adsetId} keywordText={kw.keyword} />
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SearchTermDetail({ adsetId, keywordText }: { adsetId: string; keywordText: string }) {
  const { data: searchTerms, isLoading } = useKeywordSearchTerms(adsetId, keywordText);

  if (isLoading) {
    return <div className="p-4 pl-24"><Skeleton className="h-12 rounded-lg" /></div>;
  }

  if (!searchTerms || searchTerms.length === 0) {
    return (
      <div className="px-24 py-3 bg-secondary/40 text-xs text-muted-foreground">
        No search term data available for this keyword.
      </div>
    );
  }

  return (
    <div className="bg-secondary/40 border-t border-border/10">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border/10">
            <th className="w-8"></th>
            <th className="text-left py-1 pl-24 text-muted-foreground font-medium text-[10px]">Search Term</th>
            <th className="text-right py-1 text-muted-foreground font-medium text-[10px]">Spend</th>
            <th className="text-right py-1 text-muted-foreground font-medium text-[10px]">Clicks</th>
            <th className="text-right py-1 text-muted-foreground font-medium text-[10px]">Impr.</th>
            <th className="text-right py-1 text-muted-foreground font-medium text-[10px]">CTR</th>
            <th className="text-right py-1 text-muted-foreground font-medium text-[10px]">CPC</th>
            <th className="text-right py-1 text-muted-foreground font-medium text-[10px]">Conv.</th>
            <th className="text-right py-1 text-muted-foreground font-medium text-[10px]">CPA</th>
          </tr>
        </thead>
        <tbody>
          {searchTerms.map((st) => (
            <tr key={st.searchTerm} className="border-b border-border/5 hover:bg-secondary/50 transition-colors">
              <td className="w-8"></td>
              <td className="py-1 pl-24 font-medium max-w-[220px] truncate">{st.searchTerm}</td>
              <td className="py-1 text-right font-mono">${st.spend.toLocaleString()}</td>
              <td className="py-1 text-right font-mono">{st.clicks.toLocaleString()}</td>
              <td className="py-1 text-right font-mono">{st.impressions.toLocaleString()}</td>
              <td className="py-1 text-right font-mono">{st.ctr}%</td>
              <td className="py-1 text-right font-mono">{st.cpc != null ? `$${st.cpc.toFixed(2)}` : "—"}</td>
              <td className="py-1 text-right font-mono">{st.conversions.toLocaleString()}</td>
              <td className="py-1 text-right font-mono">{st.cpa != null ? `$${st.cpa}` : "—"}</td>
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