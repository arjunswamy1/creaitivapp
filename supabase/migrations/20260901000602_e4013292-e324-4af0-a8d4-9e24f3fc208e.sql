CREATE INDEX IF NOT EXISTS idx_subbly_inv_client_sub_status ON public.subbly_invoices(client_id, subscription_id, status);
CREATE INDEX IF NOT EXISTS idx_subbly_inv_client_cust_status ON public.subbly_invoices(client_id, customer_id, status, invoice_date);
CREATE INDEX IF NOT EXISTS idx_subbly_subs_client_prod_created ON public.subbly_subscriptions(client_id, product_id, subbly_created_at);

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
mature AS (
  SELECT s.product_id, AVG(COALESCE(v.rev, 0)) AS mature_ltv
  FROM subs s
  LEFT JOIN inv v ON v.subscription_id = s.subbly_id
  WHERE s.subbly_created_at < now() - interval '12 months'
  GROUP BY s.product_id
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
  ROUND(COALESCE(NULLIF(m.mature_ltv, 0), GREATEST(COALESCE(p.price_cents, 0) / 100.0,
        CASE WHEN c.new_subs > 0 THEN c.realized_revenue / c.new_subs ELSE 0 END)), 2),
  ROUND(c.new_subs * COALESCE(NULLIF(m.mature_ltv, 0), GREATEST(COALESCE(p.price_cents, 0) / 100.0,
        CASE WHEN c.new_subs > 0 THEN c.realized_revenue / c.new_subs ELSE 0 END)), 2)
FROM cohort c
LEFT JOIN subbly_plans p ON p.plan_id = c.product_id AND (p.client_id = _client_id OR p.client_id IS NULL)
LEFT JOIN mature m ON m.product_id = c.product_id
ORDER BY c.new_subs DESC;
$$;
