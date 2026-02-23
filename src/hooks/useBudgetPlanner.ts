import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PlatformBudget {
  platform: string;
  monthly_budget: number;
  daily_budget: number;
  split_pct: number;
}

export interface CampaignBudget {
  platform: string;
  campaign_name: string;
  platform_campaign_id: string;
  monthly_budget: number;
  daily_budget: number;
  share_pct: number;
  historical_cac: number | null;
  historical_roas: number;
  historical_ctr: number;
  recent_30d_spend: number;
  total_90d_spend: number;
  total_90d_conversions: number;
}

export interface ProfitEconomics {
  avg_order_revenue: number;
  avg_order_cogs: number;
  avg_order_tax_shipping: number;
  avg_order_discounts: number;
  cac: number;
  profit_per_customer: number;
  target_profit: number;
}

export interface BudgetPlan {
  target_month: string;
  days_in_month: number;
  target_subs: number;
  projection_cac: number;
  cac_30d: number;
  cac_60d: number;
  cac_90d: number;
  cac_trend_pct: number;
  total_budget: number;
  last_year_baseline: {
    month: string;
    new_subscribers: number;
    suggested_goal: number;
  };
  platform_budgets: PlatformBudget[];
  campaign_budgets: CampaignBudget[];
  lookback_stats: {
    total_spend_90d: number;
    total_subs_90d: number;
    total_spend_60d: number;
    total_subs_60d: number;
    total_spend_30d: number;
    total_subs_30d: number;
    active_campaigns: number;
  };
  ai_insight: string;
  profit_economics: ProfitEconomics | null;
}

// Fetch baseline (no target_subs needed)
export function useBudgetBaseline(clientId: string | undefined, revenueSource?: string) {
  return useQuery<BudgetPlan>({
    queryKey: ["budget-baseline", clientId, revenueSource],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("budget-planner", {
        body: { client_id: clientId, revenue_source: revenueSource || "subbly" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as BudgetPlan;
    },
    staleTime: 10 * 60 * 1000,
  });
}

export function useBudgetPlanner(
  targetSubs: number | null,
  clientId: string | undefined,
  revenueSource?: string,
  targetProfit?: number | null,
) {
  return useQuery<BudgetPlan>({
    queryKey: ["budget-planner", targetSubs, clientId, revenueSource, targetProfit],
    enabled: (!!targetSubs && targetSubs > 0 && !!clientId) || (!!targetProfit && targetProfit > 0 && !!clientId),
    queryFn: async () => {
      const body: Record<string, unknown> = { client_id: clientId, revenue_source: revenueSource || "subbly" };
      if (targetProfit && targetProfit > 0) {
        body.target_profit = targetProfit;
      } else if (targetSubs && targetSubs > 0) {
        body.target_subs = targetSubs;
      }
      const { data, error } = await supabase.functions.invoke("budget-planner", { body });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as BudgetPlan;
    },
    staleTime: 5 * 60 * 1000,
  });
}
