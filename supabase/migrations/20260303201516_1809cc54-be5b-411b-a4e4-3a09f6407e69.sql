
-- Add add_to_cart column to ad_daily_metrics for tracking ATC events
ALTER TABLE public.ad_daily_metrics ADD COLUMN add_to_cart integer NOT NULL DEFAULT 0;

-- Also add add_to_cart to ad_campaigns for campaign-level tracking
ALTER TABLE public.ad_campaigns ADD COLUMN add_to_cart integer NOT NULL DEFAULT 0;

-- And to ads table for ad-level tracking
ALTER TABLE public.ads ADD COLUMN add_to_cart integer NOT NULL DEFAULT 0;

-- And to ad_sets table
ALTER TABLE public.ad_sets ADD COLUMN add_to_cart integer NOT NULL DEFAULT 0;
