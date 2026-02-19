-- Add impression share columns to ad_campaigns
ALTER TABLE public.ad_campaigns
ADD COLUMN IF NOT EXISTS impression_share numeric DEFAULT NULL,
ADD COLUMN IF NOT EXISTS lost_is_budget numeric DEFAULT NULL,
ADD COLUMN IF NOT EXISTS lost_is_rank numeric DEFAULT NULL;
