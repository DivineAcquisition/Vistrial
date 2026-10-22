-- Visual sales workflows, foundation.
--
-- A workflow is the graph form of a playbook step plan. The graph lives in one
-- place, playbook_versions.graph. The canvas and the list view both read it.
-- There is no second store of follow-up logic.
--
-- Also adds stage history (a record only: nothing fires from it, and nothing
-- is backfilled), per-lead enrollments, and a per-workspace switch (workspace_flags).
-- Publishing, enrolling and counting run on the server with the service role.

-- The per-workspace switch is a workspace_flags row, set by Vistrial staff and
-- logged, the same way as the agent sidebar. Off unless a row says on.
ALTER TABLE public.workspace_flags DROP CONSTRAINT IF EXISTS workspace_flags_flag_check;
ALTER TABLE public.workspace_flags ADD CONSTRAINT workspace_flags_flag_check
  CHECK (flag IN ('agent_sidebar', 'workflows'));

-- ---------------------------------------------------------------------------
-- Stage history
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.lead_stage_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  lead_id uuid NOT NULL,
  from_stage text,
  to_stage text,
  changed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lead_stage_history_lead_org_fkey FOREIGN KEY (lead_id, org_id)
    REFERENCES public.leads (id, org_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS lead_stage_history_lead_idx
  ON public.lead_stage_history (org_id, lead_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS lead_stage_history_stage_idx
  ON public.lead_stage_history (org_id, to_stage, changed_at DESC);

COMMENT ON TABLE public.lead_stage_history IS
  'Every stage change from the day this table existed. Never backfilled and never a trigger source for automation.';

CREATE OR REPLACE FUNCTION public.leads_record_stage_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.pipeline_stage IS NOT NULL THEN
      INSERT INTO public.lead_stage_history (org_id, lead_id, from_stage, to_stage)
      VALUES (NEW.org_id, NEW.id, NULL, NEW.pipeline_stage);
    END IF;
  ELSIF NEW.pipeline_stage IS DISTINCT FROM OLD.pipeline_stage THEN
    INSERT INTO public.lead_stage_history (org_id, lead_id, from_stage, to_stage)
    VALUES (NEW.org_id, NEW.id, OLD.pipeline_stage, NEW.pipeline_stage);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS leads_record_stage_change ON public.leads;
CREATE TRIGGER leads_record_stage_change
  AFTER INSERT OR UPDATE OF pipeline_stage ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.leads_record_stage_change();

REVOKE ALL ON FUNCTION public.leads_record_stage_change() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Playbooks and versions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.playbooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  record_type text NOT NULL DEFAULT 'lead' CHECK (record_type IN ('lead')),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 600),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'proposed', 'published', 'paused', 'archived')),
  priority integer NOT NULL DEFAULT 100,
  template_key text,
  published_version_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT playbooks_id_org_key UNIQUE (id, org_id)
);

CREATE INDEX IF NOT EXISTS playbooks_org_status_idx ON public.playbooks (org_id, status);

CREATE TABLE IF NOT EXISTS public.playbook_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  playbook_id uuid NOT NULL,
  version integer NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'proposed', 'pending_confirmation', 'published', 'superseded')),
  graph jsonb NOT NULL,
  note text NOT NULL DEFAULT '',
  drafted_by text NOT NULL DEFAULT 'person' CHECK (drafted_by IN ('person', 'compass', 'template')),
  created_by_member_id uuid REFERENCES public.org_members (id) ON DELETE SET NULL,
  published_by_member_id uuid REFERENCES public.org_members (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  UNIQUE (playbook_id, version),
  CONSTRAINT playbook_versions_playbook_fkey FOREIGN KEY (playbook_id, org_id)
    REFERENCES public.playbooks (id, org_id) ON DELETE CASCADE,
  CONSTRAINT playbook_versions_id_org_key UNIQUE (id, org_id),
  CONSTRAINT playbook_versions_graph_shape CHECK (
    jsonb_typeof(graph) = 'object'
    AND jsonb_typeof(graph -> 'boxes') = 'array'
    AND jsonb_typeof(graph -> 'edges') = 'array'
    AND jsonb_array_length(graph -> 'boxes') <= 40
  ),
  CONSTRAINT playbook_versions_publish_note CHECK (
    status NOT IN ('published', 'superseded') OR char_length(btrim(note)) > 0
  )
);

CREATE INDEX IF NOT EXISTS playbook_versions_playbook_idx
  ON public.playbook_versions (playbook_id, version DESC);

ALTER TABLE public.playbooks
  ADD CONSTRAINT playbooks_published_version_fkey
  FOREIGN KEY (published_version_id, org_id)
  REFERENCES public.playbook_versions (id, org_id) DEFERRABLE INITIALLY DEFERRED;

-- A published version never changes. Restoring an old one makes a new draft.
CREATE OR REPLACE FUNCTION public.playbook_versions_freeze()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.status IN ('published', 'superseded') THEN
    IF NEW.graph IS DISTINCT FROM OLD.graph
       OR NEW.note IS DISTINCT FROM OLD.note
       OR NEW.version IS DISTINCT FROM OLD.version
       OR NEW.playbook_id IS DISTINCT FROM OLD.playbook_id THEN
      RAISE EXCEPTION 'A published version cannot be edited. Restore it as a new draft.';
    END IF;
    IF OLD.status = 'superseded' AND NEW.status <> 'superseded' THEN
      RAISE EXCEPTION 'A replaced version cannot be published again. Restore it as a new draft.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS playbook_versions_freeze ON public.playbook_versions;
CREATE TRIGGER playbook_versions_freeze
  BEFORE UPDATE ON public.playbook_versions
  FOR EACH ROW EXECUTE FUNCTION public.playbook_versions_freeze();

-- At most 12 published workflows per workspace.
CREATE OR REPLACE FUNCTION public.playbooks_published_limit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'published' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'published') THEN
    IF (SELECT count(*) FROM public.playbooks
        WHERE org_id = NEW.org_id AND status = 'published' AND id <> NEW.id) >= 12 THEN
      RAISE EXCEPTION 'A workspace can have at most 12 published workflows.';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS playbooks_published_limit ON public.playbooks;
CREATE TRIGGER playbooks_published_limit
  BEFORE INSERT OR UPDATE ON public.playbooks
  FOR EACH ROW EXECUTE FUNCTION public.playbooks_published_limit();

-- ---------------------------------------------------------------------------
-- Enrollments
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.workflow_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  playbook_id uuid NOT NULL,
  version_id uuid NOT NULL,
  lead_id uuid NOT NULL,
  current_box_id text NOT NULL,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'needs_attention', 'ended')),
  entered_at timestamptz NOT NULL DEFAULT now(),
  box_entered_at timestamptz NOT NULL DEFAULT now(),
  next_due_at timestamptz,
  ended_at timestamptz,
  end_reason text,
  loop_passes jsonb NOT NULL DEFAULT '{}'::jsonb,
  enrolled_by text NOT NULL DEFAULT 'entry' CHECK (enrolled_by IN ('entry', 'person', 'bulk')),
  CONSTRAINT workflow_enrollments_playbook_fkey FOREIGN KEY (playbook_id, org_id)
    REFERENCES public.playbooks (id, org_id) ON DELETE CASCADE,
  CONSTRAINT workflow_enrollments_version_fkey FOREIGN KEY (version_id, org_id)
    REFERENCES public.playbook_versions (id, org_id),
  CONSTRAINT workflow_enrollments_lead_fkey FOREIGN KEY (lead_id, org_id)
    REFERENCES public.leads (id, org_id) ON DELETE CASCADE,
  CONSTRAINT workflow_enrollments_end_fields CHECK (
    (status = 'ended' AND ended_at IS NOT NULL AND end_reason IS NOT NULL)
    OR (status <> 'ended' AND ended_at IS NULL)
  )
);

-- One live enrollment per workflow and lead.
CREATE UNIQUE INDEX IF NOT EXISTS workflow_enrollments_one_live
  ON public.workflow_enrollments (playbook_id, lead_id) WHERE status <> 'ended';

CREATE INDEX IF NOT EXISTS workflow_enrollments_due_idx
  ON public.workflow_enrollments (next_due_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS workflow_enrollments_box_idx
  ON public.workflow_enrollments (org_id, playbook_id, current_box_id) WHERE status <> 'ended';
CREATE INDEX IF NOT EXISTS workflow_enrollments_lead_idx
  ON public.workflow_enrollments (org_id, lead_id);

-- At most two live enrollments per lead across workflows.
CREATE OR REPLACE FUNCTION public.workflow_enrollments_lead_limit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status <> 'ended' AND (
    SELECT count(*) FROM public.workflow_enrollments
    WHERE lead_id = NEW.lead_id AND org_id = NEW.org_id AND status <> 'ended' AND id <> NEW.id
  ) >= 2 THEN
    RAISE EXCEPTION 'A lead can be in at most 2 workflows at once.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS workflow_enrollments_lead_limit ON public.workflow_enrollments;
CREATE TRIGGER workflow_enrollments_lead_limit
  BEFORE INSERT OR UPDATE OF status ON public.workflow_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.workflow_enrollments_lead_limit();

-- ---------------------------------------------------------------------------
-- Access. Owners and admins read and draft. Publishing, enrolling and
-- counting are server work. Operators have no access to any of these tables.
-- ---------------------------------------------------------------------------

ALTER TABLE public.lead_stage_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playbooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playbook_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_enrollments ENABLE ROW LEVEL SECURITY;

CREATE POLICY lead_stage_history_read ON public.lead_stage_history
  FOR SELECT TO authenticated
  USING (public.user_has_org_role(org_id, 'owner', 'admin'));

CREATE POLICY playbooks_read ON public.playbooks
  FOR SELECT TO authenticated
  USING (public.user_has_org_role(org_id, 'owner', 'admin'));

CREATE POLICY playbooks_draft ON public.playbooks
  FOR INSERT TO authenticated
  WITH CHECK (public.user_has_org_role(org_id, 'owner', 'admin') AND status IN ('draft', 'proposed'));

CREATE POLICY playbooks_edit ON public.playbooks
  FOR UPDATE TO authenticated
  USING (public.user_has_org_role(org_id, 'owner', 'admin'))
  WITH CHECK (public.user_has_org_role(org_id, 'owner', 'admin'));

CREATE POLICY playbook_versions_read ON public.playbook_versions
  FOR SELECT TO authenticated
  USING (public.user_has_org_role(org_id, 'owner', 'admin'));

CREATE POLICY playbook_versions_draft ON public.playbook_versions
  FOR INSERT TO authenticated
  WITH CHECK (public.user_has_org_role(org_id, 'owner', 'admin') AND status IN ('draft', 'proposed'));

CREATE POLICY playbook_versions_edit ON public.playbook_versions
  FOR UPDATE TO authenticated
  USING (public.user_has_org_role(org_id, 'owner', 'admin') AND status IN ('draft', 'proposed'))
  WITH CHECK (public.user_has_org_role(org_id, 'owner', 'admin') AND status IN ('draft', 'proposed'));

CREATE POLICY workflow_enrollments_read ON public.workflow_enrollments
  FOR SELECT TO authenticated
  USING (public.user_has_org_role(org_id, 'owner', 'admin'));

REVOKE ALL ON public.lead_stage_history, public.playbooks, public.playbook_versions, public.workflow_enrollments
  FROM PUBLIC, anon;
GRANT SELECT ON public.lead_stage_history, public.workflow_enrollments TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.playbooks, public.playbook_versions TO authenticated;
GRANT ALL ON public.lead_stage_history, public.playbooks, public.playbook_versions, public.workflow_enrollments
  TO service_role;
