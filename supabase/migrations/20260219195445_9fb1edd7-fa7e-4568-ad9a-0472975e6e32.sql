-- Add creative metadata columns to ads table for creative-level reporting
ALTER TABLE public.ads
ADD COLUMN IF NOT EXISTS format text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS frequency numeric DEFAULT NULL,
ADD COLUMN IF NOT EXISTS video_views_3s bigint DEFAULT NULL,
ADD COLUMN IF NOT EXISTS video_views_25 bigint DEFAULT NULL,
ADD COLUMN IF NOT EXISTS video_views_50 bigint DEFAULT NULL,
ADD COLUMN IF NOT EXISTS video_views_95 bigint DEFAULT NULL,
ADD COLUMN IF NOT EXISTS thumbnail_url text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS creative_url text DEFAULT NULL;

-- Create index for format-based queries
CREATE INDEX IF NOT EXISTS idx_ads_format ON public.ads (format) WHERE format IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ads_client_date ON public.ads (client_id, date);
