
-- Forecast snapshots table - stores all forecast calculations
CREATE TABLE public.forecast_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id),
  snapshot_type TEXT NOT NULL DEFAULT 'baseline', -- baseline, spend_adjusted, efficiency_adjusted
  scenario_params JSONB NOT NULL DEFAULT '{}'::jsonb,
  projected_revenue NUMERIC NOT NULL DEFAULT 0,
  projected_spend NUMERIC NOT NULL DEFAULT 0,
  projected_cpa NUMERIC NOT NULL DEFAULT 0,
  projected_mer NUMERIC NOT NULL DEFAULT 0,
  confidence_score NUMERIC NOT NULL DEFAULT 0,
  risk_level TEXT NOT NULL DEFAULT 'medium',
  lookback_days INTEGER NOT NULL DEFAULT 30,
  forecast_days INTEGER NOT NULL DEFAULT 30,
  daily_projections JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.forecast_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view forecast snapshots"
  ON public.forecast_snapshots FOR SELECT
  USING (is_client_member(auth.uid(), client_id));

CREATE POLICY "Service role can insert forecast snapshots"
  ON public.forecast_snapshots FOR INSERT
  WITH CHECK (true);

-- Optimization recommendations table
CREATE TABLE public.optimization_recommendations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id),
  type TEXT NOT NULL, -- Budget Reallocation, Creative Refresh, Efficiency Alert, etc.
  entity TEXT NOT NULL, -- Campaign name or ad set
  action TEXT NOT NULL, -- Recommended action description
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  projected_impact TEXT,
  confidence_score NUMERIC NOT NULL DEFAULT 0,
  risk_score TEXT NOT NULL DEFAULT 'Medium',
  status TEXT NOT NULL DEFAULT 'active', -- active, dismissed, implemented
  source_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.optimization_recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view recommendations"
  ON public.optimization_recommendations FOR SELECT
  USING (is_client_member(auth.uid(), client_id));

CREATE POLICY "Service role can insert recommendations"
  ON public.optimization_recommendations FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Members can update recommendations"
  ON public.optimization_recommendations FOR UPDATE
  USING (is_client_member(auth.uid(), client_id));

-- Variance reports table
CREATE TABLE public.variance_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id),
  report_date DATE NOT NULL DEFAULT CURRENT_DATE,
  metric TEXT NOT NULL,
  forecast_value NUMERIC NOT NULL DEFAULT 0,
  actual_value NUMERIC NOT NULL DEFAULT 0,
  variance_percent NUMERIC NOT NULL DEFAULT 0,
  severity TEXT NOT NULL DEFAULT 'Low', -- Low, Medium, High
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.variance_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view variance reports"
  ON public.variance_reports FOR SELECT
  USING (is_client_member(auth.uid(), client_id));

CREATE POLICY "Service role can insert variance reports"
  ON public.variance_reports FOR INSERT
  WITH CHECK (true);

-- Indexes
CREATE INDEX idx_forecast_snapshots_client ON public.forecast_snapshots(client_id, created_at DESC);
CREATE INDEX idx_recommendations_client ON public.optimization_recommendations(client_id, status, created_at DESC);
CREATE INDEX idx_variance_reports_client ON public.variance_reports(client_id, report_date DESC);

-- Update trigger for recommendations
CREATE TRIGGER update_recommendations_updated_at
  BEFORE UPDATE ON public.optimization_recommendations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
