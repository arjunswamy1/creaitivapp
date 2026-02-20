-- Add total_cost (COGS) column to shopify_orders for profitability tracking
ALTER TABLE public.shopify_orders ADD COLUMN total_cost numeric NOT NULL DEFAULT 0;

-- Add total_shipping column for more accurate profit calculation
ALTER TABLE public.shopify_orders ADD COLUMN total_shipping numeric NOT NULL DEFAULT 0;