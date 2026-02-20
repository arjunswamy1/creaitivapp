-- Fix: add client_id to ad_daily_metrics unique constraint to support multi-tenant
ALTER TABLE public.ad_daily_metrics DROP CONSTRAINT ad_daily_metrics_user_id_platform_date_key;
ALTER TABLE public.ad_daily_metrics ADD CONSTRAINT ad_daily_metrics_user_id_platform_date_client_key UNIQUE (user_id, platform, date, client_id);