-- Rows the restore drill must round-trip. Seed has leads/touches/scores but
-- no transcripts, extractions, revenue, or baseline. A 0=0 compare is not a restore.

INSERT INTO public.calls (
  id, org_id, lead_id, type, occurred_at, raw_transcript, transcript_source, created_at
) VALUES (
  'e6e6e6e6-e6e6-4e6e-8e6e-e6e6e6e6e6e6',
  '22222222-2222-4222-8222-222222222222',
  '44444444-4444-4444-8444-444444444441',
  'close',
  now() - interval '3 days',
  'Maya: Twelve thousand is the wall this quarter.',
  'manual',
  now() - interval '3 days'
);

INSERT INTO public.call_extractions (
  org_id, call_id, summary, stated_objection, quotes, model_version
) VALUES (
  '22222222-2222-4222-8222-222222222222',
  'e6e6e6e6-e6e6-4e6e-8e6e-e6e6e6e6e6e6',
  'Price objection on the close.',
  'Twelve thousand is the wall',
  '[{"text":"Twelve thousand is the wall this quarter.","topic":"price"}]'::jsonb,
  'restore-drill'
);

INSERT INTO public.objections (
  org_id, lead_id, type, verbatim, call_id
) VALUES (
  '22222222-2222-4222-8222-222222222222',
  '44444444-4444-4444-8444-444444444441',
  'price',
  'Twelve thousand is the wall this quarter.',
  'e6e6e6e6-e6e6-4e6e-8e6e-e6e6e6e6e6e6'
);

INSERT INTO public.revenue_log (
  org_id, lead_id, amount_cents, payment_type, occurred_at
) VALUES (
  '22222222-2222-4222-8222-222222222222',
  '44444444-4444-4444-8444-444444444441',
  1200000,
  'pif',
  now() - interval '1 day'
);

INSERT INTO public.baseline_runs (
  id, org_id, status, grade, lookback_days, window_start, window_end, finished_at
) VALUES (
  'b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1',
  '22222222-2222-4222-8222-222222222222',
  'completed',
  'usable',
  90,
  now() - interval '90 days',
  now() - interval '1 day',
  now() - interval '1 day'
);

INSERT INTO public.baseline_leads (
  id, org_id, run_id, ghl_contact_id, created_at_crm
) VALUES (
  'b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2',
  '22222222-2222-4222-8222-222222222222',
  'b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1',
  'ghl_ct_restore',
  now() - interval '80 days'
);

INSERT INTO public.baseline_touches (
  org_id, run_id, baseline_lead_id, type, channel, direction, occurred_at, summary
) VALUES (
  '22222222-2222-4222-8222-222222222222',
  'b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1',
  'b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2',
  'system',
  'sms',
  'outbound',
  now() - interval '79 days',
  'CRM ping'
);

INSERT INTO public.baseline_calls (
  org_id, run_id, baseline_lead_id, occurred_at, outcome
) VALUES (
  '22222222-2222-4222-8222-222222222222',
  'b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1',
  'b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2',
  now() - interval '78 days',
  'held'
);

INSERT INTO public.baseline_revenue (
  org_id, run_id, baseline_lead_id, amount_cents, occurred_at, source
) VALUES (
  '22222222-2222-4222-8222-222222222222',
  'b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1',
  'b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2',
  250000,
  now() - interval '70 days',
  'payment'
);
