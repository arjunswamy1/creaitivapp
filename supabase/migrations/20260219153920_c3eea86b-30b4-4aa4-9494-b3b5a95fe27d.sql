
-- Create role enum for client membership
CREATE TYPE public.client_role AS ENUM ('agency_admin', 'client_admin', 'viewer');

-- Clients table
CREATE TABLE public.clients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  logo_url TEXT,
  brand_colors JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

-- Client members table (maps users to clients with roles)
CREATE TABLE public.client_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  role client_role NOT NULL DEFAULT 'viewer',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, client_id)
);
ALTER TABLE public.client_members ENABLE ROW LEVEL SECURITY;

-- Client dashboard config
CREATE TABLE public.client_dashboard_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE UNIQUE,
  enabled_platforms TEXT[] DEFAULT ARRAY['meta', 'google', 'shopify'],
  enabled_kpis TEXT[] DEFAULT ARRAY['totalSpend', 'totalRevenue', 'blendedROAS', 'conversions', 'cpc', 'ctr', 'cpm', 'impressions'],
  custom_metrics JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.client_dashboard_config ENABLE ROW LEVEL SECURITY;

-- Security definer function to check client membership
CREATE OR REPLACE FUNCTION public.is_client_member(_user_id UUID, _client_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.client_members
    WHERE user_id = _user_id AND client_id = _client_id
  )
$$;

-- Security definer function to check agency admin role
CREATE OR REPLACE FUNCTION public.is_agency_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.client_members
    WHERE user_id = _user_id AND role = 'agency_admin'
  )
$$;

-- Security definer to get all client_ids for a user
CREATE OR REPLACE FUNCTION public.get_user_client_ids(_user_id UUID)
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT client_id FROM public.client_members WHERE user_id = _user_id
$$;

-- RLS: clients - members can view their clients, agency admins can manage all
CREATE POLICY "Members can view their clients"
  ON public.clients FOR SELECT
  USING (public.is_client_member(auth.uid(), id) OR public.is_agency_admin(auth.uid()));

CREATE POLICY "Agency admins can insert clients"
  ON public.clients FOR INSERT
  WITH CHECK (public.is_agency_admin(auth.uid()));

CREATE POLICY "Agency admins can update clients"
  ON public.clients FOR UPDATE
  USING (public.is_agency_admin(auth.uid()));

CREATE POLICY "Agency admins can delete clients"
  ON public.clients FOR DELETE
  USING (public.is_agency_admin(auth.uid()));

-- RLS: client_members
CREATE POLICY "Members can view memberships for their clients"
  ON public.client_members FOR SELECT
  USING (public.is_client_member(auth.uid(), client_id) OR user_id = auth.uid());

CREATE POLICY "Agency admins can manage memberships"
  ON public.client_members FOR INSERT
  WITH CHECK (public.is_agency_admin(auth.uid()));

CREATE POLICY "Agency admins can update memberships"
  ON public.client_members FOR UPDATE
  USING (public.is_agency_admin(auth.uid()));

CREATE POLICY "Agency admins can delete memberships"
  ON public.client_members FOR DELETE
  USING (public.is_agency_admin(auth.uid()));

-- RLS: client_dashboard_config
CREATE POLICY "Members can view their client config"
  ON public.client_dashboard_config FOR SELECT
  USING (public.is_client_member(auth.uid(), client_id));

CREATE POLICY "Agency admins can manage client config"
  ON public.client_dashboard_config FOR INSERT
  WITH CHECK (public.is_agency_admin(auth.uid()));

CREATE POLICY "Agency admins can update client config"
  ON public.client_dashboard_config FOR UPDATE
  USING (public.is_agency_admin(auth.uid()));

-- Add client_id to existing tables (nullable for backward compat)
ALTER TABLE public.platform_connections ADD COLUMN client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE;
ALTER TABLE public.ad_campaigns ADD COLUMN client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE;
ALTER TABLE public.ad_daily_metrics ADD COLUMN client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE;
ALTER TABLE public.ad_sets ADD COLUMN client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE;
ALTER TABLE public.ads ADD COLUMN client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE;
ALTER TABLE public.alert_settings ADD COLUMN client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE;

-- Update RLS on existing tables to also scope by client membership
-- platform_connections: update SELECT policy
DROP POLICY IF EXISTS "Users can view their own connections" ON public.platform_connections;
CREATE POLICY "Users can view connections for their clients"
  ON public.platform_connections FOR SELECT
  USING (
    auth.uid() = user_id
    OR (client_id IS NOT NULL AND public.is_client_member(auth.uid(), client_id))
  );

-- ad_campaigns: update SELECT policy
DROP POLICY IF EXISTS "Users can view their own campaigns" ON public.ad_campaigns;
CREATE POLICY "Users can view campaigns for their clients"
  ON public.ad_campaigns FOR SELECT
  USING (
    auth.uid() = user_id
    OR (client_id IS NOT NULL AND public.is_client_member(auth.uid(), client_id))
  );

-- ad_daily_metrics: update SELECT policy
DROP POLICY IF EXISTS "Users can view their own daily metrics" ON public.ad_daily_metrics;
CREATE POLICY "Users can view metrics for their clients"
  ON public.ad_daily_metrics FOR SELECT
  USING (
    auth.uid() = user_id
    OR (client_id IS NOT NULL AND public.is_client_member(auth.uid(), client_id))
  );

-- ad_sets: update SELECT policy
DROP POLICY IF EXISTS "Users can view their own ad sets" ON public.ad_sets;
CREATE POLICY "Users can view ad sets for their clients"
  ON public.ad_sets FOR SELECT
  USING (
    auth.uid() = user_id
    OR (client_id IS NOT NULL AND public.is_client_member(auth.uid(), client_id))
  );

-- ads: update SELECT policy
DROP POLICY IF EXISTS "Users can view their own ads" ON public.ads;
CREATE POLICY "Users can view ads for their clients"
  ON public.ads FOR SELECT
  USING (
    auth.uid() = user_id
    OR (client_id IS NOT NULL AND public.is_client_member(auth.uid(), client_id))
  );

-- alert_settings: update SELECT policy
DROP POLICY IF EXISTS "Users can view their own alert settings" ON public.alert_settings;
CREATE POLICY "Users can view alerts for their clients"
  ON public.alert_settings FOR SELECT
  USING (
    auth.uid() = user_id
    OR (client_id IS NOT NULL AND public.is_client_member(auth.uid(), client_id))
  );

-- Triggers for updated_at
CREATE TRIGGER update_clients_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_client_dashboard_config_updated_at
  BEFORE UPDATE ON public.client_dashboard_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for performance
CREATE INDEX idx_client_members_user_id ON public.client_members(user_id);
CREATE INDEX idx_client_members_client_id ON public.client_members(client_id);
CREATE INDEX idx_platform_connections_client_id ON public.platform_connections(client_id);
CREATE INDEX idx_ad_campaigns_client_id ON public.ad_campaigns(client_id);
CREATE INDEX idx_ad_daily_metrics_client_id ON public.ad_daily_metrics(client_id);
CREATE INDEX idx_ad_sets_client_id ON public.ad_sets(client_id);
CREATE INDEX idx_ads_client_id ON public.ads(client_id);
CREATE INDEX idx_alert_settings_client_id ON public.alert_settings(client_id);
