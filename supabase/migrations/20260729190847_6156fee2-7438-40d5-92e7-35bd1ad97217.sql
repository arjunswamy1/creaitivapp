CREATE OR REPLACE FUNCTION public.subbly_new_vs_renewal_revenue(
  _client_id uuid,
  _from date,
  _to date
)
RETURNS TABLE (
  new_revenue numeric,
  renewal_revenue numeric,
  new_invoices bigint,
  renewal_invoices bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH firsts AS (
    SELECT customer_id, min(invoice_date) AS first_dt
    FROM public.subbly_invoices
    WHERE client_id = _client_id AND status = 'paid'
    GROUP BY customer_id
  ),
  scoped AS (
    SELECT i.amount, (i.invoice_date = f.first_dt) AS is_new
    FROM public.subbly_invoices i
    JOIN firsts f ON f.customer_id = i.customer_id
    WHERE i.client_id = _client_id
      AND i.status = 'paid'
      AND (i.invoice_date AT TIME ZONE 'America/New_York')::date BETWEEN _from AND _to
      AND public.is_client_member(auth.uid(), _client_id)
  )
  SELECT
    COALESCE(sum(amount) FILTER (WHERE is_new), 0) / 100.0,
    COALESCE(sum(amount) FILTER (WHERE NOT is_new), 0) / 100.0,
    count(*) FILTER (WHERE is_new),
    count(*) FILTER (WHERE NOT is_new)
  FROM scoped;
$$;

GRANT EXECUTE ON FUNCTION public.subbly_new_vs_renewal_revenue(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.subbly_new_vs_renewal_revenue(uuid, date, date) TO service_role;