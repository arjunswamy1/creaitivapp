
-- Create ads table for ad-level metrics
CREATE TABLE public.ads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  platform TEXT NOT NULL,
  platform_ad_id TEXT NOT NULL,
  platform_adset_id TEXT NOT NULL,
  platform_campaign_id TEXT NOT NULL,
  ad_name TEXT NOT NULL,
  adset_name TEXT,
  campaign_name TEXT,
  status TEXT DEFAULT 'unknown',
  date DATE NOT NULL,
  spend NUMERIC NOT NULL DEFAULT 0,
  revenue NUMERIC NOT NULL DEFAULT 0,
  impressions BIGINT NOT NULL DEFAULT 0,
  clicks BIGINT NOT NULL DEFAULT 0,
  conversions INTEGER NOT NULL DEFAULT 0,
  roas NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, platform, platform_ad_id, date)
);

ALTER TABLE public.ads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own ads" ON public.ads FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own ads" ON public.ads FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own ads" ON public.ads FOR UPDATE USING (auth.uid() = user_id);

-- Create alert settings table
CREATE TABLE public.alert_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  max_cac NUMERIC,
  min_roas NUMERIC,
  slack_channel TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.alert_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own alert settings" ON public.alert_settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own alert settings" ON public.alert_settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own alert settings" ON public.alert_settings FOR UPDATE USING (auth.uid() = user_id);

-- Add update triggers
CREATE TRIGGER update_ads_updated_at BEFORE UPDATE ON public.ads FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_alert_settings_updated_at BEFORE UPDATE ON public.alert_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
