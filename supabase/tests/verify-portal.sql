-- Prompt 22: owner portal access, refunded closes, unattributed ads, unusable baseline.
-- IDs use the 222e2222-2222-4222-8222- prefix so they do not collide with
-- earlier verify-*.sql fixtures.

INSERT INTO auth.users (id, email)
VALUES
  ('222e2222-2222-4222-8222-0000000000a2', 'portal-owner@vistrial.local'),
  ('222e2222-2222-4222-8222-0000000000a4', 'portal-setter@vistrial.local')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.organizations (
  id, name, slug, timezone, activated_at, sales_cycle_days, baseline_lookback_days, holdout_percent
) VALUES (
  '222e2222-2222-4222-8222-0000000000a1',
  'Portal Co',
  'portal-co',
  'America/New_York',
  now() - interval '90 days',
  60,
  365,
  0
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.org_members (id, org_id, user_id, role, display_name, email)
VALUES
  (
    '222e2222-2222-4222-8222-0000000000a3',
    '222e2222-2222-4222-8222-0000000000a1',
    '222e2222-2222-4222-8222-0000000000a2',
    'owner',
    'Portal Owner',
    'portal-owner@vistrial.local'
  ),
  (
    '222e2222-2222-4222-8222-0000000000a5',
    '222e2222-2222-4222-8222-0000000000a1',
    '222e2222-2222-4222-8222-0000000000a4',
    'setter',
    'Portal Setter',
    'portal-setter@vistrial.local'
  )
ON CONFLICT (org_id, user_id) DO NOTHING;

DO $$
DECLARE
  v_org uuid := '222e2222-2222-4222-8222-0000000000a1';
  v_owner uuid := '222e2222-2222-4222-8222-0000000000a3';
  v_activated timestamptz;
  v_mature timestamptz;
  i integer;
  v_lead uuid;
  v_json jsonb;
  v_n bigint;
  v_k bigint;
  v_denied boolean;
  v_crm bigint;
  v_unattr bigint;
  v_status public.lead_status;
  v_closed boolean;
BEGIN
  SELECT activated_at INTO v_activated FROM public.organizations WHERE id = v_org;
  v_mature := v_activated + interval '1 day';

  -- 40 mature leads. i=1..8 closed by a sale. i=1..5 campaign camp_a; rest unattributed.
  FOR i IN 1..40 LOOP
    v_lead := ('222e2222-2222-4222-8222-' || lpad(i::text, 12, '0'))::uuid;
    INSERT INTO public.leads (
      id, org_id, first_name, last_name, email, source, campaign, status, opted_in_at,
      ghl_contact_id
    ) VALUES (
      v_lead,
      v_org,
      'Portal',
      i::text,
      'portal' || i || '@example.test',
      CASE WHEN i <= 5 THEN 'facebook' ELSE 'google' END,
      CASE WHEN i <= 5 THEN 'camp_a' ELSE NULL END,
      'working',
      v_mature,
      'ghl_portal_' || i
    );
    IF i <= 8 THEN
      INSERT INTO public.revenue_log (org_id, lead_id, amount_cents, payment_type, closed_by_member_id)
      VALUES (v_org, v_lead, 100000, 'pif', v_owner);
    END IF;
  END LOOP;

  SELECT count(*), count(*) FILTER (WHERE has_net_close)
  INTO v_n, v_k
  FROM public.leads
  WHERE org_id = v_org
    AND opted_in_at >= v_activated
    AND opted_in_at <= now() - interval '60 days';

  IF v_n <> 40 OR v_k <> 8 THEN
    RAISE EXCEPTION 'portal hand count before refund expected 8/40, got %/%', v_k, v_n;
  END IF;

  v_json := public.reporting_compute_outcome(v_org, v_activated, now());
  IF (v_json #>> '{headline,k}')::bigint IS DISTINCT FROM 8
     OR (v_json #>> '{headline,n}')::bigint IS DISTINCT FROM 40 THEN
    RAISE EXCEPTION 'outcome before refund expected 8 of 40, got %', v_json -> 'headline';
  END IF;

  -- A closed deal that refunded is not a closed deal.
  INSERT INTO public.revenue_log (
    org_id, lead_id, amount_cents, payment_type, kind, processor, processor_ref
  ) VALUES (
    v_org,
    '222e2222-2222-4222-8222-000000000001',
    100000,
    'pif',
    'refund',
    'stripe',
    're_portal_1'
  );

  SELECT status, has_net_close
  INTO v_status, v_closed
  FROM public.leads
  WHERE id = '222e2222-2222-4222-8222-000000000001';

  IF v_closed IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'refunded lead still has_net_close';
  END IF;
  IF v_status IS DISTINCT FROM 'closed_lost' THEN
    RAISE EXCEPTION 'refunded lead status expected closed_lost, got %', v_status;
  END IF;

  SELECT count(*) FILTER (WHERE has_net_close) INTO v_k
  FROM public.leads
  WHERE org_id = v_org
    AND opted_in_at >= v_activated
    AND opted_in_at <= now() - interval '60 days';

  IF v_k <> 7 THEN
    RAISE EXCEPTION 'hand count after refund expected 7 net closes, got %', v_k;
  END IF;

  v_json := public.reporting_compute_outcome(v_org, v_activated, now());
  IF (v_json #>> '{headline,k}')::bigint IS DISTINCT FROM 7 THEN
    RAISE EXCEPTION 'outcome after refund expected 7 of 40, got %', v_json -> 'headline';
  END IF;
  IF (v_json ->> 'attribution') ILIKE '%vistrial closed%' THEN
    RAISE EXCEPTION 'outcome credited Vistrial with a close';
  END IF;

  -- Unattributed CRM leads stay unattributed. Modeled conversions are stored
  -- so they are never shown as measured outcomes.
  INSERT INTO public.source_connections (org_id, kind, status, provider)
  VALUES (v_org, 'meta_ads', 'active', 'meta');

  INSERT INTO public.ad_spend_days (
    org_id, platform, spend_date, campaign_id, campaign_name, spend_cents,
    platform_leads, modeled_conversions
  ) VALUES (
    v_org, 'meta', (now() - interval '2 days')::date, 'camp_a', 'Campaign A', 50000,
    9, 99.9
  );

  SELECT count(*) INTO v_crm
  FROM public.leads
  WHERE org_id = v_org AND campaign = 'camp_a'
    AND opted_in_at >= v_activated AND opted_in_at < now();
  SELECT count(*) INTO v_unattr
  FROM public.leads
  WHERE org_id = v_org AND (campaign IS NULL OR campaign = '')
    AND opted_in_at >= v_activated AND opted_in_at < now();

  IF v_crm <> 5 OR v_unattr <> 35 THEN
    RAISE EXCEPTION 'ads hand count expected 5 attributed / 35 unattributed, got % / %', v_crm, v_unattr;
  END IF;

  v_json := public.portal_ads(v_org, v_activated, now());
  IF (v_json ->> 'connected')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'portal_ads should be connected';
  END IF;
  IF (v_json #>> '{campaigns,0,crm_leads}')::bigint IS DISTINCT FROM 5 THEN
    RAISE EXCEPTION 'campaign crm_leads expected 5, not distributed, got %', v_json -> 'campaigns';
  END IF;
  IF (v_json #>> '{unattributed,crm_leads}')::bigint IS DISTINCT FROM 35 THEN
    RAISE EXCEPTION 'unattributed crm_leads expected 35, got %', v_json -> 'unattributed';
  END IF;
  IF (v_json -> 'campaigns' -> 0) ? 'modeled_conversions' THEN
    RAISE EXCEPTION 'modeled conversions presented on a campaign row';
  END IF;
  IF (v_json ->> 'attribution_basis') IS NULL OR (v_json ->> 'attribution_basis') = '' THEN
    RAISE EXCEPTION 'cost-per-client attribution basis missing';
  END IF;

  -- Unconnected sections say what they would add.
  v_json := public.portal_processor(v_org, v_activated, now());
  IF (v_json ->> 'connected')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'processor should be unconnected';
  END IF;
  IF (v_json ->> 'unlocks') IS NULL THEN
    RAISE EXCEPTION 'unconnected processor hid what it would add';
  END IF;

  v_json := public.portal_forms(v_org, v_activated, now());
  IF (v_json ->> 'connected')::boolean IS DISTINCT FROM false
     OR (v_json ->> 'unlocks') IS NULL THEN
    RAISE EXCEPTION 'unconnected forms hid what they would add';
  END IF;

  v_json := public.portal_calendar(v_org, v_activated, now());
  IF (v_json ->> 'connected')::boolean IS DISTINCT FROM false
     OR (v_json ->> 'unlocks') IS NULL THEN
    RAISE EXCEPTION 'unconnected calendar hid what it would add';
  END IF;

  -- Setter cannot call portal RPCs.
  v_denied := false;
  PERFORM set_config('request.jwt.claim.sub', '222e2222-2222-4222-8222-0000000000a4', false);
  SET ROLE authenticated;
  BEGIN
    PERFORM public.portal_adoption(v_org, v_activated, now());
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
    RAISE EXCEPTION 'setter was allowed to call portal_adoption';
  END IF;

  v_denied := false;
  PERFORM set_config('request.jwt.claim.sub', '222e2222-2222-4222-8222-0000000000a4', false);
  SET ROLE authenticated;
  BEGIN
    PERFORM public.portal_ads(v_org, v_activated, now());
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
    RAISE EXCEPTION 'setter was allowed to call portal_ads';
  END IF;

  -- Portal-only is owner/admin. A setter cannot hold it.
  BEGIN
    UPDATE public.org_members
    SET surface_access = 'portal'
    WHERE id = '222e2222-2222-4222-8222-0000000000a5';
    RAISE EXCEPTION 'setter was allowed portal-only access';
  EXCEPTION
    WHEN check_violation THEN
      NULL;
  END;
END
$$;

RESET ROLE;

-- Unusable baseline: no comparison is shown.
INSERT INTO public.organizations (
  id, name, slug, timezone, activated_at, sales_cycle_days, holdout_percent
) VALUES (
  '222e2222-2222-4222-8222-0000000000b1',
  'Unusable Co',
  'unusable-co',
  'America/New_York',
  now() - interval '90 days',
  60,
  0
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.org_members (id, org_id, user_id, role, display_name, email)
VALUES (
  '222e2222-2222-4222-8222-0000000000b2',
  '222e2222-2222-4222-8222-0000000000b1',
  '222e2222-2222-4222-8222-0000000000a2',
  'owner',
  'Unusable Owner',
  'portal-owner@vistrial.local'
)
ON CONFLICT (org_id, user_id) DO NOTHING;

INSERT INTO public.baseline_runs (
  id, org_id, status, grade, lookback_days, window_start, window_end
) VALUES (
  '222e2222-2222-4222-8222-0000000000b3',
  '222e2222-2222-4222-8222-0000000000b1',
  'completed',
  'unusable',
  365,
  now() - interval '365 days',
  now() - interval '90 days'
);

DO $$
DECLARE
  v_org uuid := '222e2222-2222-4222-8222-0000000000b1';
  v_json jsonb;
  i integer;
BEGIN
  FOR i IN 1..40 LOOP
    INSERT INTO public.leads (
      id, org_id, first_name, email, status, opted_in_at, ghl_contact_id
    ) VALUES (
      ('222e2222-2222-4222-8333-' || lpad(i::text, 12, '0'))::uuid,
      v_org,
      'U',
      'unusable' || i || '@example.test',
      'working',
      now() - interval '89 days',
      'ghl_unusable_' || i
    );
  END LOOP;

  v_json := public.reporting_compute_outcome(v_org, now() - interval '90 days', now());
  IF COALESCE((v_json #>> '{comparison,shown}')::boolean, true) THEN
    RAISE EXCEPTION 'unusable baseline still showed a comparison: %', v_json -> 'comparison';
  END IF;
  IF (v_json #>> '{comparison,plain}') NOT ILIKE '%unusable%' THEN
    RAISE EXCEPTION 'unusable baseline did not say so plainly: %', v_json -> 'comparison';
  END IF;
END
$$;
