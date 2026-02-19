
-- Subbly subscription data
CREATE TABLE public.subbly_subscriptions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid REFERENCES public.clients(id),
  subbly_id integer NOT NULL,
  customer_id integer NOT NULL,
  product_id integer NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  currency_code text,
  status text NOT NULL,
  next_payment_date timestamp with time zone,
  last_payment_at timestamp with time zone,
  successful_charges_count integer DEFAULT 0,
  past_due boolean DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  synced_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(client_id, subbly_id)
);

ALTER TABLE public.subbly_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view their client subscriptions"
  ON public.subbly_subscriptions FOR SELECT
  USING (is_client_member(auth.uid(), client_id));

CREATE POLICY "Service role can manage subscriptions"
  ON public.subbly_subscriptions FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service role can update subscriptions"
  ON public.subbly_subscriptions FOR UPDATE
  USING (true);

-- Subbly invoice/transaction data (revenue tracking)
CREATE TABLE public.subbly_invoices (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid REFERENCES public.clients(id),
  subbly_id integer NOT NULL,
  customer_id integer NOT NULL,
  subscription_id integer,
  status text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  currency_code text,
  invoice_date timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  synced_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(client_id, subbly_id)
);

ALTER TABLE public.subbly_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view their client invoices"
  ON public.subbly_invoices FOR SELECT
  USING (is_client_member(auth.uid(), client_id));

CREATE POLICY "Service role can manage invoices"
  ON public.subbly_invoices FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service role can update invoices"
  ON public.subbly_invoices FOR UPDATE
  USING (true);
