/**
 * Billy.com Vertical Configuration
 * 
 * Each vertical maps campaign name patterns (case-insensitive) to platforms.
 * A campaign matches a vertical if its name contains ANY of the listed patterns.
 * 
 * Each platform can optionally specify account IDs to scope queries to specific
 * ad accounts. If no accountIds are specified, all accounts are included.
 * 
 * To add a new vertical or adjust matching:
 * 1. Add/edit an entry in BILLY_VERTICALS
 * 2. Add patterns for each platform where campaigns run
 * 3. Optionally specify accountIds per platform to scope to specific ad accounts
 * 4. Ringba patterns match on campaign_name from Ringba call data
 */

export interface PlatformConfig {
  patterns: string[];
  /** Optional: restrict to specific ad account IDs. If empty/omitted, all accounts match. */
  accountIds?: string[];
}

export interface VerticalConfig {
  id: string;
  label: string;
  emoji: string;
  description: string;
  /** Campaign name patterns and optional account IDs per platform */
  platforms: {
    meta?: PlatformConfig;
    google?: PlatformConfig;
    ringba?: PlatformConfig;
  };
}

export const BILLY_VERTICALS: VerticalConfig[] = [
  {
    id: "flights",
    label: "Flights",
    emoji: "✈️",
    description: "Premium & Mixed Flights lead-gen funnel",
    platforms: {
      meta: { patterns: ["Flight"] },
      google: { patterns: ["Flight"], accountIds: ["1939246766"] },
      ringba: { patterns: ["Flight"] },
    },
  },
  {
    id: "porta-potties",
    label: "Porta Potties",
    emoji: "🚽",
    description: "Porta Potty rental lead-gen funnel",
    platforms: {
      meta: { patterns: ["Porta", "Potty"] },
      google: { patterns: ["Porta", "Potty"], accountIds: ["1939246766"] },
      ringba: { patterns: ["Porta", "Potty", "Portapotty"] },
    },
  },
  {
    id: "pest-control",
    label: "Pest Control",
    emoji: "🐛",
    description: "Pest Control lead-gen funnel",
    platforms: {
      meta: { patterns: ["Pest", "PestControl"], accountIds: ["448669084867269", "1779578786137314"] },
      google: { patterns: ["Pest"], accountIds: ["1939246766"] },
      ringba: { patterns: ["Pest Control US Call Flow"], exactMatch: true },
    },
  },
];

/** Check if a campaign name matches any pattern for a given platform */
export function matchesVertical(
  campaignName: string,
  vertical: VerticalConfig,
  platform: "meta" | "google" | "ringba"
): boolean {
  const cfg = vertical.platforms[platform];
  if (!cfg || cfg.patterns.length === 0) return false;
  const lower = (campaignName || "").toLowerCase();
  return cfg.patterns.some((p) => lower.includes(p.toLowerCase()));
}

/** Check if a record's account_id matches the vertical's configured accounts for a platform */
export function matchesVerticalAccount(
  accountId: string | null | undefined,
  vertical: VerticalConfig,
  platform: "meta" | "google"
): boolean {
  const cfg = vertical.platforms[platform];
  // If no accountIds configured, all accounts match
  if (!cfg?.accountIds || cfg.accountIds.length === 0) return true;
  if (!accountId) return false;
  return cfg.accountIds.includes(accountId);
}

/** Get all ad platforms configured for a vertical */
export function getAdPlatforms(vertical: VerticalConfig): ("meta" | "google")[] {
  const platforms: ("meta" | "google")[] = [];
  if (vertical.platforms.meta?.patterns?.length) platforms.push("meta");
  if (vertical.platforms.google?.patterns?.length) platforms.push("google");
  return platforms;
}

/** Get configured account IDs for a platform in a vertical (empty = all accounts) */
export function getVerticalAccountIds(
  vertical: VerticalConfig,
  platform: "meta" | "google"
): string[] {
  return vertical.platforms[platform]?.accountIds || [];
}
