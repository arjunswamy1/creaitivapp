const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const STELLAR_BASE = "https://api.gostellar.app/v1";

// Simple in-memory cache (persists for function invocation lifetime)
const cache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL_MS) return entry.data as T;
  cache.delete(key);
  return null;
}

function setCache(key: string, data: unknown) {
  cache.set(key, { data, ts: Date.now() });
}

// Vertical → experiment matching rules
// Matches experiment name OR URL against these patterns (case-insensitive)
interface VerticalRule {
  namePatterns: string[];
  urlPatterns: string[];
}

const VERTICAL_RULES: Record<string, VerticalRule> = {
  flights: {
    namePatterns: ["flight"],
    urlPatterns: ["flight", "cheap-flights", "cheapflights"],
  },
  "pest-control": {
    namePatterns: ["pest", "bed bug", "bedbug", "exterminator", "termite"],
    urlPatterns: ["pest", "bedbug", "bed-bug", "exterminator"],
  },
  "porta-potties": {
    namePatterns: ["porta", "potty"],
    urlPatterns: ["porta", "potty"],
  },
};

function matchesVertical(experiment: StellarExperiment, verticalId: string): boolean {
  const rules = VERTICAL_RULES[verticalId];
  if (!rules) return false;
  const name = (experiment.name || "").toLowerCase();
  const url = (experiment.url || "").toLowerCase();
  return (
    rules.namePatterns.some((p) => name.includes(p)) ||
    rules.urlPatterns.some((p) => url.includes(p))
  );
}

// Stellar API types
interface StellarExperiment {
  id: string;
  name: string;
  url?: string;
  status?: string;
  type?: string;
  created_at?: string;
  started_at?: string;
  ended_at?: string;
  paused_at?: string;
  [key: string]: unknown;
}

interface StellarExperimentDetail extends StellarExperiment {
  goals?: StellarGoal[];
  variants?: StellarVariant[];
  statistical_significance?: number | null;
}

interface StellarGoal {
  id: string;
  name: string;
  primary?: boolean;
  [key: string]: unknown;
}

interface StellarVariant {
  id: string;
  name: string;
  is_control?: boolean;
  traffic_split?: number;
  unique_visitors?: number;
  conversions?: number;
  conversion_rate?: number;
  squashed_conversions?: number;
  squashed_conversion_rate?: number;
  url?: string;
  [key: string]: unknown;
}

async function stellarFetch(path: string, apiKey: string): Promise<Response> {
  return fetch(`${STELLAR_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const STELLAR_API_KEY = Deno.env.get("STELLAR_API_KEY");
  if (!STELLAR_API_KEY) {
    return new Response(
      JSON.stringify({ error: "STELLAR_API_KEY is not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const url = new URL(req.url);
    const vertical = url.searchParams.get("vertical") || "";
    const statusFilter = url.searchParams.get("status") || "";

    if (!vertical) {
      return new Response(
        JSON.stringify({ error: "Missing required parameter: vertical" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!VERTICAL_RULES[vertical]) {
      return new Response(
        JSON.stringify({ error: `Unknown vertical: ${vertical}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Fetch experiments list (cached)
    const listCacheKey = `experiments_list_${statusFilter}`;
    let experiments: StellarExperiment[] | null = getCached(listCacheKey);

    if (!experiments) {
      const listUrl = statusFilter
        ? `/experiments?status=${encodeURIComponent(statusFilter)}`
        : "/experiments";
      const listRes = await stellarFetch(listUrl, STELLAR_API_KEY);

      if (listRes.status === 401) {
        return new Response(
          JSON.stringify({ error: "Unauthorized – invalid Stellar API key" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (listRes.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limited by Stellar API. Please try again shortly." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (!listRes.ok) {
        const body = await listRes.text();
        return new Response(
          JSON.stringify({ error: `Stellar API error [${listRes.status}]: ${body}` }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const json = await listRes.json();
      experiments = Array.isArray(json) ? json : json.data || json.experiments || [];
      setCache(listCacheKey, experiments);
    }

    // 2. Filter to vertical
    const filtered = (experiments as StellarExperiment[]).filter((e) =>
      matchesVertical(e, vertical)
    );

    // 3. Fetch details for each (with per-experiment caching, max 10 concurrent)
    const details: StellarExperimentDetail[] = [];

    // Batch in groups of 10 to respect rate limits
    for (let i = 0; i < filtered.length; i += 10) {
      const batch = filtered.slice(i, i + 10);
      const results = await Promise.all(
        batch.map(async (exp) => {
          const detailCacheKey = `experiment_${exp.id}`;
          const cached = getCached<StellarExperimentDetail>(detailCacheKey);
          if (cached) return cached;

          try {
            const res = await stellarFetch(`/experiments/${exp.id}`, STELLAR_API_KEY);
            if (!res.ok) {
              console.error(`Failed to fetch experiment ${exp.id}: ${res.status}`);
              return { ...exp, goals: [], variants: [] } as StellarExperimentDetail;
            }
            const detail = await res.json();
            const result = (detail.data || detail) as StellarExperimentDetail;
            setCache(detailCacheKey, result);
            return result;
          } catch (err) {
            console.error(`Error fetching experiment ${exp.id}:`, err);
            return { ...exp, goals: [], variants: [] } as StellarExperimentDetail;
          }
        })
      );
      details.push(...results);
    }

    // 4. Normalize response
    const normalized = details.map((exp) => {
      const variants = (exp.variants || []).map((v) => ({
        id: v.id,
        name: v.name,
        isControl: v.is_control ?? false,
        trafficSplit: v.traffic_split ?? null,
        uniqueVisitors: v.unique_visitors ?? 0,
        conversions: v.conversions ?? 0,
        conversionRate: v.conversion_rate ?? 0,
        squashedConversions: v.squashed_conversions ?? 0,
        squashedConversionRate: v.squashed_conversion_rate ?? 0,
        url: v.url ?? null,
      }));

      const goals = (exp.goals || []).map((g) => ({
        id: g.id,
        name: g.name,
        primary: g.primary ?? false,
      }));

      const primaryGoal = goals.find((g) => g.primary) || goals[0] || null;

      // Infer winner: variant with highest conversion rate that isn't control
      const control = variants.find((v) => v.isControl);
      const nonControl = variants.filter((v) => !v.isControl);
      let inferredWinner: string | null = null;
      if (control && nonControl.length > 0) {
        const best = nonControl.reduce((a, b) =>
          b.conversionRate > a.conversionRate ? b : a
        );
        if (best.conversionRate > (control.conversionRate || 0)) {
          inferredWinner = best.name;
        }
      }

      return {
        vertical,
        experimentId: exp.id,
        experimentName: exp.name,
        status: exp.status || "unknown",
        type: exp.type || null,
        url: exp.url || null,
        startedAt: exp.started_at || null,
        endedAt: exp.ended_at || null,
        pausedAt: exp.paused_at || null,
        createdAt: exp.created_at || null,
        mainGoal: primaryGoal?.name || null,
        goals,
        variants,
        statisticalSignificance: exp.statistical_significance ?? null,
        inferredWinner,
      };
    });

    return new Response(
      JSON.stringify({
        experiments: normalized,
        lastSynced: new Date().toISOString(),
        vertical,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Stellar proxy error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
