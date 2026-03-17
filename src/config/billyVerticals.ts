/**
 * Billy.com Vertical Configuration
 * 
 * Each vertical maps campaign name patterns (case-insensitive) to platforms.
 * A campaign matches a vertical if its name contains ANY of the listed patterns.
 * 
 * To add a new vertical or adjust matching:
 * 1. Add/edit an entry in BILLY_VERTICALS
 * 2. Add patterns for each platform where campaigns run
 * 3. Ringba patterns match on campaign_name from Ringba call data
 */

export interface VerticalConfig {
  id: string;
  label: string;
  emoji: string;
  description: string;
  /** Campaign name patterns per platform (case-insensitive contains match) */
  platforms: {
    meta?: string[];
    google?: string[];
    ringba?: string[];
  };
}

export const BILLY_VERTICALS: VerticalConfig[] = [
  {
    id: "flights",
    label: "Flights",
    emoji: "✈️",
    description: "Premium & Mixed Flights lead-gen funnel",
    platforms: {
      meta: ["Flight"],
      google: ["Flight"],
      ringba: ["Flight"],
    },
  },
  {
    id: "porta-potties",
    label: "Porta Potties",
    emoji: "🚽",
    description: "Porta Potty rental lead-gen funnel",
    platforms: {
      meta: ["Porta", "Potty"],
      google: ["Porta", "Potty"],
      ringba: ["Porta", "Potty"],
    },
  },
  {
    id: "pest-control",
    label: "Pest Control",
    emoji: "🐛",
    description: "Pest Control lead-gen funnel",
    platforms: {
      meta: ["Pest"],
      google: ["Pest"],
      ringba: ["Pest"],
    },
  },
];

/** Check if a campaign name matches any pattern for a given platform */
export function matchesVertical(
  campaignName: string,
  vertical: VerticalConfig,
  platform: "meta" | "google" | "ringba"
): boolean {
  const patterns = vertical.platforms[platform];
  if (!patterns || patterns.length === 0) return false;
  const lower = (campaignName || "").toLowerCase();
  return patterns.some((p) => lower.includes(p.toLowerCase()));
}

/** Get all ad platforms configured for a vertical */
export function getAdPlatforms(vertical: VerticalConfig): ("meta" | "google")[] {
  const platforms: ("meta" | "google")[] = [];
  if (vertical.platforms.meta?.length) platforms.push("meta");
  if (vertical.platforms.google?.length) platforms.push("google");
  return platforms;
}
