-- 1. Plan catalog
CREATE TABLE public.subbly_plans (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  plan_id integer NOT NULL,
  plan_name text NOT NULL,
  kind text NOT NULL DEFAULT 'self_pay',
  term_months integer,
  price_cents integer,
  is_legacy boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT subbly_plans_kind_check CHECK (kind IN ('self_pay','gift','other')),
  CONSTRAINT subbly_plans_client_plan_key UNIQUE (client_id, plan_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.subbly_plans TO authenticated;
GRANT ALL ON public.subbly_plans TO service_role;

ALTER TABLE public.subbly_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view plans"
ON public.subbly_plans FOR SELECT TO authenticated
USING (client_id IS NULL OR public.is_client_member(auth.uid(), client_id) OR public.is_agency_admin(auth.uid()));

CREATE POLICY "Agency admins can insert plans"
ON public.subbly_plans FOR INSERT TO authenticated
WITH CHECK (public.is_agency_admin(auth.uid()));

CREATE POLICY "Agency admins can update plans"
ON public.subbly_plans FOR UPDATE TO authenticated
USING (public.is_agency_admin(auth.uid()));

CREATE TRIGGER update_subbly_plans_updated_at
BEFORE UPDATE ON public.subbly_plans
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_subbly_plans_plan_id ON public.subbly_plans(plan_id);

-- 2. Seed the catalog (client_id NULL = global mapping, applies to every client)
INSERT INTO public.subbly_plans (client_id, plan_id, plan_name, kind, term_months, price_cents, is_legacy) VALUES
  (NULL, 400181, 'Self-Pay Monthly',        'self_pay', 1,   4900,  false),
  (NULL, 400183, 'Self-Pay 3 Month',        'self_pay', 3,  14100,  false),
  (NULL, 400185, 'Self-Pay 6 Month',        'self_pay', 6,  24900,  false),
  (NULL, 400188, 'Self-Pay 12 Month',       'self_pay', 12, 49620,  false),
  (NULL, 345302, 'Gift Monthly',            'gift',     1,   5200,  false),
  (NULL, 398594, 'Gift 3 Month',            'gift',     3,  16500,  false),
  (NULL, 398596, 'Gift 6 Month',            'gift',     6,  29400,  false),
  (NULL, 398598, 'Gift 12 Month',           'gift',     12, 54000,  false),
  (NULL, 337236, 'Self-Pay Monthly (Legacy)',  'self_pay', 1,   4700, true),
  (NULL, 337238, 'Self-Pay 3 Month (Legacy)',  'self_pay', 3,  13500, true),
  (NULL, 337240, 'Self-Pay 6 Month (Legacy)',  'self_pay', 6,  25800, true),
  (NULL, 337242, 'Self-Pay 12 Month (Legacy)', 'self_pay', 12, 49200, true),
  (NULL, 335379, 'Gift 3 Month (Legacy)',      'gift',     3,  14700, true),
  (NULL, 335464, 'Gift 6 Month (Legacy)',      'gift',     6,  28950, true),
  (NULL, 335466, 'Gift 12 Month (Legacy)',     'gift',     12, 51600, true),
  (NULL, 323159, 'Self-Pay Monthly (Legacy2)',  'self_pay', 1,   4500, true),
  (NULL, 323199, 'Self-Pay 3 Month (Legacy2)',  'self_pay', 3,  12900, true),
  (NULL, 323200, 'Self-Pay 6 Month (Legacy2)',  'self_pay', 6,  25200, true),
  (NULL, 323201, 'Self-Pay 12 Month (Legacy2)', 'self_pay', 12, 48000, true),
  (NULL, 323158, 'Quarterly Membership',        'other',    3,   4900, true),
  (NULL, 323153, 'Annual Quarterly Membership', 'other',    12, 18800, true),
  (NULL, 319035, 'Annual Quarterly Membership (Legacy)', 'other', 12, 17800, true);

-- 3. Attribution fields for future click-level LTV
ALTER TABLE public.subbly_subscriptions
  ADD COLUMN IF NOT EXISTS utm_source text,
  ADD COLUMN IF NOT EXISTS utm_medium text,
  ADD COLUMN IF NOT EXISTS utm_campaign text,
  ADD COLUMN IF NOT EXISTS utm_content text,
  ADD COLUMN IF NOT EXISTS utm_term text,
  ADD COLUMN IF NOT EXISTS ad_id text,
  ADD COLUMN IF NOT EXISTS click_id text,
  ADD COLUMN IF NOT EXISTS survey_source text;

CREATE INDEX IF NOT EXISTS idx_subbly_subs_ad_id ON public.subbly_subscriptions(client_id, ad_id);
CREATE INDEX IF NOT EXISTS idx_subbly_subs_utm ON public.subbly_subscriptions(client_id, utm_source);
CREATE INDEX IF NOT EXISTS idx_subbly_subs_created ON public.subbly_subscriptions(client_id, subbly_created_at);

-- 4. Plan mix + LTV per plan for a date range
CREATE OR REPLACE FUNCTION public.subbly_plan_mix(_client_id uuid, _from date, _to date)
RETURNS TABLE(
  plan_id integer,
  plan_name text,
  kind text,
  term_months integer,
  price_cents integer,
  new_subs bigint,
  new_customer_subs bigint,
  realized_revenue numeric,
  realized_per_sub numeric,
  projected_ltv_per_sub numeric,
  projected_revenue numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH cohort AS (
  SELECT s.subbly_id, s.product_id, s.customer_id,
         NOT EXISTS (
           SELECT 1 FROM subbly_invoices pi
           WHERE pi.client_id = s.client_id
             AND pi.customer_id = s.customer_id
             AND pi.status = 'paid'
             AND pi.invoice_date < s.subbly_created_at
         ) AS is_new_customer
  FROM subbly_subscriptions s
  WHERE s.client_id = _client_id
    AND s.subbly_created_at IS NOT NULL
    AND (s.subbly_created_at AT TIME ZONE 'America/New_York')::date BETWEEN _from AND _to
),
cohort_rev AS (
  SELECT c.product_id,
         count(*) AS new_subs,
         count(*) FILTER (WHERE c.is_new_customer) AS new_customer_subs,
         COALESCE(SUM((
           SELECT COALESCE(SUM(i.amount), 0) / 100.0
           FROM subbly_invoices i
           WHERE i.client_id = _client_id AND i.status = 'paid' AND i.subscription_id = c.subbly_id
         )), 0) AS realized_revenue
  FROM cohort c
  GROUP BY c.product_id
),
mature AS (
  SELECT s.product_id,
         AVG((
           SELECT COALESCE(SUM(i.amount), 0) / 100.0
           FROM subbly_invoices i
           WHERE i.client_id = _client_id AND i.status = 'paid' AND i.subscription_id = s.subbly_id
         )) AS mature_ltv
  FROM subbly_subscriptions s
  WHERE s.client_id = _client_id
    AND s.subbly_created_at IS NOT NULL
    AND s.subbly_created_at < now() - interval '12 months'
  GROUP BY s.product_id
)
SELECT
  cr.product_id AS plan_id,
  COALESCE(p.plan_name, 'Plan ' || cr.product_id) AS plan_name,
  COALESCE(p.kind, 'other') AS kind,
  p.term_months,
  p.price_cents,
  cr.new_subs,
  cr.new_customer_subs,
  ROUND(cr.realized_revenue, 2) AS realized_revenue,
  ROUND(CASE WHEN cr.new_subs > 0 THEN cr.realized_revenue / cr.new_subs ELSE 0 END, 2) AS realized_per_sub,
  ROUND(COALESCE(m.mature_ltv, GREATEST(COALESCE(p.price_cents, 0) / 100.0,
        CASE WHEN cr.new_subs > 0 THEN cr.realized_revenue / cr.new_subs ELSE 0 END)), 2) AS projected_ltv_per_sub,
  ROUND(cr.new_subs * COALESCE(m.mature_ltv, GREATEST(COALESCE(p.price_cents, 0) / 100.0,
        CASE WHEN cr.new_subs > 0 THEN cr.realized_revenue / cr.new_subs ELSE 0 END)), 2) AS projected_revenue
FROM cohort_rev cr
LEFT JOIN subbly_plans p ON p.plan_id = cr.product_id AND (p.client_id = _client_id OR p.client_id IS NULL)
LEFT JOIN mature m ON m.product_id = cr.product_id
ORDER BY cr.new_subs DESC;
$$;

-- 5. Blended LTV summary for a date range
CREATE OR REPLACE FUNCTION public.subbly_ltv_summary(_client_id uuid, _from date, _to date)
RETURNS TABLE(
  new_subs bigint,
  new_customer_subs bigint,
  realized_revenue numeric,
  realized_per_sub numeric,
  projected_revenue numeric,
  projected_ltv_per_sub numeric,
  self_pay_subs bigint,
  gift_subs bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
SELECT
  COALESCE(SUM(m.new_subs), 0)::bigint,
  COALESCE(SUM(m.new_customer_subs), 0)::bigint,
  ROUND(COALESCE(SUM(m.realized_revenue), 0), 2),
  ROUND(CASE WHEN COALESCE(SUM(m.new_subs), 0) > 0
    THEN COALESCE(SUM(m.realized_revenue), 0) / SUM(m.new_subs) ELSE 0 END, 2),
  ROUND(COALESCE(SUM(m.projected_revenue), 0), 2),
  ROUND(CASE WHEN COALESCE(SUM(m.new_subs), 0) > 0
    THEN COALESCE(SUM(m.projected_revenue), 0) / SUM(m.new_subs) ELSE 0 END, 2),
  COALESCE(SUM(m.new_subs) FILTER (WHERE m.kind = 'self_pay'), 0)::bigint,
  COALESCE(SUM(m.new_subs) FILTER (WHERE m.kind = 'gift'), 0)::bigint
FROM public.subbly_plan_mix(_client_id, _from, _to) m;
$$;
