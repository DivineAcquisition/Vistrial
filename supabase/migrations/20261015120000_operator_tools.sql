-- Operator tools: tasks on next_actions, routing, search helpers, push devices, usage.

ALTER TYPE public.notification_event_type ADD VALUE IF NOT EXISTS 'task_assigned';
ALTER TYPE public.notification_event_type ADD VALUE IF NOT EXISTS 'task_due';
ALTER TYPE public.notification_event_type ADD VALUE IF NOT EXISTS 'task_overdue';
ALTER TYPE public.notification_event_type ADD VALUE IF NOT EXISTS 'task_suggested';
ALTER TYPE public.notification_event_type ADD VALUE IF NOT EXISTS 'lead_assigned';
ALTER TYPE public.notification_event_type ADD VALUE IF NOT EXISTS 'lead_to_claim';
ALTER TYPE public.notification_event_type ADD VALUE IF NOT EXISTS 'lead_reassigned';
ALTER TYPE public.notification_event_type ADD VALUE IF NOT EXISTS 'routing_nobody';
ALTER TYPE public.notification_event_type ADD VALUE IF NOT EXISTS 'away_holds_leads';
ALTER TYPE public.notification_event_type ADD VALUE IF NOT EXISTS 'claim_timer_expired';
ALTER TYPE public.notification_event_type ADD VALUE IF NOT EXISTS 'stale_reassign';
ALTER TYPE public.notification_event_type ADD VALUE IF NOT EXISTS 'team_workload';
ALTER TYPE public.notification_event_type ADD VALUE IF NOT EXISTS 'push_device';
ALTER TYPE public.notification_event_type ADD VALUE IF NOT EXISTS 'install_help';

-- A lead may have several open tasks. One open row per source and purpose.
ALTER TABLE public.next_actions ALTER COLUMN lead_id DROP NOT NULL;

ALTER TABLE public.next_actions
  ADD COLUMN IF NOT EXISTS task_type text NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS source_kind text NOT NULL DEFAULT 'person',
  ADD COLUMN IF NOT EXISTS source_sentence text,
  ADD COLUMN IF NOT EXISTS purpose_key text,
  ADD COLUMN IF NOT EXISTS snoozed_until timestamptz,
  ADD COLUMN IF NOT EXISTS canceled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_reason text,
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminded_at timestamptz;

ALTER TABLE public.next_actions DROP CONSTRAINT IF EXISTS next_actions_task_type_check;
ALTER TABLE public.next_actions
  ADD CONSTRAINT next_actions_task_type_check
  CHECK (task_type IN ('call', 'follow_up', 'prepare', 'review', 'other'));

ALTER TABLE public.next_actions DROP CONSTRAINT IF EXISTS next_actions_status_check;
ALTER TABLE public.next_actions
  ADD CONSTRAINT next_actions_status_check
  CHECK (status IN ('suggested', 'open', 'snoozed', 'done', 'canceled'));

ALTER TABLE public.next_actions DROP CONSTRAINT IF EXISTS next_actions_source_kind_check;
ALTER TABLE public.next_actions
  ADD CONSTRAINT next_actions_source_kind_check
  CHECK (source_kind IN ('person', 'sentry', 'scribe', 'playbook', 'booking', 'service_team'));

UPDATE public.next_actions
SET status = 'done'
WHERE completed_at IS NOT NULL
  AND status IS DISTINCT FROM 'done';

CREATE OR REPLACE FUNCTION public.next_actions_sync_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.completed_at IS NOT NULL AND NEW.status IN ('open', 'suggested', 'snoozed') THEN
    NEW.status := 'done';
  END IF;
  IF NEW.status = 'done' AND NEW.completed_at IS NULL THEN
    NEW.completed_at := now();
  END IF;
  IF NEW.status = 'canceled' AND NEW.canceled_at IS NULL THEN
    NEW.canceled_at := now();
  END IF;
  IF NEW.status <> 'canceled' THEN
    NEW.canceled_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS next_actions_sync_status ON public.next_actions;
CREATE TRIGGER next_actions_sync_status
  BEFORE INSERT OR UPDATE ON public.next_actions
  FOR EACH ROW EXECUTE FUNCTION public.next_actions_sync_status();

CREATE UNIQUE INDEX IF NOT EXISTS next_actions_open_purpose_idx
  ON public.next_actions (org_id, lead_id, source_kind, purpose_key)
  WHERE status IN ('suggested', 'open', 'snoozed')
    AND purpose_key IS NOT NULL
    AND lead_id IS NOT NULL;

DROP POLICY IF EXISTS next_actions_select ON public.next_actions;
CREATE POLICY next_actions_select
  ON public.next_actions
  FOR SELECT
  TO authenticated
  USING (
    org_id IN (SELECT public.user_org_ids())
    AND (
      lead_id IS NULL
      OR public.ws_lead_visible(org_id, lead_id)
    )
  );

DROP POLICY IF EXISTS next_actions_update_members ON public.next_actions;
CREATE POLICY next_actions_update_members
  ON public.next_actions
  FOR UPDATE
  TO authenticated
  USING (
    org_id IN (SELECT public.user_org_ids())
    AND (lead_id IS NULL OR public.ws_lead_visible(org_id, lead_id))
  )
  WITH CHECK (
    org_id IN (SELECT public.user_org_ids())
    AND (lead_id IS NULL OR public.ws_lead_visible(org_id, lead_id))
  );

DROP POLICY IF EXISTS next_actions_insert_members ON public.next_actions;
CREATE POLICY next_actions_insert_members
  ON public.next_actions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    org_id IN (SELECT public.user_org_ids())
    AND (lead_id IS NULL OR public.ws_lead_visible(org_id, lead_id))
  );

-- Routing runtime. Workspace settings that already live in configuration stay there.
CREATE TABLE IF NOT EXISTS public.routing_settings (
  org_id uuid PRIMARY KEY REFERENCES public.organizations (id) ON DELETE CASCADE,
  mode text,
  fallback_mode text,
  sticky_days integer,
  respect_hours boolean,
  agent_tasks text,
  claim_minutes integer,
  claim_auto boolean,
  stale_reassign text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.routing_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  snapshot jsonb NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS routing_revisions_org_idx ON public.routing_revisions (org_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.routing_pools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, name)
);

CREATE TABLE IF NOT EXISTS public.routing_pool_members (
  pool_id uuid NOT NULL REFERENCES public.routing_pools (id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.org_members (id) ON DELETE CASCADE,
  PRIMARY KEY (pool_id, member_id)
);

CREATE TABLE IF NOT EXISTS public.routing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 1,
  enabled boolean NOT NULL DEFAULT true,
  source text,
  service text,
  score_band text,
  location text,
  language text,
  target_member_id uuid REFERENCES public.org_members (id) ON DELETE SET NULL,
  target_pool text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.operator_availability (
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.org_members (id) ON DELETE CASCADE,
  away boolean NOT NULL DEFAULT false,
  away_until timestamptz,
  weight integer NOT NULL DEFAULT 1,
  max_open_leads integer,
  max_overdue_tasks integer,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, member_id),
  CONSTRAINT operator_availability_weight_check CHECK (weight >= 0 AND weight <= 10)
);

CREATE TABLE IF NOT EXISTS public.routing_cursors (
  org_id uuid PRIMARY KEY REFERENCES public.organizations (id) ON DELETE CASCADE,
  member_id uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.routing_turns (
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.org_members (id) ON DELETE CASCADE,
  received integer NOT NULL DEFAULT 0,
  PRIMARY KEY (org_id, member_id)
);

CREATE TABLE IF NOT EXISTS public.routing_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  lead_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  mode text NOT NULL,
  assigned_member_id uuid,
  explanation text NOT NULL,
  skipped jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS routing_decisions_lead_idx ON public.routing_decisions (org_id, lead_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  user_id uuid,
  kind text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT usage_events_quantity_check CHECK (quantity > 0)
);

CREATE INDEX IF NOT EXISTS usage_events_org_kind_idx ON public.usage_events (org_id, kind, occurred_at DESC);

CREATE TABLE IF NOT EXISTS public.notification_push_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  show_first_names boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_push_subscriptions
  ADD COLUMN IF NOT EXISTS device_label text;

ALTER TABLE public.routing_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routing_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routing_pools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routing_pool_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operator_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routing_cursors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routing_turns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routing_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_push_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY routing_settings_select ON public.routing_settings
  FOR SELECT TO authenticated USING (org_id IN (SELECT public.user_org_ids()));
CREATE POLICY routing_settings_write ON public.routing_settings
  FOR ALL TO authenticated
  USING (org_id IN (SELECT public.user_owner_org_ids()) OR public.ws_is_staff(org_id))
  WITH CHECK (org_id IN (SELECT public.user_owner_org_ids()) OR public.ws_is_staff(org_id));

CREATE POLICY routing_revisions_select ON public.routing_revisions
  FOR SELECT TO authenticated USING (org_id IN (SELECT public.user_owner_org_ids()) OR public.ws_is_staff(org_id));
CREATE POLICY routing_revisions_insert ON public.routing_revisions
  FOR INSERT TO authenticated
  WITH CHECK (org_id IN (SELECT public.user_owner_org_ids()) OR public.ws_is_staff(org_id));

CREATE POLICY routing_pools_select ON public.routing_pools
  FOR SELECT TO authenticated USING (org_id IN (SELECT public.user_org_ids()));
CREATE POLICY routing_pools_write ON public.routing_pools
  FOR ALL TO authenticated
  USING (public.ws_is_staff(org_id))
  WITH CHECK (public.ws_is_staff(org_id));

CREATE POLICY routing_pool_members_select ON public.routing_pool_members
  FOR SELECT TO authenticated USING (org_id IN (SELECT public.user_org_ids()));
CREATE POLICY routing_pool_members_write ON public.routing_pool_members
  FOR ALL TO authenticated
  USING (public.ws_is_staff(org_id))
  WITH CHECK (public.ws_is_staff(org_id));

CREATE POLICY routing_rules_select ON public.routing_rules
  FOR SELECT TO authenticated USING (org_id IN (SELECT public.user_org_ids()));
CREATE POLICY routing_rules_write ON public.routing_rules
  FOR ALL TO authenticated
  USING (org_id IN (SELECT public.user_owner_org_ids()) OR public.ws_is_staff(org_id))
  WITH CHECK (org_id IN (SELECT public.user_owner_org_ids()) OR public.ws_is_staff(org_id));

CREATE POLICY operator_availability_select ON public.operator_availability
  FOR SELECT TO authenticated USING (org_id IN (SELECT public.user_org_ids()));
CREATE POLICY operator_availability_write ON public.operator_availability
  FOR ALL TO authenticated
  USING (
    org_id IN (SELECT public.user_owner_org_ids())
    OR public.ws_is_staff(org_id)
    OR member_id = public.user_member_id(org_id)
  )
  WITH CHECK (
    org_id IN (SELECT public.user_owner_org_ids())
    OR public.ws_is_staff(org_id)
    OR member_id = public.user_member_id(org_id)
  );

CREATE POLICY routing_cursors_select ON public.routing_cursors
  FOR SELECT TO authenticated USING (org_id IN (SELECT public.user_owner_org_ids()) OR public.ws_is_staff(org_id));
CREATE POLICY routing_turns_select ON public.routing_turns
  FOR SELECT TO authenticated USING (org_id IN (SELECT public.user_owner_org_ids()) OR public.ws_is_staff(org_id));

CREATE POLICY routing_decisions_select ON public.routing_decisions
  FOR SELECT TO authenticated
  USING (
    org_id IN (SELECT public.user_org_ids())
    AND public.ws_lead_visible(org_id, lead_id)
  );

CREATE POLICY usage_events_select ON public.usage_events
  FOR SELECT TO authenticated USING (org_id IN (SELECT public.user_owner_org_ids()) OR public.ws_is_staff(org_id));

CREATE POLICY notification_push_settings_self ON public.notification_push_settings
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.routing_settings TO authenticated, service_role;
GRANT SELECT, INSERT ON public.routing_revisions TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.routing_pools TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.routing_pool_members TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.routing_rules TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.operator_availability TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.routing_cursors TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.routing_turns TO authenticated, service_role;
GRANT SELECT, INSERT ON public.routing_decisions TO authenticated, service_role;
GRANT SELECT, INSERT ON public.usage_events TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.notification_push_settings TO authenticated, service_role;

-- Apply one routing decision. A repeated key returns the first decision.
CREATE OR REPLACE FUNCTION public.route_apply(
  p_org_id uuid,
  p_lead_id uuid,
  p_key text,
  p_member_id uuid,
  p_mode text,
  p_explanation text,
  p_skipped jsonb,
  p_expected_cursor uuid,
  p_historic boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing public.routing_decisions%ROWTYPE;
  v_cursor uuid;
  v_setter uuid;
  v_closer uuid;
BEGIN
  IF p_org_id IS NULL OR p_lead_id IS NULL OR p_key IS NULL THEN
    RAISE EXCEPTION 'Missing routing input.' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(auth.role(), '') IS DISTINCT FROM 'service_role'
     AND NOT public.ws_is_staff(p_org_id)
     AND p_org_id NOT IN (SELECT public.user_owner_org_ids()) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
  IF p_org_id IN (SELECT public.closed_org_ids()) THEN
    RETURN jsonb_build_object('ok', true, 'memberId', NULL, 'explanation', 'This workspace is closed, so the lead stays unassigned.', 'conflict', false);
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_org_id::text));

  SELECT * INTO v_existing
  FROM public.routing_decisions
  WHERE org_id = p_org_id AND idempotency_key = p_key;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'existing', true,
      'conflict', false,
      'memberId', v_existing.assigned_member_id,
      'explanation', v_existing.explanation,
      'mode', v_existing.mode
    );
  END IF;

  SELECT assigned_setter_id, assigned_closer_id INTO v_setter, v_closer
  FROM public.leads
  WHERE id = p_lead_id AND org_id = p_org_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'lead not found' USING ERRCODE = '42501';
  END IF;

  IF p_historic THEN
    INSERT INTO public.routing_decisions (org_id, lead_id, idempotency_key, mode, assigned_member_id, explanation, skipped)
    VALUES (p_org_id, p_lead_id, p_key, 'historic', NULL, p_explanation, COALESCE(p_skipped, '[]'::jsonb));
    RETURN jsonb_build_object('ok', true, 'conflict', false, 'memberId', NULL, 'explanation', p_explanation);
  END IF;

  IF v_setter IS NOT NULL OR v_closer IS NOT NULL THEN
    INSERT INTO public.routing_decisions (org_id, lead_id, idempotency_key, mode, assigned_member_id, explanation, skipped)
    VALUES (p_org_id, p_lead_id, p_key, 'already_assigned', COALESCE(v_setter, v_closer), 'This lead already has a person. It was not assigned again.', '[]'::jsonb);
    RETURN jsonb_build_object('ok', true, 'conflict', false, 'memberId', COALESCE(v_setter, v_closer), 'explanation', 'This lead already has a person. It was not assigned again.');
  END IF;

  SELECT member_id INTO v_cursor FROM public.routing_cursors WHERE org_id = p_org_id;
  IF v_cursor IS DISTINCT FROM p_expected_cursor THEN
    RETURN jsonb_build_object('ok', false, 'conflict', true, 'cursor', v_cursor);
  END IF;

  IF p_member_id IS NOT NULL THEN
    UPDATE public.leads
    SET assigned_setter_id = p_member_id
    WHERE id = p_lead_id AND org_id = p_org_id;
    INSERT INTO public.routing_cursors (org_id, member_id)
    VALUES (p_org_id, p_member_id)
    ON CONFLICT (org_id) DO UPDATE SET member_id = EXCLUDED.member_id, updated_at = now();
    INSERT INTO public.routing_turns (org_id, member_id, received)
    VALUES (p_org_id, p_member_id, 1)
    ON CONFLICT (org_id, member_id) DO UPDATE SET received = public.routing_turns.received + 1;
  END IF;

  INSERT INTO public.routing_decisions (org_id, lead_id, idempotency_key, mode, assigned_member_id, explanation, skipped)
  VALUES (p_org_id, p_lead_id, p_key, p_mode, p_member_id, p_explanation, COALESCE(p_skipped, '[]'::jsonb));

  INSERT INTO public.usage_events (org_id, kind, quantity)
  VALUES (p_org_id, 'routing_decision', 1);

  RETURN jsonb_build_object('ok', true, 'conflict', false, 'memberId', p_member_id, 'explanation', p_explanation, 'mode', p_mode);
END;
$$;

REVOKE ALL ON FUNCTION public.route_apply(uuid, uuid, text, uuid, text, text, jsonb, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.route_apply(uuid, uuid, text, uuid, text, text, jsonb, uuid, boolean) TO authenticated, service_role;

-- First claim wins. A late tap gets a calm refusal.
CREATE OR REPLACE FUNCTION public.claim_unassigned_lead(p_org_id uuid, p_lead_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_self uuid;
  v_updated uuid;
BEGIN
  IF p_org_id IS NULL OR p_org_id NOT IN (SELECT public.user_org_ids()) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
  IF NOT public.ws_can_work_lead(p_org_id, p_lead_id) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
  v_self := public.user_member_id(p_org_id);
  IF v_self IS NULL THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  UPDATE public.leads
  SET assigned_setter_id = v_self
  WHERE id = p_lead_id
    AND org_id = p_org_id
    AND assigned_setter_id IS NULL
    AND assigned_closer_id IS NULL
  RETURNING id INTO v_updated;

  IF v_updated IS NULL THEN
    RETURN false;
  END IF;

  INSERT INTO public.routing_decisions (org_id, lead_id, idempotency_key, mode, assigned_member_id, explanation, skipped)
  VALUES (p_org_id, p_lead_id, 'claim:' || p_lead_id::text || ':' || v_self::text, 'claim', v_self, 'Claimed from the unassigned queue.', '[]'::jsonb)
  ON CONFLICT (org_id, idempotency_key) DO NOTHING;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_unassigned_lead(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_unassigned_lead(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.search_visible_leads(p_org_id uuid, p_query text, p_limit integer DEFAULT 8)
RETURNS TABLE (id uuid, title text, detail text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT l.id,
    btrim(concat_ws(' ', l.first_name, l.last_name)),
    concat_ws(' · ', l.status, NULLIF(btrim(concat_ws(' ', setter.display_name, closer.display_name)), ''))
  FROM public.leads l
  LEFT JOIN public.org_members setter ON setter.id = l.assigned_setter_id
  LEFT JOIN public.org_members closer ON closer.id = l.assigned_closer_id
  WHERE l.org_id = p_org_id
    AND p_org_id IN (SELECT public.user_org_ids())
    AND public.ws_lead_visible(p_org_id, l.id)
    AND l.merged_into IS NULL
    AND (
      btrim(concat_ws(' ', l.first_name, l.last_name, l.email, l.source)) ILIKE '%' || btrim(p_query) || '%'
      OR (
        length(regexp_replace(p_query, '\D', '', 'g')) >= 3
        AND regexp_replace(COALESCE(l.phone, ''), '\D', '', 'g') LIKE '%' || regexp_replace(p_query, '\D', '', 'g') || '%'
      )
    )
  ORDER BY l.last_touch_at DESC NULLS LAST
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 8), 1), 20);
$$;

CREATE OR REPLACE FUNCTION public.search_visible_tasks(p_org_id uuid, p_query text, p_limit integer DEFAULT 8)
RETURNS TABLE (id uuid, title text, detail text, lead_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT n.id,
    n.action_text,
    concat_ws(' · ', n.status, to_char(n.due_at, 'YYYY-MM-DD')),
    n.lead_id
  FROM public.next_actions n
  WHERE n.org_id = p_org_id
    AND p_org_id IN (SELECT public.user_org_ids())
    AND (n.lead_id IS NULL OR public.ws_lead_visible(p_org_id, n.lead_id))
    AND n.action_text ILIKE '%' || btrim(p_query) || '%'
    AND n.status IN ('suggested', 'open', 'snoozed')
  ORDER BY n.due_at NULLS LAST
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 8), 1), 20);
$$;

REVOKE ALL ON FUNCTION public.search_visible_leads(uuid, text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.search_visible_tasks(uuid, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_visible_leads(uuid, text, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_visible_tasks(uuid, text, integer) TO authenticated, service_role;

COMMENT ON TABLE public.usage_events IS
  'Counts for cost review. No lead content.';

-- config-registry:begin (generated from src/lib/config; do not edit by hand)
INSERT INTO public.config_fields (key, section, field_type, label, required, workspace_only, default_lock, tighten, owner_editable, rules, sort_order) VALUES
  ('identity.business_name', 'identity', 'text', 'Business name', true, true, false, NULL, NULL, $cfg${"minLength":2,"maxLength":120}$cfg$::jsonb, 1),
  ('identity.display_name', 'identity', 'text', 'Name used in messages', true, true, false, NULL, NULL, $cfg${"minLength":2,"maxLength":80}$cfg$::jsonb, 2),
  ('identity.timezone', 'identity', 'choice', 'Time zone', true, false, false, NULL, NULL, $cfg${"timezone":true}$cfg$::jsonb, 3),
  ('identity.business_hours', 'identity', 'schedule', 'Business hours', true, false, false, NULL, 'when_allowed', $cfg${}$cfg$::jsonb, 4),
  ('identity.owners_can_edit_hours', 'identity', 'boolean', 'Owners can change business hours', false, false, false, NULL, NULL, $cfg${}$cfg$::jsonb, 5),
  ('identity.primary_contact', 'identity', 'key_value', 'Primary contact', true, true, false, NULL, 'always', $cfg${"valueType":"text","keys":["name","email","phone"]}$cfg$::jsonb, 6),
  ('identity.escalation_contact', 'identity', 'key_value', 'Escalation contact', false, true, false, NULL, NULL, $cfg${"valueType":"text","keys":["name","email","phone"]}$cfg$::jsonb, 7),
  ('qualification.ready_criteria', 'qualification', 'list', 'Ready to buy when', true, false, false, NULL, NULL, $cfg${"minItems":1,"maxItems":30,"itemMaxLength":200}$cfg$::jsonb, 8),
  ('qualification.not_ready_criteria', 'qualification', 'list', 'Needs nurturing when', false, false, false, NULL, NULL, $cfg${"maxItems":30,"itemMaxLength":200}$cfg$::jsonb, 9),
  ('qualification.disqualifiers', 'qualification', 'list', 'Stop pursuing when', false, false, false, NULL, NULL, $cfg${"maxItems":30,"itemFields":[{"key":"reason","type":"text","required":true,"maxLength":200},{"key":"closing_message","type":"long_text","maxLength":600}]}$cfg$::jsonb, 10),
  ('qualification.scoring_bands', 'qualification', 'list', 'Score bands', true, false, false, NULL, NULL, $cfg${"minItems":2,"maxItems":6,"uniqueBy":"name","itemFields":[{"key":"name","type":"text","required":true,"maxLength":40},{"key":"min_score","type":"number","required":true,"min":0,"max":100},{"key":"meaning","type":"text","required":true,"maxLength":200},{"key":"next_step","type":"text","required":true,"maxLength":200}]}$cfg$::jsonb, 11),
  ('qualification.ready_threshold', 'qualification', 'number', 'Ready from score', true, false, false, NULL, NULL, $cfg${"min":0,"max":100,"integer":true}$cfg$::jsonb, 12),
  ('qualification.factor_weights', 'qualification', 'key_value', 'How much each factor counts', true, false, false, NULL, NULL, $cfg${"min":0,"max":100,"valueType":"number","keys":["timeline","investment_capacity","decision_authority","pain_severity"]}$cfg$::jsonb, 13),
  ('qualification.minimum_info', 'qualification', 'list', 'Must know before qualifying', false, false, false, NULL, NULL, $cfg${"maxItems":20,"itemMaxLength":60}$cfg$::jsonb, 14),
  ('response.first_touch_minutes', 'response', 'duration', 'First touch within', true, false, false, NULL, NULL, $cfg${"min":1,"max":10080,"integer":true}$cfg$::jsonb, 15),
  ('response.follow_up_cadence', 'response', 'list', 'Longest gap between touches, by stage', false, false, false, NULL, NULL, $cfg${"maxItems":12,"uniqueBy":"stage","itemFields":[{"key":"stage","type":"choice","required":true,"options":["new","working","call_booked","follow_up","objection_hold","no_show","ghost"]},{"key":"max_gap_hours","type":"number","required":true,"min":1,"max":2160}]}$cfg$::jsonb, 16),
  ('response.after_hours', 'response', 'choice', 'Outside business hours', true, false, false, NULL, NULL, $cfg${"options":["pause","keep_running","separate_window"]}$cfg$::jsonb, 17),
  ('response.after_hours_window_minutes', 'response', 'duration', 'After-hours window', false, false, false, NULL, NULL, $cfg${"min":15,"max":10080,"integer":true}$cfg$::jsonb, 18),
  ('response.counted_touch_types', 'response', 'multi_choice', 'Counts as a human touch', true, false, false, NULL, NULL, $cfg${"minItems":1,"options":["call","text","email"]}$cfg$::jsonb, 19),
  ('response.relay_counts_as_human_touch', 'response', 'boolean', 'An approved Relay message counts as a human touch', false, false, false, NULL, NULL, $cfg${}$cfg$::jsonb, 20),
  ('response.warning_threshold_percent', 'response', 'number', 'Nudge at', false, false, false, NULL, NULL, $cfg${"min":50,"max":95,"integer":true}$cfg$::jsonb, 21),
  ('response.ghost_days_soft', 'response', 'number', 'Going quiet after', true, false, false, NULL, NULL, $cfg${"min":1,"max":365,"integer":true}$cfg$::jsonb, 22),
  ('response.ghost_days_hard', 'response', 'number', 'Gone quiet after', true, false, false, NULL, NULL, $cfg${"min":2,"max":365,"integer":true}$cfg$::jsonb, 23),
  ('response.max_sequence_length', 'response', 'number', 'Most follow-ups in a row', false, false, false, NULL, NULL, $cfg${"min":1,"max":8,"integer":true}$cfg$::jsonb, 24),
  ('response.max_sequence_days', 'response', 'number', 'Follow-up runs for at most', false, false, false, NULL, NULL, $cfg${"min":1,"max":90,"integer":true}$cfg$::jsonb, 25),
  ('response.draft_stale_days', 'response', 'number', 'Unapproved drafts expire after', false, false, false, NULL, NULL, $cfg${"min":1,"max":14,"integer":true}$cfg$::jsonb, 26),
  ('response.quiet_lead_hours', 'response', 'number', 'A lead is quiet after', false, false, false, NULL, NULL, $cfg${"min":1,"max":720,"integer":true}$cfg$::jsonb, 27),
  ('response.untouched_window_days', 'response', 'number', 'Look back for untouched leads', false, false, false, NULL, NULL, $cfg${"min":1,"max":30,"integer":true}$cfg$::jsonb, 28),
  ('response.no_show_window_days', 'response', 'number', 'Rebook no-shows within', false, false, false, NULL, NULL, $cfg${"min":1,"max":60,"integer":true}$cfg$::jsonb, 29),
  ('tone.formality', 'tone', 'choice', 'Formality', true, false, false, NULL, NULL, $cfg${"options":["formal","friendly","casual"]}$cfg$::jsonb, 30),
  ('tone.use_contractions', 'tone', 'boolean', 'Use contractions', false, false, false, NULL, NULL, $cfg${}$cfg$::jsonb, 31),
  ('tone.sender_identity', 'tone', 'text', 'Messages come from', false, false, false, NULL, NULL, $cfg${"maxLength":80}$cfg$::jsonb, 32),
  ('tone.greeting', 'tone', 'text', 'Greeting', false, false, false, NULL, NULL, $cfg${"maxLength":60}$cfg$::jsonb, 33),
  ('tone.sign_off', 'tone', 'text', 'Sign-off', false, false, false, NULL, NULL, $cfg${"maxLength":80}$cfg$::jsonb, 34),
  ('tone.sms_max_chars', 'tone', 'number', 'Longest text message', true, false, false, NULL, NULL, $cfg${"min":40,"max":480,"integer":true}$cfg$::jsonb, 35),
  ('tone.email_max_chars', 'tone', 'number', 'Longest email', true, false, false, NULL, NULL, $cfg${"min":120,"max":4000,"integer":true}$cfg$::jsonb, 36),
  ('tone.emoji', 'tone', 'choice', 'Emoji', false, false, false, NULL, NULL, $cfg${"options":["never","sparing","natural"]}$cfg$::jsonb, 37),
  ('tone.punctuation_rules', 'tone', 'long_text', 'Punctuation rules', false, false, false, NULL, NULL, $cfg${"maxLength":500}$cfg$::jsonb, 38),
  ('tone.language', 'tone', 'choice', 'Language and spelling', false, false, false, NULL, NULL, $cfg${"options":["en-US","en-GB","en-CA","en-AU","es-US"]}$cfg$::jsonb, 39),
  ('tone.preferred_terms', 'tone', 'list', 'Words to use', false, false, false, NULL, NULL, $cfg${"maxItems":50,"itemMaxLength":80}$cfg$::jsonb, 40),
  ('tone.banned_terms', 'tone', 'list', 'Words and phrases to avoid', false, false, false, NULL, NULL, $cfg${"maxItems":200,"itemMaxLength":120}$cfg$::jsonb, 41),
  ('tone.examples', 'tone', 'list', 'Example messages', false, false, false, NULL, NULL, $cfg${"maxItems":10,"itemFields":[{"key":"channel","type":"choice","required":true,"options":["sms","email"]},{"key":"body","type":"long_text","required":true,"maxLength":2000}]}$cfg$::jsonb, 42),
  ('industry.business_description', 'industry', 'text', 'What kind of business this is', true, false, false, NULL, NULL, $cfg${"minLength":5,"maxLength":200}$cfg$::jsonb, 43),
  ('industry.offers', 'industry', 'list', 'What the business sells', true, false, false, NULL, NULL, $cfg${"minItems":1,"maxItems":50,"uniqueBy":"name","itemFields":[{"key":"name","type":"text","required":true,"maxLength":100},{"key":"ticket_min","type":"number","min":0,"max":10000000},{"key":"ticket_max","type":"number","min":0,"max":10000000},{"key":"recurring","type":"boolean"}]}$cfg$::jsonb, 44),
  ('industry.case_facts', 'industry', 'list', 'Case-file facts', true, false, false, NULL, NULL, $cfg${"minItems":1,"maxItems":40,"uniqueBy":"key","itemFields":[{"key":"key","type":"text","required":true,"maxLength":60},{"key":"label","type":"text","required":true,"maxLength":80},{"key":"type","type":"choice","required":true,"options":["text","number","choice","yes_no","date"]},{"key":"required","type":"boolean"}]}$cfg$::jsonb, 45),
  ('industry.urgency_signals', 'industry', 'list', 'Act-now signals', false, false, false, NULL, NULL, $cfg${"maxItems":50,"itemMaxLength":120}$cfg$::jsonb, 46),
  ('industry.compass_questions', 'industry', 'list', 'Compass starter questions', false, false, false, NULL, NULL, $cfg${"maxItems":20,"uniqueBy":"question","itemFields":[{"key":"question","type":"text","required":true,"maxLength":160},{"key":"audience","type":"choice","required":true,"options":["everyone","managers","operators"]}]}$cfg$::jsonb, 47),
  ('industry.objections', 'industry', 'list', 'Objection library', false, false, false, NULL, NULL, $cfg${"maxItems":200,"uniqueBy":"label","itemFields":[{"key":"label","type":"text","required":true,"maxLength":80},{"key":"category","type":"choice","required":true,"options":["price","timing","spouse_partner","trust","fit","competitor","other"]},{"key":"recognize","type":"long_text","maxLength":500},{"key":"guidance","type":"long_text","maxLength":1000}]}$cfg$::jsonb, 48),
  ('industry.lead_sources', 'industry', 'list', 'Lead sources', false, false, false, NULL, NULL, $cfg${"maxItems":30,"uniqueBy":"source","itemFields":[{"key":"source","type":"text","required":true,"maxLength":80},{"key":"priority","type":"choice","required":true,"options":["high","normal","low"]},{"key":"treatment","type":"text","maxLength":300}]}$cfg$::jsonb, 49),
  ('escalation.levels', 'escalation', 'list', 'Who hears about what', true, false, false, NULL, NULL, $cfg${"minItems":1,"maxItems":8,"itemFields":[{"key":"severity","type":"choice","required":true,"options":["info","warning","urgent","critical"]},{"key":"trigger","type":"text","required":true,"maxLength":200},{"key":"after_windows","type":"number","min":1,"max":20},{"key":"notify","type":"multi_choice","required":true,"options":["assignee","setters","closers","managers","service_team"]},{"key":"channels","type":"multi_choice","required":true,"options":["push","email","sms","team_channel","discord"]}]}$cfg$::jsonb, 50),
  ('escalation.quiet_hours', 'escalation', 'choice', 'Quiet hours for the team', false, false, false, NULL, NULL, $cfg${"options":["outside_business_hours","none"]}$cfg$::jsonb, 51),
  ('escalation.urgent_exception', 'escalation', 'choice', 'Break quiet hours for', false, false, false, NULL, NULL, $cfg${"options":["critical","urgent_and_critical","none"]}$cfg$::jsonb, 52),
  ('escalation.unacknowledged_minutes', 'escalation', 'duration', 'If no one acknowledges within', false, false, false, NULL, NULL, $cfg${"min":5,"max":1440,"integer":true}$cfg$::jsonb, 53),
  ('escalation.unacknowledged_next', 'escalation', 'choice', 'Then tell', false, false, false, NULL, NULL, $cfg${"options":["assignee","setters","closers","managers","service_team"]}$cfg$::jsonb, 54),
  ('approval.actions', 'approval', 'list', 'What needs approval', true, false, false, NULL, NULL, $cfg${"minItems":1,"maxItems":30,"uniqueBy":"action","itemFields":[{"key":"action","type":"choice","required":true,"options":["first_reply","quiet_lead_follow_up","no_show_rebook","client_report","crm_stage_change","setter_nudge","owner_escalation","slack_post","discord_post","drive_store","send_text","send_email","create_asset"]},{"key":"mode","type":"choice","required":true,"options":["ask_first","auto_run","off"]},{"key":"approver","type":"choice","required":true,"options":["owners_and_managers","owner_only","assigned"]},{"key":"max_wait_minutes","type":"number","min":15,"max":10080},{"key":"auto_run_confirmed","type":"boolean"}]}$cfg$::jsonb, 55),
  ('approval.never_auto', 'approval', 'multi_choice', 'Always needs approval', false, false, true, 'superset_list', NULL, $cfg${"options":["first_reply","quiet_lead_follow_up","no_show_rebook","client_report","crm_stage_change","setter_nudge","owner_escalation","slack_post","discord_post","drive_store","send_text","send_email","create_asset"]}$cfg$::jsonb, 56),
  ('approval.timeout_minutes', 'approval', 'duration', 'Waiting too long after', false, false, false, NULL, NULL, $cfg${"min":15,"max":10080,"integer":true}$cfg$::jsonb, 57),
  ('approval.timeout_behavior', 'approval', 'choice', 'When no one approves in time', false, false, false, NULL, NULL, $cfg${"options":["nothing","escalate","proceed"]}$cfg$::jsonb, 58),
  ('approval.timeout_proceed_confirmed', 'approval', 'boolean', 'I understand waiting items will proceed without approval', false, false, false, NULL, NULL, $cfg${}$cfg$::jsonb, 59),
  ('integrations.crm', 'integrations', 'reference', 'CRM', false, false, false, NULL, NULL, $cfg${"referenceKinds":["integration"]}$cfg$::jsonb, 60),
  ('integrations.messaging_numbers', 'integrations', 'list', 'Messaging numbers', false, false, false, NULL, NULL, $cfg${"maxItems":20,"uniqueBy":"number","itemFields":[{"key":"label","type":"text","required":true,"maxLength":60},{"key":"number","type":"text","required":true,"maxLength":20},{"key":"provider","type":"choice","required":true,"options":["crm","telnyx"]},{"key":"sender_name","type":"text","maxLength":60}]}$cfg$::jsonb, 61),
  ('integrations.calendar', 'integrations', 'reference', 'Calendar', false, false, false, NULL, NULL, $cfg${"referenceKinds":["integration"]}$cfg$::jsonb, 62),
  ('integrations.email_domain', 'integrations', 'text', 'Email sending domain', false, false, false, NULL, NULL, $cfg${"maxLength":120,"pattern":"^$|^([a-z0-9-]+\\.)+[a-z]{2,}$"}$cfg$::jsonb, 63),
  ('integrations.chat_channels', 'integrations', 'list', 'Chat channels', false, false, false, NULL, NULL, $cfg${"maxItems":10,"itemFields":[{"key":"label","type":"text","required":true,"maxLength":60},{"key":"kind","type":"choice","required":true,"options":["slack","discord","teams"]},{"key":"connection_id","type":"text","required":true,"maxLength":64}]}$cfg$::jsonb, 64),
  ('integrations.file_folder', 'integrations', 'text', 'File storage folder', false, false, false, NULL, NULL, $cfg${"minLength":1,"maxLength":120}$cfg$::jsonb, 65),
  ('sources.allowed', 'sources', 'multi_choice', 'Agents may read', true, false, false, NULL, NULL, $cfg${"options":["call_transcripts","email","text_messages","forms","crm_notes"]}$cfg$::jsonb, 66),
  ('sources.retention_days', 'sources', 'key_value', 'Keep for (days)', false, false, false, NULL, NULL, $cfg${"min":30,"max":3650,"valueType":"number","keys":["call_transcripts","email","text_messages","forms","crm_notes"]}$cfg$::jsonb, 67),
  ('sources.agent_run_history_days', 'sources', 'number', 'Keep agent run history for (days)', false, false, false, NULL, NULL, $cfg${"min":7,"max":730,"integer":true}$cfg$::jsonb, 68),
  ('sources.scribe_calls_per_hour', 'sources', 'number', 'Calls Scribe reads per hour', false, false, false, NULL, NULL, $cfg${"min":1,"max":1000,"integer":true}$cfg$::jsonb, 69),
  ('sources.excluded', 'sources', 'list', 'Never read', false, false, false, NULL, NULL, $cfg${"maxItems":10,"uniqueBy":"source","itemFields":[{"key":"source","type":"choice","required":true,"options":["call_transcripts","email","text_messages","forms","crm_notes"]},{"key":"reason","type":"text","required":true,"maxLength":200}]}$cfg$::jsonb, 70),
  ('sources.forsight_history_weeks', 'sources', 'number', 'Forsight shows (weeks)', false, false, false, NULL, NULL, $cfg${"min":4,"max":52,"integer":true}$cfg$::jsonb, 71),
  ('sources.forsight_quiet_days', 'sources', 'number', 'Forsight: going quiet after (days)', false, false, false, NULL, NULL, $cfg${"min":1,"max":60,"integer":true}$cfg$::jsonb, 72),
  ('sources.forsight_silent_days', 'sources', 'number', 'Forsight: silent after (days)', false, false, false, NULL, NULL, $cfg${"min":2,"max":120,"integer":true}$cfg$::jsonb, 73),
  ('sources.forsight_long_silent_days', 'sources', 'number', 'Forsight: long silent after (days)', false, false, false, NULL, NULL, $cfg${"min":3,"max":365,"integer":true}$cfg$::jsonb, 74),
  ('sources.stellar_stage_labels', 'sources', 'key_value', 'Stellar build stage names', false, false, false, NULL, NULL, $cfg${"valueType":"text","keys":["getting_set_up","building_system","testing","live","running_smoothly"]}$cfg$::jsonb, 75),
  ('operators.assignment_mode', 'operators', 'choice', 'How leads are assigned', true, false, false, NULL, 'always', $cfg${"options":["manual","round_robin","weighted_round_robin","least_loaded","rules","by_source","by_service"]}$cfg$::jsonb, 76),
  ('operators.routing_fallback', 'operators', 'choice', 'When no rule matches', false, false, false, NULL, 'always', $cfg${"options":["manual","round_robin","weighted_round_robin","least_loaded"]}$cfg$::jsonb, 77),
  ('operators.sticky_days', 'operators', 'number', 'Send a returning lead to the same person', false, false, false, NULL, 'always', $cfg${"min":0,"max":365,"integer":true}$cfg$::jsonb, 78),
  ('operators.respect_hours', 'operators', 'boolean', 'Only assign during working hours', false, false, false, NULL, 'always', $cfg${}$cfg$::jsonb, 79),
  ('operators.agent_tasks', 'operators', 'choice', 'Tasks from Sentry and plays', false, false, false, NULL, 'always', $cfg${"options":["suggested","direct"]}$cfg$::jsonb, 80),
  ('operators.claim_minutes', 'operators', 'number', 'Minutes before an unclaimed lead is flagged', false, false, false, NULL, 'always', $cfg${"min":0,"max":1440,"integer":true}$cfg$::jsonb, 81),
  ('operators.claim_auto', 'operators', 'boolean', 'Assign automatically when the claim time runs out', false, false, false, NULL, 'always', $cfg${}$cfg$::jsonb, 82),
  ('operators.stale_reassign', 'operators', 'choice', 'When a lead sits unworked', false, false, false, NULL, 'always', $cfg${"options":["notify","automatic"]}$cfg$::jsonb, 83),
  ('operators.extra_permissions', 'operators', 'multi_choice', 'Operators may also', false, false, false, NULL, NULL, $cfg${"options":["view_unassigned_details","reassign_own_leads"]}$cfg$::jsonb, 84),
  ('operators.summary_time', 'operators', 'choice', 'Daily summary', false, false, false, NULL, NULL, $cfg${"options":["start_of_day","end_of_day"]}$cfg$::jsonb, 85),
  ('operators.summary_confirmer', 'operators', 'choice', 'Summaries are confirmed by', false, false, false, NULL, NULL, $cfg${"options":["operator","owner","service_team"]}$cfg$::jsonb, 86),
  ('compliance.opt_out_words', 'compliance', 'list', 'Opt-out words', false, false, true, 'superset_list', NULL, $cfg${"maxItems":30,"itemMaxLength":30}$cfg$::jsonb, 87),
  ('compliance.quiet_hours', 'compliance', 'time_window', 'No messages between', true, false, true, 'wider_window', NULL, $cfg${}$cfg$::jsonb, 88),
  ('compliance.quiet_hours_basis', 'compliance', 'choice', 'Quiet hours follow', false, false, true, NULL, NULL, $cfg${"options":["lead_local","workspace"]}$cfg$::jsonb, 89),
  ('compliance.daily_cap_per_lead', 'compliance', 'number', 'Most messages per lead per day', true, false, true, 'lower_number', NULL, $cfg${"min":1,"max":20,"integer":true}$cfg$::jsonb, 90),
  ('compliance.cap_applies_to', 'compliance', 'choice', 'The daily limit covers', false, false, true, NULL, NULL, $cfg${"options":["every_send","auto_run_only"]}$cfg$::jsonb, 91),
  ('compliance.weekly_cap_per_lead', 'compliance', 'number', 'Most messages per lead per week', false, false, true, 'lower_number_zero_is_unlimited', NULL, $cfg${"min":0,"max":100,"integer":true}$cfg$::jsonb, 92),
  ('compliance.required_disclosures', 'compliance', 'list', 'Required disclosures', false, false, true, 'superset_list', NULL, $cfg${"maxItems":10,"itemMaxLength":300}$cfg$::jsonb, 93)
ON CONFLICT (key) DO UPDATE SET section = EXCLUDED.section, field_type = EXCLUDED.field_type, label = EXCLUDED.label, required = EXCLUDED.required, workspace_only = EXCLUDED.workspace_only, default_lock = EXCLUDED.default_lock, tighten = EXCLUDED.tighten, owner_editable = EXCLUDED.owner_editable, rules = EXCLUDED.rules, sort_order = EXCLUDED.sort_order;
CREATE OR REPLACE FUNCTION public.config_profile_labels() RETURNS jsonb LANGUAGE sql IMMUTABLE AS $fn$ SELECT $cfg${"signals":{"has_budget":"They can afford it","existing_revenue":"They already have revenue","urgent_timeline":"They want to start soon","sole_decision_maker":"They can decide alone","has_team":"They have a team behind them","clear_pain":"The problem is costing them now","tried_alternatives":"They have tried other things","right_industry":"They are in a market you serve","other":"Something else"},"disqualifiers":{"no_budget":"No budget at all","pre_revenue":"Pre-revenue","wrong_industry":"An industry you do not serve","needs_partner_approval":"Cannot decide without a partner","seeking_employment":"Looking for a job, not a service","out_of_geography":"Outside the places you work","competitor":"A competitor","other":"Something else"},"channels":{"meta_ads":"Facebook or Instagram ads","google_ads":"Google ads","youtube_ads":"YouTube ads","tiktok_ads":"TikTok ads","organic_social":"Organic social","email_list":"Your email list","referral":"Referrals","affiliate":"Affiliates or partners","webinar":"Webinars or masterclasses","cold_outbound":"Cold outbound","podcast":"Podcast","seo":"Search and content","events":"Live events","other":"Something else"},"offer_types":{"coaching":"Coaching","consulting":"Consulting","agency_service":"Agency service","course":"Course or programme","software":"Software","done_for_you":"Done-for-you delivery","other":"Something else"},"objection_types":{"price":"Price","timing":"Timing","spouse_partner":"Needs a partner's agreement","trust":"Trust","fit":"Fit","competitor":"Looking at someone else","other":"Something else"}}$cfg$::jsonb $fn$;
CREATE OR REPLACE FUNCTION public.config_legacy_banned_terms() RETURNS text[] LANGUAGE sql IMMUTABLE AS $fn$ SELECT ARRAY['I hope this message finds you well', 'I hope you''re doing well', 'I wanted to reach out', 'just circling back', 'circling back', 'touching base', 'following up on our conversation', 'as we discussed', 'leverage', 'utilize', 'synergy', 'streamline', 'robust', 'seamless', 'journey', 'solution']::text[] $fn$;
SELECT public.config_seed_platform($cfg${"identity.timezone":"America/New_York","identity.business_hours":{"days":{"mon":[{"start":"08:00","end":"18:00"}],"tue":[{"start":"08:00","end":"18:00"}],"wed":[{"start":"08:00","end":"18:00"}],"thu":[{"start":"08:00","end":"18:00"}],"fri":[{"start":"08:00","end":"18:00"}],"sat":[],"sun":[]},"closures":[]},"identity.owners_can_edit_hours":false,"qualification.not_ready_criteria":[],"qualification.disqualifiers":[],"qualification.scoring_bands":[{"name":"Cold","min_score":0,"meaning":"Interested, but not ready to decide.","next_step":"Keep in touch with useful, low-pressure follow-up."},{"name":"Warm","min_score":40,"meaning":"Engaged, with some of what they need in place.","next_step":"Fill the gaps: timing, budget, and who decides."},{"name":"Hot","min_score":60,"meaning":"Ready to buy now.","next_step":"Call today and book the next step."}],"qualification.ready_threshold":60,"qualification.factor_weights":{"timeline":35,"investment_capacity":30,"decision_authority":20,"pain_severity":15},"qualification.minimum_info":[],"response.first_touch_minutes":15,"response.follow_up_cadence":[{"stage":"working","max_gap_hours":48},{"stage":"follow_up","max_gap_hours":72},{"stage":"objection_hold","max_gap_hours":72},{"stage":"no_show","max_gap_hours":24}],"response.after_hours":"keep_running","response.after_hours_window_minutes":120,"response.counted_touch_types":["call","text","email"],"response.relay_counts_as_human_touch":true,"response.warning_threshold_percent":75,"response.ghost_days_soft":14,"response.ghost_days_hard":30,"response.max_sequence_length":3,"response.max_sequence_days":21,"response.draft_stale_days":5,"response.quiet_lead_hours":48,"response.untouched_window_days":3,"response.no_show_window_days":7,"tone.formality":"casual","tone.use_contractions":true,"tone.sender_identity":"","tone.greeting":"","tone.sign_off":"","tone.sms_max_chars":240,"tone.email_max_chars":900,"tone.emoji":"never","tone.punctuation_rules":"","tone.language":"en-US","tone.preferred_terms":[],"tone.banned_terms":["I hope this message finds you well","I hope you're doing well","I wanted to reach out","just circling back","circling back","touching base","following up on our conversation","as we discussed","leverage","utilize","synergy","streamline","robust","seamless","journey","solution"],"tone.examples":[],"industry.business_description":"a business that sells through conversations with its leads","industry.urgency_signals":[],"industry.compass_questions":[{"question":"Which hot leads have not been contacted in the last two days?","audience":"managers"},{"question":"How did our response time look this week?","audience":"managers"},{"question":"What are the most common objections this month?","audience":"managers"},{"question":"Which drafts are waiting for approval?","audience":"managers"},{"question":"What should I follow up on first today?","audience":"operators"},{"question":"Which of my leads are at risk of missing their response window?","audience":"operators"}],"industry.objections":[],"industry.lead_sources":[],"escalation.levels":[{"severity":"warning","trigger":"A new lead has not had a first touch within the window.","after_windows":1,"notify":["assignee"],"channels":["push"]},{"severity":"urgent","trigger":"Still untouched at twice the window.","after_windows":2,"notify":["setters"],"channels":["push","team_channel"]},{"severity":"critical","trigger":"Still untouched at four times the window.","after_windows":4,"notify":["managers"],"channels":["push"]}],"escalation.quiet_hours":"outside_business_hours","escalation.urgent_exception":"critical","escalation.unacknowledged_minutes":60,"escalation.unacknowledged_next":"managers","approval.actions":[{"action":"first_reply","mode":"ask_first","approver":"owners_and_managers"},{"action":"quiet_lead_follow_up","mode":"ask_first","approver":"owners_and_managers"},{"action":"no_show_rebook","mode":"ask_first","approver":"owners_and_managers"},{"action":"client_report","mode":"ask_first","approver":"owners_and_managers"},{"action":"crm_stage_change","mode":"ask_first","approver":"owners_and_managers"},{"action":"setter_nudge","mode":"auto_run","approver":"owners_and_managers","auto_run_confirmed":true},{"action":"owner_escalation","mode":"auto_run","approver":"owners_and_managers","auto_run_confirmed":true},{"action":"slack_post","mode":"ask_first","approver":"owners_and_managers"},{"action":"discord_post","mode":"ask_first","approver":"owners_and_managers"},{"action":"drive_store","mode":"ask_first","approver":"owners_and_managers"},{"action":"send_text","mode":"ask_first","approver":"owners_and_managers"},{"action":"send_email","mode":"ask_first","approver":"owners_and_managers"},{"action":"create_asset","mode":"ask_first","approver":"owners_and_managers"}],"approval.never_auto":["first_reply","quiet_lead_follow_up","no_show_rebook","client_report","send_text","send_email"],"approval.timeout_minutes":240,"approval.timeout_behavior":"escalate","approval.timeout_proceed_confirmed":false,"integrations.crm":null,"integrations.messaging_numbers":[],"integrations.calendar":null,"integrations.email_domain":"","integrations.chat_channels":[],"integrations.file_folder":"Vistrial","sources.allowed":["call_transcripts","email","text_messages","forms","crm_notes"],"sources.retention_days":{"call_transcripts":365,"email":365,"text_messages":365,"forms":365,"crm_notes":365},"sources.agent_run_history_days":90,"sources.scribe_calls_per_hour":120,"sources.excluded":[],"sources.forsight_history_weeks":12,"sources.forsight_quiet_days":7,"sources.forsight_silent_days":14,"sources.forsight_long_silent_days":30,"sources.stellar_stage_labels":{"getting_set_up":"Getting set up","building_system":"Building your system","testing":"Testing","live":"Live","running_smoothly":"Running smoothly"},"operators.assignment_mode":"manual","operators.routing_fallback":"manual","operators.sticky_days":30,"operators.respect_hours":false,"operators.agent_tasks":"suggested","operators.claim_minutes":0,"operators.claim_auto":false,"operators.stale_reassign":"notify","operators.extra_permissions":[],"operators.summary_time":"start_of_day","operators.summary_confirmer":"operator","compliance.opt_out_words":[],"compliance.quiet_hours":{"start":"20:00","end":"08:00"},"compliance.quiet_hours_basis":"workspace","compliance.daily_cap_per_lead":2,"compliance.cap_applies_to":"auto_run_only","compliance.weekly_cap_per_lead":0,"compliance.required_disclosures":[]}$cfg$::jsonb, ARRAY['approval.never_auto', 'compliance.opt_out_words', 'compliance.quiet_hours', 'compliance.quiet_hours_basis', 'compliance.daily_cap_per_lead', 'compliance.cap_applies_to', 'compliance.weekly_cap_per_lead', 'compliance.required_disclosures']::text[], $cfg${"compliance.opt_out_words":["STOP","STOPALL","UNSUBSCRIBE","CANCEL","END","QUIT"],"compliance.cap_applies_to":"every_send","compliance.quiet_hours_basis":"lead_local","response.after_hours":"pause"}$cfg$::jsonb, 'Launch compliance rules, switched on deliberately: opt-out words stop all messages; the daily per-lead limit covers every send; quiet hours (8pm to 8am) follow the lead''s local time; and the first-touch clock pauses outside business hours.');
SELECT public.config_seed_template('med-spa', 'Med Spa', 'Injectables, facials, laser and skin treatments, body contouring, and memberships.', $cfg${"industry.business_description":"a med spa offering injectables, facials, laser and skin treatments, and body contouring","industry.offers":[{"name":"Injectables (wrinkle relaxers and fillers)","ticket_min":300,"ticket_max":1500,"recurring":false},{"name":"Facials and peels","ticket_min":150,"ticket_max":400,"recurring":false},{"name":"Laser and skin treatments","ticket_min":300,"ticket_max":2500,"recurring":false},{"name":"Body contouring","ticket_min":600,"ticket_max":4000,"recurring":false},{"name":"Membership","ticket_min":99,"ticket_max":299,"recurring":true}],"industry.case_facts":[{"key":"treatment_interest","label":"Treatment of interest","type":"text","required":true},{"key":"concern","label":"What they want to change","type":"text","required":false},{"key":"prior_treatments","label":"Treatments they have had before","type":"text","required":false},{"key":"timeline","label":"When they want it done","type":"text","required":true},{"key":"budget_comfort","label":"Budget they are comfortable with","type":"text","required":false},{"key":"consultation_preference","label":"In-person or virtual consultation","type":"text","required":false}],"industry.compass_questions":[{"question":"Which consultation leads have gone quiet for three days?","audience":"managers"},{"question":"Which hot leads have not been contacted in the last two days?","audience":"managers"},{"question":"How did our response time look this week?","audience":"managers"},{"question":"What are the most common objections from consultation leads this month?","audience":"managers"},{"question":"Which of my consultation leads should I follow up on first?","audience":"operators"},{"question":"Which of my leads are waiting on a reply?","audience":"operators"}],"industry.urgency_signals":["An upcoming event, like a wedding, holiday, or trip","As soon as possible","This week","Asks about a promotion before it ends","Asks for the next available appointment"],"industry.objections":[{"label":"Cost","category":"price","recognize":"\"How much is it?\", \"That's more than I thought\", \"Do you have payment plans?\"","guidance":"Give the price range plainly, explain what is included, and mention memberships or payment options if you offer them. Never discount under pressure."},{"label":"Nervous about the treatment","category":"trust","recognize":"\"Does it hurt?\", \"I'm worried it will look fake\", \"What if something goes wrong?\"","guidance":"Acknowledge the worry, explain what the treatment involves in simple terms, and offer a consultation to talk it through with the provider. Make no medical claims or promises about results."},{"label":"Timing","category":"timing","recognize":"\"Not right now\", \"Maybe after the holidays\", \"I'm too busy this month\"","guidance":"Ask whether there is an event or date they have in mind, and offer to hold a time that suits them."},{"label":"Trust in the provider","category":"trust","recognize":"\"Who does the treatment?\", \"Are they certified?\", \"Can I see before-and-after photos?\"","guidance":"Share the provider's credentials and experience, and point to reviews or a gallery. Offer a consultation to meet them first."},{"label":"Needs to think about it","category":"fit","recognize":"\"Let me think about it\", \"I'll get back to you\"","guidance":"Respect it. Offer one clear, easy next step, like a free consultation, and check in once without pressure."}],"industry.lead_sources":[{"source":"Website booking form","priority":"high","treatment":"Reply quickly; they already chose a time slot or treatment."},{"source":"Google search","priority":"high","treatment":"Usually ready to book. Lead with availability."},{"source":"Instagram or Facebook ads","priority":"normal","treatment":"Often browsing. Start with the treatment they clicked on."},{"source":"Referral from a client","priority":"high","treatment":"Mention who referred them and thank them."}],"qualification.ready_criteria":["Asks about a specific treatment or its price.","Asks about availability or the next open appointment.","Has had a consultation or treatment with us before.","Mentions an event or a date they want to look their best for."],"qualification.not_ready_criteria":["General browsing with no treatment in mind.","Asks only about price, with no interest in a specific treatment.","Says they are \"just looking\"."],"qualification.disqualifiers":[{"reason":"Lives outside the area we serve.","closing_message":"Thanks so much for reaching out. We only see clients in our local area, so we're not the right fit, but we hope you find someone wonderful nearby."},{"reason":"Below the minimum age for treatment.","closing_message":"Thank you for your interest. We can only treat clients who are 18 or older, so we're not able to book you in."},{"reason":"Wants a treatment we do not offer.","closing_message":"Thanks for asking. That's not a treatment we offer, so we'd rather point you to a specialist who does."}],"qualification.minimum_info":["treatment_interest","timeline"],"response.first_touch_minutes":5,"response.follow_up_cadence":[{"stage":"working","max_gap_hours":4},{"stage":"follow_up","max_gap_hours":24},{"stage":"objection_hold","max_gap_hours":24},{"stage":"no_show","max_gap_hours":4}],"response.ghost_days_soft":3,"response.ghost_days_hard":7,"response.max_sequence_days":7,"tone.formality":"friendly","tone.emoji":"sparing","tone.sms_max_chars":300,"tone.punctuation_rules":"At most one exclamation mark per message. No capitals for emphasis.","tone.preferred_terms":["consultation","treatment plan","provider","results vary"],"tone.banned_terms":["I hope this message finds you well","I hope you're doing well","I wanted to reach out","just circling back","circling back","touching base","following up on our conversation","as we discussed","leverage","utilize","synergy","streamline","robust","seamless","journey","solution","guaranteed results","cure","permanent","risk-free","pain-free","act now","last chance","limited time only"],"tone.examples":[{"channel":"sms","body":"Hi Jess, it's Maya from Glow Studio. We have a lip filler consultation open Thursday at 4. Would that work for you?"},{"channel":"email","body":"Thanks for asking about laser skin resurfacing. A short consultation lets our provider look at your skin and talk through what to expect, including downtime and cost. We have openings this week on Tuesday and Thursday afternoon. Would either suit you?"}]}$cfg$::jsonb);
SELECT public.config_seed_template('home-services', 'Home Services', 'Recurring and one-time jobs: cleaning, HVAC, roofing, lawn care, plumbing, pest control, remodeling.', $cfg${"industry.business_description":"a local home services company doing recurring and one-time jobs at people's homes","identity.business_hours":{"days":{"mon":[{"start":"07:00","end":"18:00"}],"tue":[{"start":"07:00","end":"18:00"}],"wed":[{"start":"07:00","end":"18:00"}],"thu":[{"start":"07:00","end":"18:00"}],"fri":[{"start":"07:00","end":"18:00"}],"sat":[{"start":"08:00","end":"14:00"}],"sun":[]},"closures":[]},"industry.offers":[{"name":"Recurring service (cleaning, lawn care, pest control)","ticket_min":100,"ticket_max":400,"recurring":true},{"name":"One-time job","ticket_min":150,"ticket_max":1500,"recurring":false},{"name":"Repair or emergency call-out","ticket_min":150,"ticket_max":800,"recurring":false},{"name":"Large project (roofing, HVAC replacement, remodeling)","ticket_min":3000,"ticket_max":40000,"recurring":false}],"industry.case_facts":[{"key":"service_type","label":"Service needed","type":"text","required":true},{"key":"property_type","label":"Property type (house, apartment, business)","type":"text","required":false},{"key":"property_size","label":"Property size","type":"text","required":false},{"key":"service_area","label":"Address or area","type":"text","required":true},{"key":"timing","label":"When they need it","type":"text","required":true},{"key":"frequency","label":"One-time or recurring","type":"text","required":false},{"key":"access_notes","label":"Access notes (gate code, pets, parking)","type":"text","required":false}],"industry.compass_questions":[{"question":"Which estimate requests have not been called back yet?","audience":"managers"},{"question":"How quickly did we reach new leads this week?","audience":"managers"},{"question":"Which leads went quiet after an estimate?","audience":"managers"},{"question":"What are the most common objections this month?","audience":"managers"},{"question":"Which of my leads need a call back today?","audience":"operators"},{"question":"Which of my leads are at risk of missing their response window?","audience":"operators"}],"industry.urgency_signals":["today","leak","flooding","broken","no heat","no AC","emergency","A move-in or move-out date"],"industry.objections":[{"label":"Price","category":"price","recognize":"\"That's expensive\", \"Can you do it cheaper?\"","guidance":"Explain what the price includes and why. Offer a smaller first job or a recurring rate if you have one. Do not undercut yourself to win the job."},{"label":"Availability","category":"timing","recognize":"\"When can you come?\", \"I need it sooner than that\"","guidance":"Give the earliest real date. If an emergency, say what you can do today."},{"label":"Trust and reviews","category":"trust","recognize":"\"Are you insured?\", \"Do you have reviews?\"","guidance":"Confirm licensing and insurance, and share where to read reviews."},{"label":"Getting other quotes","category":"competitor","recognize":"\"I'm getting a few quotes\", \"Someone else quoted less\"","guidance":"That's sensible. Make your quote easy to compare: what is included, warranty, and timing. Follow up once after a couple of days."},{"label":"Timing","category":"timing","recognize":"\"Not until next month\", \"After the holidays\"","guidance":"Offer to book a date now so they keep the slot, and set a reminder."}],"industry.lead_sources":[{"source":"Google local listing","priority":"high","treatment":"Usually needs help soon. Reply with the earliest date."},{"source":"Website quote form","priority":"high","treatment":"Confirm the job and the address, then give a time."},{"source":"Referral","priority":"high","treatment":"Mention who referred them."},{"source":"Lead marketplace (Angi, Thumbtack)","priority":"normal","treatment":"Reply fast; they contacted several companies."},{"source":"Flyers and door hangers","priority":"low","treatment":"Often price shopping. Lead with a clear starting price."}],"qualification.ready_criteria":["Described a specific job.","Gave an address or the area they are in.","Asked for a quote or a date.","Mentioned something urgent, like a leak or a broken system."],"qualification.not_ready_criteria":["Curious about prices in general.","Comparing many providers with no date in mind."],"qualification.disqualifiers":[{"reason":"Outside our service area.","closing_message":"Thanks for getting in touch. That address is outside the area we cover, so we can't help with this one. Sorry we couldn't be more useful."},{"reason":"A job type we do not offer.","closing_message":"Thanks for asking. That's not a job we do, but a specialist will be able to help."},{"reason":"Below our minimum job size.","closing_message":"Thanks for reaching out. That job is smaller than we usually take on, so we're not the best fit this time."}],"qualification.minimum_info":["service_type","service_area","timing"],"response.first_touch_minutes":10,"response.follow_up_cadence":[{"stage":"working","max_gap_hours":24},{"stage":"follow_up","max_gap_hours":48},{"stage":"objection_hold","max_gap_hours":48},{"stage":"no_show","max_gap_hours":24}],"response.ghost_days_soft":7,"response.ghost_days_hard":21,"response.max_sequence_days":14,"escalation.levels":[{"severity":"warning","trigger":"A new lead has not had a first touch within the window.","after_windows":1,"notify":["assignee"],"channels":["push"]},{"severity":"urgent","trigger":"Still untouched at twice the window.","after_windows":2,"notify":["setters"],"channels":["push","team_channel"]},{"severity":"critical","trigger":"Still untouched at four times the window.","after_windows":4,"notify":["managers"],"channels":["push"]},{"severity":"urgent","trigger":"A lead mentions an emergency, like a leak, flooding, or no heat.","notify":["assignee","managers"],"channels":["push","sms"]}],"tone.formality":"friendly","tone.sms_max_chars":200,"tone.email_max_chars":600,"tone.punctuation_rules":"Plain words and short sentences. No exclamation marks in quotes or prices.","tone.banned_terms":["I hope this message finds you well","I hope you're doing well","I wanted to reach out","just circling back","circling back","touching base","following up on our conversation","as we discussed","leverage","utilize","synergy","streamline","robust","seamless","journey","solution","kindly","do not hesitate","per our conversation"],"tone.examples":[{"channel":"sms","body":"Hi Dan, it's Luis from Northside Plumbing. We can be there tomorrow between 8 and 10 to look at the leak. Does that work?"},{"channel":"sms","body":"Thanks for the photos. A full gutter clean for a two-story house is usually $180 to $240. Want me to book you in for Saturday morning?"}]}$cfg$::jsonb);
SELECT public.config_seed_template('coaches-consultants', 'Coaches and Consultants', 'High-ticket programs, group programs, one-to-one coaching, and consulting engagements.', $cfg${"industry.business_description":"a high-ticket coaching or consulting business that sells through sales calls","industry.offers":[{"name":"High-ticket program","ticket_min":3000,"ticket_max":25000,"recurring":false},{"name":"Group program","ticket_min":500,"ticket_max":5000,"recurring":false},{"name":"One-to-one coaching","ticket_min":1000,"ticket_max":10000,"recurring":true},{"name":"Consulting engagement","ticket_min":5000,"ticket_max":50000,"recurring":false}],"industry.case_facts":[{"key":"stated_goal","label":"What they want to achieve","type":"text","required":true},{"key":"current_situation","label":"Where they are now","type":"text","required":false},{"key":"budget_range","label":"Budget range","type":"text","required":true},{"key":"decision_maker","label":"Who makes the decision","type":"text","required":true},{"key":"timeline","label":"When they want to start","type":"text","required":true},{"key":"previous_coaching","label":"Coaching or consulting they have had before","type":"text","required":false},{"key":"objections_raised","label":"Objections raised on the call","type":"text","required":false}],"industry.compass_questions":[{"question":"Which strategy-call leads went quiet after a good first call?","audience":"managers"},{"question":"Which hot leads have not had a follow-up in two days?","audience":"managers"},{"question":"How did our response time look this week?","audience":"managers"},{"question":"What objections came up most on sales calls this month?","audience":"managers"},{"question":"Which of my leads should I follow up on first today?","audience":"operators"},{"question":"Which of my booked calls need a reminder?","audience":"operators"}],"industry.urgency_signals":["A stated deadline","A launch date coming up","\"Ready to start\"","A recent trigger event, like losing a client or new funding"],"industry.objections":[{"label":"Price","category":"price","recognize":"\"It's a lot of money right now\", \"I can't justify that\"","guidance":"Tie the investment back to the goal they stated and what it is costing them to stay where they are. Offer a payment plan only if one exists."},{"label":"Timing","category":"timing","recognize":"\"Now's not the right time\", \"Maybe next quarter\"","guidance":"Ask what would need to be true for the timing to be right, and what waiting costs them."},{"label":"Needs to talk to a partner or team","category":"spouse_partner","recognize":"\"I need to talk to my partner\", \"I have to run it by my team\"","guidance":"Offer a short call with the other decision-maker, and send a one-page summary they can share."},{"label":"Skeptical about results","category":"trust","recognize":"\"How do I know this will work for me?\"","guidance":"Share a relevant client story with specifics, and be honest about what the program needs from them."},{"label":"Past bad experience","category":"trust","recognize":"\"I've done a program before and it didn't work\"","guidance":"Ask what went wrong, listen, and explain clearly how this differs. Never criticize the other provider."}],"industry.lead_sources":[{"source":"Referral","priority":"high","treatment":"Mention who referred them; trust is already there."},{"source":"Paid social ads","priority":"normal","treatment":"Confirm the problem they want solved before talking about the offer."},{"source":"Webinar or podcast","priority":"normal","treatment":"Reference what they watched or heard."},{"source":"Email list","priority":"normal","treatment":"They know you; ask what prompted them to reply now."}],"qualification.ready_criteria":["Has stated a clear problem and the goal they want.","Has acknowledged the budget.","The decision-maker is on the call.","Has stated a timeline for starting.","Has engaged with earlier touches."],"qualification.not_ready_criteria":["Curious, but with no clear goal.","No budget for this yet.","Needs approval from someone who is not on the call."],"qualification.disqualifiers":[{"reason":"Not at the right stage for the offer.","closing_message":"Thanks for the time today. Based on where you are right now, this isn't the right program yet. Here's what I'd focus on first, and I'm happy to talk again when you get there."},{"reason":"No decision-making authority, with no path to the person who has it.","closing_message":null},{"reason":"Unwilling to commit to the program format.","closing_message":"Thanks for being straight with me. The program only works with the full commitment, so it wouldn't be fair to take you on. I wish you the best with it."}],"qualification.minimum_info":["stated_goal","budget_range","decision_maker","timeline"],"response.first_touch_minutes":15,"response.follow_up_cadence":[{"stage":"working","max_gap_hours":48},{"stage":"follow_up","max_gap_hours":96},{"stage":"objection_hold","max_gap_hours":72},{"stage":"no_show","max_gap_hours":24}],"tone.formality":"friendly","tone.punctuation_rules":"Confident and plain. No hype, no exclamation marks in follow-ups after a call.","tone.banned_terms":["I hope this message finds you well","I hope you're doing well","I wanted to reach out","just circling back","circling back","touching base","following up on our conversation","as we discussed","leverage","utilize","synergy","streamline","robust","seamless","journey","solution","guaranteed","life-changing","secret","hack","only a few spots left"],"tone.examples":[{"channel":"sms","body":"Good talking today, Sam. You said the goal is 10 clients a month by March. I'll send the plan we walked through tonight; worth looking at before Thursday's call."},{"channel":"email","body":"Thanks for walking me through where the business is. You mentioned two things are holding growth back: no consistent lead flow and closing calls yourself. The program covers both, and the next step is a 20-minute call with your business partner so you can decide together. Does Thursday at 2 work?"}]}$cfg$::jsonb);
-- config-registry:end
