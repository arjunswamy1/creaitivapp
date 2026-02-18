CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_connections_user_platform
ON public.platform_connections (user_id, platform);