-- Add campaign settings columns for bid strategy and campaign type
ALTER TABLE public.ad_campaigns ADD COLUMN IF NOT EXISTS bidding_strategy_type text DEFAULT NULL;
ALTER TABLE public.ad_campaigns ADD COLUMN IF NOT EXISTS campaign_type text DEFAULT NULL;