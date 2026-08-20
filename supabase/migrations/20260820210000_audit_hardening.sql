-- Audit Check A hardening: role-aware writes, trigger-owned score cache,
-- and a non-secret setup-error column for CRM connection health.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.user_member_id(p_org_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id
  FROM public.org_members
  WHERE org_id = p_org_id
    AND user_id = auth.uid()
    AND active = true
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.user_member_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_member_id(uuid) TO authenticated, service_role;

-- Score cache and first-touch stamps are trigger-owned. Application roles
-- (including owner) cannot write them. Service-role ingest still cannot
-- forge the cache unless the sync trigger set the transaction GUC.
CREATE OR REPLACE FUNCTION public.protect_lead_protected_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('vistrial.allow_score_cache', true) IS DISTINCT FROM '1' THEN
    IF NEW.current_score IS DISTINCT FROM OLD.current_score
      OR NEW.lead_type IS DISTINCT FROM OLD.lead_type THEN
      RAISE EXCEPTION 'leads.current_score and lead_type are trigger-maintained';
    END IF;
  END IF;

  IF current_setting('vistrial.allow_touch_times', true) IS DISTINCT FROM '1' THEN
    IF NEW.first_human_touch_at IS DISTINCT FROM OLD.first_human_touch_at
      OR NEW.last_touch_at IS DISTINCT FROM OLD.last_touch_at THEN
      RAISE EXCEPTION 'leads touch timestamps are trigger-maintained';
    END IF;
  END IF;

  IF NEW.assigned_setter_id IS DISTINCT FROM OLD.assigned_setter_id
    OR NEW.assigned_closer_id IS DISTINCT FROM OLD.assigned_closer_id THEN
    IF auth.uid() IS NOT NULL
      AND NOT public.user_has_org_role(NEW.org_id, 'owner', 'admin') THEN
      RAISE EXCEPTION 'not authorized to reassign leads';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS leads_protect_cached_columns ON public.leads;
CREATE TRIGGER leads_protect_cached_columns
  BEFORE UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_lead_protected_columns();

CREATE OR REPLACE FUNCTION public.sync_lead_score()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_threshold integer;
BEGIN
  SELECT ready_threshold
  INTO v_threshold
  FROM public.score_configs
  WHERE org_id = NEW.org_id;

  PERFORM set_config('vistrial.allow_score_cache', '1', true);

  UPDATE public.leads
  SET
    current_score = NEW.total,
    lead_type = CASE
      WHEN v_threshold IS NOT NULL AND NEW.total >= v_threshold
        THEN 'ready_track'::public.lead_type
      ELSE 'nurture_track'::public.lead_type
    END
  WHERE id = NEW.lead_id
    AND org_id = NEW.org_id;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_lead_touch_times()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('vistrial.allow_touch_times', '1', true);

  UPDATE public.leads
  SET
    last_touch_at = GREATEST(
      COALESCE(last_touch_at, NEW.occurred_at),
      NEW.occurred_at
    ),
    first_human_touch_at = CASE
      WHEN NEW.type = 'human' AND NEW.direction = 'outbound' THEN
        LEAST(
          COALESCE(first_human_touch_at, NEW.occurred_at),
          NEW.occurred_at
        )
      ELSE first_human_touch_at
    END,
    ghost_approaching_at = NULL,
    status = CASE
      WHEN status = 'ghost' AND NEW.direction = 'inbound' THEN 'working'::public.lead_status
      ELSE status
    END
  WHERE id = NEW.lead_id
    AND org_id = NEW.org_id;

  UPDATE public.next_actions
  SET completed_at = now()
  WHERE lead_id = NEW.lead_id
    AND org_id = NEW.org_id
    AND kind = 'ghost_reengagement'
    AND completed_at IS NULL;

  RETURN NEW;
END;
$$;

-- Authenticated clients cannot PATCH the cache columns even if a policy
-- would otherwise allow the row.
REVOKE UPDATE ON public.leads FROM authenticated;
GRANT UPDATE (
  ghl_contact_id,
  ghl_opportunity_id,
  first_name,
  last_name,
  email,
  phone,
  source,
  campaign,
  ad_id,
  offer_name,
  application_answers,
  status,
  pipeline_stage,
  assigned_setter_id,
  assigned_closer_id,
  opted_in_at,
  ghost_approaching_at,
  updated_at
) ON public.leads TO authenticated;

REVOKE INSERT (
  current_score,
  lead_type,
  first_human_touch_at,
  last_touch_at
) ON public.leads FROM authenticated;
REVOKE UPDATE (
  current_score,
  lead_type,
  first_human_touch_at,
  last_touch_at
) ON public.leads FROM authenticated;

-- ---------------------------------------------------------------------------
-- Role-aware RLS: org isolation stays; setters/closers cannot mutate freely
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS leads_all ON public.leads;
DROP POLICY IF EXISTS readiness_scores_all ON public.readiness_scores;
DROP POLICY IF EXISTS touches_all ON public.touches;
DROP POLICY IF EXISTS calls_all ON public.calls;
DROP POLICY IF EXISTS call_extractions_all ON public.call_extractions;
DROP POLICY IF EXISTS objections_all ON public.objections;
DROP POLICY IF EXISTS next_actions_all ON public.next_actions;

CREATE POLICY leads_select
  ON public.leads
  FOR SELECT
  TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));

CREATE POLICY leads_insert_managers
  ON public.leads
  FOR INSERT
  TO authenticated
  WITH CHECK (public.user_has_org_role(org_id, 'owner', 'admin'));

CREATE POLICY leads_update_managers
  ON public.leads
  FOR UPDATE
  TO authenticated
  USING (public.user_has_org_role(org_id, 'owner', 'admin'))
  WITH CHECK (public.user_has_org_role(org_id, 'owner', 'admin'));

CREATE POLICY leads_update_assigned_setter
  ON public.leads
  FOR UPDATE
  TO authenticated
  USING (
    public.user_has_org_role(org_id, 'setter')
    AND assigned_setter_id = public.user_member_id(org_id)
  )
  WITH CHECK (
    public.user_has_org_role(org_id, 'setter')
    AND assigned_setter_id = public.user_member_id(org_id)
  );

CREATE POLICY leads_update_assigned_closer
  ON public.leads
  FOR UPDATE
  TO authenticated
  USING (
    public.user_has_org_role(org_id, 'closer')
    AND assigned_closer_id = public.user_member_id(org_id)
  )
  WITH CHECK (
    public.user_has_org_role(org_id, 'closer')
    AND assigned_closer_id = public.user_member_id(org_id)
  );

CREATE POLICY leads_delete_managers
  ON public.leads
  FOR DELETE
  TO authenticated
  USING (public.user_has_org_role(org_id, 'owner', 'admin'));

CREATE POLICY readiness_scores_select
  ON public.readiness_scores
  FOR SELECT
  TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));

CREATE POLICY readiness_scores_insert_managers
  ON public.readiness_scores
  FOR INSERT
  TO authenticated
  WITH CHECK (public.user_has_org_role(org_id, 'owner', 'admin'));

CREATE POLICY readiness_scores_insert_assigned
  ON public.readiness_scores
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.leads l
      WHERE l.id = lead_id
        AND l.org_id = readiness_scores.org_id
        AND (
          (
            public.user_has_org_role(l.org_id, 'setter')
            AND l.assigned_setter_id = public.user_member_id(l.org_id)
          )
          OR (
            public.user_has_org_role(l.org_id, 'closer')
            AND l.assigned_closer_id = public.user_member_id(l.org_id)
          )
        )
    )
  );

CREATE POLICY touches_select
  ON public.touches
  FOR SELECT
  TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));

CREATE POLICY touches_insert_managers
  ON public.touches
  FOR INSERT
  TO authenticated
  WITH CHECK (public.user_has_org_role(org_id, 'owner', 'admin'));

CREATE POLICY calls_select
  ON public.calls
  FOR SELECT
  TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));

CREATE POLICY calls_write_managers
  ON public.calls
  FOR ALL
  TO authenticated
  USING (public.user_has_org_role(org_id, 'owner', 'admin'))
  WITH CHECK (public.user_has_org_role(org_id, 'owner', 'admin'));

CREATE POLICY call_extractions_select
  ON public.call_extractions
  FOR SELECT
  TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));

CREATE POLICY call_extractions_write_managers
  ON public.call_extractions
  FOR ALL
  TO authenticated
  USING (public.user_has_org_role(org_id, 'owner', 'admin'))
  WITH CHECK (public.user_has_org_role(org_id, 'owner', 'admin'));

CREATE POLICY objections_select
  ON public.objections
  FOR SELECT
  TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));

CREATE POLICY objections_write_managers
  ON public.objections
  FOR ALL
  TO authenticated
  USING (public.user_has_org_role(org_id, 'owner', 'admin'))
  WITH CHECK (public.user_has_org_role(org_id, 'owner', 'admin'));

CREATE POLICY next_actions_select
  ON public.next_actions
  FOR SELECT
  TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));

CREATE POLICY next_actions_write_managers
  ON public.next_actions
  FOR ALL
  TO authenticated
  USING (public.user_has_org_role(org_id, 'owner', 'admin'))
  WITH CHECK (public.user_has_org_role(org_id, 'owner', 'admin'));

-- Connection status is safe for every member (tokens are still not granted).
DROP POLICY IF EXISTS ghl_connections_select ON public.ghl_connections;
CREATE POLICY ghl_connections_select
  ON public.ghl_connections
  FOR SELECT
  TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));

ALTER TABLE public.ghl_connections
  ADD COLUMN IF NOT EXISTS last_setup_error text;

GRANT SELECT (
  id,
  org_id,
  location_id,
  location_name,
  company_id,
  webhook_id,
  status,
  last_verified_at,
  last_refresh_error,
  last_setup_error,
  token_expires_at,
  created_at,
  updated_at
) ON public.ghl_connections TO authenticated;

CREATE OR REPLACE FUNCTION public.ghl_event_counts_24h(p_org_id uuid)
RETURNS TABLE(event_type text, n bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT event_type, count(*)::bigint AS n
  FROM public.webhook_events
  WHERE org_id = p_org_id
    AND source = 'ghl'
    AND received_at >= now() - interval '24 hours'
  GROUP BY event_type
$$;

REVOKE ALL ON FUNCTION public.ghl_event_counts_24h(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ghl_event_counts_24h(uuid) TO service_role;

