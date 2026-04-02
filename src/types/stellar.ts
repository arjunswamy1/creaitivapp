/** Normalized Stellar A/B test experiment models */

export interface StellarVariant {
  id: string;
  name: string;
  isControl: boolean;
  trafficSplit: number | null;
  uniqueVisitors: number;
  conversions: number;
  conversionRate: number;
  squashedConversions: number;
  squashedConversionRate: number;
  url: string | null;
}

export interface StellarGoal {
  id: string;
  name: string;
  primary: boolean;
}

export interface StellarExperiment {
  vertical: string;
  experimentId: string;
  experimentName: string;
  status: string;
  type: string | null;
  url: string | null;
  startedAt: string | null;
  endedAt: string | null;
  pausedAt: string | null;
  createdAt: string | null;
  mainGoal: string | null;
  goals: StellarGoal[];
  variants: StellarVariant[];
  statisticalSignificance: number | null;
  inferredWinner: string | null;
}

export interface StellarResponse {
  experiments: StellarExperiment[];
  lastSynced: string;
  vertical: string;
}

export type StellarStatusFilter = "all" | "running" | "completed" | "paused";

export type StellarSortOption = "newest" | "significance" | "conversion_rate";
