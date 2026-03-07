-- Purge all contaminated ad data for Tinned Fish Club
-- This data was synced before ad account isolation was enforced
-- User will re-sync from the correct ad account (act_1166465921403912)

DELETE FROM public.ads WHERE client_id = 'a1000000-0000-0000-0000-000000000001';
DELETE FROM public.ad_sets WHERE client_id = 'a1000000-0000-0000-0000-000000000001';
DELETE FROM public.ad_campaigns WHERE client_id = 'a1000000-0000-0000-0000-000000000001';
DELETE FROM public.ad_daily_metrics WHERE client_id = 'a1000000-0000-0000-0000-000000000001';
DELETE FROM public.keywords WHERE client_id = 'a1000000-0000-0000-0000-000000000001';