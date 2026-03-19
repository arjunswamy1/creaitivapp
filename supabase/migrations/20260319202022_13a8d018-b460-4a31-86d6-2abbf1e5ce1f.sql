
DELETE FROM public.ringba_calls
WHERE client_id = 'b1013915-13a0-4688-b41c-e84e8623506e'
  AND (metadata->>'publisher' IS NULL OR metadata->>'publisher' != 'CPM');
