
-- Create keywords table for Google Ads keyword-level performance
CREATE TABLE public.keywords (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  client_id UUID REFERENCES public.clients(id),
  platform TEXT NOT NULL DEFAULT 'google',
  platform_campaign_id TEXT NOT NULL,
  platform_adset_id TEXT NOT NULL,
  keyword_text TEXT NOT NULL,
  match_type TEXT,
  campaign_name TEXT,
  adset_name TEXT,
  status TEXT DEFAULT 'unknown',
  date DATE NOT NULL,
  spend NUMERIC NOT NULL DEFAULT 0,
  revenue NUMERIC NOT NULL DEFAULT 0,
  impressions BIGINT NOT NULL DEFAULT 0,
  clicks BIGINT NOT NULL DEFAULT 0,
  conversions INTEGER NOT NULL DEFAULT 0,
  roas NUMERIC,
  quality_score INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, platform, platform_adset_id, keyword_text, match_type, date)
);

-- Enable RLS
ALTER TABLE public.keywords ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view keywords for their clients"
  ON public.keywords FOR SELECT
  USING ((auth.uid() = user_id) OR (client_id IS NOT NULL AND is_client_member(auth.uid(), client_id)));

CREATE POLICY "Users can insert their own keywords"
  ON public.keywords FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own keywords"
  ON public.keywords FOR UPDATE
  USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_keywords_user_date ON public.keywords(user_id, date);
CREATE INDEX idx_keywords_adset ON public.keywords(platform_adset_id, date);
CREATE INDEX idx_keywords_campaign ON public.keywords(campaign_name, date);
