export const mockKPIs = {
  totalSpend: 47832,
  totalRevenue: 189450,
  blendedROAS: 3.96,
  totalConversions: 2847,
  cpc: 1.82,
  ctr: 3.24,
  cpm: 12.47,
  impressions: 3834000,
};

export const channelData = [
  { channel: "Meta Ads", spend: 22400, revenue: 89600, roas: 4.0, conversions: 1340, ctr: 3.8, color: "meta" as const },
  { channel: "Google Ads", spend: 18200, revenue: 72800, roas: 4.0, conversions: 1087, ctr: 2.9, color: "google" as const },
  { channel: "Shopify (Organic)", spend: 7232, revenue: 27050, roas: 3.74, conversions: 420, ctr: 2.1, color: "shopify" as const },
];

export const dailyPerformance = [
  { date: "Feb 1", metaSpend: 780, googleSpend: 620, revenue: 6200 },
  { date: "Feb 2", metaSpend: 820, googleSpend: 590, revenue: 5800 },
  { date: "Feb 3", metaSpend: 750, googleSpend: 680, revenue: 7100 },
  { date: "Feb 4", metaSpend: 890, googleSpend: 710, revenue: 7900 },
  { date: "Feb 5", metaSpend: 920, googleSpend: 640, revenue: 6800 },
  { date: "Feb 6", metaSpend: 860, googleSpend: 720, revenue: 8200 },
  { date: "Feb 7", metaSpend: 950, googleSpend: 690, revenue: 8800 },
  { date: "Feb 8", metaSpend: 810, googleSpend: 750, revenue: 7400 },
  { date: "Feb 9", metaSpend: 770, googleSpend: 660, revenue: 6900 },
  { date: "Feb 10", metaSpend: 900, googleSpend: 700, revenue: 8500 },
  { date: "Feb 11", metaSpend: 830, googleSpend: 730, revenue: 7600 },
  { date: "Feb 12", metaSpend: 880, googleSpend: 680, revenue: 8100 },
  { date: "Feb 13", metaSpend: 940, googleSpend: 740, revenue: 9200 },
  { date: "Feb 14", metaSpend: 1020, googleSpend: 810, revenue: 10500 },
];

export const topCampaigns = [
  { name: "Prospecting - Lookalike 1%", channel: "Meta", spend: 5200, revenue: 24800, roas: 4.77, status: "active" },
  { name: "Brand Search - Exact", channel: "Google", spend: 3100, revenue: 18600, roas: 6.0, status: "active" },
  { name: "Retargeting - Cart Abandon", channel: "Meta", spend: 2800, revenue: 14000, roas: 5.0, status: "active" },
  { name: "Shopping - Top Products", channel: "Google", spend: 4500, revenue: 16200, roas: 3.6, status: "active" },
  { name: "DPA - Broad", channel: "Meta", spend: 3900, revenue: 11700, roas: 3.0, status: "paused" },
];
