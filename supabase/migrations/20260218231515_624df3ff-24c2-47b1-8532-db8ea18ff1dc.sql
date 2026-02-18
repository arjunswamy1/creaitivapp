
-- Daily aggregated metrics per platform
CREATE TABLE public.ad_daily_metrics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  platform TEXT NOT NULL, -- 'meta' or 'google'
  date DATE NOT NULL,
  spend NUMERIC(12,2) NOT NULL DEFAULT 0,
  revenue NUMERIC(12,2) NOT NULL DEFAULT 0,
  impressions BIGINT NOT NULL DEFAULT 0,
  clicks BIGINT NOT NULL DEFAULT 0,
  conversions INTEGER NOT NULL DEFAULT 0,
  cpc NUMERIC(8,4),
  ctr NUMERIC(6,4),
  cpm NUMERIC(8,4),
  roas NUMERIC(8,4),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, platform, date)
);

-- Campaign-level metrics
CREATE TABLE public.ad_campaigns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  platform TEXT NOT NULL,
  platform_campaign_id TEXT NOT NULL,
  campaign_name TEXT NOT NULL,
  status TEXT DEFAULT 'unknown',
  date DATE NOT NULL,
  spend NUMERIC(12,2) NOT NULL DEFAULT 0,
  revenue NUMERIC(12,2) NOT NULL DEFAULT 0,
  impressions BIGINT NOT NULL DEFAULT 0,
  clicks BIGINT NOT NULL DEFAULT 0,
  conversions INTEGER NOT NULL DEFAULT 0,
  roas NUMERIC(8,4),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, platform, platform_campaign_id, date)
);

-- Ad set / Ad group level metrics
CREATE TABLE public.ad_sets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  platform TEXT NOT NULL,
  platform_campaign_id TEXT NOT NULL,
  platform_adset_id TEXT NOT NULL,
  adset_name TEXT NOT NULL,
  campaign_name TEXT,
  status TEXT DEFAULT 'unknown',
  date DATE NOT NULL,
  spend NUMERIC(12,2) NOT NULL DEFAULT 0,
  revenue NUMERIC(12,2) NOT NULL DEFAULT 0,
  impressions BIGINT NOT NULL DEFAULT 0,
  clicks BIGINT NOT NULL DEFAULT 0,
  conversions INTEGER NOT NULL DEFAULT 0,
  roas NUMERIC(8,4),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, platform, platform_adset_id, date)
);

-- Sync log to track pipeline runs
CREATE TABLE public.ad_sync_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  platform TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running', -- running, success, error
  records_synced INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- Enable RLS on all tables
ALTER TABLE public.ad_daily_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_sync_log ENABLE ROW LEVEL SECURITY;

-- RLS policies for ad_daily_metrics
CREATE POLICY "Users can view their own daily metrics" ON public.ad_daily_metrics FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own daily metrics" ON public.ad_daily_metrics FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own daily metrics" ON public.ad_daily_metrics FOR UPDATE USING (auth.uid() = user_id);

-- RLS policies for ad_campaigns
CREATE POLICY "Users can view their own campaigns" ON public.ad_campaigns FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own campaigns" ON public.ad_campaigns FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own campaigns" ON public.ad_campaigns FOR UPDATE USING (auth.uid() = user_id);

-- RLS policies for ad_sets
CREATE POLICY "Users can view their own ad sets" ON public.ad_sets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own ad sets" ON public.ad_sets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own ad sets" ON public.ad_sets FOR UPDATE USING (auth.uid() = user_id);

-- RLS policies for ad_sync_log
CREATE POLICY "Users can view their own sync logs" ON public.ad_sync_log FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own sync logs" ON public.ad_sync_log FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own sync logs" ON public.ad_sync_log FOR UPDATE USING (auth.uid() = user_id);

-- Triggers for updated_at
CREATE TRIGGER update_ad_daily_metrics_updated_at BEFORE UPDATE ON public.ad_daily_metrics FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_ad_campaigns_updated_at BEFORE UPDATE ON public.ad_campaigns FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_ad_sets_updated_at BEFORE UPDATE ON public.ad_sets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
