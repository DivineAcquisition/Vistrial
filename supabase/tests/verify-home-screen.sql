-- Home screen: approval gate defaults, owner-only changes with history,
-- approval queue isolation.

INSERT INTO auth.users (id, email)
VALUES
  ('a0a0a0a0-0001-4001-8001-0000000000a2', 'hs-owner@vistrial.local'),
  ('a0a0a0a0-0001-4001-8001-0000000000a4', 'hs-admin@vistrial.local'),
  ('a0a0a0a0-0001-4001-8001-0000000000a6', 'hs-setter@vistrial.local'),
  ('a0a0a0a0-0001-4001-8001-0000000000a8', 'hs-setter2@vistrial.local'),
  ('a0a0a0a0-0001-4001-8001-0000000000b2', 'hs-other-owner@vistrial.local')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.organizations (id, name, slug, timezone)
VALUES
  ('a0a0a0a0-0001-4001-8001-0000000000a1', 'Home Screen Co', 'home-screen-co', 'America/Chicago'),
  ('a0a0a0a0-0001-4001-8001-0000000000b1', 'Other Home Co', 'other-home-co', 'America/New_York');

INSERT INTO public.org_members (id, org_id, user_id, role, display_name, email)
VALUES
  ('a0a0a0a0-0001-4001-8001-0000000000a3', 'a0a0a0a0-0001-4001-8001-0000000000a1',
   'a0a0a0a0-0001-4001-8001-0000000000a2', 'owner', 'Olive Owner', 'hs-owner@vistrial.local'),
  ('a0a0a0a0-0001-4001-8001-0000000000a5', 'a0a0a0a0-0001-4001-8001-0000000000a1',
   'a0a0a0a0-0001-4001-8001-0000000000a4', 'admin', 'Adam Admin', 'hs-admin@vistrial.local'),
  ('a0a0a0a0-0001-4001-8001-0000000000a7', 'a0a0a0a0-0001-4001-8001-0000000000a1',
   'a0a0a0a0-0001-4001-8001-0000000000a6', 'setter', 'Sam Setter', 'hs-setter@vistrial.local'),
  ('a0a0a0a0-0001-4001-8001-0000000000a9', 'a0a0a0a0-0001-4001-8001-0000000000a1',
   'a0a0a0a0-0001-4001-8001-0000000000a8', 'setter', 'Sid Setter', 'hs-setter2@vistrial.local'),
  ('a0a0a0a0-0001-4001-8001-0000000000b3', 'a0a0a0a0-0001-4001-8001-0000000000b1',
   'a0a0a0a0-0001-4001-8001-0000000000b2', 'owner', 'Other Owner', 'hs-other-owner@vistrial.local');

INSERT INTO public.leads (id, org_id, first_name, email)
VALUES
  ('a0a0a0a0-0001-4001-8001-0000000000c1', 'a0a0a0a0-0001-4001-8001-0000000000a1', 'Quinn', 'quinn@example.com'),
  ('a0a0a0a0-0001-4001-8001-0000000000c2', 'a0a0a0a0-0001-4001-8001-0000000000a1', 'Riley', 'riley@example.com'),
  ('a0a0a0a0-0001-4001-8001-0000000000d1', 'a0a0a0a0-0001-4001-8001-0000000000b1', 'Other', 'other@example.com');

-- Service role writes the queue.
INSERT INTO public.approval_items (id, org_id, kind, action_type, title, lead_ids, assigned_member_id)
VALUES
  ('a0a0a0a0-0001-4001-8001-0000000000e1', 'a0a0a0a0-0001-4001-8001-0000000000a1',
   'quiet_lead_follow_up', 'quiet_lead_follow_up', 'Follow up with 1 lead quiet for 48h+',
   ARRAY['a0a0a0a0-0001-4001-8001-0000000000c1']::uuid[], 'a0a0a0a0-0001-4001-8001-0000000000a7'),
  ('a0a0a0a0-0001-4001-8001-0000000000e2', 'a0a0a0a0-0001-4001-8001-0000000000a1',
   'no_show_rebook', 'no_show_rebook', 'Rebook 1 no-show',
   ARRAY['a0a0a0a0-0001-4001-8001-0000000000c2']::uuid[], 'a0a0a0a0-0001-4001-8001-0000000000a9'),
  ('a0a0a0a0-0001-4001-8001-0000000000e3', 'a0a0a0a0-0001-4001-8001-0000000000b1',
   'no_show_rebook', 'no_show_rebook', 'Rebook 1 no-show',
   ARRAY['a0a0a0a0-0001-4001-8001-0000000000d1']::uuid[], NULL);

DO $$
DECLARE
  v_count integer;
  v_failed boolean;
BEGIN
  -- Registry and defaults.
  SELECT count(*) INTO v_count FROM public.approval_action_types;
  IF v_count < 7 THEN
    RAISE EXCEPTION 'expected seven seeded action types, got %', v_count;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.approval_action_types WHERE reaches_people AND default_mode <> 'ask_first'
  ) THEN
    RAISE EXCEPTION 'an action that reaches people does not default to ask first';
  END IF;
  IF public.approval_gate_mode('a0a0a0a0-0001-4001-8001-0000000000a1', 'quiet_lead_follow_up') <> 'ask_first' THEN
    RAISE EXCEPTION 'quiet lead follow-up should ask first by default';
  END IF;
  IF public.approval_gate_mode('a0a0a0a0-0001-4001-8001-0000000000a1', 'setter_nudge') <> 'auto_run' THEN
    RAISE EXCEPTION 'setter nudges should auto-run by default';
  END IF;
  IF public.approval_gate_mode('a0a0a0a0-0001-4001-8001-0000000000a1', 'retention_win_back') <> 'ask_first' THEN
    RAISE EXCEPTION 'an unregistered future action type must ask first';
  END IF;

  v_failed := false;
  BEGIN
    INSERT INTO public.approval_action_types (action_type, area, reaches_people, default_mode)
    VALUES ('sneaky_auto_message', 'sales', true, 'auto_run');
  EXCEPTION WHEN check_violation THEN
    v_failed := true;
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'registry accepted a people-reaching action that auto-runs by default';
  END IF;

  -- Cross-workspace lead in an item.
  v_failed := false;
  BEGIN
    INSERT INTO public.approval_items (org_id, kind, action_type, title, lead_ids)
    VALUES ('a0a0a0a0-0001-4001-8001-0000000000a1', 'no_show_rebook', 'no_show_rebook', 'x',
            ARRAY['a0a0a0a0-0001-4001-8001-0000000000d1']::uuid[]);
  EXCEPTION WHEN raise_exception THEN
    v_failed := true;
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'approval item accepted a lead from another workspace';
  END IF;

  -- Approved with no named person.
  v_failed := false;
  BEGIN
    UPDATE public.approval_items SET status = 'succeeded', run_mode = 'approved'
    WHERE id = 'a0a0a0a0-0001-4001-8001-0000000000e1';
  EXCEPTION WHEN check_violation THEN
    v_failed := true;
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'approval item recorded an approval with no approver';
  END IF;
END $$;

-- Setter: cannot change settings, sees only their own item.
DO $$
DECLARE
  v_count integer;
  v_failed boolean := false;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', 'a0a0a0a0-0001-4001-8001-0000000000a6', false);
  SET ROLE authenticated;

  BEGIN
    PERFORM public.set_approval_gate_action(
      'a0a0a0a0-0001-4001-8001-0000000000a1', 'setter_nudge', 'off', 'owners_and_managers');
  EXCEPTION WHEN insufficient_privilege THEN
    v_failed := true;
  END;
  IF NOT v_failed THEN
    RESET ROLE;
    RAISE EXCEPTION 'a setter changed an approval setting';
  END IF;

  SELECT count(*) INTO v_count FROM public.approval_items;
  IF v_count <> 1 THEN
    RESET ROLE;
    RAISE EXCEPTION 'setter should see exactly their one item, saw %', v_count;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.approval_items WHERE id = 'a0a0a0a0-0001-4001-8001-0000000000e1') THEN
    RESET ROLE;
    RAISE EXCEPTION 'setter could not see the item assigned to them';
  END IF;

  SELECT count(*) INTO v_count FROM public.approval_gate_changes;
  IF v_count <> 0 THEN
    RESET ROLE;
    RAISE EXCEPTION 'setter can read approval history';
  END IF;

  v_failed := false;
  BEGIN
    INSERT INTO public.approval_items (org_id, kind, action_type, title)
    VALUES ('a0a0a0a0-0001-4001-8001-0000000000a1', 'no_show_rebook', 'no_show_rebook', 'forged');
  EXCEPTION WHEN insufficient_privilege THEN
    v_failed := true;
  END;
  IF NOT v_failed THEN
    RESET ROLE;
    RAISE EXCEPTION 'an authenticated user wrote to the approval queue directly';
  END IF;

  RESET ROLE;
END $$;

-- Admin: sees the workspace queue, cannot change settings, can finish onboarding.
DO $$
DECLARE
  v_count integer;
  v_failed boolean := false;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', 'a0a0a0a0-0001-4001-8001-0000000000a4', false);
  SET ROLE authenticated;

  SELECT count(*) INTO v_count FROM public.approval_items;
  IF v_count <> 2 THEN
    RESET ROLE;
    RAISE EXCEPTION 'admin should see both items in their workspace and none elsewhere, saw %', v_count;
  END IF;

  BEGIN
    PERFORM public.set_approval_gate_action(
      'a0a0a0a0-0001-4001-8001-0000000000a1', 'quiet_lead_follow_up', 'auto_run', 'owners_and_managers');
  EXCEPTION WHEN insufficient_privilege THEN
    v_failed := true;
  END;
  IF NOT v_failed THEN
    RESET ROLE;
    RAISE EXCEPTION 'an admin let a lead message auto-run';
  END IF;

  PERFORM public.mark_approval_gate_reviewed('a0a0a0a0-0001-4001-8001-0000000000a1', true);
  PERFORM public.mark_approval_gate_reviewed('a0a0a0a0-0001-4001-8001-0000000000a1', false);
  RESET ROLE;

  IF NOT EXISTS (
    SELECT 1 FROM public.approval_gate_settings
    WHERE org_id = 'a0a0a0a0-0001-4001-8001-0000000000a1' AND reviewed_at IS NOT NULL
      AND quiet_hours_start = '20:00' AND quiet_hours_end = '08:00'
      AND daily_send_limit_per_lead = 2 AND queue_wait_limit_minutes = 240
  ) THEN
    RAISE EXCEPTION 'skipping onboarding did not keep the defaults';
  END IF;
  SELECT count(*) INTO v_count FROM public.approval_gate_changes
  WHERE org_id = 'a0a0a0a0-0001-4001-8001-0000000000a1' AND field = 'reviewed';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'reviewing twice should leave one history row, got %', v_count;
  END IF;
END $$;

-- Owner: changes settings, every change recorded with who.
DO $$
DECLARE
  v_count integer;
  v_failed boolean := false;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', 'a0a0a0a0-0001-4001-8001-0000000000a2', false);
  SET ROLE authenticated;

  PERFORM public.set_approval_gate_action(
    'a0a0a0a0-0001-4001-8001-0000000000a1', 'quiet_lead_follow_up', 'auto_run', 'owner_only');
  -- Unchanged save writes nothing.
  PERFORM public.set_approval_gate_action(
    'a0a0a0a0-0001-4001-8001-0000000000a1', 'quiet_lead_follow_up', 'auto_run', 'owner_only');
  PERFORM public.set_approval_gate_limits(
    'a0a0a0a0-0001-4001-8001-0000000000a1', '21:00', '08:00', 2, 120);

  BEGIN
    PERFORM public.set_approval_gate_action(
      'a0a0a0a0-0001-4001-8001-0000000000b1', 'no_show_rebook', 'off', 'owner_only');
  EXCEPTION WHEN insufficient_privilege THEN
    v_failed := true;
  END;
  IF NOT v_failed THEN
    RESET ROLE;
    RAISE EXCEPTION 'an owner changed another workspace''s settings';
  END IF;

  v_failed := false;
  BEGIN
    PERFORM public.set_approval_gate_action(
      'a0a0a0a0-0001-4001-8001-0000000000a1', 'not_a_real_action', 'auto_run', 'owner_only');
  EXCEPTION WHEN invalid_parameter_value THEN
    v_failed := true;
  END;
  IF NOT v_failed THEN
    RESET ROLE;
    RAISE EXCEPTION 'an unregistered action type was configured';
  END IF;

  SELECT count(*) INTO v_count FROM public.approval_gate_changes
  WHERE org_id = 'a0a0a0a0-0001-4001-8001-0000000000a1';
  -- reviewed + mode + approver + quiet start + wait limit
  IF v_count <> 5 THEN
    RESET ROLE;
    RAISE EXCEPTION 'expected five history rows, got %', v_count;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.approval_gate_changes
    WHERE field = 'mode' AND action_type = 'quiet_lead_follow_up'
      AND from_value = 'ask_first' AND to_value = 'auto_run'
      AND actor_label = 'Olive Owner'
      AND actor_member_id = 'a0a0a0a0-0001-4001-8001-0000000000a3'
  ) THEN
    RESET ROLE;
    RAISE EXCEPTION 'mode change was not recorded with who made it';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.approval_gate_changes
    WHERE field = 'quiet_hours_start' AND from_value = '20:00' AND to_value = '21:00'
  ) THEN
    RESET ROLE;
    RAISE EXCEPTION 'quiet hours change was not recorded';
  END IF;

  RESET ROLE;

  IF public.approval_gate_mode('a0a0a0a0-0001-4001-8001-0000000000a1', 'quiet_lead_follow_up') <> 'auto_run' THEN
    RAISE EXCEPTION 'the owner''s change did not take effect';
  END IF;
  IF public.approval_gate_mode('a0a0a0a0-0001-4001-8001-0000000000b1', 'quiet_lead_follow_up') <> 'ask_first' THEN
    RAISE EXCEPTION 'one workspace''s change leaked into another';
  END IF;
END $$;

-- Other workspace's owner sees nothing from the first workspace.
DO $$
DECLARE
  v_count integer;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', 'a0a0a0a0-0001-4001-8001-0000000000b2', false);
  SET ROLE authenticated;
  SELECT count(*) INTO v_count FROM public.approval_items
  WHERE org_id = 'a0a0a0a0-0001-4001-8001-0000000000a1';
  IF v_count <> 0 THEN
    RESET ROLE;
    RAISE EXCEPTION 'another workspace''s owner saw this workspace''s queue';
  END IF;
  SELECT count(*) INTO v_count FROM public.approval_gate_changes
  WHERE org_id = 'a0a0a0a0-0001-4001-8001-0000000000a1';
  IF v_count <> 0 THEN
    RESET ROLE;
    RAISE EXCEPTION 'another workspace''s owner saw this workspace''s history';
  END IF;
  SELECT count(*) INTO v_count FROM public.approval_gate_actions
  WHERE org_id = 'a0a0a0a0-0001-4001-8001-0000000000a1';
  IF v_count <> 0 THEN
    RESET ROLE;
    RAISE EXCEPTION 'another workspace''s owner saw this workspace''s modes';
  END IF;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', false);
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.ops_job_catalog WHERE job_name = 'home-agents') THEN
    RAISE EXCEPTION 'home-agents job missing from ops_job_catalog';
  END IF;
END $$;
