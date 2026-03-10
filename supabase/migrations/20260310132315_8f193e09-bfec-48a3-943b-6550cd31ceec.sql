-- Ringba call logs table for Billy.com call monetization tracking
CREATE TABLE public.ringba_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) NOT NULL,
  ringba_call_id text NOT NULL,
  call_date timestamp with time zone NOT NULL,
  duration_seconds integer NOT NULL DEFAULT 0,
  revenue numeric NOT NULL DEFAULT 0,
  payout numeric NOT NULL DEFAULT 0,
  connected boolean NOT NULL DEFAULT false,
  converted boolean NOT NULL DEFAULT false,
  caller_number text,
  target_name text,
  campaign_name text,
  campaign_id text,
  call_status text,
  metadata jsonb DEFAULT '{}'::jsonb,
  synced_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(client_id, ringba_call_id)
);

ALTER TABLE public.ringba_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view ringba calls"
  ON public.ringba_calls FOR SELECT
  USING (is_client_member(auth.uid(), client_id));

CREATE POLICY "Service role can insert ringba calls"
  ON public.ringba_calls FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service role can update ringba calls"
  ON public.ringba_calls FOR UPDATE
  USING (true);

CREATE INDEX idx_ringba_calls_client_date ON public.ringba_calls(client_id, call_date);