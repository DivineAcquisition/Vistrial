-- Workflows are the picture of a playbook. One graph, two views.
-- A draft box never sends. Publishing is the Owner's, except a platform template.
-- Older follow-up sequences stop once a workflow is published, so they do not run beside it.

ALTER TABLE public.workspace_flags DROP CONSTRAINT IF EXISTS workspace_flags_flag_check;
ALTER TABLE public.workspace_flags
  ADD CONSTRAINT workspace_flags_flag_check CHECK (flag IN ('agent_sidebar', 'workflows'));

CREATE TABLE IF NOT EXISTS public.playbooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES public.organizations (id) ON DELETE CASCADE,
  template_key text,
  area text NOT NULL DEFAULT 'sales',
  record_kind text NOT NULL DEFAULT 'lead',
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'proposed', 'pending_confirmation', 'published', 'paused', 'archived')),
  priority integer NOT NULL DEFAULT 100 CHECK (priority BETWEEN 1 AND 999),
  graph jsonb NOT NULL CHECK (jsonb_typeof(graph) = 'object'),
  snippets jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(snippets) = 'array'),
  origin text NOT NULL DEFAULT 'person' CHECK (origin IN ('person', 'compass', 'template')),
  drafted_by_label text,
  publish_note text,
  published_by uuid,
  published_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (org_id IS NOT NULL OR template_key IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS playbooks_org_status_idx ON public.playbooks (org_id, status);

CREATE TABLE IF NOT EXISTS public.playbook_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  playbook_id uuid NOT NULL REFERENCES public.playbooks (id) ON DELETE CASCADE,
  org_id uuid,
  version integer NOT NULL CHECK (version >= 1),
  note text NOT NULL CHECK (char_length(btrim(note)) BETWEEN 2 AND 500),
  graph jsonb NOT NULL,
  snippets jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (playbook_id, version)
);

CREATE TABLE IF NOT EXISTS public.playbook_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  playbook_id uuid NOT NULL REFERENCES public.playbooks (id) ON DELETE CASCADE,
  version integer NOT NULL,
  lead_id uuid NOT NULL,
  box_id text NOT NULL,
  workflow_name text NOT NULL DEFAULT '',
  step_label text NOT NULL DEFAULT '',
  next_label text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'needs_attention', 'finished')),
  end_reason text,
  acted boolean NOT NULL DEFAULT false,
  passes jsonb NOT NULL DEFAULT '{}'::jsonb,
  next_due_at timestamptz,
  step_entered_at timestamptz NOT NULL DEFAULT now(),
  relay_dedupe_key text,
  attention text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT playbook_enrollments_lead_fkey FOREIGN KEY (lead_id, org_id) REFERENCES public.leads (id, org_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS playbook_enrollments_one_active
  ON public.playbook_enrollments (playbook_id, lead_id)
  WHERE status IN ('active', 'paused', 'needs_attention');

CREATE INDEX IF NOT EXISTS playbook_enrollments_due_idx
  ON public.playbook_enrollments (org_id, status, next_due_at);

CREATE INDEX IF NOT EXISTS playbook_enrollments_box_idx
  ON public.playbook_enrollments (playbook_id, box_id, status);

CREATE TABLE IF NOT EXISTS public.playbook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  playbook_id uuid,
  enrollment_id uuid,
  lead_id uuid,
  box_id text,
  kind text NOT NULL CHECK (kind IN ('published', 'paused', 'resumed', 'archived', 'enrolled', 'advanced', 'take_over', 'skipped', 'attention', 'capped', 'restored')),
  note text,
  actor uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS playbook_events_org_idx ON public.playbook_events (org_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.workflow_managers (
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.org_members (id) ON DELETE CASCADE,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, member_id)
);

CREATE TABLE IF NOT EXISTS public.workflow_daily (
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  day date NOT NULL,
  drafts integer NOT NULL DEFAULT 0,
  tasks integer NOT NULL DEFAULT 0,
  routes integer NOT NULL DEFAULT 0,
  enrollments integer NOT NULL DEFAULT 0,
  cap_notified boolean NOT NULL DEFAULT false,
  PRIMARY KEY (org_id, day)
);

CREATE TABLE IF NOT EXISTS public.workflow_draws (
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  day date NOT NULL,
  full_runs integer NOT NULL DEFAULT 0,
  last_single_at timestamptz,
  PRIMARY KEY (org_id, day)
);

COMMENT ON TABLE public.playbooks IS
  'A sales workflow and its playbook step plan. The graph is the only copy of the steps.';
COMMENT ON TABLE public.playbook_enrollments IS
  'Where a lead is in a published workflow. No message text.';
COMMENT ON TABLE public.playbook_events IS
  'Audit of publish, pause, enroll, take over, and version changes. Identifiers and states only.';

CREATE OR REPLACE FUNCTION public.workflows_enabled(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_flags
    WHERE org_id = p_org_id AND flag = 'workflows' AND enabled
  );
$$;

CREATE OR REPLACE FUNCTION public.workflows_plan_allows(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT plan_id IN ('private_access', 'custom', 'internal', 'pilot')
    FROM public.billing_accounts WHERE org_id = p_org_id
  ), true);
$$;

CREATE OR REPLACE FUNCTION public.workflows_manage(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.workflows_enabled(p_org_id)
    AND public.workflows_plan_allows(p_org_id)
    AND (
      public.ws_access(p_org_id) = 'owner'
      OR public.ws_access(p_org_id) IN ('service_team', 'platform_admin')
      OR (
        public.ws_access(p_org_id) = 'member'
        AND EXISTS (
          SELECT 1 FROM public.workflow_managers m
          WHERE m.org_id = p_org_id AND m.member_id = public.user_member_id(p_org_id)
        )
      )
    );
$$;

REVOKE ALL ON FUNCTION public.workflows_enabled(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.workflows_plan_allows(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.workflows_manage(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.workflows_enabled(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.workflows_plan_allows(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.workflows_manage(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.playbooks_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('published', 'pending_confirmation')
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    IF coalesce(char_length(btrim(NEW.publish_note)), 0) < 2 THEN
      RAISE EXCEPTION 'Add a short note before this workflow can be published.';
    END IF;
  END IF;
  IF NEW.status = 'published' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'published') THEN
    IF NEW.org_id IS NULL THEN
      IF NOT public.is_platform_admin() AND auth.role() IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'Only a Platform Admin can publish a template.';
      END IF;
    ELSIF public.ws_access(NEW.org_id) IS DISTINCT FROM 'owner'
      AND NOT (
        public.ws_access(NEW.org_id) = 'member'
        AND EXISTS (
          SELECT 1 FROM public.workflow_managers m
          WHERE m.org_id = NEW.org_id AND m.member_id = public.user_member_id(NEW.org_id)
        )
      )
      AND auth.role() IS DISTINCT FROM 'service_role' THEN
      RAISE EXCEPTION 'The Owner publishes a workflow. A staff change waits for confirmation.';
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM 'published' THEN
      NEW.published_at := COALESCE(NEW.published_at, now());
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS playbooks_guard ON public.playbooks;
CREATE TRIGGER playbooks_guard
  BEFORE INSERT OR UPDATE ON public.playbooks
  FOR EACH ROW EXECUTE FUNCTION public.playbooks_guard();

CREATE OR REPLACE FUNCTION public.playbooks_record_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('published', 'pending_confirmation')
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status OR OLD.version IS DISTINCT FROM NEW.version) THEN
    INSERT INTO public.playbook_versions (playbook_id, org_id, version, note, graph, snippets, status, created_by)
    VALUES (NEW.id, NEW.org_id, NEW.version, COALESCE(NEW.publish_note, 'Published'), NEW.graph, NEW.snippets, NEW.status, auth.uid())
    ON CONFLICT (playbook_id, version) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS playbooks_record_version ON public.playbooks;
CREATE TRIGGER playbooks_record_version
  AFTER INSERT OR UPDATE ON public.playbooks
  FOR EACH ROW EXECUTE FUNCTION public.playbooks_record_version();

CREATE OR REPLACE FUNCTION public.playbook_enrollments_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_access text := public.ws_access(NEW.org_id);
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF v_access = 'operator' THEN
    IF TG_OP = 'INSERT' THEN
      RAISE EXCEPTION 'You cannot enroll a lead.';
    END IF;
    IF NEW.box_id IS DISTINCT FROM OLD.box_id OR NEW.version IS DISTINCT FROM OLD.version OR NEW.playbook_id IS DISTINCT FROM OLD.playbook_id THEN
      RAISE EXCEPTION 'You can take over or pause this lead. You cannot change the step.';
    END IF;
    IF NEW.status NOT IN ('paused', 'finished') THEN
      RAISE EXCEPTION 'You can take over or pause this lead.';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS playbook_enrollments_guard ON public.playbook_enrollments;
CREATE TRIGGER playbook_enrollments_guard
  BEFORE INSERT OR UPDATE ON public.playbook_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.playbook_enrollments_guard();

ALTER TABLE public.playbooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playbook_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playbook_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playbook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_managers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_draws ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.playbooks FROM PUBLIC, anon;
REVOKE ALL ON public.playbook_versions FROM PUBLIC, anon;
REVOKE ALL ON public.playbook_enrollments FROM PUBLIC, anon;
REVOKE ALL ON public.playbook_events FROM PUBLIC, anon;
REVOKE ALL ON public.workflow_managers FROM PUBLIC, anon;
REVOKE ALL ON public.workflow_daily FROM PUBLIC, anon;
REVOKE ALL ON public.workflow_draws FROM PUBLIC, anon;

GRANT SELECT, INSERT, UPDATE ON public.playbooks TO authenticated;
GRANT SELECT, INSERT ON public.playbook_versions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.playbook_enrollments TO authenticated;
GRANT SELECT, INSERT ON public.playbook_events TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.workflow_managers TO authenticated;
GRANT SELECT ON public.workflow_daily TO authenticated;
GRANT SELECT ON public.workflow_draws TO authenticated;
GRANT ALL ON public.playbooks TO service_role;
GRANT ALL ON public.playbook_versions TO service_role;
GRANT ALL ON public.playbook_enrollments TO service_role;
GRANT ALL ON public.playbook_events TO service_role;
GRANT ALL ON public.workflow_managers TO service_role;
GRANT ALL ON public.workflow_daily TO service_role;
GRANT ALL ON public.workflow_draws TO service_role;

DROP POLICY IF EXISTS playbooks_select ON public.playbooks;
CREATE POLICY playbooks_select ON public.playbooks FOR SELECT TO authenticated
  USING (
    (org_id IS NULL AND public.is_platform_admin())
    OR (
      org_id IS NOT NULL
      AND public.workflows_enabled(org_id)
      AND public.ws_access(org_id) IN ('owner', 'member', 'service_team', 'platform_admin')
    )
  );

DROP POLICY IF EXISTS playbooks_write ON public.playbooks;
CREATE POLICY playbooks_write ON public.playbooks FOR INSERT TO authenticated
  WITH CHECK (org_id IS NOT NULL AND public.workflows_manage(org_id));

DROP POLICY IF EXISTS playbooks_update ON public.playbooks;
CREATE POLICY playbooks_update ON public.playbooks FOR UPDATE TO authenticated
  USING (org_id IS NOT NULL AND public.workflows_manage(org_id))
  WITH CHECK (org_id IS NOT NULL AND public.workflows_manage(org_id));

DROP POLICY IF EXISTS playbook_versions_select ON public.playbook_versions;
CREATE POLICY playbook_versions_select ON public.playbook_versions FOR SELECT TO authenticated
  USING (org_id IS NOT NULL AND public.workflows_enabled(org_id) AND public.ws_access(org_id) IN ('owner', 'member', 'service_team', 'platform_admin'));

DROP POLICY IF EXISTS playbook_enrollments_select ON public.playbook_enrollments;
CREATE POLICY playbook_enrollments_select ON public.playbook_enrollments FOR SELECT TO authenticated
  USING (
    public.workflows_enabled(org_id)
    AND (
      public.ws_access(org_id) IN ('owner', 'member', 'service_team', 'platform_admin')
      OR (
        public.ws_access(org_id) = 'operator'
        AND public.ws_can_work_lead(org_id, lead_id)
      )
    )
  );

DROP POLICY IF EXISTS playbook_enrollments_update ON public.playbook_enrollments;
CREATE POLICY playbook_enrollments_update ON public.playbook_enrollments FOR UPDATE TO authenticated
  USING (
    public.workflows_enabled(org_id)
    AND (
      public.workflows_manage(org_id)
      OR (public.ws_access(org_id) = 'operator' AND public.ws_can_work_lead(org_id, lead_id))
    )
  )
  WITH CHECK (
    public.workflows_enabled(org_id)
    AND (
      public.workflows_manage(org_id)
      OR (public.ws_access(org_id) = 'operator' AND public.ws_can_work_lead(org_id, lead_id))
    )
  );

DROP POLICY IF EXISTS playbook_events_select ON public.playbook_events;
CREATE POLICY playbook_events_select ON public.playbook_events FOR SELECT TO authenticated
  USING (
    public.workflows_enabled(org_id)
    AND public.ws_access(org_id) IN ('owner', 'member', 'service_team', 'platform_admin')
  );

DROP POLICY IF EXISTS workflow_managers_all ON public.workflow_managers;
CREATE POLICY workflow_managers_all ON public.workflow_managers FOR ALL TO authenticated
  USING (public.ws_access(org_id) = 'owner')
  WITH CHECK (public.ws_access(org_id) = 'owner');

DROP POLICY IF EXISTS workflow_daily_select ON public.workflow_daily;
CREATE POLICY workflow_daily_select ON public.workflow_daily FOR SELECT TO authenticated
  USING (public.ws_access(org_id) IN ('owner', 'service_team', 'platform_admin'));

DROP POLICY IF EXISTS workflow_draws_select ON public.workflow_draws;
CREATE POLICY workflow_draws_select ON public.workflow_draws FOR SELECT TO authenticated
  USING (public.ws_access(org_id) IN ('owner', 'service_team', 'platform_admin'));

-- Relay learns one more reason to draft. It still only creates an approval.
ALTER TABLE public.relay_jobs DROP CONSTRAINT IF EXISTS relay_jobs_trigger_check;
ALTER TABLE public.relay_jobs ADD CONSTRAINT relay_jobs_trigger_check
  CHECK (trigger IN ('after_call', 'missed_window', 'sample', 'compass_request', 'assay_request', 'assay_no_show', 'workflow'));
ALTER TABLE public.relay_drafts DROP CONSTRAINT IF EXISTS relay_drafts_trigger_check;
ALTER TABLE public.relay_drafts ADD CONSTRAINT relay_drafts_trigger_check
  CHECK (trigger IN ('after_call', 'missed_window', 'follow_up', 'sample', 'compass_request', 'assay_request', 'assay_no_show', 'workflow'));
