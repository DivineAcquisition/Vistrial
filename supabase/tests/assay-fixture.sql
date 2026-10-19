-- Fake workspaces for Assay: one per seeded template, with legacy readiness
-- scores, activity metadata, and enough closed outcomes to learn from
-- (at least 40 closed in 180 days, at least 10 won and 10 lost).
-- Local test databases only. Apply after the migrations that precede the
-- Assay migration, so the switch report has legacy numbers to compare.
--
-- Everything is fake and deterministic (setseed). No real names: leads are
-- "Test lead 1", "Test lead 2", and so on.

SELECT setseed(0.42);

DO $$
DECLARE
  w record;
  v_org uuid;
  v_template uuid;
  v_version integer;
  v_lead uuid;
  v_status public.lead_status;
  v_age interval;
  v_score integer;
  v_closed_at timestamptz;
  i integer;
  k integer;
BEGIN
  FOR w IN
    SELECT * FROM (VALUES
      ('a55a0001-0000-4000-8000-000000000001'::uuid, 'Fake Home Services', 'fake-home', 'home-services', 'America/Chicago', 'Large project (roofing, HVAC replacement, remodeling)'),
      ('a55a0001-0000-4000-8000-000000000002'::uuid, 'Fake Med Spa', 'fake-spa', 'med-spa', 'America/Los_Angeles', 'Body contouring'),
      ('a55a0001-0000-4000-8000-000000000003'::uuid, 'Fake Coaching', 'fake-coach', 'coaches-consultants', 'America/New_York', 'High-ticket program')
    ) AS t (id, name, slug, template_slug, tz, offer)
  LOOP
    INSERT INTO public.organizations (id, name, slug, timezone, holdout_percent)
    VALUES (w.id, w.name, w.slug, w.tz, 5)
    ON CONFLICT (id) DO NOTHING;
    v_org := w.id;

    SELECT t.id, l.version INTO v_template, v_version
    FROM public.config_templates t JOIN public.config_layers l ON l.template_id = t.id AND l.level = 'template'
    WHERE t.slug = w.template_slug;
    UPDATE public.workspace_config_pins SET template_id = v_template, template_version = v_version WHERE org_id = v_org;
    UPDATE public.organizations SET industry_template_id = v_template WHERE id = v_org;

    INSERT INTO public.score_configs (org_id) VALUES (v_org) ON CONFLICT (org_id) DO NOTHING;
    INSERT INTO public.score_field_maps (org_id, field_name, factor)
    VALUES (v_org, 'budget', 'investment_capacity'), (v_org, 'timeline', 'timeline')
    ON CONFLICT DO NOTHING;

    FOR i IN 1..360 LOOP
      v_age := make_interval(days => (random() * 170)::integer, hours => (random() * 23)::integer);
      v_status := CASE
        WHEN i <= 30 THEN 'closed_won'
        WHEN i <= 60 THEN 'closed_lost'
        WHEN i % 7 = 0 THEN 'call_booked'
        WHEN i % 11 = 0 THEN 'no_show'
        WHEN i % 5 = 0 THEN 'follow_up'
        WHEN i % 3 = 0 THEN 'working'
        ELSE 'new'
      END;
      INSERT INTO public.leads (
        org_id, first_name, last_name, email, phone, source, offer_name, application_answers, status, opted_in_at, created_at, is_test
      ) VALUES (
        v_org, 'Test', 'lead ' || i,
        CASE WHEN i % 9 = 0 THEN NULL ELSE 'lead' || i || '@example.test' END,
        CASE WHEN i % 4 = 0 THEN NULL ELSE '+1555' || lpad(i::text, 7, '0') END,
        (ARRAY['Website form', 'Google search', 'Facebook ads', 'Referral'])[1 + (i % 4)],
        CASE WHEN i % 3 = 0 THEN w.offer ELSE NULL END,
        CASE WHEN i % 2 = 0 THEN '{"budget":"5k","timeline":"30 days"}'::jsonb ELSE '{}'::jsonb END,
        'new', now() - v_age, now() - v_age, false
      ) RETURNING id INTO v_lead;

      -- A legacy readiness score, so the switch has something to compare.
      IF i % 6 <> 0 THEN
        v_score := (random() * 100)::integer;
        INSERT INTO public.readiness_scores (org_id, lead_id, timeline_raw, investment_capacity_raw, decision_authority_raw, pain_severity_raw, total, reasoning, triggered_by)
        VALUES (v_org, v_lead, v_score, v_score, v_score, v_score, v_score, 'Fixture score.', 'intake');
      END IF;

      -- The team reached out, and most leads answered at some point.
      FOR k IN 0..((random() * 3)::integer) LOOP
        INSERT INTO public.touches (org_id, lead_id, type, channel, direction, occurred_at)
        VALUES (v_org, v_lead, 'system', 'sms', 'outbound', now() - v_age + make_interval(hours => k * 30));
        IF random() < 0.6 THEN
          INSERT INTO public.touches (org_id, lead_id, type, channel, direction, occurred_at)
          VALUES (v_org, v_lead, 'system', 'sms', 'inbound', now() - v_age + make_interval(hours => k * 30, mins => (random() * 90)::integer));
        END IF;
      END LOOP;

      -- Bookings and their outcomes.
      IF v_status IN ('call_booked', 'no_show', 'closed_won', 'closed_lost') OR i % 8 = 0 THEN
        INSERT INTO public.calls (org_id, lead_id, type, scheduled_at, occurred_at, outcome, created_at)
        VALUES (
          v_org, v_lead, 'discovery',
          now() - v_age + interval '2 days',
          CASE WHEN v_status IN ('closed_won', 'closed_lost') OR i % 16 = 0 THEN now() - v_age + interval '2 days' END,
          CASE
            WHEN v_status = 'no_show' THEN 'no_show'::public.call_outcome
            WHEN v_status IN ('closed_won', 'closed_lost') OR i % 16 = 0 THEN 'held'::public.call_outcome
            ELSE NULL
          END,
          now() - v_age + interval '1 hour'
        );
      END IF;

      -- Move the lead to its status, the way the app does, so the history exists.
      IF v_status <> 'new' THEN
        PERFORM set_config('vistrial.allow_closed_won', '1', true);
        UPDATE public.leads SET status = 'working' WHERE id = v_lead AND v_status <> 'working';
        UPDATE public.leads SET status = v_status WHERE id = v_lead;
        PERFORM set_config('vistrial.allow_closed_won', '', true);
        -- Spread the recorded status changes back over the lead's life.
        v_closed_at := now() - v_age + make_interval(days => 3 + (random() * 10)::integer);
        UPDATE public.lead_status_changes SET created_at = LEAST(v_closed_at, now()) WHERE lead_id = v_lead AND to_status = v_status;
      END IF;
    END LOOP;
  END LOOP;
END;
$$;
