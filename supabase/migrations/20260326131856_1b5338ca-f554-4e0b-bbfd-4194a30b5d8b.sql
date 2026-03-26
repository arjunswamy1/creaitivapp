
CREATE TABLE public.login_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  email text,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  logged_in_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.login_events ENABLE ROW LEVEL SECURITY;

-- Only agency admins can read login events
CREATE POLICY "Agency admins can view login events"
  ON public.login_events FOR SELECT
  TO authenticated
  USING (public.is_agency_admin(auth.uid()));

-- Anyone authenticated can insert their own login event
CREATE POLICY "Users can log their own logins"
  ON public.login_events FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);
