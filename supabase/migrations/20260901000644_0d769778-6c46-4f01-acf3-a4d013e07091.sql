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
inv AS (
  SELECT i.subscription_id, SUM(i.amount) / 100.0 AS rev
  FROM subbly_invoices i
  WHERE i.client_id = _client_id AND i.status = 'paid' AND i.subscription_id IS NOT NULL
    AND (SELECT ok FROM allowed)
  GROUP BY i.subscription_id
),
first_paid AS (
  SELECT i.customer_id, MIN(i.invoice_date) AS first_paid_at
  FROM subbly_invoices i
  WHERE i.client_id = _client_id AND i.status = 'paid'
    AND (SELECT ok FROM allowed)
  GROUP BY i.customer_id
),
subs AS (
  SELECT s.subbly_id, s.product_id, s.customer_id, s.subbly_created_at
  FROM subbly_subscriptions s
  WHERE s.client_id = _client_id
    AND (SELECT ok FROM allowed)
    AND s.subbly_created_at IS NOT NULL
),
cohort AS (
  SELECT s.product_id,
         COUNT(*) AS new_subs,
         COUNT(*) FILTER (WHERE fp.first_paid_at IS NULL OR fp.first_paid_at >= s.subbly_created_at) AS new_customer_subs,
         COALESCE(SUM(COALESCE(v.rev, 0)), 0) AS realized_revenue
  FROM subs s
  LEFT JOIN inv v ON v.subscription_id = s.subbly_id
  LEFT JOIN first_paid fp ON fp.customer_id = s.customer_id
  WHERE (s.subbly_created_at AT TIME ZONE 'America/New_York')::date BETWEEN _from AND _to
  GROUP BY s.product_id
),
mature_subs AS (
  SELECT s.product_id, COALESCE(v.rev, 0) AS rev
  FROM subs s
  LEFT JOIN inv v ON v.subscription_id = s.subbly_id
  WHERE s.subbly_created_at < now() - interval '12 months'
),
mature_plan AS (
  SELECT product_id, AVG(rev) AS ltv FROM mature_subs GROUP BY product_id
),
mature_group AS (
  SELECT p.kind, p.term_months, AVG(ms.rev) AS ltv
  FROM mature_subs ms
  JOIN subbly_plans p ON p.plan_id = ms.product_id AND (p.client_id = _client_id OR p.client_id IS NULL)
  WHERE p.term_months IS NOT NULL
  GROUP BY p.kind, p.term_months
)
SELECT
  c.product_id AS plan_id,
  COALESCE(p.plan_name, 'Plan ' || c.product_id) AS plan_name,
  COALESCE(p.kind, 'other') AS kind,
  p.term_months,
  p.price_cents,
  c.new_subs,
  c.new_customer_subs,
  ROUND(c.realized_revenue, 2),
  ROUND(CASE WHEN c.new_subs > 0 THEN c.realized_revenue / c.new_subs ELSE 0 END, 2),
  ROUND(est.ltv, 2),
  ROUND(c.new_subs * est.ltv, 2)
FROM cohort c
LEFT JOIN subbly_plans p ON p.plan_id = c.product_id AND (p.client_id = _client_id OR p.client_id IS NULL)
LEFT JOIN mature_plan mp ON mp.product_id = c.product_id
LEFT JOIN mature_group mg ON mg.kind = p.kind AND mg.term_months = p.term_months
CROSS JOIN LATERAL (
  SELECT GREATEST(
    COALESCE(NULLIF(mp.ltv, 0), NULLIF(mg.ltv, 0), COALESCE(p.price_cents, 0) / 100.0),
    CASE WHEN c.new_subs > 0 THEN c.realized_revenue / c.new_subs ELSE 0 END
  ) AS ltv
) est
ORDER BY c.new_subs DESC;
$$;
