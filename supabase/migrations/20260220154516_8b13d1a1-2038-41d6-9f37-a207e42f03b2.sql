
-- Create client_invites table
CREATE TABLE public.client_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  email text NOT NULL,
  role public.client_role NOT NULL DEFAULT 'viewer',
  token uuid NOT NULL DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'pending',
  invited_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  UNIQUE(client_id, email)
);

ALTER TABLE public.client_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency admins can manage invites"
  ON public.client_invites FOR ALL
  USING (is_agency_admin(auth.uid()))
  WITH CHECK (is_agency_admin(auth.uid()));

-- Function to auto-assign user on signup if they have a pending invite
CREATE OR REPLACE FUNCTION public.handle_invite_on_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv RECORD;
BEGIN
  FOR inv IN
    SELECT id, client_id, role FROM public.client_invites
    WHERE email = NEW.email AND status = 'pending'
  LOOP
    INSERT INTO public.client_members (user_id, client_id, role)
    VALUES (NEW.id, inv.client_id, inv.role)
    ON CONFLICT DO NOTHING;

    UPDATE public.client_invites
    SET status = 'accepted', accepted_at = now()
    WHERE id = inv.id;
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_invite
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_invite_on_signup();
