import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useClient } from "@/contexts/ClientContext";
import { useDateRange } from "@/contexts/DateRangeContext";
import { format } from "date-fns";
import { isRangeIncludingTodayInNewYork } from "@/lib/newYorkTime";

export type PlanKind = "self_pay" | "gift" | "other";

export interface PlanMixRow {
  planId: number;
  planName: string;
  kind: PlanKind;
  termMonths: number | null;
  priceCents: number | null;
  newSubs: number;
  newCustomerSubs: number;
  realizedRevenue: number;
  realizedPerSub: number;
  projectedLtvPerSub: number;
  projectedRevenue: number;
}

export interface LTVSummary {
  newSubs: number;
  newCustomerSubs: number;
  realizedRevenue: number;
  realizedPerSub: number;
  projectedRevenue: number;
  projectedLtvPerSub: number;
  selfPaySubs: number;
  giftSubs: number;
}

function useRangeStrings() {
  const { dateRange } = useDateRange();
  return {
    fromStr: format(dateRange.from, "yyyy-MM-dd"),
    toStr: format(dateRange.to, "yyyy-MM-dd"),
    live: isRangeIncludingTodayInNewYork(dateRange.from, dateRange.to),
  };
}

/** New subscriptions broken out by product/plan, with realized + projected LTV. */
export function useSubblyPlanMix() {
  const { activeClient, dashboardConfig } = useClient();
  const { fromStr, toStr, live } = useRangeStrings();
  const clientId = activeClient?.id;
  const enabled = dashboardConfig?.enabled_platforms?.includes("subbly") ?? false;

  return useQuery({
    queryKey: ["subbly-plan-mix", clientId, fromStr, toStr],
    enabled: !!clientId && enabled,
    refetchInterval: live ? 60_000 : false,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<PlanMixRow[]> => {
      const { data, error } = await (supabase as any).rpc("subbly_plan_mix", {
        _client_id: clientId,
        _from: fromStr,
        _to: toStr,
      });
      if (error) throw error;
      return ((data as any[]) || []).map((r) => ({
        planId: Number(r.plan_id),
        planName: String(r.plan_name),
        kind: (r.kind || "other") as PlanKind,
        termMonths: r.term_months === null ? null : Number(r.term_months),
        priceCents: r.price_cents === null ? null : Number(r.price_cents),
        newSubs: Number(r.new_subs || 0),
        newCustomerSubs: Number(r.new_customer_subs || 0),
        realizedRevenue: Number(r.realized_revenue || 0),
        realizedPerSub: Number(r.realized_per_sub || 0),
        projectedLtvPerSub: Number(r.projected_ltv_per_sub || 0),
        projectedRevenue: Number(r.projected_revenue || 0),
      }));
    },
  });
}

/** Blended new-subscriber LTV totals for the selected range. */
export function useSubblyLTVSummary() {
  const { activeClient, dashboardConfig } = useClient();
  const { fromStr, toStr, live } = useRangeStrings();
  const clientId = activeClient?.id;
  const enabled = dashboardConfig?.enabled_platforms?.includes("subbly") ?? false;

  return useQuery({
    queryKey: ["subbly-ltv-summary", clientId, fromStr, toStr],
    enabled: !!clientId && enabled,
    refetchInterval: live ? 60_000 : false,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<LTVSummary> => {
      const { data, error } = await (supabase as any).rpc("subbly_ltv_summary", {
        _client_id: clientId,
        _from: fromStr,
        _to: toStr,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return {
        newSubs: Number(row?.new_subs || 0),
        newCustomerSubs: Number(row?.new_customer_subs || 0),
        realizedRevenue: Number(row?.realized_revenue || 0),
        realizedPerSub: Number(row?.realized_per_sub || 0),
        projectedRevenue: Number(row?.projected_revenue || 0),
        projectedLtvPerSub: Number(row?.projected_ltv_per_sub || 0),
        selfPaySubs: Number(row?.self_pay_subs || 0),
        giftSubs: Number(row?.gift_subs || 0),
      };
    },
  });
}

export interface AttributedSubRow {
  key: string;
  platform: "meta" | "google" | "other";
  label: string;
  newSubs: number;
  realizedRevenue: number;
}

export interface AttributionState {
  hasRealAttribution: boolean;
  totalSubsInRange: number;
  attributedSubs: number;
  byAd: AttributedSubRow[];
  byKeyword: AttributedSubRow[];
}

function normalizePlatform(source?: string | null): "meta" | "google" | "other" {
  const s = (source || "").toLowerCase();
  if (s.includes("facebook") || s.includes("instagram") || s.includes("meta") || s === "fb" || s === "ig") return "meta";
  if (s.includes("google") || s.includes("adwords") || s.includes("gads")) return "google";
  return "other";
}

/**
 * Real click-level attribution, when checkout passes UTMs / click IDs into Subbly.
 * Returns empty buckets (hasRealAttribution=false) until that data starts flowing.
 */
export function useSubblyAttribution() {
  const { activeClient, dashboardConfig } = useClient();
  const { dateRange } = useDateRange();
  const { fromStr, toStr, live } = useRangeStrings();
  const clientId = activeClient?.id;
  const enabled = dashboardConfig?.enabled_platforms?.includes("subbly") ?? false;

  return useQuery({
    queryKey: ["subbly-attribution", clientId, fromStr, toStr],
    enabled: !!clientId && enabled,
    refetchInterval: live ? 60_000 : false,
    queryFn: async (): Promise<AttributionState> => {
      const fromUTC = fromStr + "T00:00:00.000Z";
      const toUTC = toStr + "T23:59:59.999Z";

      const { data, error } = await (supabase as any)
        .from("subbly_subscriptions")
        .select("subbly_id, product_id, ad_id, utm_source, utm_medium, utm_campaign, utm_content, utm_term, subbly_created_at")
        .eq("client_id", clientId)
        .gte("subbly_created_at", fromUTC)
        .lte("subbly_created_at", toUTC)
        .limit(5000);
      if (error) throw error;

      const subs = (data as any[]) || [];
      const attributed = subs.filter((s) => s.ad_id || s.utm_source || s.utm_content || s.utm_term);

      let revenueBySub = new Map<number, number>();
      if (attributed.length > 0) {
        const ids = attributed.map((s) => s.subbly_id);
        for (let i = 0; i < ids.length; i += 200) {
          const chunk = ids.slice(i, i + 200);
          const { data: inv } = await (supabase as any)
            .from("subbly_invoices")
            .select("subscription_id, amount")
            .eq("client_id", clientId)
            .eq("status", "paid")
            .in("subscription_id", chunk);
          for (const row of (inv as any[]) || []) {
            const id = Number(row.subscription_id);
            revenueBySub.set(id, (revenueBySub.get(id) || 0) + Number(row.amount) / 100);
          }
        }
      }

      const agg = (keyFn: (s: any) => string | null) => {
        const map = new Map<string, AttributedSubRow>();
        for (const s of attributed) {
          const key = keyFn(s);
          if (!key) continue;
          const platform = normalizePlatform(s.utm_source);
          const existing = map.get(key) || { key, platform, label: key, newSubs: 0, realizedRevenue: 0 };
          existing.newSubs += 1;
          existing.realizedRevenue += revenueBySub.get(Number(s.subbly_id)) || 0;
          map.set(key, existing);
        }
        return Array.from(map.values()).sort((a, b) => b.newSubs - a.newSubs);
      };

      return {
        hasRealAttribution: attributed.length > 0,
        totalSubsInRange: subs.length,
        attributedSubs: attributed.length,
        byAd: agg((s) => (normalizePlatform(s.utm_source) === "meta" ? s.ad_id || s.utm_content || null : null)),
        byKeyword: agg((s) => (normalizePlatform(s.utm_source) === "google" ? s.utm_term || null : null)),
      };
    },
  });
}

export interface EntityLTVRow {
  id: string;
  name: string;
  campaignName: string;
  spend: number;
  clicks: number;
  conversions: number;
  cpa: number;
  estimatedLtv: number;
  ltvToCac: number;
  attributedSubs: number | null;
  attributedRealized: number | null;
}

/** Meta ads with modeled LTV (conversions x blended projected LTV per new subscriber). */
export function useAdLTV(ltvPerSub: number, attribution?: AttributionState) {
  const { activeClient } = useClient();
  const { fromStr, toStr } = useRangeStrings();
  const clientId = activeClient?.id;

  return useQuery({
    queryKey: ["ad-ltv", clientId, fromStr, toStr, ltvPerSub, attribution?.attributedSubs ?? 0],
    enabled: !!clientId,
    queryFn: async (): Promise<EntityLTVRow[]> => {
      const { data, error } = await supabase
        .from("ads")
        .select("platform_ad_id, ad_name, campaign_name, spend, clicks, conversions")
        .eq("client_id", clientId!)
        .eq("platform", "meta")
        .gte("date", fromStr)
        .lte("date", toStr)
        .limit(5000);
      if (error) throw error;

      const map = new Map<string, EntityLTVRow>();
      for (const row of data || []) {
        const id = String(row.platform_ad_id);
        const existing =
          map.get(id) ||
          ({
            id,
            name: row.ad_name || id,
            campaignName: row.campaign_name || "—",
            spend: 0,
            clicks: 0,
            conversions: 0,
            cpa: 0,
            estimatedLtv: 0,
            ltvToCac: 0,
            attributedSubs: null,
            attributedRealized: null,
          } as EntityLTVRow);
        existing.spend += Number(row.spend || 0);
        existing.clicks += Number(row.clicks || 0);
        existing.conversions += Number(row.conversions || 0);
        map.set(id, existing);
      }

      const adAttr = new Map((attribution?.byAd || []).map((r) => [r.key, r]));

      return Array.from(map.values())
        .filter((r) => r.spend > 0)
        .map((r) => {
          const real = adAttr.get(r.id) || adAttr.get(r.name);
          r.cpa = r.conversions > 0 ? r.spend / r.conversions : 0;
          r.estimatedLtv = r.conversions * ltvPerSub;
          r.ltvToCac = r.spend > 0 ? r.estimatedLtv / r.spend : 0;
          r.attributedSubs = real ? real.newSubs : null;
          r.attributedRealized = real ? real.realizedRevenue : null;
          return r;
        })
        .sort((a, b) => b.spend - a.spend);
    },
  });
}

/** Google keywords with modeled LTV. */
export function useKeywordLTV(ltvPerSub: number, attribution?: AttributionState) {
  const { activeClient } = useClient();
  const { fromStr, toStr } = useRangeStrings();
  const clientId = activeClient?.id;

  return useQuery({
    queryKey: ["keyword-ltv", clientId, fromStr, toStr, ltvPerSub, attribution?.attributedSubs ?? 0],
    enabled: !!clientId,
    queryFn: async (): Promise<EntityLTVRow[]> => {
      const { data, error } = await supabase
        .from("keywords")
        .select("keyword_text, match_type, campaign_name, spend, clicks, conversions")
        .eq("client_id", clientId!)
        .eq("platform", "google")
        .gte("date", fromStr)
        .lte("date", toStr)
        .limit(5000);
      if (error) throw error;

      const map = new Map<string, EntityLTVRow>();
      for (const row of data || []) {
        const id = `${row.keyword_text}|${row.match_type || ""}`;
        const existing =
          map.get(id) ||
          ({
            id,
            name: row.keyword_text,
            campaignName: row.campaign_name || "—",
            spend: 0,
            clicks: 0,
            conversions: 0,
            cpa: 0,
            estimatedLtv: 0,
            ltvToCac: 0,
            attributedSubs: null,
            attributedRealized: null,
          } as EntityLTVRow);
        existing.spend += Number(row.spend || 0);
        existing.clicks += Number(row.clicks || 0);
        existing.conversions += Number(row.conversions || 0);
        map.set(id, existing);
      }

      const kwAttr = new Map((attribution?.byKeyword || []).map((r) => [r.key.toLowerCase(), r]));

      return Array.from(map.values())
        .filter((r) => r.spend > 0)
        .map((r) => {
          const real = kwAttr.get(r.name.toLowerCase());
          r.cpa = r.conversions > 0 ? r.spend / r.conversions : 0;
          r.estimatedLtv = r.conversions * ltvPerSub;
          r.ltvToCac = r.spend > 0 ? r.estimatedLtv / r.spend : 0;
          r.attributedSubs = real ? real.newSubs : null;
          r.attributedRealized = real ? real.realizedRevenue : null;
          return r;
        })
        .sort((a, b) => b.spend - a.spend);
    },
  });
}
