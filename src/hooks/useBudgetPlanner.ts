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
}

// Fetch baseline (no target_subs needed)
export function useBudgetBaseline(clientId: string | undefined) {
  return useQuery<BudgetPlan>({
    queryKey: ["budget-baseline", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("budget-planner", {
        body: { client_id: clientId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as BudgetPlan;
    },
    staleTime: 10 * 60 * 1000,
  });
}

export function useBudgetPlanner(targetSubs: number | null, clientId: string | undefined) {
  return useQuery<BudgetPlan>({
    queryKey: ["budget-planner", targetSubs, clientId],
    enabled: !!targetSubs && targetSubs > 0 && !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("budget-planner", {
        body: { target_subs: targetSubs, client_id: clientId },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as BudgetPlan;
    },
    staleTime: 5 * 60 * 1000,
  });
}
