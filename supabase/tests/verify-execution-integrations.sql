-- Execution integrations: tokens stay server-side, workspaces stay apart,
-- a write cannot be recorded as sent without an authorisation.

INSERT INTO auth.users (id, email)
VALUES
  ('b1b1b1b1-0002-4002-8002-0000000000a2', 'ei-owner@vistrial.local'),
  ('b1b1b1b1-0002-4002-8002-0000000000a4', 'ei-setter@vistrial.local'),
  ('b1b1b1b1-0002-4002-8002-0000000000b2', 'ei-other@vistrial.local')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.organizations (id, name, slug, timezone)
VALUES
  ('b1b1b1b1-0002-4002-8002-0000000000a1', 'Exec Integrations Co', 'exec-integrations-co', 'UTC'),
  ('b1b1b1b1-0002-4002-8002-0000000000b1', 'Exec Other Co', 'exec-other-co', 'UTC');

INSERT INTO public.org_members (id, org_id, user_id, role, display_name, email)
VALUES
  ('b1b1b1b1-0002-4002-8002-0000000000a3', 'b1b1b1b1-0002-4002-8002-0000000000a1',
   'b1b1b1b1-0002-4002-8002-0000000000a2', 'owner', 'EI Owner', 'ei-owner@vistrial.local'),
  ('b1b1b1b1-0002-4002-8002-0000000000a5', 'b1b1b1b1-0002-4002-8002-0000000000a1',
   'b1b1b1b1-0002-4002-8002-0000000000a4', 'setter', 'EI Setter', 'ei-setter@vistrial.local'),
  ('b1b1b1b1-0002-4002-8002-0000000000b3', 'b1b1b1b1-0002-4002-8002-0000000000b1',
   'b1b1b1b1-0002-4002-8002-0000000000b2', 'owner', 'EI Other', 'ei-other@vistrial.local');

INSERT INTO public.execution_connections
  (org_id, kind, status, account_label, external_account_id, secret_encrypted, destination_id, destination_label)
VALUES
  ('b1b1b1b1-0002-4002-8002-0000000000a1', 'slack', 'active', 'Team A', 'T0001', 'v1.ciphertext-a', 'C0001', 'sales'),
  ('b1b1b1b1-0002-4002-8002-0000000000b1', 'slack', 'active', 'Team B', 'T0002', 'v1.ciphertext-b', 'C0002', 'general');

DO $$
DECLARE
  v_failed boolean;
BEGIN
  IF (SELECT count(*) FROM public.approval_action_types
      WHERE action_type IN ('slack_post','discord_post','drive_store')
        AND default_mode = 'ask_first' AND NOT reaches_people) <> 3 THEN
    RAISE EXCEPTION 'execution action types missing, or not ask first';
  END IF;

  -- Only a slack, discord, or google_drive connection can exist.
  v_failed := false;
  BEGIN
    INSERT INTO public.execution_connections (org_id, kind, status)
    VALUES ('b1b1b1b1-0002-4002-8002-0000000000a1', 'webhook_url', 'inactive');
  EXCEPTION WHEN check_violation THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'an unknown destination kind was accepted'; END IF;

  -- An inactive connection cannot keep a token.
  v_failed := false;
  BEGIN
    UPDATE public.execution_connections SET status = 'inactive'
    WHERE org_id = 'b1b1b1b1-0002-4002-8002-0000000000a1' AND kind = 'slack';
  EXCEPTION WHEN check_violation THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'a disconnected connection kept its token'; END IF;

  -- Sent with no authorisation at all.
  v_failed := false;
  BEGIN
    INSERT INTO public.execution_writes
      (org_id, kind, operation, action_type, status, content, authorization_kind)
    VALUES ('b1b1b1b1-0002-4002-8002-0000000000a1', 'slack', 'slack.post_message', 'slack_post',
            'sent', 'hello', 'approval_item');
  EXCEPTION WHEN check_violation THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'a write was recorded as sent with no approval'; END IF;

  -- An unknown operation, i.e. no generic "post anywhere" row.
  v_failed := false;
  BEGIN
    INSERT INTO public.execution_writes
      (org_id, kind, operation, action_type, status, content, authorization_kind, authorized_by_member_id)
    VALUES ('b1b1b1b1-0002-4002-8002-0000000000a1', 'slack', 'http.post', 'slack_post',
            'sent', 'x', 'owner_test', 'b1b1b1b1-0002-4002-8002-0000000000a3');
  EXCEPTION WHEN check_violation THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'a generic write operation was accepted'; END IF;

  INSERT INTO public.execution_writes
    (org_id, kind, operation, action_type, status, destination_id, destination_label, content,
     external_ref, authorization_kind, authorized_by_member_id)
  VALUES ('b1b1b1b1-0002-4002-8002-0000000000a1', 'slack', 'slack.post_message', 'slack_post',
          'sent', 'C0001', '#sales', 'Test post', '1700000000.000100', 'owner_test',
          'b1b1b1b1-0002-4002-8002-0000000000a3'),
         ('b1b1b1b1-0002-4002-8002-0000000000b1', 'slack', 'slack.post_message', 'slack_post',
          'blocked', 'C0002', '#general', 'Other post', NULL, 'auto_run', NULL);
END $$;

-- Owner: reads the row and the log, but never the token.
DO $$
DECLARE
  v_count integer;
  v_failed boolean := false;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', 'b1b1b1b1-0002-4002-8002-0000000000a2', false);
  SET ROLE authenticated;

  SELECT count(*) INTO v_count FROM public.execution_connections;
  IF v_count <> 1 THEN RESET ROLE; RAISE EXCEPTION 'owner should see exactly their connection, saw %', v_count; END IF;
  SELECT count(*) INTO v_count FROM public.execution_writes;
  IF v_count <> 1 THEN RESET ROLE; RAISE EXCEPTION 'owner should see exactly their write, saw %', v_count; END IF;

  BEGIN
    PERFORM secret_encrypted FROM public.execution_connections;
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true; END;
  IF NOT v_failed THEN RESET ROLE; RAISE EXCEPTION 'an owner could read the token column'; END IF;

  v_failed := false;
  BEGIN
    PERFORM refresh_encrypted FROM public.execution_connections;
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true; END;
  IF NOT v_failed THEN RESET ROLE; RAISE EXCEPTION 'an owner could read the refresh token column'; END IF;

  v_failed := false;
  BEGIN
    PERFORM * FROM public.execution_connections;
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true; END;
  IF NOT v_failed THEN RESET ROLE; RAISE EXCEPTION 'select * returned the token columns'; END IF;

  v_failed := false;
  BEGIN
    UPDATE public.execution_connections SET destination_id = 'C9999';
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true; END;
  IF NOT v_failed THEN RESET ROLE; RAISE EXCEPTION 'an owner wrote a connection directly, skipping server checks'; END IF;

  v_failed := false;
  BEGIN
    DELETE FROM public.execution_writes;
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true; END;
  IF NOT v_failed THEN RESET ROLE; RAISE EXCEPTION 'an owner deleted write history'; END IF;

  RESET ROLE;
END $$;

-- Setter: sees nothing.
DO $$
DECLARE v_count integer;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', 'b1b1b1b1-0002-4002-8002-0000000000a4', false);
  SET ROLE authenticated;
  SELECT count(*) INTO v_count FROM public.execution_connections;
  IF v_count <> 0 THEN RESET ROLE; RAISE EXCEPTION 'a setter saw a connection'; END IF;
  SELECT count(*) INTO v_count FROM public.execution_writes;
  IF v_count <> 0 THEN RESET ROLE; RAISE EXCEPTION 'a setter saw the write log'; END IF;
  RESET ROLE;
END $$;

-- Another workspace's owner sees only their own.
DO $$
DECLARE v_count integer;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', 'b1b1b1b1-0002-4002-8002-0000000000b2', false);
  SET ROLE authenticated;
  SELECT count(*) INTO v_count FROM public.execution_connections
  WHERE org_id = 'b1b1b1b1-0002-4002-8002-0000000000a1';
  IF v_count <> 0 THEN RESET ROLE; RAISE EXCEPTION 'another workspace saw this workspace''s connection'; END IF;
  SELECT count(*) INTO v_count FROM public.execution_writes
  WHERE org_id = 'b1b1b1b1-0002-4002-8002-0000000000a1';
  IF v_count <> 0 THEN RESET ROLE; RAISE EXCEPTION 'another workspace saw this workspace''s write log'; END IF;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', false);
END $$;
