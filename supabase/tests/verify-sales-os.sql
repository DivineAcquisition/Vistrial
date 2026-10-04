-- Sales OS agent: conversations, assets, gated executions, and isolation.

INSERT INTO auth.users (id, email)
VALUES
  ('5a1e5051-0000-4000-8000-0000000000a2', 'sos-owner@vistrial.local'),
  ('5a1e5051-0000-4000-8000-0000000000a4', 'sos-setter@vistrial.local'),
  ('5a1e5051-0000-4000-8000-0000000000b2', 'sos-other-owner@vistrial.local')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.organizations (id, name, slug, timezone, activated_at)
VALUES
  ('5a1e5051-0000-4000-8000-0000000000a1', 'Sales OS Co', 'sales-os-co', 'America/Chicago', now() - interval '30 days'),
  ('5a1e5051-0000-4000-8000-0000000000b1', 'Other Co', 'sales-os-other-co', 'America/Chicago', now() - interval '30 days');

INSERT INTO public.org_members (id, org_id, user_id, role, display_name, email)
VALUES
  ('5a1e5051-0000-4000-8000-0000000000a3', '5a1e5051-0000-4000-8000-0000000000a1',
   '5a1e5051-0000-4000-8000-0000000000a2', 'owner', 'SOS Owner', 'sos-owner@vistrial.local'),
  ('5a1e5051-0000-4000-8000-0000000000a5', '5a1e5051-0000-4000-8000-0000000000a1',
   '5a1e5051-0000-4000-8000-0000000000a4', 'setter', 'SOS Setter', 'sos-setter@vistrial.local'),
  ('5a1e5051-0000-4000-8000-0000000000b3', '5a1e5051-0000-4000-8000-0000000000b1',
   '5a1e5051-0000-4000-8000-0000000000b2', 'owner', 'Other Owner', 'sos-other-owner@vistrial.local');

-- A service-role or unauthenticated path cannot request an execution.
DO $$
BEGIN
  INSERT INTO public.sales_os_conversations (id, org_id, member_id, user_id)
  VALUES ('5a1e5051-0000-4000-8000-0000000000c9', '5a1e5051-0000-4000-8000-0000000000a1',
          '5a1e5051-0000-4000-8000-0000000000a3', '5a1e5051-0000-4000-8000-0000000000a2');
  INSERT INTO public.sales_os_destinations (id, org_id, kind, label, secret_ciphertext, created_by_member_id)
  VALUES ('5a1e5051-0000-4000-8000-0000000000d9', '5a1e5051-0000-4000-8000-0000000000a1', 'slack_channel',
          '#seeded', 'v1.a.b.c', '5a1e5051-0000-4000-8000-0000000000a3');
  BEGIN
    INSERT INTO public.sales_os_executions (
      org_id, conversation_id, tool_call_id, execution_type, destination_id, plan,
      plain_summary, preview, input_hash, gate_mode, status,
      requested_by_member_id, requested_by_user_id
    ) VALUES (
      '5a1e5051-0000-4000-8000-0000000000a1', '5a1e5051-0000-4000-8000-0000000000c9', 'svc-1',
      'post_slack_update', '5a1e5051-0000-4000-8000-0000000000d9', '{}'::jsonb,
      'Post a summary', 'Summary', 'h', 'always_ask', 'awaiting_approval',
      '5a1e5051-0000-4000-8000-0000000000a3', '5a1e5051-0000-4000-8000-0000000000a2'
    );
    RAISE EXCEPTION 'execution inserted without a signed-in member';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
END
$$;

-- ---------------------------------------------------------------------------
-- Setter: limited role.
-- ---------------------------------------------------------------------------

SELECT set_config('request.jwt.claim.role', 'authenticated', false);
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '5a1e5051-0000-4000-8000-0000000000a4', false);

INSERT INTO public.sales_os_conversations (id, org_id, member_id, user_id, title)
VALUES ('5a1e5051-0000-4000-8000-0000000000c1', '5a1e5051-0000-4000-8000-0000000000a1',
        '5a1e5051-0000-4000-8000-0000000000a5', '5a1e5051-0000-4000-8000-0000000000a4', 'Setter chat');

INSERT INTO public.sales_os_messages (id, conversation_id, org_id, seq, role, parts, acted_as_member_id)
VALUES ('m1', '5a1e5051-0000-4000-8000-0000000000c1', '5a1e5051-0000-4000-8000-0000000000a1', 1, 'user',
        '[{"type":"text","text":"what is up"}]'::jsonb, '5a1e5051-0000-4000-8000-0000000000a5');

DO $$
DECLARE
  v_count integer;
  v_secret text;
BEGIN
  BEGIN
    INSERT INTO public.sales_os_conversations (org_id, member_id, user_id)
    VALUES ('5a1e5051-0000-4000-8000-0000000000a1', '5a1e5051-0000-4000-8000-0000000000a3',
            '5a1e5051-0000-4000-8000-0000000000a2');
    RAISE EXCEPTION 'setter started a conversation as the owner';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    INSERT INTO public.sales_os_gates (org_id, execution_type, mode, updated_by_member_id)
    VALUES ('5a1e5051-0000-4000-8000-0000000000a1', 'post_slack_update', 'automatic',
            '5a1e5051-0000-4000-8000-0000000000a5');
    RAISE EXCEPTION 'setter changed a gate';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    PERFORM public.sales_os_save_asset_version(
      '5a1e5051-0000-4000-8000-0000000000a1', NULL, 'sales_script', 'Script', 'Body', 'Basis', 5,
      now() - interval '30 days', now(), '[]'::jsonb, 'agent', NULL
    );
    RAISE EXCEPTION 'setter created an asset';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  SELECT public.sales_os_destination_credential('5a1e5051-0000-4000-8000-0000000000d9') INTO v_secret;
  IF v_secret IS NOT NULL THEN
    RAISE EXCEPTION 'setter read a destination credential';
  END IF;

  BEGIN
    INSERT INTO public.sales_os_executions (
      org_id, conversation_id, tool_call_id, execution_type, destination_id, plan,
      plain_summary, preview, input_hash, gate_mode, status,
      requested_by_member_id, requested_by_user_id
    ) VALUES (
      '5a1e5051-0000-4000-8000-0000000000a1', '5a1e5051-0000-4000-8000-0000000000c1', 'setter-1',
      'post_slack_update', '5a1e5051-0000-4000-8000-0000000000d9', '{}'::jsonb,
      'Post a summary', 'Summary', 'h', 'always_ask', 'awaiting_approval',
      '5a1e5051-0000-4000-8000-0000000000a5', '5a1e5051-0000-4000-8000-0000000000a4'
    );
    RAISE EXCEPTION 'setter requested an execution';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  SELECT count(*) INTO v_count FROM public.sales_os_conversations
  WHERE id = '5a1e5051-0000-4000-8000-0000000000c9';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'setter can read the owner''s conversation';
  END IF;

  BEGIN
    INSERT INTO public.sales_os_tool_calls (
      org_id, conversation_id, tool_call_id, tool_name, tier, label,
      acted_as_member_id, acted_as_user_id, acted_as_display_name, acted_as_role
    ) VALUES (
      '5a1e5051-0000-4000-8000-0000000000a1', '5a1e5051-0000-4000-8000-0000000000c1', 't-generic',
      'http_request', 'execution', 'Calling an endpoint',
      '5a1e5051-0000-4000-8000-0000000000a5', '5a1e5051-0000-4000-8000-0000000000a4', 'SOS Setter', 'setter'
    );
    RAISE EXCEPTION 'a generic tool was recorded';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.sales_os_tool_calls (
      org_id, conversation_id, tool_call_id, tool_name, tier, label,
      acted_as_member_id, acted_as_user_id, acted_as_display_name, acted_as_role
    ) VALUES (
      '5a1e5051-0000-4000-8000-0000000000a1', '5a1e5051-0000-4000-8000-0000000000c1', 't-label',
      'analyze_funnel', 'analysis', 'analyze_funnel',
      '5a1e5051-0000-4000-8000-0000000000a5', '5a1e5051-0000-4000-8000-0000000000a4', 'SOS Setter', 'setter'
    );
    RAISE EXCEPTION 'a function name was stored as a label';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;
END
$$;

INSERT INTO public.sales_os_tool_calls (
  org_id, conversation_id, tool_call_id, tool_name, tier, label,
  acted_as_member_id, acted_as_user_id, acted_as_display_name, acted_as_role
) VALUES (
  '5a1e5051-0000-4000-8000-0000000000a1', '5a1e5051-0000-4000-8000-0000000000c1', 't-1',
  'analyze_funnel', 'analysis', 'Reading where leads stop moving',
  '5a1e5051-0000-4000-8000-0000000000a5', '5a1e5051-0000-4000-8000-0000000000a4', 'SOS Setter', 'setter'
);

RESET ROLE;

-- ---------------------------------------------------------------------------
-- Owner.
-- ---------------------------------------------------------------------------

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '5a1e5051-0000-4000-8000-0000000000a2', false);

INSERT INTO public.sales_os_conversations (id, org_id, member_id, user_id, title)
VALUES ('5a1e5051-0000-4000-8000-0000000000c2', '5a1e5051-0000-4000-8000-0000000000a1',
        '5a1e5051-0000-4000-8000-0000000000a3', '5a1e5051-0000-4000-8000-0000000000a2', 'Owner chat');

INSERT INTO public.sales_os_destinations (id, org_id, kind, label, secret_ciphertext, created_by_member_id)
VALUES
  ('5a1e5051-0000-4000-8000-0000000000d1', '5a1e5051-0000-4000-8000-0000000000a1', 'slack_channel',
   '#sales-wins', 'v1.iv.tag.cipher', '5a1e5051-0000-4000-8000-0000000000a3'),
  ('5a1e5051-0000-4000-8000-0000000000d2', '5a1e5051-0000-4000-8000-0000000000a1', 'discord_channel',
   '#team', 'v1.iv.tag.cipher2', '5a1e5051-0000-4000-8000-0000000000a3');

DO $$
DECLARE
  v_count integer;
  v_secret text;
  v_v1 public.sales_os_assets;
  v_v2 public.sales_os_assets;
BEGIN
  SELECT count(*) INTO v_count FROM public.sales_os_conversations
  WHERE id = '5a1e5051-0000-4000-8000-0000000000c1';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'owner cannot review the setter''s conversation';
  END IF;

  SELECT count(*) INTO v_count FROM public.sales_os_tool_calls
  WHERE conversation_id = '5a1e5051-0000-4000-8000-0000000000c1' AND acted_as_display_name = 'SOS Setter';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'owner cannot see who the setter''s tool call ran as';
  END IF;

  BEGIN
    SELECT secret_ciphertext INTO v_secret FROM public.sales_os_destinations
    WHERE id = '5a1e5051-0000-4000-8000-0000000000d1';
    RAISE EXCEPTION 'destination ciphertext is selectable';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  SELECT public.sales_os_destination_credential('5a1e5051-0000-4000-8000-0000000000d1') INTO v_secret;
  IF v_secret IS DISTINCT FROM 'v1.iv.tag.cipher' THEN
    RAISE EXCEPTION 'owner could not read the destination credential';
  END IF;

  -- No gate row: ask every time. Prior configuration is refused.
  BEGIN
    INSERT INTO public.sales_os_executions (
      org_id, conversation_id, tool_call_id, execution_type, destination_id, plan,
      plain_summary, preview, input_hash, gate_mode, status, gate_satisfied_by,
      requested_by_member_id, requested_by_user_id
    ) VALUES (
      '5a1e5051-0000-4000-8000-0000000000a1', '5a1e5051-0000-4000-8000-0000000000c2', 'x-auto',
      'post_slack_update', '5a1e5051-0000-4000-8000-0000000000d1', '{}'::jsonb,
      'Post a summary to #sales-wins', 'Summary', 'h', 'always_ask', 'approved', 'prior_configuration',
      '5a1e5051-0000-4000-8000-0000000000a3', '5a1e5051-0000-4000-8000-0000000000a2'
    );
    RAISE EXCEPTION 'always-ask execution ran on prior configuration';
  EXCEPTION
    WHEN insufficient_privilege OR check_violation THEN NULL;
  END;

  -- Lying about the gate mode is refused.
  BEGIN
    INSERT INTO public.sales_os_executions (
      org_id, conversation_id, tool_call_id, execution_type, destination_id, plan,
      plain_summary, preview, input_hash, gate_mode, status, gate_satisfied_by,
      requested_by_member_id, requested_by_user_id
    ) VALUES (
      '5a1e5051-0000-4000-8000-0000000000a1', '5a1e5051-0000-4000-8000-0000000000c2', 'x-lie',
      'post_slack_update', '5a1e5051-0000-4000-8000-0000000000d1', '{}'::jsonb,
      'Post a summary to #sales-wins', 'Summary', 'h', 'automatic', 'approved', 'prior_configuration',
      '5a1e5051-0000-4000-8000-0000000000a3', '5a1e5051-0000-4000-8000-0000000000a2'
    );
    RAISE EXCEPTION 'execution claimed a gate mode the workspace does not have';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  -- A pending execution cannot arrive approved.
  BEGIN
    INSERT INTO public.sales_os_executions (
      org_id, conversation_id, tool_call_id, execution_type, destination_id, plan,
      plain_summary, preview, input_hash, gate_mode, status, gate_satisfied_by,
      approved_by_member_id, approved_at, requested_by_member_id, requested_by_user_id
    ) VALUES (
      '5a1e5051-0000-4000-8000-0000000000a1', '5a1e5051-0000-4000-8000-0000000000c2', 'x-pre',
      'post_slack_update', '5a1e5051-0000-4000-8000-0000000000d1', '{}'::jsonb,
      'Post a summary to #sales-wins', 'Summary', 'h', 'always_ask', 'approved', 'in_conversation_approval',
      '5a1e5051-0000-4000-8000-0000000000a3', now(),
      '5a1e5051-0000-4000-8000-0000000000a3', '5a1e5051-0000-4000-8000-0000000000a2'
    );
    RAISE EXCEPTION 'execution was inserted already approved';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  -- A payload is never the preview.
  BEGIN
    INSERT INTO public.sales_os_executions (
      org_id, conversation_id, tool_call_id, execution_type, destination_id, plan,
      plain_summary, preview, input_hash, gate_mode, status,
      requested_by_member_id, requested_by_user_id
    ) VALUES (
      '5a1e5051-0000-4000-8000-0000000000a1', '5a1e5051-0000-4000-8000-0000000000c2', 'x-json',
      'post_slack_update', '5a1e5051-0000-4000-8000-0000000000d1', '{}'::jsonb,
      '{"channel":"x"}', 'Summary', 'h', 'always_ask', 'awaiting_approval',
      '5a1e5051-0000-4000-8000-0000000000a3', '5a1e5051-0000-4000-8000-0000000000a2'
    );
    RAISE EXCEPTION 'a payload was stored as the plain summary';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;

  -- Asset versions.
  v_v1 := public.sales_os_save_asset_version(
    '5a1e5051-0000-4000-8000-0000000000a1', NULL, 'sales_script', 'Discovery script', 'Open with their words.',
    'Built from 6 closed calls', 6, now() - interval '30 days', now(), '[]'::jsonb, 'agent',
    '5a1e5051-0000-4000-8000-0000000000c2'
  );
  IF v_v1.version <> 1 OR v_v1.status <> 'current' THEN
    RAISE EXCEPTION 'first asset version is not current v1';
  END IF;

  BEGIN
    UPDATE public.sales_os_assets SET body = 'Changed in place' WHERE id = v_v1.id;
    RAISE EXCEPTION 'an asset version was edited in place';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  v_v2 := public.sales_os_save_asset_version(
    '5a1e5051-0000-4000-8000-0000000000a1', v_v1.family_id, 'ad_angles', 'Discovery script', 'Open with their exact words.',
    'Built from 6 closed calls, edited by SOS Owner', 6, now() - interval '30 days', now(), '[]'::jsonb, 'edit',
    '5a1e5051-0000-4000-8000-0000000000c2'
  );
  IF v_v2.version <> 2 OR v_v2.asset_type <> 'sales_script' THEN
    RAISE EXCEPTION 'second version did not keep the family type';
  END IF;
  SELECT count(*) INTO v_count FROM public.sales_os_assets
  WHERE family_id = v_v1.family_id AND status = 'current';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'more than one current version';
  END IF;
  IF (SELECT status FROM public.sales_os_assets WHERE id = v_v1.id) <> 'superseded' THEN
    RAISE EXCEPTION 'old version still reads as current';
  END IF;

  BEGIN
    UPDATE public.sales_os_assets SET status = 'current', superseded_at = NULL WHERE id = v_v1.id;
    RAISE EXCEPTION 'a superseded version became current again';
  EXCEPTION
    WHEN insufficient_privilege OR unique_violation THEN NULL;
  END;
END
$$;

-- Ask every time: request, approve, run, succeed. Then nothing reopens.
INSERT INTO public.sales_os_executions (
  id, org_id, conversation_id, tool_call_id, execution_type, destination_id, plan,
  plain_summary, preview, input_hash, gate_mode, status,
  requested_by_member_id, requested_by_user_id
) VALUES (
  '5a1e5051-0000-4000-8000-0000000000e1',
  '5a1e5051-0000-4000-8000-0000000000a1', '5a1e5051-0000-4000-8000-0000000000c2', 'x-1',
  'post_slack_update', '5a1e5051-0000-4000-8000-0000000000d1', '{}'::jsonb,
  'Post this week''s summary to #sales-wins', 'This week: 42 leads.', 'h1', 'always_ask', 'awaiting_approval',
  '5a1e5051-0000-4000-8000-0000000000a3', '5a1e5051-0000-4000-8000-0000000000a2'
);

DO $$
BEGIN
  BEGIN
    UPDATE public.sales_os_executions SET status = 'running', started_at = now()
    WHERE id = '5a1e5051-0000-4000-8000-0000000000e1';
    RAISE EXCEPTION 'a pending execution started running without approval';
  EXCEPTION
    WHEN insufficient_privilege OR check_violation THEN NULL;
  END;

  BEGIN
    UPDATE public.sales_os_executions
    SET status = 'approved', gate_satisfied_by = 'in_conversation_approval',
        approved_by_member_id = '5a1e5051-0000-4000-8000-0000000000a5', approved_at = now()
    WHERE id = '5a1e5051-0000-4000-8000-0000000000e1';
    RAISE EXCEPTION 'approval was recorded as someone else';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  UPDATE public.sales_os_executions SET preview = 'This week: 40 leads, revised before approval.'
  WHERE id = '5a1e5051-0000-4000-8000-0000000000e1';
  IF (SELECT preview FROM public.sales_os_executions WHERE id = '5a1e5051-0000-4000-8000-0000000000e1')
     IS DISTINCT FROM 'This week: 40 leads, revised before approval.' THEN
    RAISE EXCEPTION 'a pending execution could not be revised';
  END IF;
END
$$;

UPDATE public.sales_os_executions
SET status = 'approved', gate_satisfied_by = 'in_conversation_approval',
    approved_by_member_id = '5a1e5051-0000-4000-8000-0000000000a3', approved_at = now()
WHERE id = '5a1e5051-0000-4000-8000-0000000000e1';

DO $$
BEGIN
  BEGIN
    UPDATE public.sales_os_executions SET preview = 'Changed after approval'
    WHERE id = '5a1e5051-0000-4000-8000-0000000000e1';
    RAISE EXCEPTION 'the preview changed after it was approved';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
END
$$;

UPDATE public.sales_os_executions SET status = 'running', started_at = now()
WHERE id = '5a1e5051-0000-4000-8000-0000000000e1';

UPDATE public.sales_os_executions
SET status = 'failed', finished_at = now(), error_text = 'Slack did not accept the message.'
WHERE id = '5a1e5051-0000-4000-8000-0000000000e1';

DO $$
BEGIN
  BEGIN
    UPDATE public.sales_os_executions SET status = 'running', started_at = now()
    WHERE id = '5a1e5051-0000-4000-8000-0000000000e1';
    RAISE EXCEPTION 'a failed execution was retried';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    DELETE FROM public.sales_os_executions WHERE id = '5a1e5051-0000-4000-8000-0000000000e1';
    RAISE EXCEPTION 'an execution was deleted';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    DELETE FROM public.sales_os_destinations WHERE id = '5a1e5051-0000-4000-8000-0000000000d1';
    RAISE EXCEPTION 'a destination was deleted';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
END
$$;

-- Rejection is final.
INSERT INTO public.sales_os_executions (
  id, org_id, conversation_id, tool_call_id, execution_type, destination_id, plan,
  plain_summary, preview, input_hash, gate_mode, status,
  requested_by_member_id, requested_by_user_id
) VALUES (
  '5a1e5051-0000-4000-8000-0000000000e2',
  '5a1e5051-0000-4000-8000-0000000000a1', '5a1e5051-0000-4000-8000-0000000000c2', 'x-2',
  'post_discord_update', '5a1e5051-0000-4000-8000-0000000000d2', '{}'::jsonb,
  'Post an alert to #team', 'Speed to lead slipped.', 'h2', 'always_ask', 'awaiting_approval',
  '5a1e5051-0000-4000-8000-0000000000a3', '5a1e5051-0000-4000-8000-0000000000a2'
);

UPDATE public.sales_os_executions
SET status = 'rejected', rejected_by_member_id = '5a1e5051-0000-4000-8000-0000000000a3',
    rejected_at = now(), rejection_reason = 'Not this week.'
WHERE id = '5a1e5051-0000-4000-8000-0000000000e2';

DO $$
BEGIN
  BEGIN
    UPDATE public.sales_os_executions
    SET status = 'approved', gate_satisfied_by = 'in_conversation_approval',
        approved_by_member_id = '5a1e5051-0000-4000-8000-0000000000a3', approved_at = now()
    WHERE id = '5a1e5051-0000-4000-8000-0000000000e2';
    RAISE EXCEPTION 'a rejected execution was approved later';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
END
$$;

-- Ask the first time: refused until one to this destination was approved and succeeded.
INSERT INTO public.sales_os_gates (org_id, execution_type, mode, updated_by_member_id)
VALUES ('5a1e5051-0000-4000-8000-0000000000a1', 'post_discord_update', 'ask_first_time',
        '5a1e5051-0000-4000-8000-0000000000a3');

DO $$
BEGIN
  BEGIN
    INSERT INTO public.sales_os_executions (
      org_id, conversation_id, tool_call_id, execution_type, destination_id, plan,
      plain_summary, preview, input_hash, gate_mode, status, gate_satisfied_by,
      requested_by_member_id, requested_by_user_id
    ) VALUES (
      '5a1e5051-0000-4000-8000-0000000000a1', '5a1e5051-0000-4000-8000-0000000000c2', 'x-first',
      'post_discord_update', '5a1e5051-0000-4000-8000-0000000000d2', '{}'::jsonb,
      'Post an alert to #team', 'Speed to lead slipped.', 'h3', 'ask_first_time', 'approved', 'prior_configuration',
      '5a1e5051-0000-4000-8000-0000000000a3', '5a1e5051-0000-4000-8000-0000000000a2'
    );
    RAISE EXCEPTION 'the first post to a new destination skipped approval';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
END
$$;

INSERT INTO public.sales_os_executions (
  id, org_id, conversation_id, tool_call_id, execution_type, destination_id, plan,
  plain_summary, preview, input_hash, gate_mode, status,
  requested_by_member_id, requested_by_user_id
) VALUES (
  '5a1e5051-0000-4000-8000-0000000000e3',
  '5a1e5051-0000-4000-8000-0000000000a1', '5a1e5051-0000-4000-8000-0000000000c2', 'x-3',
  'post_discord_update', '5a1e5051-0000-4000-8000-0000000000d2', '{}'::jsonb,
  'Post an alert to #team', 'Speed to lead slipped.', 'h4', 'ask_first_time', 'awaiting_approval',
  '5a1e5051-0000-4000-8000-0000000000a3', '5a1e5051-0000-4000-8000-0000000000a2'
);
UPDATE public.sales_os_executions
SET status = 'approved', gate_satisfied_by = 'in_conversation_approval',
    approved_by_member_id = '5a1e5051-0000-4000-8000-0000000000a3', approved_at = now()
WHERE id = '5a1e5051-0000-4000-8000-0000000000e3';
UPDATE public.sales_os_executions SET status = 'running', started_at = now()
WHERE id = '5a1e5051-0000-4000-8000-0000000000e3';
UPDATE public.sales_os_executions SET status = 'succeeded', finished_at = now()
WHERE id = '5a1e5051-0000-4000-8000-0000000000e3';

INSERT INTO public.sales_os_executions (
  org_id, conversation_id, tool_call_id, execution_type, destination_id, plan,
  plain_summary, preview, input_hash, gate_mode, status, gate_satisfied_by,
  requested_by_member_id, requested_by_user_id
) VALUES (
  '5a1e5051-0000-4000-8000-0000000000a1', '5a1e5051-0000-4000-8000-0000000000c2', 'x-4',
  'post_discord_update', '5a1e5051-0000-4000-8000-0000000000d2', '{}'::jsonb,
  'Post an alert to #team', 'Speed to lead slipped again.', 'h5', 'ask_first_time', 'approved', 'prior_configuration',
  '5a1e5051-0000-4000-8000-0000000000a3', '5a1e5051-0000-4000-8000-0000000000a2'
);

-- Automatic: runs on prior configuration.
INSERT INTO public.sales_os_gates (org_id, execution_type, mode, updated_by_member_id)
VALUES ('5a1e5051-0000-4000-8000-0000000000a1', 'post_slack_update', 'automatic',
        '5a1e5051-0000-4000-8000-0000000000a3');

INSERT INTO public.sales_os_executions (
  org_id, conversation_id, tool_call_id, execution_type, destination_id, plan,
  plain_summary, preview, input_hash, gate_mode, status, gate_satisfied_by,
  requested_by_member_id, requested_by_user_id
) VALUES (
  '5a1e5051-0000-4000-8000-0000000000a1', '5a1e5051-0000-4000-8000-0000000000c2', 'x-5',
  'post_slack_update', '5a1e5051-0000-4000-8000-0000000000d1', '{}'::jsonb,
  'Post this week''s summary to #sales-wins', 'This week: 42 leads.', 'h6', 'automatic', 'approved', 'prior_configuration',
  '5a1e5051-0000-4000-8000-0000000000a3', '5a1e5051-0000-4000-8000-0000000000a2'
);

DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.settings_activity
  WHERE org_id = '5a1e5051-0000-4000-8000-0000000000a1'
    AND section = 'agent'
    AND action = 'agent_gate_changed'
    AND actor_label = 'SOS Owner';
  IF v_count < 2 THEN
    RAISE EXCEPTION 'gate changes were not recorded with the person who made them';
  END IF;
END
$$;

RESET ROLE;

-- ---------------------------------------------------------------------------
-- Another client's owner sees none of it.
-- ---------------------------------------------------------------------------

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '5a1e5051-0000-4000-8000-0000000000b2', false);

DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT
    (SELECT count(*) FROM public.sales_os_conversations WHERE org_id = '5a1e5051-0000-4000-8000-0000000000a1')
    + (SELECT count(*) FROM public.sales_os_messages WHERE org_id = '5a1e5051-0000-4000-8000-0000000000a1')
    + (SELECT count(*) FROM public.sales_os_tool_calls WHERE org_id = '5a1e5051-0000-4000-8000-0000000000a1')
    + (SELECT count(*) FROM public.sales_os_assets WHERE org_id = '5a1e5051-0000-4000-8000-0000000000a1')
    + (SELECT count(*) FROM public.sales_os_destinations WHERE org_id = '5a1e5051-0000-4000-8000-0000000000a1')
    + (SELECT count(*) FROM public.sales_os_executions WHERE org_id = '5a1e5051-0000-4000-8000-0000000000a1')
    + (SELECT count(*) FROM public.sales_os_gates WHERE org_id = '5a1e5051-0000-4000-8000-0000000000a1')
  INTO v_count;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'another workspace can read Sales OS rows (% visible)', v_count;
  END IF;

  IF public.sales_os_destination_credential('5a1e5051-0000-4000-8000-0000000000d1') IS NOT NULL THEN
    RAISE EXCEPTION 'another workspace read a destination credential';
  END IF;

  BEGIN
    INSERT INTO public.sales_os_messages (id, conversation_id, org_id, seq, role, parts, acted_as_member_id)
    VALUES ('intrude', '5a1e5051-0000-4000-8000-0000000000c2', '5a1e5051-0000-4000-8000-0000000000a1', 99,
            'user', '[]'::jsonb, '5a1e5051-0000-4000-8000-0000000000b3');
    RAISE EXCEPTION 'another workspace wrote into a conversation';
  EXCEPTION
    WHEN insufficient_privilege OR foreign_key_violation THEN NULL;
  END;
END
$$;

RESET ROLE;

-- A pending post can be revised. An approved one cannot, and a revision cannot approve itself.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '5a1e5051-0000-4000-8000-0000000000a2', false);

UPDATE public.sales_os_gates
SET mode = 'always_ask', updated_by_member_id = '5a1e5051-0000-4000-8000-0000000000a3', updated_at = now()
WHERE org_id = '5a1e5051-0000-4000-8000-0000000000a1' AND execution_type = 'post_slack_update';

INSERT INTO public.sales_os_executions (
  id, org_id, conversation_id, tool_call_id, execution_type, destination_id, plan,
  plain_summary, preview, input_hash, gate_mode, status,
  requested_by_member_id, requested_by_user_id
) VALUES (
  '5a1e5051-0000-4000-8000-0000000000e9',
  '5a1e5051-0000-4000-8000-0000000000a1', '5a1e5051-0000-4000-8000-0000000000c2', 'x-revise',
  'post_slack_update', '5a1e5051-0000-4000-8000-0000000000d1',
  '{"update":{"kind":"summary","title":"This week","summary":"42 leads.","sections":[]}}'::jsonb,
  'Post "This week" in #sales-wins on Slack.', 'This week\n\n42 leads.', 'h-revise', 'always_ask', 'awaiting_approval',
  '5a1e5051-0000-4000-8000-0000000000a3', '5a1e5051-0000-4000-8000-0000000000a2'
);

UPDATE public.sales_os_executions
SET plain_summary = 'Post "This week, revised" in #sales-wins on Slack.',
    preview = 'This week, revised

40 leads, not 42.',
    plan = '{"update":{"kind":"summary","title":"This week, revised","summary":"40 leads, not 42.","sections":[]}}'::jsonb,
    input_hash = 'h-revised'
WHERE id = '5a1e5051-0000-4000-8000-0000000000e9';

DO $$
BEGIN
  IF (SELECT preview FROM public.sales_os_executions WHERE id = '5a1e5051-0000-4000-8000-0000000000e9')
     NOT LIKE 'This week, revised%' THEN
    RAISE EXCEPTION 'a pending execution could not be revised';
  END IF;
  BEGIN
    UPDATE public.sales_os_executions
    SET status = 'approved', gate_satisfied_by = 'prior_configuration'
    WHERE id = '5a1e5051-0000-4000-8000-0000000000e9' AND status = 'awaiting_approval';
    RAISE EXCEPTION 'a revision approved itself';
  EXCEPTION
    WHEN insufficient_privilege OR check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.sales_os_executions SET preview = 'Changed after the fact'
    WHERE id = '5a1e5051-0000-4000-8000-0000000000e1';
    RAISE EXCEPTION 'a finished execution was revised';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
END
$$;

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', false);
