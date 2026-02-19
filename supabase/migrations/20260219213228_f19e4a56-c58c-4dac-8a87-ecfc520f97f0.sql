
-- Add revenue_source column to client_dashboard_config
-- 'subbly' = use subbly_invoices table, 'shopify' = use ad_daily_metrics where platform='shopify'
ALTER TABLE public.client_dashboard_config 
ADD COLUMN revenue_source text NOT NULL DEFAULT 'subbly';

-- Create shopify_orders table for granular order-level data (like subbly_invoices)
CREATE TABLE public.shopify_orders (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid REFERENCES public.clients(id),
  shopify_order_id bigint NOT NULL,
  order_number text,
  total_price numeric NOT NULL DEFAULT 0,
  subtotal_price numeric NOT NULL DEFAULT 0,
  total_tax numeric NOT NULL DEFAULT 0,
  total_discounts numeric NOT NULL DEFAULT 0,
  currency text DEFAULT 'USD',
  financial_status text NOT NULL,
  fulfillment_status text,
  order_date timestamp with time zone,
  customer_id bigint,
  line_items_count integer DEFAULT 0,
  synced_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.shopify_orders ENABLE ROW LEVEL SECURITY;

-- RLS policies matching subbly_invoices pattern
CREATE POLICY "Members can view their client orders"
ON public.shopify_orders
FOR SELECT
USING (is_client_member(auth.uid(), client_id));

CREATE POLICY "Service role can manage orders"
ON public.shopify_orders
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Service role can update orders"
ON public.shopify_orders
FOR UPDATE
USING (true);

-- Add unique constraint on shopify_order_id + client_id for upserts
CREATE UNIQUE INDEX idx_shopify_orders_unique ON public.shopify_orders(shopify_order_id, client_id);

-- Add index on order_date for date range queries
CREATE INDEX idx_shopify_orders_date ON public.shopify_orders(client_id, order_date);

-- Trigger for updated_at
CREATE TRIGGER update_shopify_orders_updated_at
BEFORE UPDATE ON public.shopify_orders
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
