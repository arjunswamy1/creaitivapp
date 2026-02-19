
-- Add selected_ad_account column to platform_connections
-- Stores the selected Meta ad account ID (e.g. "act_1166465921403912")
ALTER TABLE public.platform_connections
ADD COLUMN selected_ad_account jsonb DEFAULT NULL;

COMMENT ON COLUMN public.platform_connections.selected_ad_account IS 'The currently selected ad account for syncing, stored as {id, name}';
