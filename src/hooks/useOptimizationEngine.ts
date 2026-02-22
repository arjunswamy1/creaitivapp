import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useClient } from "@/contexts/ClientContext";

export interface ScenarioParams {
  spend_change_pct?: number;
  cpa_improvement_pct?: number;
  ctr_improvement_pct?: number;
  cvr_improvement_pct?: number;
}

export interface BaselineForecast {
  projected_revenue: number;
  projected_spend: number;
  projected_cpa: number;
  projected_mer: number;
  avg_daily_spend: number;
  avg_daily_revenue: number;
  avg_daily_conversions: number;
  ctr: number;
  cvr: number;
  confidence_score: number;
  daily_projections: { date: string; projected_spend: number; projected_revenue: number; projected_conversions: number }[];
  projected_transactions: number;
  transaction_count_30d: number;
  avg_daily_transactions: number;
  transaction_label: string;
}

export interface SpendScenario {
  spend_change_pct: number;
  projected_spend: number;
  projected_revenue: number;
  projected_cpa: number;
  projected_mer: number;
  delta_revenue: number;
  delta_revenue_pct: number;
  projected_transactions: number;
  transaction_label: string;
}

export interface EfficiencyScenario {
  metric: string;
  improvement_pct: number;
  projected_revenue: number;
  delta_revenue: number;
  sensitivity_score: number;
  break_even_lift: number;
}

export interface VarianceItem {
  metric: string;
  forecast_value: number;
  actual_value: number;
  variance_percent: number;
  severity: "Low" | "Medium" | "High";
}

export interface Recommendation {
  type: string;
  entity: string;
  action: string;
  evidence: string[];
  projected_impact: string;
  confidence_score: number;
  risk_score: string;
  source_metrics: Record<string, number>;
}

export interface RiskAssessment {
  risk_level: "Low" | "Medium" | "High";
  confidence_score: number;
  factors: {
    data_sufficiency: number;
    volatility: number;
    conversion_volume: number;
    forecast_sensitivity: number;
  };
}

export interface CACTrend {
  cac_3d: number;
  cac_7d: number;
  cac_baseline: number;
  cac_3d_vs_baseline_pct: number;
  cac_3d_vs_7d_pct: number;
  spend_3d: number;
  spend_7d: number;
  conversions_3d: number;
  conversions_7d: number;
  signal: "increase" | "hold" | "reduce" | "pause_losers";
  signal_label: string;
  signal_detail: string;
  losing_creatives: { name: string; cpa: number; spend: number; campaign: string }[];
}

export interface OptimizationResult {
  baseline: BaselineForecast;
  spend_adjusted: SpendScenario[];
  efficiency_adjusted: EfficiencyScenario[];
  variances: VarianceItem[];
  recommendations: Recommendation[];
  risk: RiskAssessment;
  ai_insight: string;
  cac_trend: CACTrend;
  data_quality: {
    days_with_data: number;
    total_days_analyzed: number;
    revenue_source: string;
  };
  error?: string;
  message?: string;
}

export function useOptimizationEngine(scenarioParams?: ScenarioParams) {
  const { activeClient } = useClient();
  const clientId = activeClient?.id;

  return useQuery({
    queryKey: ["optimization-engine", clientId, scenarioParams],
    enabled: !!clientId,
    queryFn: async (): Promise<OptimizationResult> => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const { data, error } = await supabase.functions.invoke("optimization-engine", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { client_id: clientId, scenario_params: scenarioParams || {} },
      });

      if (error) throw error;
      if (data?.error && !data?.baseline) throw new Error(data.message || data.error);
      return data;
    },
    staleTime: 1000 * 60 * 15, // 15 min cache
    retry: 1,
  });
}

export function useRunScenario() {
  const { activeClient } = useClient();
  const clientId = activeClient?.id;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: ScenarioParams) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const { data, error } = await supabase.functions.invoke("optimization-engine", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { client_id: clientId, scenario_params: params },
      });

      if (error) throw error;
      return data as OptimizationResult;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["optimization-engine"] });
    },
  });
}

export function useRecommendationHistory() {
  const { activeClient } = useClient();
  const clientId = activeClient?.id;

  return useQuery({
    queryKey: ["recommendation-history", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("optimization_recommendations" as any)
        .select("*")
        .eq("client_id", clientId)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) throw error;
      return data || [];
    },
  });
}
