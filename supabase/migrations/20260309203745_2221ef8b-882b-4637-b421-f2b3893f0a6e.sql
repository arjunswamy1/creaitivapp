ALTER TABLE public.client_dashboard_config
  ADD COLUMN IF NOT EXISTS kpi text NOT NULL DEFAULT 'ROAS',
  ADD COLUMN IF NOT EXISTS target numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS break_even_roas numeric;