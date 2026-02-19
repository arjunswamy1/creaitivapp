-- Drop the old unique constraint that limits one connection per user+platform
ALTER TABLE public.platform_connections 
  DROP CONSTRAINT platform_connections_user_id_platform_key;

-- Add new unique constraint that allows one connection per user+platform+client
ALTER TABLE public.platform_connections 
  ADD CONSTRAINT platform_connections_user_platform_client_key 
  UNIQUE (user_id, platform, client_id);