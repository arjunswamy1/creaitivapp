
-- Create search_terms table for Google Search Term Report data
CREATE TABLE public.search_terms (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  client_id uuid REFERENCES public.clients(id),
  platform text NOT NULL DEFAULT 'google',
  platform_campaign_id text NOT NULL,
  platform_adset_id text NOT NULL,
  keyword_text text NOT NULL,
  search_term text NOT NULL,
  match_type text,
  campaign_name text,
  adset_name text,
  date date NOT NULL,
  spend numeric NOT NULL DEFAULT 0,
  revenue numeric NOT NULL DEFAULT 0,
  impressions bigint NOT NULL DEFAULT 0,
  clicks bigint NOT NULL DEFAULT 0,
  conversions integer NOT NULL DEFAULT 0,
  roas numeric,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, platform, platform_adset_id, keyword_text, search_term, date)
);

-- Enable RLS
ALTER TABLE public.search_terms ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can insert their own search terms"
  ON public.search_terms FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own search terms"
  ON public.search_terms FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view search terms for their clients"
  ON public.search_terms FOR SELECT
  USING ((auth.uid() = user_id) OR ((client_id IS NOT NULL) AND is_client_member(auth.uid(), client_id)));
