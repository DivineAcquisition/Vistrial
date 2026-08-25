-- Prompt 20: verification records, reporting recompute, DA toggles.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'call_extractions' AND column_name = 'verification_status'
  ) THEN
    RAISE EXCEPTION 'call_extractions.verification_status missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'follow_up_drafts' AND column_name = 'verification_faults'
  ) THEN
    RAISE EXCEPTION 'follow_up_drafts.verification_faults missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'operator_run_confirmations' AND column_name = 'verification_gate'
  ) THEN
    RAISE EXCEPTION 'operator_run_confirmations.verification_gate missing';
  END IF;
END
$$;

DO $$
DECLARE
  rel text;
BEGIN
  FOREACH rel IN ARRAY ARRAY[
    'verification_runs',
    'verification_usage',
    'verification_task_settings',
    'verification_sample_audits',
    'verification_injected_runs',
    'verification_false_positives'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = rel AND c.relrowsecurity
    ) THEN
      RAISE EXCEPTION '% RLS is not enabled', rel;
    END IF;
  END LOOP;
END
$$;

DO $$
BEGIN
  IF (
    SELECT count(*) FROM public.verification_task_settings
    WHERE task IN ('extraction', 'draft', 'agent_plan', 'agent_response', 'reporting')
  ) <> 5 THEN
    RAISE EXCEPTION 'verification_task_settings not seeded';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ops_job_catalog WHERE job_name = 'verification-audit') THEN
    RAISE EXCEPTION 'verification-audit job catalog missing';
  END IF;
END
$$;

-- Authenticated members can read runs for their org, not write them.
INSERT INTO auth.users (id, email)
VALUES
  ('201e2011-2011-4201-8201-2011111111a2', 'sv-owner@vistrial.local'),
  ('201e2011-2011-4201-8201-2011111111a4', 'sv-setter@vistrial.local')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.organizations (id, name, slug, timezone, activated_at)
VALUES (
  '201e2011-2011-4201-8201-2011111111a1',
  'Self Verify Co',
  'self-verify-co',
  'America/New_York',
  now() - interval '30 days'
);

INSERT INTO public.score_configs (org_id)
VALUES ('201e2011-2011-4201-8201-2011111111a1')
ON CONFLICT (org_id) DO NOTHING;

INSERT INTO public.org_members (id, org_id, user_id, role, display_name, email)
VALUES
(
  '201e2011-2011-4201-8201-2011111111a3',
  '201e2011-2011-4201-8201-2011111111a1',
  '201e2011-2011-4201-8201-2011111111a2',
  'owner',
  'SV Owner',
  'sv-owner@vistrial.local'
),
(
  '201e2011-2011-4201-8201-2011111111a5',
  '201e2011-2011-4201-8201-2011111111a1',
  '201e2011-2011-4201-8201-2011111111a4',
  'setter',
  'SV Setter',
  'sv-setter@vistrial.local'
);

SELECT set_config('request.jwt.claim.sub', '201e2011-2011-4201-8201-2011111111a2', false);
SELECT set_config('request.jwt.claim.role', 'authenticated', false);
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '201e2011-2011-4201-8201-2011111111a2', false);

DO $$
BEGIN
  BEGIN
    INSERT INTO public.verification_runs (
      org_id, task, subject_type, final_state
    ) VALUES (
      '201e2011-2011-4201-8201-2011111111a1',
      'extraction',
      'call_extraction',
      'passed'
    );
    RAISE EXCEPTION 'authenticated insert into verification_runs should fail';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN others THEN
      IF SQLERRM LIKE '%authenticated insert into verification_runs should fail%' THEN
        RAISE;
      END IF;
  END;
END
$$;

RESET ROLE;

INSERT INTO public.verification_runs (
  org_id, task, subject_type, final_state, model_invoked
) VALUES (
  '201e2011-2011-4201-8201-2011111111a1',
  'extraction',
  'call_extraction',
  'passed',
  true
);

SELECT set_config('request.jwt.claim.sub', '201e2011-2011-4201-8201-2011111111a2', false);
SELECT set_config('request.jwt.claim.role', 'authenticated', false);
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '201e2011-2011-4201-8201-2011111111a2', false);

DO $$
DECLARE
  n int;
BEGIN
  SELECT count(*) INTO n FROM public.verification_runs
  WHERE org_id = '201e2011-2011-4201-8201-2011111111a1';
  IF n < 1 THEN
    RAISE EXCEPTION 'owner should select own verification_runs';
  END IF;
END
$$;

DO $$
BEGIN
  BEGIN
    PERFORM public.set_verification_task_enabled('extraction', false, 'test');
    RAISE EXCEPTION 'org owner must not toggle verification tasks';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM LIKE '%org owner must not toggle%' THEN
        RAISE;
      END IF;
  END;
END
$$;

RESET ROLE;

-- Platform admin can toggle.
INSERT INTO public.platform_admins (user_id)
VALUES ('99999999-9999-4999-8999-999999999999')
ON CONFLICT (user_id) DO NOTHING;

SELECT set_config('request.jwt.claim.sub', '99999999-9999-4999-8999-999999999999', false);
SELECT set_config('request.jwt.claim.role', 'authenticated', false);
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '99999999-9999-4999-8999-999999999999', false);

DO $$
BEGIN
  PERFORM public.set_verification_task_enabled('extraction', false, 'accuracy poor in test');
  IF (SELECT enabled FROM public.verification_task_settings WHERE task = 'extraction') IS NOT FALSE THEN
    RAISE EXCEPTION 'platform admin disable failed';
  END IF;
  PERFORM public.set_verification_task_enabled('extraction', true, NULL);
  IF (SELECT enabled FROM public.verification_task_settings WHERE task = 'extraction') IS NOT TRUE THEN
    RAISE EXCEPTION 'platform admin re-enable failed';
  END IF;
END
$$;

RESET ROLE;

-- Independent recompute shape matches reporting_rate.
DO $$
DECLARE
  recomputed jsonb;
BEGIN
  recomputed := public.reporting_recompute_outcome(
    '201e2011-2011-4201-8201-2011111111a1',
    now() - interval '30 days',
    now()
  );
  IF NOT (recomputed ? 'k') OR NOT (recomputed ? 'n') THEN
    RAISE EXCEPTION 'reporting_recompute_outcome missing k/n';
  END IF;
  IF (recomputed ->> 'k')::int > (recomputed ->> 'n')::int THEN
    RAISE EXCEPTION 'recompute k exceeds n';
  END IF;
END
$$;

DO $$
DECLARE
  snap jsonb;
BEGIN
  snap := public.reporting_integrity_snapshot('201e2011-2011-4201-8201-2011111111a1');
  IF snap ->> 'ok' IS NULL THEN
    RAISE EXCEPTION 'integrity snapshot missing ok';
  END IF;
  IF NOT (snap ? 'closedWonWithoutRevenue' AND snap ? 'phantomTouches' AND snap ? 'scoreDrift') THEN
    RAISE EXCEPTION 'integrity snapshot missing Prompt 14 keys';
  END IF;
END
$$;
