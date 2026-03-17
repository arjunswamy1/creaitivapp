
-- Add account_id to all ad-related tables so we can track which ad account each record came from
ALTER TABLE public.ad_campaigns ADD COLUMN IF NOT EXISTS account_id text;
ALTER TABLE public.ad_sets ADD COLUMN IF NOT EXISTS account_id text;
ALTER TABLE public.ads ADD COLUMN IF NOT EXISTS account_id text;
ALTER TABLE public.ad_daily_metrics ADD COLUMN IF NOT EXISTS account_id text;
ALTER TABLE public.keywords ADD COLUMN IF NOT EXISTS account_id text;
ALTER TABLE public.search_terms ADD COLUMN IF NOT EXISTS account_id text;

-- Index for efficient filtering by account
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_account_id ON public.ad_campaigns (account_id);
CREATE INDEX IF NOT EXISTS idx_ad_sets_account_id ON public.ad_sets (account_id);
CREATE INDEX IF NOT EXISTS idx_ads_account_id ON public.ads (account_id);
CREATE INDEX IF NOT EXISTS idx_ad_daily_metrics_account_id ON public.ad_daily_metrics (account_id);
CREATE INDEX IF NOT EXISTS idx_keywords_account_id ON public.keywords (account_id);
CREATE INDEX IF NOT EXISTS idx_search_terms_account_id ON public.search_terms (account_id);
