CREATE TABLE public.notion_oauth_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state text NOT NULL UNIQUE,
  access_token text NOT NULL,
  workspace_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '5 minutes')
);

-- No RLS needed - only accessed by service role from edge functions
ALTER TABLE public.notion_oauth_tokens ENABLE ROW LEVEL SECURITY;