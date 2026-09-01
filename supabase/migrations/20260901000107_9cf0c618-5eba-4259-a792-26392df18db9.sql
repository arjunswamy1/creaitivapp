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
WITH allowed AS (
  SELECT public.is_client_member(auth.uid(), _client_id)
      OR public.is_agency_admin(auth.uid()) AS ok
),
cohort AS (
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
    AND (SELECT ok FROM allowed)
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
    AND (SELECT ok FROM allowed)
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

REVOKE EXECUTE ON FUNCTION public.subbly_plan_mix(uuid, date, date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.subbly_ltv_summary(uuid, date, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.subbly_plan_mix(uuid, date, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.subbly_ltv_summary(uuid, date, date) TO authenticated, service_role;
