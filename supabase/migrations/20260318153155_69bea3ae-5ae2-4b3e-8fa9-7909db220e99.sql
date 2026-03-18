-- TripleWhale daily summary metrics (from /summary-page/get-data)
CREATE TABLE public.triplewhale_summary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  date date NOT NULL,
  total_revenue numeric NOT NULL DEFAULT 0,
  total_orders integer NOT NULL DEFAULT 0,
  total_spend numeric NOT NULL DEFAULT 0,
  blended_roas numeric DEFAULT 0,
  blended_cpa numeric DEFAULT 0,
  new_customers integer DEFAULT 0,
  returning_customers integer DEFAULT 0,
  meta_spend numeric DEFAULT 0,
  meta_tw_revenue numeric DEFAULT 0,
  meta_tw_roas numeric DEFAULT 0,
  meta_tw_cpa numeric DEFAULT 0,
  meta_tw_purchases integer DEFAULT 0,
  meta_clicks bigint DEFAULT 0,
  meta_impressions bigint DEFAULT 0,
  google_spend numeric DEFAULT 0,
  google_tw_revenue numeric DEFAULT 0,
  google_tw_roas numeric DEFAULT 0,
  google_tw_cpa numeric DEFAULT 0,
  google_tw_purchases integer DEFAULT 0,
  google_clicks bigint DEFAULT 0,
  google_impressions bigint DEFAULT 0,
  raw_data jsonb DEFAULT '{}'::jsonb,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(client_id, date)
);

ALTER TABLE public.triplewhale_summary ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view TW summary" ON public.triplewhale_summary
  FOR SELECT TO public USING (is_client_member(auth.uid(), client_id));
CREATE POLICY "Service role can insert TW summary" ON public.triplewhale_summary
  FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Service role can update TW summary" ON public.triplewhale_summary
  FOR UPDATE TO public USING (true);

-- TripleWhale ad-level attribution
CREATE TABLE public.triplewhale_ad_attribution (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  date date NOT NULL,
  platform text NOT NULL DEFAULT 'meta',
  campaign_id text,
  campaign_name text,
  adset_id text,
  adset_name text,
  ad_id text,
  ad_name text,
  tw_revenue numeric NOT NULL DEFAULT 0,
  tw_purchases integer NOT NULL DEFAULT 0,
  tw_roas numeric DEFAULT 0,
  tw_cpa numeric DEFAULT 0,
  spend numeric DEFAULT 0,
  clicks bigint DEFAULT 0,
  impressions bigint DEFAULT 0,
  attribution_model text DEFAULT 'Triple Attribution',
  raw_data jsonb DEFAULT '{}'::jsonb,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(client_id, date, platform, ad_id)
);

ALTER TABLE public.triplewhale_ad_attribution ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view TW attribution" ON public.triplewhale_ad_attribution
  FOR SELECT TO public USING (is_client_member(auth.uid(), client_id));
CREATE POLICY "Service role can insert TW attribution" ON public.triplewhale_ad_attribution
  FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Service role can update TW attribution" ON public.triplewhale_ad_attribution
  FOR UPDATE TO public USING (true);

-- Add TW config to client_dashboard_config
ALTER TABLE public.client_dashboard_config 
  ADD COLUMN IF NOT EXISTS triplewhale_shop_domain text,
  ADD COLUMN IF NOT EXISTS triplewhale_enabled boolean DEFAULT false;