-- Prompt 11: reporting metrics verified against raw rows, plus access and backfill rules.
-- IDs in this file use the 111e1111-1111-4111-8111- prefix so they do not
-- collide with org/lead/call ids in earlier verify-*.sql scripts. A collision
-- makes ON CONFLICT DO NOTHING skip the reporting org, leaving activated_at
-- null and every opted_in_at derived from it null.

INSERT INTO auth.users (id, email)
VALUES
  ('111e1111-1111-4111-8111-1111111111a2', 'report-owner@vistrial.local'),
  ('111e1111-1111-4111-8111-1111111111a4', 'report-setter@vistrial.local')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.organizations (
  id, name, slug, timezone, activated_at, sales_cycle_days, baseline_lookback_days, holdout_percent
) VALUES (
  '111e1111-1111-4111-8111-1111111111a1',
  'Reporting Co',
  'reporting-co',
  'America/New_York',
  now() - interval '90 days',
  60,
  365,
  0
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.score_configs (org_id, speed_to_lead_minutes)
VALUES ('111e1111-1111-4111-8111-1111111111a1', 15)
ON CONFLICT (org_id) DO NOTHING;

INSERT INTO public.org_members (id, org_id, user_id, role, display_name, email)
VALUES
  (
    '111e1111-1111-4111-8111-1111111111a3',
    '111e1111-1111-4111-8111-1111111111a1',
    '111e1111-1111-4111-8111-1111111111a2',
    'owner',
    'Reporting Owner',
    'report-owner@vistrial.local'
  ),
  (
    '111e1111-1111-4111-8111-1111111111a5',
    '111e1111-1111-4111-8111-1111111111a1',
    '111e1111-1111-4111-8111-1111111111a4',
    'setter',
    'Reporting Setter',
    'report-setter@vistrial.local'
  )
ON CONFLICT (org_id, user_id) DO NOTHING;

DO $$
DECLARE
  v_org uuid := '111e1111-1111-4111-8111-1111111111a1';
  v_owner uuid := '111e1111-1111-4111-8111-1111111111a3';
  v_activated timestamptz;
  v_mature timestamptz;
  v_maturing timestamptz;
  v_before timestamptz;
  i integer;
  v_lead uuid;
  v_run uuid;
  v_json jsonb;
  v_n bigint;
  v_k bigint;
  v_rate numeric;
  v_denied boolean;
  v_other uuid := '66666666-6666-4666-8666-666666666666';
  v_skip_org uuid := '111e1111-1111-4111-8111-1111111111b1';
  v_count integer;
  v_grade public.baseline_grade;
  v_plan text;
  v_started timestamptz;
  v_ms numeric;
BEGIN
  SELECT activated_at INTO v_activated FROM public.organizations WHERE id = v_org;
  v_mature := v_activated + interval '1 day';
  v_maturing := now() - interval '3 days';
  v_before := v_activated - interval '10 days';

  -- 40 mature leads. i=1..8 closed; i=1..20 touch at +10m; i=21..30 touch at +120m;
  -- i=31..40 never touched; i=31..34 ghost; i=35..37 closed_lost; i=38..40 working (breach).
  FOR i IN 1..40 LOOP
    v_lead := (
      'c0000000-0000-4000-8000-' || lpad(i::text, 12, '0')
    )::uuid;
    INSERT INTO public.leads (
      id, org_id, first_name, last_name, email, source, campaign, status, opted_in_at,
      first_human_touch_at, ghl_contact_id
    ) VALUES (
      v_lead,
      v_org,
      'Mature',
      i::text,
      'mature' || i || '@example.test',
      CASE WHEN i <= 20 THEN 'facebook' ELSE 'google' END,
      CASE WHEN i <= 20 THEN 'q1' ELSE 'q2' END,
      CASE
        WHEN i BETWEEN 31 AND 34 THEN 'ghost'::public.lead_status
        WHEN i BETWEEN 35 AND 37 THEN 'closed_lost'::public.lead_status
        ELSE 'working'::public.lead_status
      END,
      v_mature,
      CASE
        WHEN i <= 20 THEN v_mature + interval '10 minutes'
        WHEN i <= 30 THEN v_mature + interval '120 minutes'
        ELSE NULL
      END,
      'ghl_rep_m_' || i
    );
    IF i <= 8 THEN
      INSERT INTO public.revenue_log (org_id, lead_id, amount_cents, payment_type, closed_by_member_id)
      VALUES (v_org, v_lead, 100000, 'pif', v_owner);
    END IF;
    IF i <= 30 THEN
      INSERT INTO public.touches (
        org_id, lead_id, type, channel, direction, actor_member_id, summary, occurred_at
      ) VALUES (
        v_org, v_lead, 'human', 'sms', 'outbound', v_owner, 'Outbound sms sent',
        CASE WHEN i <= 20 THEN v_mature + interval '10 minutes' ELSE v_mature + interval '120 minutes' END
      );
    END IF;
  END LOOP;

  -- 10 maturing leads, one of which has revenue that must NOT enter the headline.
  FOR i IN 1..10 LOOP
    v_lead := ('d0000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid;
    INSERT INTO public.leads (
      id, org_id, first_name, email, source, status, opted_in_at, ghl_contact_id
    ) VALUES (
      v_lead, v_org, 'Maturing', 'maturing' || i || '@example.test', 'facebook', 'new',
      v_maturing, 'ghl_rep_y_' || i
    );
    IF i = 1 THEN
      INSERT INTO public.revenue_log (org_id, lead_id, amount_cents, payment_type)
      VALUES (v_org, v_lead, 50000, 'pif');
    END IF;
  END LOOP;

  -- Pre-activation live row with a close. Must stay out of the after headline.
  INSERT INTO public.leads (
    id, org_id, first_name, email, source, status, opted_in_at, ghl_contact_id
  ) VALUES (
    'e0000000-0000-4000-8000-000000000001',
    v_org, 'Before', 'before@example.test', 'facebook', 'working',
    v_before, 'ghl_rep_before'
  );
  INSERT INTO public.revenue_log (org_id, lead_id, amount_cents, payment_type)
  VALUES (v_org, 'e0000000-0000-4000-8000-000000000001', 999999, 'pif');

  -- Hand count from the raw tables (the numbers the screen must match).
  SELECT count(*),
         count(*) FILTER (WHERE l.has_net_close)
  INTO v_n, v_k
  FROM public.leads l
  WHERE l.org_id = v_org
    AND l.opted_in_at >= v_activated
    AND l.opted_in_at <= now() - interval '60 days';

  IF v_n <> 40 OR v_k <> 8 THEN
    RAISE EXCEPTION 'hand count mature live expected 8/40, got %/%', v_k, v_n;
  END IF;

  -- Baseline: 80 contacts across 8 months, 10 closes, 40 with activity.
  INSERT INTO public.baseline_runs (
    id, org_id, status, lookback_days, window_start, window_end,
    contacts_seen, contacts_with_created_date, contacts_with_activity,
    opportunities_seen, opportunities_with_value, payments_seen
  ) VALUES (
    'f0000000-0000-4000-8000-000000000001',
    v_org,
    'completed',
    365,
    v_activated - interval '365 days',
    v_activated,
    80, 80, 40, 10, 10, 0
  );
  v_run := 'f0000000-0000-4000-8000-000000000001';

  FOR i IN 1..80 LOOP
    INSERT INTO public.baseline_leads (
      id, org_id, run_id, ghl_contact_id, created_at_crm, source, campaign, first_human_touch_at
    ) VALUES (
      ('a1000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
      v_org,
      v_run,
      'ghl_base_' || i,
      (v_activated - interval '8 months') + make_interval(months => ((i - 1) / 10)),
      'facebook',
      'legacy',
      CASE WHEN i <= 40 THEN (v_activated - interval '8 months') + make_interval(months => ((i - 1) / 10)) + interval '1 day'
           ELSE NULL END
    );
    IF i <= 10 THEN
      INSERT INTO public.baseline_revenue (
        org_id, run_id, baseline_lead_id, amount_cents, occurred_at, source
      ) VALUES (
        v_org,
        v_run,
        ('a1000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
        200000,
        v_activated - interval '20 days',
        'opportunity'
      );
    END IF;
  END LOOP;

  PERFORM public.reporting_grade_baseline(v_run);
  SELECT grade INTO v_grade FROM public.baseline_runs WHERE id = v_run;
  IF v_grade IS DISTINCT FROM 'usable' THEN
    RAISE EXCEPTION 'expected usable baseline, got % %', v_grade,
      (SELECT grade_reasons FROM public.baseline_runs WHERE id = v_run);
  END IF;

  -- Truncation helpers.
  IF (public.reporting_rate(2, 31, 30, true) ->> 'per_hundred')::numeric IS DISTINCT FROM 6.4 THEN
    RAISE EXCEPTION '2/31 should truncate to 6.4, got %', public.reporting_rate(2, 31, 30, true);
  END IF;
  IF (public.reporting_rate(8, 20, 30, true) ->> 'too_small')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'n=20 must be too small for a rate';
  END IF;
  IF public.reporting_rate(8, 20, 30, true) ->> 'per_hundred' IS NOT NULL THEN
    RAISE EXCEPTION 'too-small samples must not ship a percentage';
  END IF;
  IF public.reporting_trunc_delta(2.51, 1) IS DISTINCT FROM 2.5 THEN
    RAISE EXCEPTION 'positive delta rounded flatteringly';
  END IF;
  IF public.reporting_trunc_delta(-2.51, 1) IS DISTINCT FROM -2.6 THEN
    RAISE EXCEPTION 'negative delta rounded flatteringly: %', public.reporting_trunc_delta(-2.51, 1);
  END IF;

  PERFORM set_config('request.jwt.claim.sub', '111e1111-1111-4111-8111-1111111111a2', false);
  SET ROLE authenticated;

  v_json := public.reporting_compute_outcome(v_org, v_activated, now());

  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);

  v_n := (v_json #>> '{headline,n}')::bigint;
  v_k := (v_json #>> '{headline,k}')::bigint;
  v_rate := (v_json #>> '{headline,per_hundred}')::numeric;
  IF v_n <> 40 OR v_k <> 8 OR v_rate IS DISTINCT FROM 20.0 THEN
    RAISE EXCEPTION 'headline mismatch: expected 8 of 40 = 20.0, got %', v_json -> 'headline';
  END IF;
  IF (v_json #>> '{maturing,n}')::bigint IS DISTINCT FROM 10 THEN
    RAISE EXCEPTION 'maturing n expected 10, got %', v_json -> 'maturing';
  END IF;
  IF (v_json #>> '{maturing,k}')::bigint IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'maturing closed expected 1 (excluded from headline), got %', v_json -> 'maturing';
  END IF;
  IF (v_json #>> '{baseline,n}')::bigint IS DISTINCT FROM 80
     OR (v_json #>> '{baseline,k}')::bigint IS DISTINCT FROM 10
     OR (v_json #>> '{baseline,per_hundred}')::numeric IS DISTINCT FROM 12.5 THEN
    RAISE EXCEPTION 'baseline mismatch: %', v_json -> 'baseline';
  END IF;
  IF (v_json #>> '{comparison,delta_per_hundred}')::numeric IS DISTINCT FROM 7.5 THEN
    RAISE EXCEPTION 'delta expected 7.5, got %', v_json -> 'comparison';
  END IF;
  IF (v_json ->> 'attribution') NOT ILIKE '%did not close%' THEN
    RAISE EXCEPTION 'outcome must not credit Vistrial with closes';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', '111e1111-1111-4111-8111-1111111111a2', false);
  SET ROLE authenticated;
  v_json := public.reporting_compute_coverage(v_org, v_activated, now());
  RESET ROLE;

  -- 50 leads in range (40 mature + 10 maturing). 30 touched. 20 within 15m.
  -- 4 ghost untouched. 3 mature working untouched. 1 maturing lead has
  -- revenue so it is closed_won, leaving 9 open maturing untouched = 12 in breach.
  IF (v_json ->> 'n')::bigint IS DISTINCT FROM 50 THEN
    RAISE EXCEPTION 'coverage n expected 50, got %', v_json;
  END IF;
  IF (v_json #>> '{ever_touched,k}')::bigint IS DISTINCT FROM 30 THEN
    RAISE EXCEPTION 'ever touched expected 30, got %', v_json -> 'ever_touched';
  END IF;
  IF (v_json #>> '{within_window,k}')::bigint IS DISTINCT FROM 20 THEN
    RAISE EXCEPTION 'within window expected 20, got %', v_json -> 'within_window';
  END IF;
  IF (v_json ->> 'median_minutes')::numeric IS DISTINCT FROM 10.0 THEN
    RAISE EXCEPTION 'median expected 10, got %', v_json ->> 'median_minutes';
  END IF;
  IF (v_json ->> 'worst_case_minutes')::numeric IS DISTINCT FROM 120.0 THEN
    RAISE EXCEPTION 'worst case expected 120, got %', v_json ->> 'worst_case_minutes';
  END IF;
  IF (v_json ->> 'ghosted_no_touch')::bigint IS DISTINCT FROM 4 THEN
    RAISE EXCEPTION 'ghosted no touch expected 4, got %', v_json;
  END IF;
  IF (v_json ->> 'currently_in_breach')::bigint IS DISTINCT FROM 12 THEN
    RAISE EXCEPTION 'breach expected 12, got %', v_json;
  END IF;

  -- Unusable baseline: no comparison.
  INSERT INTO public.organizations (id, name, slug, activated_at, holdout_percent)
  VALUES (
    '111e1111-1111-4111-8111-1111111111c1',
    'Sparse CRM',
    'sparse-crm',
    now() - interval '90 days',
    0
  );
  INSERT INTO public.org_members (id, org_id, user_id, role, display_name, email)
  VALUES (
    '111e1111-1111-4111-8111-1111111111c2',
    '111e1111-1111-4111-8111-1111111111c1',
    '111e1111-1111-4111-8111-1111111111a2',
    'owner',
    'Sparse Owner',
    'report-owner@vistrial.local'
  );
  INSERT INTO public.baseline_runs (
    id, org_id, status, lookback_days, window_start, window_end,
    contacts_seen, contacts_with_created_date, contacts_with_activity,
    opportunities_seen, opportunities_with_value, payments_seen
  ) VALUES (
    '111e1111-1111-4111-8111-1111111111c3',
    '111e1111-1111-4111-8111-1111111111c1',
    'completed',
    365,
    now() - interval '365 days',
    now() - interval '90 days',
    5, 1, 0, 0, 0, 0
  );
  PERFORM public.reporting_grade_baseline('111e1111-1111-4111-8111-1111111111c3');
  SELECT grade INTO v_grade FROM public.baseline_runs
  WHERE id = '111e1111-1111-4111-8111-1111111111c3';
  IF v_grade IS DISTINCT FROM 'unusable' THEN
    RAISE EXCEPTION 'sparse CRM should grade unusable, got %', v_grade;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', '111e1111-1111-4111-8111-1111111111a2', false);
  SET ROLE authenticated;
  v_json := public.reporting_compute_outcome(
    '111e1111-1111-4111-8111-1111111111c1',
    now() - interval '90 days',
    now()
  );
  RESET ROLE;
  IF v_json -> 'baseline' IS NOT NULL AND v_json -> 'baseline' <> 'null'::jsonb THEN
    RAISE EXCEPTION 'unusable baseline must not produce a comparison baseline: %', v_json -> 'baseline';
  END IF;
  IF COALESCE((v_json #>> '{comparison,shown}')::boolean, true) THEN
    RAISE EXCEPTION 'unusable baseline must not show a comparison: %', v_json -> 'comparison';
  END IF;

  -- Self-reported is labeled and not blended into comparison.
  PERFORM set_config('request.jwt.claim.sub', '111e1111-1111-4111-8111-1111111111a2', false);
  SET ROLE authenticated;
  PERFORM public.upsert_self_reported_baseline(v_org, 50, 3, 'from the client');
  v_json := public.reporting_compute_outcome(v_org, v_activated, now());
  RESET ROLE;
  IF v_json #>> '{self_reported,label}' IS DISTINCT FROM 'self-reported' THEN
    RAISE EXCEPTION 'self-reported must be labeled, got %', v_json -> 'self_reported';
  END IF;
  IF (v_json #>> '{comparison,from}') IS DISTINCT FROM 'backfilled' THEN
    RAISE EXCEPTION 'self-reported must not replace or blend into the backfilled comparison';
  END IF;

  -- Discontinuity: quiet first months, then a busy block.
  INSERT INTO public.baseline_runs (
    id, org_id, status, lookback_days, window_start, window_end,
    contacts_seen, contacts_with_created_date, contacts_with_activity,
    opportunities_seen, opportunities_with_value, payments_seen
  ) VALUES (
    'f0000000-0000-4000-8000-000000000002',
    v_org,
    'completed',
    365,
    v_activated - interval '365 days',
    v_activated,
    90, 90, 50, 10, 10, 0
  );
  DELETE FROM public.baseline_leads WHERE run_id = 'f0000000-0000-4000-8000-000000000002';
  FOR i IN 1..90 LOOP
    INSERT INTO public.baseline_leads (
      org_id, run_id, ghl_contact_id, created_at_crm
    ) VALUES (
      v_org,
      'f0000000-0000-4000-8000-000000000002',
      'ghl_disc_' || i,
      CASE
        WHEN i <= 6 THEN (v_activated - interval '365 days') + make_interval(days => i)
        ELSE v_activated - interval '90 days' + make_interval(days => i)
      END
    );
  END LOOP;
  PERFORM public.reporting_grade_baseline('f0000000-0000-4000-8000-000000000002');
  IF NOT (SELECT discontinuity_detected FROM public.baseline_runs WHERE id = 'f0000000-0000-4000-8000-000000000002') THEN
    RAISE EXCEPTION 'expected a volume discontinuity';
  END IF;

  -- Setter is rejected by the reporting RPC.
  v_denied := false;
  PERFORM set_config('request.jwt.claim.sub', '111e1111-1111-4111-8111-1111111111a4', false);
  SET ROLE authenticated;
  BEGIN
    PERFORM public.load_reporting_panel(v_org, 'outcome', v_activated, now(), 'custom');
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_denied := true;
    WHEN OTHERS THEN
      IF SQLERRM ILIKE '%owner/admin%' THEN
        v_denied := true;
      ELSE
        RAISE;
      END IF;
  END;
  RESET ROLE;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'setter was allowed to load reporting';
  END IF;

  -- Another org cannot read this org's panel.
  v_denied := false;
  PERFORM set_config('request.jwt.claim.sub', '55555555-5555-4555-8555-555555555555', false);
  SET ROLE authenticated;
  BEGIN
    PERFORM public.load_reporting_panel(v_org, 'outcome', v_activated, now(), 'custom');
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_denied := true;
    WHEN OTHERS THEN
      IF SQLERRM ILIKE '%owner/admin%' THEN
        v_denied := true;
      ELSE
        RAISE;
      END IF;
  END;
  RESET ROLE;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'org B owner was allowed to load reporting for org R';
  END IF;

  -- Neither enqueue nor skip activates. Prompt 12 moved activation behind the
  -- gate in activate_org, so skipping only resolves the backfill.
  INSERT INTO public.organizations (id, name, slug, holdout_percent)
  VALUES (v_skip_org, 'Skip Co', 'skip-co', 0);
  INSERT INTO public.org_members (id, org_id, user_id, role, display_name, email)
  VALUES (
    '111e1111-1111-4111-8111-1111111111b2',
    v_skip_org,
    '111e1111-1111-4111-8111-1111111111a2',
    'owner',
    'Skip Owner',
    'report-owner@vistrial.local'
  );
  PERFORM set_config('request.jwt.claim.sub', '111e1111-1111-4111-8111-1111111111a2', false);
  SET ROLE authenticated;
  PERFORM public.enqueue_baseline_backfill(v_skip_org, '111e1111-1111-4111-8111-1111111111b2', false);
  RESET ROLE;
  IF (SELECT activated_at FROM public.organizations WHERE id = v_skip_org) IS NOT NULL THEN
    RAISE EXCEPTION 'enqueue must not set activated_at';
  END IF;
  IF (SELECT status FROM public.baseline_runs WHERE org_id = v_skip_org ORDER BY created_at DESC LIMIT 1)
     IS DISTINCT FROM 'queued' THEN
    RAISE EXCEPTION 'connect backfill was not queued';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', '111e1111-1111-4111-8111-1111111111a2', false);
  SET ROLE authenticated;
  PERFORM public.skip_baseline_backfill(v_skip_org, '111e1111-1111-4111-8111-1111111111b2');
  RESET ROLE;
  IF (SELECT activated_at FROM public.organizations WHERE id = v_skip_org) IS NOT NULL THEN
    RAISE EXCEPTION 'skip must not set activated_at; activation is gated';
  END IF;
  IF (SELECT grade FROM public.baseline_runs WHERE org_id = v_skip_org ORDER BY created_at DESC LIMIT 1)
     IS DISTINCT FROM 'unusable' THEN
    RAISE EXCEPTION 'skipped backfill must grade unusable';
  END IF;

  -- Re-run replaces rows rather than appending.
  INSERT INTO public.baseline_leads (org_id, run_id, ghl_contact_id, created_at_crm)
  SELECT v_org, v_run, 'ghl_replace_old', now() - interval '100 days';
  PERFORM set_config('request.jwt.claim.sub', '111e1111-1111-4111-8111-1111111111a2', false);
  SET ROLE authenticated;
  PERFORM public.enqueue_baseline_backfill(v_org, v_owner, true);
  RESET ROLE;
  SELECT count(*) INTO v_count FROM public.baseline_leads WHERE org_id = v_org;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 're-run must replace baseline_leads, still have %', v_count;
  END IF;
  IF (SELECT replaced_run_id IS NOT NULL FROM public.baseline_runs
      WHERE org_id = v_org ORDER BY created_at DESC, id DESC LIMIT 1) IS NOT TRUE THEN
    RAISE EXCEPTION 're-run must record the run it replaced';
  END IF;
  IF (SELECT triggered_by_member_id FROM public.baseline_runs
      WHERE org_id = v_org ORDER BY created_at DESC, id DESC LIMIT 1)
     IS DISTINCT FROM v_owner THEN
    RAISE EXCEPTION 're-run must record who triggered it';
  END IF;

  -- Cohort job moves months older than the sales cycle to mature.
  -- Restore live data is still present; mature the org.
  PERFORM set_config('request.jwt.claim.sub', '111e1111-1111-4111-8111-1111111111a2', false);
  SET ROLE authenticated;
  PERFORM public.reporting_mature_cohorts(v_org);
  RESET ROLE;
  IF NOT EXISTS (
    SELECT 1 FROM public.reporting_cohorts
    WHERE org_id = v_org AND side = 'live' AND status = 'mature'
  ) THEN
    RAISE EXCEPTION 'maturation job did not mark a live cohort mature';
  END IF;

  -- Aggregation job writes a snapshot and is idempotent.
  PERFORM set_config('request.jwt.claim.sub', '111e1111-1111-4111-8111-1111111111a2', false);
  SET ROLE authenticated;
  PERFORM public.reporting_refresh_org_snapshot(v_org, NULL);
  PERFORM public.reporting_refresh_org_snapshot(v_org, NULL);
  RESET ROLE;
  SELECT count(*) INTO v_count FROM public.reporting_snapshots WHERE org_id = v_org;
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'expected 3 range snapshots, got %', v_count;
  END IF;

  -- Contribution never includes revenue.
  PERFORM set_config('request.jwt.claim.sub', '111e1111-1111-4111-8111-1111111111a2', false);
  SET ROLE authenticated;
  v_json := public.reporting_compute_contribution(v_org, v_activated, now());
  RESET ROLE;
  IF (v_json ->> 'never_credits_revenue')::boolean IS NOT TRUE
     OR (v_json ->> 'never_credits_closes')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'contribution flags missing: %', v_json;
  END IF;
  IF v_json::text ILIKE '%amount_cents%' THEN
    RAISE EXCEPTION 'contribution payload includes amount_cents: %', v_json;
  END IF;
END;
$$;

DO $$
DECLARE
  v_vol uuid := '111e1111-1111-4111-8111-1111111111d1';
  v_started timestamptz;
  v_ms numeric;
  v_json jsonb;
  v_plan text;
BEGIN
  INSERT INTO public.organizations (id, name, slug, activated_at, sales_cycle_days, holdout_percent)
  VALUES (v_vol, 'Volume Co', 'volume-co', now() - interval '400 days', 60, 0);

  ALTER TABLE public.leads DISABLE TRIGGER ALL;
  INSERT INTO public.leads (org_id, opted_in_at, status, source, is_holdout)
  SELECT
    v_vol,
    (now() - interval '400 days') + (g || ' minutes')::interval,
    'working',
    'volume',
    false
  FROM generate_series(1, 100000) AS g;
  ALTER TABLE public.leads ENABLE TRIGGER ALL;
  ANALYZE public.leads;

  INSERT INTO public.org_members (org_id, user_id, role, display_name, email)
  VALUES (
    v_vol,
    '111e1111-1111-4111-8111-1111111111a2',
    'owner',
    'Volume Owner',
    'report-owner@vistrial.local'
  )
  ON CONFLICT (org_id, user_id) DO NOTHING;

  PERFORM set_config('request.jwt.claim.sub', '111e1111-1111-4111-8111-1111111111a2', false);
  SET ROLE authenticated;
  v_started := clock_timestamp();
  v_json := public.reporting_compute_outcome(v_vol, now() - interval '400 days', now());
  v_ms := extract(epoch FROM clock_timestamp() - v_started) * 1000;
  RESET ROLE;

  -- 100000 minutes ≈ 69.4 days starting 400 days ago, so every row is older than 60 days.
  IF (v_json #>> '{headline,n}')::bigint IS DISTINCT FROM 100000 THEN
    RAISE EXCEPTION 'volume headline n expected 100000 mature leads, got %', v_json -> 'headline';
  END IF;
  IF v_ms > 15000 THEN
    RAISE EXCEPTION 'outcome over 100k leads took % ms', v_ms;
  END IF;
END;
$$;
