-- DEV ONLY. Do not run against production.
-- Placeholder owner auth user id is replaced once a real owner signs in.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Placeholder auth user (skipped if the Auth schema rejects a slim insert)
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  INSERT INTO auth.users (id, email)
  VALUES (
    '11111111-1111-4111-8111-111111111111',
    'owner@vistrial.local'
  )
  ON CONFLICT (id) DO NOTHING;
EXCEPTION
  WHEN undefined_table THEN
    RAISE NOTICE 'auth.users is missing; skip placeholder user';
  WHEN not_null_violation OR check_violation OR foreign_key_violation THEN
    RAISE NOTICE 'auth.users rejected a slim insert (expected on hosted Auth). Replace OWNER_USER_ID in Prompt 3.';
  WHEN OTHERS THEN
    RAISE NOTICE 'auth.users insert skipped: %', SQLERRM;
END
$$;

INSERT INTO public.organizations (id, name, slug, ghl_location_id, timezone, holdout_percent)
VALUES (
  '22222222-2222-4222-8222-222222222222',
  'Northstar Coaching',
  'northstar',
  'ghl_loc_dev_northstar',
  'America/New_York',
  0
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.score_configs (org_id)
VALUES ('22222222-2222-4222-8222-222222222222')
ON CONFLICT (org_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Divine Acquisition. We run our own acquisition on the same install we sell,
-- so the DA workspace is an ordinary workspace with an ordinary source record.
-- Nothing here is special-cased: if this works, a client workspace works.
--
-- The base id below is a local placeholder. Point the real workspace at the
-- real base with `node scripts/seed-forsight-source.mjs`, which is the only
-- supported way to do it against a real database.
-- ---------------------------------------------------------------------------

INSERT INTO public.organizations (id, name, slug, timezone, holdout_percent)
VALUES (
  '2d2d2d2d-2222-4222-8222-222222222222',
  'Divine Acquisition',
  'divine-acquisition',
  'America/New_York',
  0
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.score_configs (org_id)
VALUES ('2d2d2d2d-2222-4222-8222-222222222222')
ON CONFLICT (org_id) DO NOTHING;

INSERT INTO public.forsight_sources (org_id, source_type, label, airtable_base_id)
VALUES (
  '2d2d2d2d-2222-4222-8222-222222222222',
  'airtable',
  'DA Pipeline — Client Acquisition',
  'appDaPipelineLocal'
)
ON CONFLICT (org_id, source_type) DO NOTHING;

INSERT INTO public.org_members (
  id,
  org_id,
  user_id,
  role,
  display_name,
  email
)
SELECT
  '33333333-3333-4333-8333-333333333333',
  '22222222-2222-4222-8222-222222222222',
  '11111111-1111-4111-8111-111111111111',
  'owner',
  'Dev Owner',
  'owner@vistrial.local'
WHERE EXISTS (
  SELECT 1 FROM auth.users WHERE id = '11111111-1111-4111-8111-111111111111'
)
ON CONFLICT (org_id, user_id) DO NOTHING;

-- 1. Fully worked lead: intake 83, system + human touch, call booked.
INSERT INTO public.leads (
  id,
  org_id,
  ghl_contact_id,
  first_name,
  last_name,
  email,
  phone,
  source,
  campaign,
  offer_name,
  application_answers,
  status,
  assigned_setter_id,
  opted_in_at
)
VALUES (
  '44444444-4444-4444-8444-444444444441',
  '22222222-2222-4222-8222-222222222222',
  'ghl_ct_maya',
  'Maya',
  'Chen',
  'maya.chen@example.com',
  '+15555550101',
  'facebook',
  'q3-authority',
  'Private coaching',
  '{"timeline":"30 days","budget":"15k"}'::jsonb,
  'call_booked',
  CASE
    WHEN EXISTS (
      SELECT 1 FROM public.org_members
      WHERE id = '33333333-3333-4333-8333-333333333333'
    ) THEN '33333333-3333-4333-8333-333333333333'::uuid
    ELSE NULL
  END,
  now() - interval '2 days'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.readiness_scores (
  org_id,
  lead_id,
  timeline_raw,
  investment_capacity_raw,
  decision_authority_raw,
  pain_severity_raw,
  total,
  reasoning,
  triggered_by,
  scored_by_member_id
)
VALUES (
  '22222222-2222-4222-8222-222222222222',
  '44444444-4444-4444-8444-444444444441',
  90,
  80,
  85,
  75,
  83,
  'Strong timeline and authority. Budget language matches the offer.',
  'intake',
  CASE
    WHEN EXISTS (
      SELECT 1 FROM public.org_members
      WHERE id = '33333333-3333-4333-8333-333333333333'
    ) THEN '33333333-3333-4333-8333-333333333333'::uuid
    ELSE NULL
  END
);

INSERT INTO public.touches (
  org_id,
  lead_id,
  type,
  channel,
  direction,
  actor_member_id,
  summary,
  occurred_at
)
VALUES
  (
    '22222222-2222-4222-8222-222222222222',
    '44444444-4444-4444-8444-444444444441',
    'system',
    'email',
    'outbound',
    NULL,
    'Intake confirmation sent.',
    now() - interval '2 days'
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    '44444444-4444-4444-8444-444444444441',
    'human',
    'call',
    'outbound',
    CASE
      WHEN EXISTS (
        SELECT 1 FROM public.org_members
        WHERE id = '33333333-3333-4333-8333-333333333333'
      ) THEN '33333333-3333-4333-8333-333333333333'::uuid
      ELSE NULL
    END,
    'Booked discovery for Thursday.',
    now() - interval '1 day'
  );

-- 2. Never-touched breach: opted in ~25 minutes ago, no touches.
-- Default speed-to-lead is 15 minutes.
INSERT INTO public.leads (
  id,
  org_id,
  ghl_contact_id,
  first_name,
  last_name,
  email,
  phone,
  source,
  status,
  opted_in_at
)
VALUES (
  '44444444-4444-4444-8444-444444444442',
  '22222222-2222-4222-8222-222222222222',
  'ghl_ct_jordan',
  'Jordan',
  'Blake',
  'jordan.blake@example.com',
  '+15555550102',
  'google',
  'new',
  now() - interval '25 minutes'
)
ON CONFLICT (id) DO NOTHING;

-- 3. Working, a few days old, already touched.
INSERT INTO public.leads (
  id,
  org_id,
  ghl_contact_id,
  first_name,
  last_name,
  email,
  status,
  opted_in_at
)
VALUES (
  '44444444-4444-4444-8444-444444444443',
  '22222222-2222-4222-8222-222222222222',
  'ghl_ct_priya',
  'Priya',
  'Nair',
  'priya.nair@example.com',
  'working',
  now() - interval '4 days'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.touches (
  org_id,
  lead_id,
  type,
  channel,
  direction,
  actor_member_id,
  summary,
  occurred_at
)
VALUES (
  '22222222-2222-4222-8222-222222222222',
  '44444444-4444-4444-8444-444444444443',
  'human',
  'sms',
  'outbound',
  CASE
    WHEN EXISTS (
      SELECT 1 FROM public.org_members
      WHERE id = '33333333-3333-4333-8333-333333333333'
    ) THEN '33333333-3333-4333-8333-333333333333'::uuid
    ELSE NULL
  END,
  'Sent calendar link.',
  now() - interval '3 days'
);

-- 4. Silent for three weeks — working, so the ghost detector can catch them.
INSERT INTO public.leads (
  id,
  org_id,
  ghl_contact_id,
  first_name,
  last_name,
  email,
  status,
  opted_in_at,
  last_touch_at
)
VALUES (
  '44444444-4444-4444-8444-444444444444',
  '22222222-2222-4222-8222-222222222222',
  'ghl_ct_sam',
  'Sam',
  'Ortiz',
  'sam.ortiz@example.com',
  'working',
  now() - interval '24 days',
  now() - interval '21 days'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.touches (
  org_id,
  lead_id,
  type,
  channel,
  direction,
  actor_member_id,
  summary,
  occurred_at
)
VALUES (
  '22222222-2222-4222-8222-222222222222',
  '44444444-4444-4444-8444-444444444444',
  'human',
  'sms',
  'outbound',
  CASE
    WHEN EXISTS (
      SELECT 1 FROM public.org_members
      WHERE id = '33333333-3333-4333-8333-333333333333'
    ) THEN '33333333-3333-4333-8333-333333333333'::uuid
    ELSE NULL
  END,
  'Last ping before they went quiet.',
  now() - interval '21 days'
);

-- 5. Follow-up after a no-show.
INSERT INTO public.leads (
  id,
  org_id,
  ghl_contact_id,
  first_name,
  last_name,
  email,
  status,
  opted_in_at
)
VALUES (
  '44444444-4444-4444-8444-444444444445',
  '22222222-2222-4222-8222-222222222222',
  'ghl_ct_lee',
  'Alex',
  'Lee',
  'alex.lee@example.com',
  'follow_up',
  now() - interval '8 days'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.touches (
  org_id,
  lead_id,
  type,
  channel,
  direction,
  actor_member_id,
  summary,
  occurred_at
)
VALUES (
  '22222222-2222-4222-8222-222222222222',
  '44444444-4444-4444-8444-444444444445',
  'human',
  'call',
  'outbound',
  CASE
    WHEN EXISTS (
      SELECT 1 FROM public.org_members
      WHERE id = '33333333-3333-4333-8333-333333333333'
    ) THEN '33333333-3333-4333-8333-333333333333'::uuid
    ELSE NULL
  END,
  'No-show. Reschedule requested.',
  now() - interval '2 days'
);

-- ---------------------------------------------------------------------------
-- Stellar (Prompt S1). One client org, one setter, one client_viewer, one
-- active placement — the skeleton this prompt targets end to end.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  INSERT INTO auth.users (id, email)
  VALUES
    ('55555555-5555-4555-8555-555555555551', 'setter@stellar.local'),
    ('55555555-5555-4555-8555-555555555552', 'owner@stellar-client.local'),
    ('55555555-5555-4555-8555-555555555553', 'da-operator@vistrial.local')
  ON CONFLICT (id) DO NOTHING;
EXCEPTION
  WHEN undefined_table THEN
    RAISE NOTICE 'auth.users is missing; skip Stellar placeholder users';
  WHEN not_null_violation OR check_violation OR foreign_key_violation THEN
    RAISE NOTICE 'auth.users rejected a slim insert for Stellar seed users (expected on hosted Auth).';
  WHEN OTHERS THEN
    RAISE NOTICE 'Stellar seed auth.users insert skipped: %', SQLERRM;
END
$$;

INSERT INTO public.organizations (id, name, slug, timezone, product, holdout_percent)
VALUES (
  '66666666-6666-4666-8666-666666666661',
  'Riverside Home Services',
  'riverside-home-services',
  'America/Chicago',
  'stellar',
  0
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.score_configs (org_id)
VALUES ('66666666-6666-4666-8666-666666666661')
ON CONFLICT (org_id) DO NOTHING;

INSERT INTO public.org_members (id, org_id, user_id, role, display_name, email)
SELECT
  '77777777-7777-4777-8777-777777777771',
  '66666666-6666-4666-8666-666666666661',
  '55555555-5555-4555-8555-555555555551',
  'setter',
  'Casey Rivera',
  'setter@stellar.local'
WHERE EXISTS (SELECT 1 FROM auth.users WHERE id = '55555555-5555-4555-8555-555555555551')
ON CONFLICT (org_id, user_id) DO NOTHING;

INSERT INTO public.org_members (id, org_id, user_id, role, display_name, email)
SELECT
  '77777777-7777-4777-8777-777777777772',
  '66666666-6666-4666-8666-666666666661',
  '55555555-5555-4555-8555-555555555552',
  'client_viewer',
  'Riverside Owner',
  'owner@stellar-client.local'
WHERE EXISTS (SELECT 1 FROM auth.users WHERE id = '55555555-5555-4555-8555-555555555552')
ON CONFLICT (org_id, user_id) DO NOTHING;

INSERT INTO public.stellar_da_operators (user_id, note)
SELECT '55555555-5555-4555-8555-555555555553', 'Dev seed DA operator'
WHERE EXISTS (SELECT 1 FROM auth.users WHERE id = '55555555-5555-4555-8555-555555555553')
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.placements (
  id,
  org_id,
  setter_member_id,
  agreement_status,
  agreement_signed_at,
  build_stage,
  started_at
)
SELECT
  '88888888-8888-4888-8888-888888888881',
  '66666666-6666-4666-8666-666666666661',
  '77777777-7777-4777-8777-777777777771',
  'signed',
  now() - interval '30 days',
  'building_system',
  now() - interval '30 days'
WHERE EXISTS (
  SELECT 1 FROM public.org_members WHERE id = '77777777-7777-4777-8777-777777777771'
)
ON CONFLICT DO NOTHING;
