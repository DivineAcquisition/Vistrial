-- The configuration system: one product, many industries, no custom code.
--
-- Every value an agent or feature acts on resolves through three levels:
--
--   platform default  ->  industry template  ->  workspace override
--
-- A workspace override beats its template, which beats the platform default.
-- Overrides are sparse: a workspace stores only what differs, so later
-- template and default improvements still reach it. Locked fields come from
-- the level that locks them; compliance rules are locked at the platform and
-- can be tightened below it, never loosened.
--
-- Live workspaces never change silently. Each workspace is pinned to a version
-- of the platform default and of its template. Editing either creates review
-- notices showing exactly what would change for that workspace; until someone
-- accepts, the workspace keeps resolving against its pinned version. Locked
-- fields are the exception: they always come from the current version, so a
-- Platform Admin's change to a compliance rule applies everywhere at once,
-- with a record of who did it and why.
--
-- Every change to every level is versioned (who, when, what, why), and a
-- rollback writes a new version rather than erasing history.
--
-- The existing settings tables (score_configs, follow_up_settings,
-- org_voice_profiles, approval_gate_settings, approval_gate_actions, and the
-- workspace columns on organizations) stay. They become projections of the
-- effective configuration, written whenever it changes, so every existing
-- reader keeps working. Edits made through an existing screen are captured
-- back into the workspace's overrides, so the two can never disagree.
--
-- The field list, the platform default, and the three starting templates are
-- generated from src/lib/config (see the config-registry block below).

-- ---------------------------------------------------------------------------
-- 1. Tables.
-- ---------------------------------------------------------------------------

CREATE TABLE public.config_fields (
  key text PRIMARY KEY,
  section text NOT NULL,
  field_type text NOT NULL,
  label text NOT NULL,
  required boolean NOT NULL DEFAULT false,
  workspace_only boolean NOT NULL DEFAULT false,
  default_lock boolean NOT NULL DEFAULT false,
  tighten text,
  owner_editable text,
  rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order integer NOT NULL,
  CONSTRAINT config_fields_tighten_check CHECK (
    tighten IS NULL OR tighten IN ('lower_number', 'lower_number_zero_is_unlimited', 'superset_list', 'wider_window')
  ),
  CONSTRAINT config_fields_owner_editable_check CHECK (owner_editable IS NULL OR owner_editable IN ('always', 'when_allowed'))
);

COMMENT ON TABLE public.config_fields IS
  'Generated copy of the configuration registry (src/lib/config/registry.ts): the facts the database enforces itself. Edit the registry, not this table.';

CREATE TABLE public.config_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  status_changed_at timestamptz,
  status_changed_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_from_template_id uuid REFERENCES public.config_templates (id) ON DELETE SET NULL,
  created_from_org_id uuid REFERENCES public.organizations (id) ON DELETE SET NULL,
  CONSTRAINT config_templates_status_check CHECK (status IN ('draft', 'active', 'retired')),
  CONSTRAINT config_templates_slug_format CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,60}$'),
  CONSTRAINT config_templates_name_present CHECK (btrim(name) <> '')
);

COMMENT ON TABLE public.config_templates IS
  'Industry templates. Draft until a Platform Admin activates one; retired ones keep working for the workspaces on them but cannot be chosen for new ones.';

CREATE TABLE public.config_layers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  level text NOT NULL,
  template_id uuid REFERENCES public.config_templates (id) ON DELETE CASCADE,
  org_id uuid REFERENCES public.organizations (id) ON DELETE CASCADE,
  field_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  locked_keys text[] NOT NULL DEFAULT ARRAY[]::text[],
  version integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  CONSTRAINT config_layers_level_check CHECK (level IN ('platform', 'template', 'workspace')),
  CONSTRAINT config_layers_shape CHECK (
    (level = 'platform' AND template_id IS NULL AND org_id IS NULL)
    OR (level = 'template' AND template_id IS NOT NULL AND org_id IS NULL)
    OR (level = 'workspace' AND org_id IS NOT NULL AND template_id IS NULL)
  ),
  CONSTRAINT config_layers_values_object CHECK (jsonb_typeof(field_values) = 'object'),
  CONSTRAINT config_layers_workspace_unlocked CHECK (level <> 'workspace' OR cardinality(locked_keys) = 0)
);

COMMENT ON TABLE public.config_layers IS
  'The current values of each level: the one platform default, each template, and each workspace. Sparse: a level stores only what it sets. Written only through the config_* functions.';

CREATE UNIQUE INDEX config_layers_one_platform ON public.config_layers (level) WHERE level = 'platform';
CREATE UNIQUE INDEX config_layers_one_per_template ON public.config_layers (template_id) WHERE level = 'template';
CREATE UNIQUE INDEX config_layers_one_per_workspace ON public.config_layers (org_id) WHERE level = 'workspace';

CREATE TABLE public.config_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  layer_id uuid NOT NULL REFERENCES public.config_layers (id) ON DELETE CASCADE,
  level text NOT NULL,
  template_id uuid,
  org_id uuid,
  version integer NOT NULL,
  field_values jsonb NOT NULL,
  locked_keys text[] NOT NULL,
  changes jsonb NOT NULL DEFAULT '[]'::jsonb,
  note text,
  source text NOT NULL,
  changed_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  affected_org_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  CONSTRAINT config_versions_unique UNIQUE (layer_id, version),
  CONSTRAINT config_versions_source_check CHECK (
    source IN ('seed', 'launch', 'migration', 'edit', 'rollback', 'push', 'legacy_sync', 'owner_edit', 'create', 'switch')
  )
);

COMMENT ON TABLE public.config_versions IS
  'Every version of every level, with the field-by-field change, who made it, when, and why. Append-only: rollback writes a new version.';

CREATE INDEX config_versions_org_idx ON public.config_versions (org_id, changed_at DESC) WHERE org_id IS NOT NULL;
CREATE INDEX config_versions_template_idx ON public.config_versions (template_id, version DESC) WHERE template_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.config_versions_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM public.config_layers WHERE id = OLD.layer_id) THEN
    RETURN OLD; -- the level itself is being deleted (a workspace or template removed)
  END IF;
  -- A push records which workspaces it reached once, right after writing its version.
  IF TG_OP = 'UPDATE' AND cardinality(OLD.affected_org_ids) = 0
     AND (to_jsonb(NEW) - 'affected_org_ids') = (to_jsonb(OLD) - 'affected_org_ids') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Configuration history cannot be changed or deleted.' USING ERRCODE = '42501';
END;
$$;

CREATE TRIGGER config_versions_immutable
  BEFORE UPDATE OR DELETE ON public.config_versions
  FOR EACH ROW EXECUTE FUNCTION public.config_versions_immutable();

CREATE TABLE public.workspace_config_pins (
  org_id uuid PRIMARY KEY REFERENCES public.organizations (id) ON DELETE CASCADE,
  template_id uuid REFERENCES public.config_templates (id) ON DELETE RESTRICT,
  template_version integer,
  platform_version integer NOT NULL,
  auto_accept_while_onboarding boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  CONSTRAINT workspace_config_pins_template_version CHECK ((template_id IS NULL) = (template_version IS NULL))
);

COMMENT ON TABLE public.workspace_config_pins IS
  'Which version of the platform default and of its template each workspace resolves against. A template edit never moves a pin by itself; accepting a review notice does.';

CREATE TABLE public.config_review_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  level text NOT NULL,
  template_id uuid REFERENCES public.config_templates (id) ON DELETE CASCADE,
  from_version integer NOT NULL,
  to_version integer NOT NULL,
  changes jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  note text,
  postponed_until timestamptz,
  decided_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  CONSTRAINT config_review_notices_level_check CHECK (level IN ('platform', 'template')),
  CONSTRAINT config_review_notices_status_check CHECK (
    status IN ('pending', 'accepted', 'declined', 'postponed', 'superseded', 'auto_accepted', 'pushed')
  )
);

COMMENT ON TABLE public.config_review_notices IS
  'What a template or platform-default change would do to one workspace, after its overrides. Accepted, declined (remembered for that version), or postponed by its Service Team or a Platform Admin. Status pushed records a locked-field change applied by a Platform Admin.';

CREATE UNIQUE INDEX config_review_notices_one_per_version
  ON public.config_review_notices (org_id, level, COALESCE(template_id, '00000000-0000-0000-0000-000000000000'::uuid), to_version);
CREATE INDEX config_review_notices_open_idx ON public.config_review_notices (org_id) WHERE status IN ('pending', 'postponed');

CREATE TABLE public.config_readiness (
  org_id uuid PRIMARY KEY REFERENCES public.organizations (id) ON DELETE CASCADE,
  config_version text NOT NULL,
  ready boolean NOT NULL,
  missing jsonb NOT NULL DEFAULT '[]'::jsonb,
  problems jsonb NOT NULL DEFAULT '[]'::jsonb,
  test_run jsonb,
  checked_at timestamptz NOT NULL DEFAULT now(),
  checked_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  marked_ready_at timestamptz,
  marked_ready_by uuid REFERENCES auth.users (id) ON DELETE SET NULL
);

COMMENT ON TABLE public.config_readiness IS
  'The last go-live check for each workspace: which configuration version it judged, what was missing, and who marked it ready. Going live requires a passing check for the current version.';

-- What the legacy settings tables held before this migration, for the rollback.
CREATE TABLE public.config_migration_legacy (
  org_id uuid NOT NULL,
  table_name text NOT NULL,
  row_data jsonb NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.config_migration_legacy IS
  'Legacy settings rows as they were before the configuration system took over. Read only by the rollback.';

-- ---------------------------------------------------------------------------
-- 2. Who may read what. Every write goes through a config_* function.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ws_has_template_access()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    public.is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM public.platform_staff s
      WHERE s.user_id = auth.uid() AND s.active AND s.template_access
    ),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.ws_has_template_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ws_has_template_access() TO authenticated, service_role;

ALTER TABLE public.config_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.config_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.config_layers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.config_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_config_pins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.config_review_notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.config_readiness ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.config_migration_legacy ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  public.config_fields, public.config_templates, public.config_layers, public.config_versions,
  public.workspace_config_pins, public.config_review_notices, public.config_readiness,
  public.config_migration_legacy
FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE
  public.config_fields, public.config_templates, public.config_layers, public.config_versions,
  public.workspace_config_pins, public.config_review_notices, public.config_readiness
TO authenticated;

GRANT ALL ON TABLE
  public.config_fields, public.config_templates, public.config_layers, public.config_versions,
  public.workspace_config_pins, public.config_review_notices, public.config_readiness,
  public.config_migration_legacy
TO service_role;

-- Staff only. Customers never read configuration internals; owners get their
-- small subset through config_owner_view().
CREATE POLICY config_fields_select ON public.config_fields
  FOR SELECT TO authenticated USING (public.is_platform_staff());

CREATE POLICY config_templates_select ON public.config_templates
  FOR SELECT TO authenticated USING (public.is_platform_staff());

CREATE POLICY config_layers_select ON public.config_layers
  FOR SELECT TO authenticated USING (
    (level <> 'workspace' AND public.is_platform_staff())
    OR (level = 'workspace' AND public.ws_is_staff(org_id))
  );

CREATE POLICY config_versions_select ON public.config_versions
  FOR SELECT TO authenticated USING (
    (level <> 'workspace' AND public.is_platform_staff())
    OR (level = 'workspace' AND public.ws_is_staff(org_id))
  );

CREATE POLICY workspace_config_pins_select ON public.workspace_config_pins
  FOR SELECT TO authenticated USING (public.ws_is_staff(org_id));

CREATE POLICY config_review_notices_select ON public.config_review_notices
  FOR SELECT TO authenticated USING (public.ws_is_staff(org_id));

CREATE POLICY config_readiness_select ON public.config_readiness
  FOR SELECT TO authenticated USING (public.ws_is_staff(org_id));

-- ---------------------------------------------------------------------------
-- 3. Resolving and validating, in the database. These mirror
--    src/lib/config/resolve.ts and validate.ts so jobs that run inside the
--    database, the projection into the legacy tables, and the go-live check
--    all see the same answer the app does.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.config_time_minutes(p_value jsonb)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN jsonb_typeof(p_value) = 'string' AND (p_value #>> '{}') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    THEN split_part(p_value #>> '{}', ':', 1)::int * 60 + split_part(p_value #>> '{}', ':', 2)::int
  END;
$$;

-- The minutes of the day a quiet window covers (it may wrap past midnight).
CREATE OR REPLACE FUNCTION public.config_window_minutes(p_window jsonb)
RETURNS SETOF integer
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_start integer := public.config_time_minutes(p_window -> 'start');
  v_end integer := public.config_time_minutes(p_window -> 'end');
BEGIN
  IF v_start IS NULL OR v_end IS NULL OR v_start = v_end THEN
    RETURN;
  ELSIF v_start < v_end THEN
    RETURN QUERY SELECT generate_series(v_start, v_end - 1);
  ELSE
    RETURN QUERY SELECT generate_series(v_start, 1439) UNION ALL SELECT generate_series(0, v_end - 1);
  END IF;
END;
$$;

-- Whether p_candidate is at least as strict as p_baseline under a tighten rule.
CREATE OR REPLACE FUNCTION public.config_is_stricter(p_rule text, p_baseline jsonb, p_candidate jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_baseline IS NULL OR jsonb_typeof(p_baseline) = 'null' THEN
    RETURN true;
  END IF;
  IF p_candidate IS NULL OR jsonb_typeof(p_candidate) = 'null' THEN
    RETURN false;
  END IF;
  CASE p_rule
    WHEN 'lower_number' THEN
      RETURN jsonb_typeof(p_candidate) = 'number' AND jsonb_typeof(p_baseline) = 'number'
        AND (p_candidate #>> '{}')::numeric <= (p_baseline #>> '{}')::numeric;
    WHEN 'lower_number_zero_is_unlimited' THEN
      IF jsonb_typeof(p_candidate) <> 'number' OR jsonb_typeof(p_baseline) <> 'number' THEN
        RETURN false;
      END IF;
      IF (p_baseline #>> '{}')::numeric = 0 THEN
        RETURN true;
      END IF;
      RETURN (p_candidate #>> '{}')::numeric <> 0 AND (p_candidate #>> '{}')::numeric <= (p_baseline #>> '{}')::numeric;
    WHEN 'superset_list' THEN
      IF jsonb_typeof(p_candidate) <> 'array' OR jsonb_typeof(p_baseline) <> 'array' THEN
        RETURN false;
      END IF;
      RETURN NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(p_baseline) b(item)
        WHERE lower(btrim(b.item)) NOT IN (
          SELECT lower(btrim(c.item)) FROM jsonb_array_elements_text(p_candidate) c(item)
        )
      );
    WHEN 'wider_window' THEN
      IF NOT EXISTS (SELECT 1 FROM public.config_window_minutes(p_candidate)) THEN
        RETURN false;
      END IF;
      RETURN NOT EXISTS (
        SELECT m FROM public.config_window_minutes(p_baseline) m
        EXCEPT
        SELECT m FROM public.config_window_minutes(p_candidate) m
      );
    ELSE
      RETURN false;
  END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION public.config_looks_like_secret(p_value jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM jsonb_path_query(COALESCE(p_value, 'null'::jsonb), 'strict $.**') AS node(v)
    WHERE jsonb_typeof(node.v) = 'string'
      AND (
        (node.v #>> '{}') ~ '(sk|pk|rk)_(live|test)_[A-Za-z0-9]{8,}'
        OR (node.v #>> '{}') ~ 'xox[abprs]-[A-Za-z0-9-]{8,}'
        OR (node.v #>> '{}') ~* 'hooks\.slack\.com/services/'
        OR (node.v #>> '{}') ~* 'discord(app)?\.com/api/webhooks/'
        OR (node.v #>> '{}') ~ '-----BEGIN [A-Z ]*PRIVATE KEY-----'
        OR (node.v #>> '{}') ~ 'eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}'
        OR (node.v #>> '{}') ~ 'AKIA[0-9A-Z]{16}'
        OR (node.v #>> '{}') ~ 'gh[pousr]_[A-Za-z0-9]{20,}'
        OR (node.v #>> '{}') ~ 'AIza[0-9A-Za-z_-]{30,}'
      )
  );
$$;

-- One field's own value. NULL when it is fine; otherwise a plain sentence.
CREATE OR REPLACE FUNCTION public.config_validate_value(p_key text, p_value jsonb)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  f public.config_fields%ROWTYPE;
  r jsonb;
  v_type text := jsonb_typeof(p_value);
  v_label text;
  v_num numeric;
  v_len integer;
  v_item jsonb;
  v_col jsonb;
  v_cell jsonb;
  v_day text;
  v_iv jsonb;
  v_open integer := 0;
  v_seen text[] := ARRAY[]::text[];
  v_id text;
BEGIN
  SELECT * INTO f FROM public.config_fields WHERE key = p_key;
  IF NOT FOUND THEN
    RETURN format('"%s" is not a setting Vistrial knows about.', p_key);
  END IF;
  IF p_value IS NULL OR v_type = 'null' THEN
    RETURN NULL;
  END IF;
  r := f.rules;
  v_label := format('"%s"', f.label);
  IF public.config_looks_like_secret(p_value) THEN
    RETURN 'This looks like a password, key, or private link. Connect the service on the Integrations page instead.';
  END IF;

  CASE f.field_type
    WHEN 'text', 'long_text' THEN
      IF v_type <> 'string' THEN RETURN v_label || ' must be text.'; END IF;
      v_len := char_length(p_value #>> '{}');
      IF r ? 'maxLength' AND v_len > (r ->> 'maxLength')::int THEN
        RETURN format('%s is too long. Keep it under %s characters.', v_label, r ->> 'maxLength');
      END IF;
      IF r ? 'minLength' AND char_length(btrim(p_value #>> '{}')) > 0 AND char_length(btrim(p_value #>> '{}')) < (r ->> 'minLength')::int THEN
        RETURN format('%s is too short. Use at least %s characters.', v_label, r ->> 'minLength');
      END IF;
      IF r ? 'pattern' AND (p_value #>> '{}') !~ (r ->> 'pattern') THEN
        RETURN v_label || ' is not in the expected format.';
      END IF;
    WHEN 'number', 'duration' THEN
      IF v_type <> 'number' THEN RETURN 'Enter a number for ' || v_label || '.'; END IF;
      v_num := (p_value #>> '{}')::numeric;
      IF COALESCE((r ->> 'integer')::boolean, false) AND v_num <> trunc(v_num) THEN
        RETURN 'Use a whole number for ' || v_label || '.';
      END IF;
      IF (r ? 'min' AND v_num < (r ->> 'min')::numeric) OR (r ? 'max' AND v_num > (r ->> 'max')::numeric) THEN
        RETURN format('Enter a number from %s to %s for %s.', COALESCE(r ->> 'min', 'any'), COALESCE(r ->> 'max', 'any'), v_label);
      END IF;
    WHEN 'boolean' THEN
      IF v_type <> 'boolean' THEN RETURN v_label || ' must be yes or no.'; END IF;
    WHEN 'choice' THEN
      IF v_type <> 'string' THEN RETURN 'Choose an option for ' || v_label || '.'; END IF;
      IF COALESCE((r ->> 'timezone')::boolean, false) THEN
        IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = p_value #>> '{}') THEN
          RETURN v_label || ': choose a time zone from the list, like America/Chicago.';
        END IF;
      ELSIF NOT (r -> 'options') ? (p_value #>> '{}') THEN
        RETURN 'Choose one of the listed options for ' || v_label || '.';
      END IF;
    WHEN 'multi_choice' THEN
      IF v_type <> 'array' THEN RETURN 'Choose options for ' || v_label || '.'; END IF;
      IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_value) e(v)
                 WHERE jsonb_typeof(e.v) <> 'string' OR NOT (r -> 'options') ? (e.v #>> '{}')) THEN
        RETURN 'Choose only listed options for ' || v_label || '.';
      END IF;
      IF (SELECT count(*) FROM jsonb_array_elements_text(p_value)) <> (SELECT count(DISTINCT x) FROM jsonb_array_elements_text(p_value) x) THEN
        RETURN v_label || ' lists the same option twice.';
      END IF;
      IF r ? 'minItems' AND jsonb_array_length(p_value) < (r ->> 'minItems')::int THEN
        RETURN format('Choose at least %s for %s.', r ->> 'minItems', v_label);
      END IF;
    WHEN 'list' THEN
      IF v_type <> 'array' THEN RETURN v_label || ' must be a list.'; END IF;
      IF r ? 'minItems' AND jsonb_array_length(p_value) < (r ->> 'minItems')::int THEN
        RETURN format('Add at least %s entries to %s.', r ->> 'minItems', v_label);
      END IF;
      IF r ? 'maxItems' AND jsonb_array_length(p_value) > (r ->> 'maxItems')::int THEN
        RETURN format('%s can hold at most %s entries.', v_label, r ->> 'maxItems');
      END IF;
      FOR v_item IN SELECT e FROM jsonb_array_elements(p_value) e LOOP
        IF r ? 'itemFields' THEN
          IF jsonb_typeof(v_item) <> 'object' THEN
            RETURN 'An entry in ' || v_label || ' is not filled in correctly.';
          END IF;
          FOR v_col IN SELECT c FROM jsonb_array_elements(r -> 'itemFields') c LOOP
            v_cell := v_item -> (v_col ->> 'key');
            IF v_cell IS NULL OR jsonb_typeof(v_cell) = 'null' OR (jsonb_typeof(v_cell) = 'string' AND btrim(v_cell #>> '{}') = '') THEN
              IF COALESCE((v_col ->> 'required')::boolean, false) THEN
                RETURN format('Every entry in %s needs "%s".', v_label, v_col ->> 'key');
              END IF;
              CONTINUE;
            END IF;
            IF v_col ->> 'type' = 'choice' AND NOT (v_col -> 'options') ? (v_cell #>> '{}') THEN
              RETURN format('An entry in %s has an option that is not on the list.', v_label);
            END IF;
            IF v_col ->> 'type' IN ('number', 'duration') THEN
              IF jsonb_typeof(v_cell) <> 'number' THEN
                RETURN format('An entry in %s needs a number for "%s".', v_label, v_col ->> 'key');
              END IF;
              IF (v_col ? 'min' AND (v_cell #>> '{}')::numeric < (v_col ->> 'min')::numeric)
                 OR (v_col ? 'max' AND (v_cell #>> '{}')::numeric > (v_col ->> 'max')::numeric) THEN
                RETURN format('An entry in %s has a number out of range for "%s".', v_label, v_col ->> 'key');
              END IF;
            END IF;
            IF v_col ->> 'type' IN ('text', 'long_text') AND v_col ? 'maxLength'
               AND char_length(v_cell #>> '{}') > (v_col ->> 'maxLength')::int THEN
              RETURN format('An entry in %s is too long.', v_label);
            END IF;
          END LOOP;
          IF r ? 'uniqueBy' THEN
            v_id := lower(btrim(COALESCE(v_item ->> (r ->> 'uniqueBy'), '')));
            IF v_id <> '' AND v_id = ANY (v_seen) THEN
              RETURN format('%s lists the same entry twice.', v_label);
            END IF;
            v_seen := v_seen || v_id;
          END IF;
        ELSE
          IF jsonb_typeof(v_item) <> 'string' OR btrim(v_item #>> '{}') = '' THEN
            RETURN 'An entry in ' || v_label || ' is empty.';
          END IF;
          IF r ? 'itemMaxLength' AND char_length(v_item #>> '{}') > (r ->> 'itemMaxLength')::int THEN
            RETURN 'An entry in ' || v_label || ' is too long.';
          END IF;
          v_id := lower(btrim(v_item #>> '{}'));
          IF v_id = ANY (v_seen) THEN
            RETURN format('%s lists "%s" twice.', v_label, btrim(v_item #>> '{}'));
          END IF;
          v_seen := v_seen || v_id;
        END IF;
      END LOOP;
    WHEN 'schedule' THEN
      IF v_type <> 'object' OR jsonb_typeof(p_value -> 'days') <> 'object' THEN
        RETURN 'Set the hours for each day in ' || v_label || '.';
      END IF;
      FOREACH v_day IN ARRAY ARRAY['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] LOOP
        CONTINUE WHEN NOT (p_value -> 'days') ? v_day;
        IF jsonb_typeof(p_value -> 'days' -> v_day) <> 'array' THEN
          RETURN 'The hours for each day in ' || v_label || ' are not set correctly.';
        END IF;
        FOR v_iv IN SELECT e FROM jsonb_array_elements(p_value -> 'days' -> v_day) e LOOP
          IF public.config_time_minutes(v_iv -> 'start') IS NULL OR public.config_time_minutes(v_iv -> 'end') IS NULL THEN
            RETURN 'Use times like 09:00 in ' || v_label || '.';
          END IF;
          IF public.config_time_minutes(v_iv -> 'end') <= public.config_time_minutes(v_iv -> 'start') THEN
            RETURN 'In ' || v_label || ', each closing time must be after its opening time.';
          END IF;
        END LOOP;
        IF jsonb_array_length(p_value -> 'days' -> v_day) > 0 THEN
          v_open := v_open + 1;
        END IF;
      END LOOP;
      IF v_open = 0 THEN
        RETURN v_label || ' needs at least one open day.';
      END IF;
    WHEN 'key_value' THEN
      IF v_type <> 'object' THEN RETURN v_label || ' is not set correctly.'; END IF;
      IF r ? 'keys' AND EXISTS (SELECT 1 FROM jsonb_object_keys(p_value) k WHERE NOT (r -> 'keys') ? k) THEN
        RETURN v_label || ' has an entry Vistrial does not recognize.';
      END IF;
      IF r ->> 'valueType' = 'number' AND EXISTS (
        SELECT 1 FROM jsonb_each(p_value) e
        WHERE jsonb_typeof(e.value) <> 'null' AND (
          jsonb_typeof(e.value) <> 'number'
          OR (r ? 'min' AND (e.value #>> '{}')::numeric < (r ->> 'min')::numeric)
          OR (r ? 'max' AND (e.value #>> '{}')::numeric > (r ->> 'max')::numeric)
        )
      ) THEN
        RETURN format('Enter numbers from %s to %s in %s.', COALESCE(r ->> 'min', 'any'), COALESCE(r ->> 'max', 'any'), v_label);
      END IF;
      IF COALESCE(r ->> 'valueType', 'text') = 'text' AND EXISTS (
        SELECT 1 FROM jsonb_each(p_value) e WHERE jsonb_typeof(e.value) NOT IN ('string', 'null')
      ) THEN
        RETURN v_label || ' must be text.';
      END IF;
      IF COALESCE(r ->> 'valueType', 'text') = 'text' AND (p_value ->> 'email') IS NOT NULL AND (p_value ->> 'email') <> ''
         AND (p_value ->> 'email') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
        RETURN 'Enter a valid email address in ' || v_label || '.';
      END IF;
      IF COALESCE(r ->> 'valueType', 'text') = 'text' AND (p_value ->> 'phone') IS NOT NULL AND (p_value ->> 'phone') <> ''
         AND (p_value ->> 'phone') !~ '^\+?[0-9 ().-]{7,20}$' THEN
        RETURN 'Enter a phone number with digits only, like +1 555 123 4567, for ' || v_label || '.';
      END IF;
    WHEN 'reference' THEN
      IF v_type <> 'object' OR COALESCE(btrim(p_value ->> 'id'), '') = '' THEN
        RETURN 'Choose what ' || v_label || ' points to.';
      END IF;
      IF r ? 'referenceKinds' AND NOT (r -> 'referenceKinds') ? COALESCE(p_value ->> 'kind', '') THEN
        RETURN v_label || ' points to the wrong kind of thing.';
      END IF;
    WHEN 'time_window' THEN
      IF v_type <> 'object' OR public.config_time_minutes(p_value -> 'start') IS NULL OR public.config_time_minutes(p_value -> 'end') IS NULL THEN
        RETURN 'Use times like 20:00 and 08:00 for ' || v_label || '.';
      END IF;
      IF p_value -> 'start' = p_value -> 'end' THEN
        RETURN v_label || ' would cover the whole day or none of it. Use different start and end times.';
      END IF;
    ELSE
      RETURN v_label || ' has a type Vistrial does not recognize.';
  END CASE;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.config_value_empty(p_type text, p_value jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_value IS NULL OR jsonb_typeof(p_value) = 'null' THEN true
    WHEN p_type IN ('boolean', 'number', 'duration') THEN false
    WHEN jsonb_typeof(p_value) = 'string' THEN btrim(p_value #>> '{}') = ''
    WHEN jsonb_typeof(p_value) = 'array' THEN jsonb_array_length(p_value) = 0
    WHEN jsonb_typeof(p_value) = 'object' THEN NOT EXISTS (
      SELECT 1 FROM jsonb_each(p_value) e
      WHERE jsonb_typeof(e.value) <> 'null' AND NOT (jsonb_typeof(e.value) = 'string' AND btrim(e.value #>> '{}') = '')
    )
    ELSE false
  END;
$$;

-- The values of one level at one version, from history.
CREATE OR REPLACE FUNCTION public.config_layer_at(p_layer_id uuid, p_version integer)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object('values', v.field_values, 'locks', to_jsonb(v.locked_keys), 'version', v.version)
  FROM public.config_versions v
  WHERE v.layer_id = p_layer_id AND v.version = p_version;
$$;

/*
 * The three-level resolution, for any combination of levels. Each level is
 * {"values": {...}, "locks": [...], "version": n}. Locked fields take their
 * value and lock from the current level; everything else from the pinned one.
 */
CREATE OR REPLACE FUNCTION public.config_resolve(
  p_platform_pinned jsonb,
  p_platform_current jsonb,
  p_template_pinned jsonb,
  p_template_current jsonb,
  p_workspace jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  f record;
  v_values jsonb := '{}'::jsonb;
  v_sources jsonb := '{}'::jsonb;
  v_locked_at text;
  v_value jsonb;
  v_source text;
  v_tightened boolean;
  v_cand jsonb;
  v_level text;
  v_platform_locks jsonb := COALESCE(p_platform_current -> 'locks', '[]'::jsonb);
  v_template_locks jsonb := COALESCE(p_template_current -> 'locks', '[]'::jsonb);
BEGIN
  FOR f IN SELECT key, tighten FROM public.config_fields ORDER BY sort_order LOOP
    v_locked_at := CASE
      WHEN v_platform_locks ? f.key THEN 'platform'
      WHEN p_template_current IS NOT NULL AND v_template_locks ? f.key THEN 'template'
    END;
    v_tightened := false;

    IF v_locked_at IS NOT NULL THEN
      IF v_locked_at = 'platform' THEN
        v_value := p_platform_current -> 'values' -> f.key;
        v_source := 'platform';
      ELSE
        v_value := COALESCE(p_template_current -> 'values' -> f.key, p_platform_current -> 'values' -> f.key);
        v_source := CASE WHEN p_template_current -> 'values' ? f.key THEN 'template' ELSE 'platform' END;
      END IF;
      FOR v_level, v_cand IN
        SELECT lvl, val FROM (VALUES
          (1, 'template', CASE WHEN v_locked_at = 'platform' THEN p_template_current -> 'values' -> f.key END),
          (2, 'workspace', p_workspace -> 'values' -> f.key)
        ) AS c(ord, lvl, val)
        WHERE val IS NOT NULL
        ORDER BY ord
      LOOP
        IF f.tighten IS NOT NULL AND public.config_is_stricter(f.tighten, v_value, v_cand) THEN
          v_value := v_cand;
          v_source := v_level;
          v_tightened := true;
        END IF;
      END LOOP;
    ELSIF p_workspace -> 'values' ? f.key THEN
      v_value := p_workspace -> 'values' -> f.key;
      v_source := 'workspace';
    ELSIF p_template_pinned IS NOT NULL AND p_template_pinned -> 'values' ? f.key THEN
      v_value := p_template_pinned -> 'values' -> f.key;
      v_source := 'template';
    ELSIF p_platform_pinned -> 'values' ? f.key THEN
      v_value := p_platform_pinned -> 'values' -> f.key;
      v_source := 'platform';
    ELSE
      v_value := NULL;
      v_source := 'missing';
    END IF;

    IF v_value IS NOT NULL THEN
      v_values := v_values || jsonb_build_object(f.key, v_value);
    END IF;
    v_sources := v_sources || jsonb_build_object(
      f.key,
      jsonb_build_object('source', CASE WHEN v_value IS NULL THEN 'missing' ELSE v_source END, 'locked_at', v_locked_at, 'tightened', v_tightened)
    );
  END LOOP;
  RETURN jsonb_build_object('values', v_values, 'sources', v_sources);
END;
$$;

CREATE OR REPLACE FUNCTION public.config_platform_layer()
RETURNS public.config_layers
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.config_layers WHERE level = 'platform';
$$;

/*
 * A workspace's effective configuration, resolved against explicit versions
 * of the platform default and template (used to preview a change before it
 * is accepted). NULL versions mean the workspace's pinned ones.
 */
CREATE OR REPLACE FUNCTION public.config_effective_at(
  p_org_id uuid,
  p_platform_version integer DEFAULT NULL,
  p_template_id uuid DEFAULT NULL,
  p_template_version integer DEFAULT NULL,
  p_workspace_values jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pin public.workspace_config_pins%ROWTYPE;
  v_platform public.config_layers%ROWTYPE;
  v_template public.config_layers%ROWTYPE;
  v_ws public.config_layers%ROWTYPE;
  v_template_id uuid;
  v_template_version integer;
  v_platform_version integer;
  v_slug text;
  v_resolved jsonb;
BEGIN
  SELECT * INTO v_pin FROM public.workspace_config_pins WHERE org_id = p_org_id;
  v_platform := public.config_platform_layer();
  SELECT * INTO v_ws FROM public.config_layers WHERE level = 'workspace' AND org_id = p_org_id;

  v_platform_version := COALESCE(p_platform_version, v_pin.platform_version, v_platform.version);
  v_template_id := COALESCE(p_template_id, v_pin.template_id);
  IF v_template_id IS NOT NULL THEN
    SELECT * INTO v_template FROM public.config_layers WHERE level = 'template' AND template_id = v_template_id;
    SELECT slug INTO v_slug FROM public.config_templates WHERE id = v_template_id;
    v_template_version := COALESCE(
      p_template_version,
      CASE WHEN v_template_id = v_pin.template_id THEN v_pin.template_version END,
      v_template.version
    );
  END IF;

  v_resolved := public.config_resolve(
    public.config_layer_at(v_platform.id, v_platform_version),
    jsonb_build_object('values', v_platform.field_values, 'locks', to_jsonb(v_platform.locked_keys), 'version', v_platform.version),
    CASE WHEN v_template_id IS NOT NULL THEN public.config_layer_at(v_template.id, v_template_version) END,
    CASE WHEN v_template_id IS NOT NULL THEN
      jsonb_build_object('values', v_template.field_values, 'locks', to_jsonb(v_template.locked_keys), 'version', v_template.version)
    END,
    jsonb_build_object('values', COALESCE(p_workspace_values, v_ws.field_values, '{}'::jsonb))
  );

  RETURN v_resolved || jsonb_build_object(
    'version',
    format('p%s/%s.t:%s.w%s',
      v_platform_version, v_platform.version,
      CASE WHEN v_template_id IS NULL THEN 'none' ELSE format('%s@%s/%s', v_slug, v_template_version, v_template.version) END,
      COALESCE(v_ws.version, 0)),
    'template_id', v_template_id,
    'template_slug', v_slug
  );
END;
$$;

/*
 * The version stamp recorded on every run and draft. Matches versionStamp()
 * in src/lib/config/resolve.ts exactly, so the two can be compared.
 */
CREATE OR REPLACE FUNCTION public.config_version_stamp(p_org_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT format('p%s/%s.t:%s.w%s',
    COALESCE(pin.platform_version, plat.version), plat.version,
    CASE WHEN pin.template_id IS NULL THEN 'none'
         ELSE format('%s@%s/%s', t.slug, pin.template_version, tl.version) END,
    COALESCE(ws.version, 0))
  FROM public.config_layers plat
  LEFT JOIN public.workspace_config_pins pin ON pin.org_id = p_org_id
  LEFT JOIN public.config_templates t ON t.id = pin.template_id
  LEFT JOIN public.config_layers tl ON tl.level = 'template' AND tl.template_id = pin.template_id
  LEFT JOIN public.config_layers ws ON ws.level = 'workspace' AND ws.org_id = p_org_id
  WHERE plat.level = 'platform';
$$;

/*
 * The effective configuration for a workspace, for the staff working it and
 * for server code. Agents read this (through the app), never the raw levels.
 */
CREATE OR REPLACE FUNCTION public.config_effective(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.ws_end_user_request() AND NOT public.ws_is_staff(p_org_id) THEN
    RAISE EXCEPTION 'Configuration is managed by the Vistrial team.' USING ERRCODE = '42501';
  END IF;
  RETURN public.config_effective_at(p_org_id);
END;
$$;

-- Required fields with no value in a resolved configuration.
CREATE OR REPLACE FUNCTION public.config_missing_required(p_values jsonb, p_include_workspace_only boolean DEFAULT true)
RETURNS text[]
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(f.key ORDER BY f.sort_order), ARRAY[]::text[])
  FROM public.config_fields f
  WHERE f.required
    AND (p_include_workspace_only OR NOT f.workspace_only)
    AND public.config_value_empty(f.field_type, p_values -> f.key);
$$;

REVOKE ALL ON FUNCTION public.config_layer_at(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.config_platform_layer() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.config_effective_at(uuid, integer, uuid, integer, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.config_version_stamp(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.config_effective(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.config_layer_at(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.config_platform_layer() TO service_role;
GRANT EXECUTE ON FUNCTION public.config_effective_at(uuid, integer, uuid, integer, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.config_version_stamp(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.config_effective(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Writing. Every change goes through these functions: they check who may
--    make it, refuse invalid values and loosened locks, detect two people
--    editing at once, version the change, log it, and keep workspaces from
--    changing silently.
-- ---------------------------------------------------------------------------

-- Field-by-field difference between two sets of values.
CREATE OR REPLACE FUNCTION public.config_diff(p_before jsonb, p_after jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('key', k, 'before', p_before -> k, 'after', p_after -> k) ORDER BY k), '[]'::jsonb)
  FROM (
    SELECT jsonb_object_keys(COALESCE(p_before, '{}'::jsonb)) AS k
    UNION
    SELECT jsonb_object_keys(COALESCE(p_after, '{}'::jsonb))
  ) keys
  WHERE (p_before -> k) IS DISTINCT FROM (p_after -> k);
$$;

/*
 * Write a new version of one level. Internal: callers check permission and
 * validity first. Returns the new version, or the current one when nothing
 * changed (no empty versions).
 */
CREATE OR REPLACE FUNCTION public.config_write_layer(
  p_layer_id uuid,
  p_values jsonb,
  p_locks text[],
  p_source text,
  p_note text DEFAULT NULL,
  p_affected uuid[] DEFAULT ARRAY[]::uuid[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_layer public.config_layers%ROWTYPE;
  v_changes jsonb;
  v_lock_changes jsonb;
  v_locks text[] := ARRAY(SELECT DISTINCT unnest(COALESCE(p_locks, ARRAY[]::text[])) ORDER BY 1);
  v_version integer;
BEGIN
  SELECT * INTO v_layer FROM public.config_layers WHERE id = p_layer_id FOR UPDATE;
  v_changes := public.config_diff(v_layer.field_values, p_values);
  SELECT COALESCE(jsonb_agg(jsonb_build_object('key', k, 'lock', change) ORDER BY k), '[]'::jsonb)
  INTO v_lock_changes
  FROM (
    SELECT k, 'added' AS change FROM unnest(v_locks) k WHERE NOT k = ANY (v_layer.locked_keys)
    UNION ALL
    SELECT k, 'removed' FROM unnest(v_layer.locked_keys) k WHERE NOT k = ANY (v_locks)
  ) lock_changes;

  -- A template switch is always recorded, even when no override was dropped.
  IF jsonb_array_length(v_changes) = 0 AND jsonb_array_length(v_lock_changes) = 0 AND v_layer.version > 0 AND p_source <> 'switch' THEN
    RETURN v_layer.version;
  END IF;

  v_version := v_layer.version + 1;
  UPDATE public.config_layers
  SET field_values = p_values, locked_keys = v_locks, version = v_version, updated_at = now(), updated_by = auth.uid()
  WHERE id = p_layer_id;

  INSERT INTO public.config_versions (
    layer_id, level, template_id, org_id, version, field_values, locked_keys, changes, note, source, changed_by, affected_org_ids
  )
  VALUES (
    p_layer_id, v_layer.level, v_layer.template_id, v_layer.org_id, v_version, p_values, v_locks,
    v_changes || v_lock_changes, NULLIF(btrim(COALESCE(p_note, '')), ''), p_source, auth.uid(), COALESCE(p_affected, ARRAY[]::uuid[])
  );

  PERFORM public.ws_log(
    v_layer.org_id,
    'config.' || v_layer.level || '.' || p_source,
    'config_layers',
    p_layer_id::text,
    jsonb_build_object(
      'version', v_version,
      'template_id', v_layer.template_id,
      'fields', (SELECT COALESCE(jsonb_agg(c ->> 'key'), '[]'::jsonb) FROM jsonb_array_elements(v_changes || v_lock_changes) c),
      'note', NULLIF(btrim(COALESCE(p_note, '')), ''),
      'affected_workspaces', COALESCE(array_length(p_affected, 1), 0)
    )
  );
  RETURN v_version;
END;
$$;

-- Who may write a level: platform → Platform Admin; template → template access;
-- workspace → its staff, and never a closed workspace.
CREATE OR REPLACE FUNCTION public.config_require_writer(p_layer public.config_layers)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.ws_end_user_request() THEN
    RETURN;
  END IF;
  IF p_layer.level = 'platform' THEN
    PERFORM public.ws_require_platform_admin();
  ELSIF p_layer.level = 'template' THEN
    IF NOT public.ws_has_template_access() THEN
      RAISE EXCEPTION 'Only a Platform Admin, or a Vistrial team member with template access, can edit templates.' USING ERRCODE = '42501';
    END IF;
  ELSE
    PERFORM public.ws_require_staff(p_layer.org_id);
    IF EXISTS (SELECT 1 FROM public.organizations WHERE id = p_layer.org_id AND status = 'closed') THEN
      RAISE EXCEPTION 'This workspace is closed. Its configuration can be viewed but not changed.' USING ERRCODE = '42501';
    END IF;
  END IF;
END;
$$;

/*
 * Check a level's new values before saving: every key known, every value
 * valid, workspace-only fields only on workspaces, and locked fields only
 * tightened. Raises a plain-language error on the first problem.
 */
CREATE OR REPLACE FUNCTION public.config_check_values(p_layer public.config_layers, p_values jsonb, p_changed text[])
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text;
  v_error text;
  v_field public.config_fields%ROWTYPE;
  v_platform public.config_layers%ROWTYPE := public.config_platform_layer();
  v_template public.config_layers%ROWTYPE;
  v_inherited jsonb;
  v_locked boolean;
BEGIN
  IF p_layer.level = 'workspace' THEN
    SELECT tl.* INTO v_template
    FROM public.workspace_config_pins pin
    JOIN public.config_layers tl ON tl.level = 'template' AND tl.template_id = pin.template_id
    WHERE pin.org_id = p_layer.org_id;
    -- What this workspace would get with no overrides of its own.
    v_inherited := public.config_effective_at(p_layer.org_id, p_workspace_values => '{}'::jsonb) -> 'values';
  ELSIF p_layer.level = 'template' THEN
    v_inherited := v_platform.field_values;
  END IF;

  FOREACH v_key IN ARRAY p_changed LOOP
    SELECT * INTO v_field FROM public.config_fields WHERE key = v_key;
    IF NOT FOUND THEN
      RAISE EXCEPTION '"%" is not a setting Vistrial knows about.', v_key USING HINT = 'config_invalid';
    END IF;
    CONTINUE WHEN NOT p_values ? v_key;
    IF v_field.workspace_only AND p_layer.level <> 'workspace' THEN
      RAISE EXCEPTION '"%" belongs to each workspace and cannot be set in a template or the platform default.', v_field.label
        USING HINT = 'config_invalid';
    END IF;
    v_error := public.config_validate_value(v_key, p_values -> v_key);
    IF v_error IS NOT NULL THEN
      RAISE EXCEPTION '%', v_error USING HINT = 'config_invalid';
    END IF;
    v_locked := v_key = ANY (v_platform.locked_keys)
      OR (p_layer.level = 'workspace' AND v_template.id IS NOT NULL AND v_key = ANY (v_template.locked_keys));
    IF p_layer.level <> 'platform' AND v_locked THEN
      IF v_field.tighten IS NULL THEN
        RAISE EXCEPTION '"%" is locked above this level and cannot be changed here.', v_field.label USING HINT = 'config_locked';
      END IF;
      IF NOT public.config_is_stricter(v_field.tighten, v_inherited -> v_key, p_values -> v_key) THEN
        RAISE EXCEPTION '"%" is locked. It can be made stricter here, but not looser.', v_field.label USING HINT = 'config_locked';
      END IF;
    END IF;
  END LOOP;
END;
$$;

/*
 * Record a change to locked fields of the platform default or a template.
 * Locked fields always resolve from the current version, so the change is
 * already live everywhere; this notes it on every affected workspace, for
 * its Service Team, with who did it and why.
 */
CREATE OR REPLACE FUNCTION public.config_record_push(
  p_level text,
  p_template_id uuid,
  p_version integer,
  p_changes jsonb,
  p_note text
)
RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_orgs uuid[] := ARRAY[]::uuid[];
BEGIN
  FOR v_org IN
    SELECT pin.org_id FROM public.workspace_config_pins pin
    WHERE p_level = 'platform' OR pin.template_id = p_template_id
  LOOP
    INSERT INTO public.config_review_notices (org_id, level, template_id, from_version, to_version, changes, status, note, created_by, decided_by, decided_at)
    VALUES (v_org, p_level, p_template_id, p_version - 1, p_version, p_changes, 'pushed', p_note, auth.uid(), auth.uid(), now())
    ON CONFLICT DO NOTHING;
    PERFORM public.config_project_workspace(v_org);
    v_orgs := v_orgs || v_org;
  END LOOP;
  RETURN v_orgs;
END;
$$;

/*
 * After a template or platform-default edit: for each workspace on it, work
 * out exactly what would change for that workspace (its overrides win, so a
 * field it overrides produces no change). No change: the pin simply moves.
 * Onboarding with auto-accept: the pin moves and the notice records it.
 * Otherwise: a pending review notice, and the workspace stays as it is.
 */
CREATE OR REPLACE FUNCTION public.config_fanout(p_level text, p_template_id uuid, p_new_version integer)
RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pin public.workspace_config_pins%ROWTYPE;
  v_status public.workspace_status;
  v_before jsonb;
  v_after jsonb;
  v_changes jsonb;
  v_from integer;
  v_affected uuid[] := ARRAY[]::uuid[];
BEGIN
  FOR v_pin IN
    SELECT * FROM public.workspace_config_pins
    WHERE (p_level = 'platform') OR (template_id = p_template_id)
    FOR UPDATE
  LOOP
    v_from := CASE WHEN p_level = 'platform' THEN v_pin.platform_version ELSE v_pin.template_version END;
    CONTINUE WHEN v_from >= p_new_version;
    SELECT status INTO v_status FROM public.organizations WHERE id = v_pin.org_id;

    v_before := public.config_effective_at(v_pin.org_id) -> 'values';
    v_after := public.config_effective_at(
      v_pin.org_id,
      CASE WHEN p_level = 'platform' THEN p_new_version ELSE v_pin.platform_version END,
      v_pin.template_id,
      CASE WHEN p_level = 'template' THEN p_new_version ELSE v_pin.template_version END
    ) -> 'values';
    v_changes := public.config_diff(v_before, v_after);

    IF jsonb_array_length(v_changes) = 0
       OR (v_status = 'onboarding' AND v_pin.auto_accept_while_onboarding) THEN
      UPDATE public.workspace_config_pins
      SET platform_version = CASE WHEN p_level = 'platform' THEN p_new_version ELSE platform_version END,
          template_version = CASE WHEN p_level = 'template' THEN p_new_version ELSE template_version END,
          updated_at = now(), updated_by = auth.uid()
      WHERE org_id = v_pin.org_id;
      IF jsonb_array_length(v_changes) > 0 THEN
        INSERT INTO public.config_review_notices (org_id, level, template_id, from_version, to_version, changes, status, created_by, decided_at)
        VALUES (v_pin.org_id, p_level, p_template_id, v_from, p_new_version, v_changes, 'auto_accepted', auth.uid(), now())
        ON CONFLICT DO NOTHING;
        PERFORM public.config_project_workspace(v_pin.org_id);
        v_affected := v_affected || v_pin.org_id;
      END IF;
    ELSE
      UPDATE public.config_review_notices
      SET status = 'superseded', decided_at = now()
      WHERE org_id = v_pin.org_id AND level = p_level
        AND template_id IS NOT DISTINCT FROM p_template_id
        AND status IN ('pending', 'postponed') AND to_version < p_new_version;
      INSERT INTO public.config_review_notices (org_id, level, template_id, from_version, to_version, changes, status, created_by)
      VALUES (v_pin.org_id, p_level, p_template_id, v_from, p_new_version, v_changes, 'pending', auth.uid())
      ON CONFLICT DO NOTHING;
      v_affected := v_affected || v_pin.org_id;
    END IF;
  END LOOP;
  RETURN v_affected;
END;
$$;

/*
 * Save changes to one level. p_set holds new values (a JSON null removes the
 * value), p_unset keys to return to inherited, p_lock / p_unlock lock changes
 * (platform and templates only). p_expected_version detects two people
 * editing at once: if someone saved in between, nothing is written.
 */
CREATE OR REPLACE FUNCTION public.config_save_layer(
  p_layer_id uuid,
  p_expected_version integer,
  p_set jsonb DEFAULT '{}'::jsonb,
  p_unset text[] DEFAULT ARRAY[]::text[],
  p_lock text[] DEFAULT ARRAY[]::text[],
  p_unlock text[] DEFAULT ARRAY[]::text[],
  p_note text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_layer public.config_layers%ROWTYPE;
  v_values jsonb;
  v_locks text[];
  v_changed text[];
  v_locked_now text[];
  v_locked_changed text[];
  v_unlocked_changed text[];
  v_new_version integer;
  v_status public.workspace_status;
  v_missing_before text[];
  v_missing_after text[];
  v_affected uuid[];
  v_changes jsonb;
BEGIN
  SELECT * INTO v_layer FROM public.config_layers WHERE id = p_layer_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Those settings no longer exist.';
  END IF;
  PERFORM public.config_require_writer(v_layer);

  IF v_layer.version <> p_expected_version THEN
    RAISE EXCEPTION 'Someone else changed these settings while you were editing. Reload to see their changes, then make yours again.'
      USING HINT = 'config_conflict';
  END IF;

  IF v_layer.level = 'workspace' AND (cardinality(p_lock) > 0 OR cardinality(p_unlock) > 0) THEN
    RAISE EXCEPTION 'Workspaces cannot lock settings. Locks belong to templates and the platform default.';
  END IF;

  v_values := v_layer.field_values - COALESCE(p_unset, ARRAY[]::text[]);
  v_values := v_values || COALESCE((SELECT jsonb_object_agg(key, value) FROM jsonb_each(p_set) WHERE jsonb_typeof(value) <> 'null'), '{}'::jsonb);
  v_values := v_values - COALESCE(ARRAY(SELECT key FROM jsonb_each(p_set) WHERE jsonb_typeof(value) = 'null'), ARRAY[]::text[]);
  v_locks := ARRAY(SELECT DISTINCT k FROM unnest(v_layer.locked_keys || COALESCE(p_lock, ARRAY[]::text[])) k
                   WHERE NOT k = ANY (COALESCE(p_unlock, ARRAY[]::text[])));
  IF EXISTS (SELECT 1 FROM unnest(v_locks) k WHERE NOT EXISTS (SELECT 1 FROM public.config_fields WHERE key = k)) THEN
    RAISE EXCEPTION 'A locked setting is not one Vistrial knows about.';
  END IF;

  v_changed := ARRAY(SELECT c ->> 'key' FROM jsonb_array_elements(public.config_diff(v_layer.field_values, v_values)) c);
  PERFORM public.config_check_values(v_layer, v_values, v_changed);

  -- Locked rules apply everywhere at once, so changing one (or a lock itself)
  -- is a push: Platform Admin only, with a reason, and on its own.
  IF v_layer.level <> 'workspace' THEN
    v_locked_now := v_locks || CASE WHEN v_layer.level = 'template' THEN (public.config_platform_layer()).locked_keys ELSE ARRAY[]::text[] END;
    v_locked_changed := ARRAY(
      SELECT k FROM unnest(v_changed) k WHERE k = ANY (v_locked_now) OR k = ANY (v_layer.locked_keys)
      UNION SELECT k FROM unnest(COALESCE(p_lock, ARRAY[]::text[]) || COALESCE(p_unlock, ARRAY[]::text[])) k
    );
    v_unlocked_changed := ARRAY(SELECT k FROM unnest(v_changed) k WHERE NOT k = ANY (v_locked_changed));
    IF cardinality(v_locked_changed) > 0 THEN
      IF public.ws_end_user_request() THEN
        PERFORM public.ws_require_platform_admin();
      END IF;
      IF NULLIF(btrim(COALESCE(p_note, '')), '') IS NULL THEN
        RAISE EXCEPTION 'Changing a locked rule applies it to every workspace straight away. Add a note saying why.'
          USING HINT = 'config_push_needs_reason';
      END IF;
      IF cardinality(v_unlocked_changed) > 0 THEN
        RAISE EXCEPTION 'Save changes to locked rules on their own, so they can be applied everywhere with a reason. Save the other changes separately.'
          USING HINT = 'config_push_mixed';
      END IF;
    END IF;
  END IF;

  -- A live workspace never loses a required value: block the change instead.
  IF v_layer.level = 'workspace' THEN
    SELECT status INTO v_status FROM public.organizations WHERE id = v_layer.org_id;
    IF v_status = 'active' THEN
      v_missing_before := public.config_missing_required(public.config_effective_at(v_layer.org_id) -> 'values');
      v_missing_after := public.config_missing_required(
        public.config_effective_at(v_layer.org_id, p_workspace_values => v_values) -> 'values'
      );
      IF EXISTS (SELECT 1 FROM unnest(v_missing_after) k WHERE NOT k = ANY (v_missing_before)) THEN
        RAISE EXCEPTION 'This workspace is live, and this change would leave required settings empty: %. Fill them in, or move the workspace back to onboarding first.',
          (SELECT string_agg(f.label, ', ') FROM public.config_fields f WHERE f.key = ANY (v_missing_after) AND NOT f.key = ANY (v_missing_before))
          USING HINT = 'config_required_live';
      END IF;
    END IF;
  END IF;

  v_changes := public.config_diff(v_layer.field_values, v_values);
  v_new_version := public.config_write_layer(
    p_layer_id, v_values, v_locks,
    CASE WHEN v_layer.level <> 'workspace' AND cardinality(COALESCE(v_locked_changed, ARRAY[]::text[])) > 0 THEN 'push' ELSE 'edit' END,
    p_note
  );
  IF v_new_version = v_layer.version THEN
    RETURN v_new_version;
  END IF;

  IF v_layer.level = 'workspace' THEN
    PERFORM public.config_project_workspace(v_layer.org_id);
  ELSIF cardinality(COALESCE(v_locked_changed, ARRAY[]::text[])) > 0 THEN
    v_affected := public.config_record_push(v_layer.level, v_layer.template_id, v_new_version, v_changes, p_note);
    UPDATE public.config_versions SET affected_org_ids = v_affected WHERE layer_id = p_layer_id AND version = v_new_version;
  ELSE
    v_affected := public.config_fanout(v_layer.level, v_layer.template_id, v_new_version);
  END IF;
  RETURN v_new_version;
END;
$$;

/* Roll a level back to an earlier version. Writes a new version; history stays. */
CREATE OR REPLACE FUNCTION public.config_rollback_layer(p_layer_id uuid, p_to_version integer, p_note text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_layer public.config_layers%ROWTYPE;
  v_old public.config_versions%ROWTYPE;
  v_set jsonb;
  v_unset text[];
BEGIN
  SELECT * INTO v_layer FROM public.config_layers WHERE id = p_layer_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Those settings no longer exist.';
  END IF;
  PERFORM public.config_require_writer(v_layer);
  SELECT * INTO v_old FROM public.config_versions WHERE layer_id = p_layer_id AND version = p_to_version;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Version % does not exist.', p_to_version;
  END IF;
  v_set := v_old.field_values;
  v_unset := ARRAY(SELECT k FROM jsonb_object_keys(v_layer.field_values) k WHERE NOT v_old.field_values ? k);
  -- Through the normal save, so validation, locks, and review notices all apply.
  RETURN public.config_save_layer(
    p_layer_id, v_layer.version, v_set, v_unset,
    ARRAY(SELECT k FROM unnest(v_old.locked_keys) k WHERE NOT k = ANY (v_layer.locked_keys)),
    ARRAY(SELECT k FROM unnest(v_layer.locked_keys) k WHERE NOT k = ANY (v_old.locked_keys)),
    COALESCE(NULLIF(btrim(COALESCE(p_note, '')), ''), format('Rolled back to version %s.', p_to_version))
  );
END;
$$;

/* Accept, decline, or postpone a review notice. */
CREATE OR REPLACE FUNCTION public.config_decide_notice(
  p_notice_id uuid,
  p_decision text,
  p_note text DEFAULT NULL,
  p_postpone_days integer DEFAULT 7
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_notice public.config_review_notices%ROWTYPE;
BEGIN
  SELECT * INTO v_notice FROM public.config_review_notices WHERE id = p_notice_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That notice no longer exists.';
  END IF;
  IF public.ws_end_user_request() THEN
    PERFORM public.ws_require_staff(v_notice.org_id);
  END IF;
  IF v_notice.status NOT IN ('pending', 'postponed') THEN
    RAISE EXCEPTION 'This notice was already %.', v_notice.status;
  END IF;

  IF p_decision = 'accept' THEN
    UPDATE public.workspace_config_pins
    SET platform_version = CASE WHEN v_notice.level = 'platform' THEN GREATEST(platform_version, v_notice.to_version) ELSE platform_version END,
        template_version = CASE WHEN v_notice.level = 'template' AND template_id = v_notice.template_id
                                THEN GREATEST(template_version, v_notice.to_version) ELSE template_version END,
        updated_at = now(), updated_by = auth.uid()
    WHERE org_id = v_notice.org_id;
    UPDATE public.config_review_notices
    SET status = 'accepted', decided_by = auth.uid(), decided_at = now(), decision_note = NULLIF(btrim(COALESCE(p_note, '')), '')
    WHERE id = p_notice_id;
    UPDATE public.config_review_notices
    SET status = 'superseded', decided_at = now()
    WHERE org_id = v_notice.org_id AND level = v_notice.level AND template_id IS NOT DISTINCT FROM v_notice.template_id
      AND status IN ('pending', 'postponed') AND to_version < v_notice.to_version;
    PERFORM public.config_project_workspace(v_notice.org_id);
  ELSIF p_decision = 'decline' THEN
    UPDATE public.config_review_notices
    SET status = 'declined', decided_by = auth.uid(), decided_at = now(), decision_note = NULLIF(btrim(COALESCE(p_note, '')), '')
    WHERE id = p_notice_id;
  ELSIF p_decision = 'postpone' THEN
    UPDATE public.config_review_notices
    SET status = 'postponed', postponed_until = now() + make_interval(days => GREATEST(1, LEAST(COALESCE(p_postpone_days, 7), 90))),
        decided_by = auth.uid(), decided_at = now(), decision_note = NULLIF(btrim(COALESCE(p_note, '')), '')
    WHERE id = p_notice_id;
  ELSE
    RAISE EXCEPTION 'Choose accept, decline, or postpone.';
  END IF;

  PERFORM public.ws_log(v_notice.org_id, 'config.notice.' || p_decision, 'config_review_notices', p_notice_id::text,
    jsonb_build_object('level', v_notice.level, 'template_id', v_notice.template_id, 'to_version', v_notice.to_version));
END;
$$;

-- Templates ------------------------------------------------------------------

/*
 * A new draft template: blank, a copy of another template, or a workspace's
 * current effective configuration (minus its workspace-only details, and
 * storing only what differs from the platform default).
 */
CREATE OR REPLACE FUNCTION public.config_create_template(
  p_name text,
  p_slug text,
  p_description text DEFAULT '',
  p_from_template uuid DEFAULT NULL,
  p_from_org uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_layer uuid;
  v_values jsonb := '{}'::jsonb;
  v_locks text[] := ARRAY[]::text[];
  v_platform public.config_layers%ROWTYPE := public.config_platform_layer();
  v_effective jsonb;
BEGIN
  IF public.ws_end_user_request() AND NOT public.ws_has_template_access() THEN
    RAISE EXCEPTION 'Only a Platform Admin, or a Vistrial team member with template access, can create templates.' USING ERRCODE = '42501';
  END IF;
  IF p_from_template IS NOT NULL THEN
    SELECT field_values, locked_keys INTO v_values, v_locks
    FROM public.config_layers WHERE level = 'template' AND template_id = p_from_template;
  ELSIF p_from_org IS NOT NULL THEN
    IF public.ws_end_user_request() THEN
      PERFORM public.ws_require_staff(p_from_org);
    END IF;
    v_effective := public.config_effective_at(p_from_org) -> 'values';
    SELECT COALESCE(jsonb_object_agg(e.key, e.value), '{}'::jsonb) INTO v_values
    FROM jsonb_each(v_effective) e
    JOIN public.config_fields f ON f.key = e.key
    WHERE NOT f.workspace_only
      AND NOT e.key = ANY (v_platform.locked_keys)
      AND (v_platform.field_values -> e.key) IS DISTINCT FROM e.value;
  END IF;

  INSERT INTO public.config_templates (slug, name, description, status, created_by, created_from_template_id, created_from_org_id)
  VALUES (lower(btrim(p_slug)), btrim(p_name), COALESCE(btrim(p_description), ''), 'draft', auth.uid(), p_from_template, p_from_org)
  RETURNING id INTO v_id;
  INSERT INTO public.config_layers (level, template_id) VALUES ('template', v_id) RETURNING id INTO v_layer;
  PERFORM public.config_write_layer(v_layer, COALESCE(v_values, '{}'::jsonb), COALESCE(v_locks, ARRAY[]::text[]), 'create',
    CASE WHEN p_from_template IS NOT NULL THEN 'Copied from another template.'
         WHEN p_from_org IS NOT NULL THEN 'Created from a workspace''s configuration.'
         ELSE 'Created blank.' END);
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.config_update_template_details(p_template_id uuid, p_name text, p_description text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.ws_end_user_request() AND NOT public.ws_has_template_access() THEN
    RAISE EXCEPTION 'Only a Platform Admin, or a Vistrial team member with template access, can edit templates.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.config_templates SET name = btrim(p_name), description = COALESCE(btrim(p_description), '') WHERE id = p_template_id;
END;
$$;

/*
 * Activate or retire a template. Platform Admin only. Activating needs every
 * required setting a template can hold (with the platform default), all valid.
 */
CREATE OR REPLACE FUNCTION public.config_set_template_status(p_template_id uuid, p_status text, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_template public.config_layers%ROWTYPE;
  v_platform public.config_layers%ROWTYPE := public.config_platform_layer();
  v_resolved jsonb;
  v_missing text[];
  v_key text;
  v_error text;
BEGIN
  IF public.ws_end_user_request() THEN
    PERFORM public.ws_require_platform_admin();
  END IF;
  IF p_status NOT IN ('draft', 'active', 'retired') THEN
    RAISE EXCEPTION 'Choose draft, active, or retired.';
  END IF;
  SELECT * INTO v_template FROM public.config_layers WHERE level = 'template' AND template_id = p_template_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That template does not exist.';
  END IF;
  IF p_status = 'active' THEN
    v_resolved := public.config_resolve(
      jsonb_build_object('values', v_platform.field_values, 'locks', to_jsonb(v_platform.locked_keys)),
      jsonb_build_object('values', v_platform.field_values, 'locks', to_jsonb(v_platform.locked_keys)),
      jsonb_build_object('values', v_template.field_values, 'locks', to_jsonb(v_template.locked_keys)),
      jsonb_build_object('values', v_template.field_values, 'locks', to_jsonb(v_template.locked_keys)),
      jsonb_build_object('values', '{}'::jsonb)
    ) -> 'values';
    v_missing := public.config_missing_required(v_resolved, false);
    IF cardinality(v_missing) > 0 THEN
      RAISE EXCEPTION 'This template cannot be activated yet. Fill in: %.',
        (SELECT string_agg(label, ', ' ORDER BY sort_order) FROM public.config_fields WHERE key = ANY (v_missing))
        USING HINT = 'config_incomplete';
    END IF;
    FOR v_key IN SELECT jsonb_object_keys(v_template.field_values) LOOP
      v_error := public.config_validate_value(v_key, v_template.field_values -> v_key);
      IF v_error IS NOT NULL THEN
        RAISE EXCEPTION 'This template cannot be activated: %', v_error USING HINT = 'config_invalid';
      END IF;
    END LOOP;
  END IF;
  UPDATE public.config_templates
  SET status = p_status, status_changed_at = now(), status_changed_by = auth.uid()
  WHERE id = p_template_id;
  PERFORM public.ws_log(NULL, 'config.template.' || p_status, 'config_templates', p_template_id::text,
    jsonb_build_object('note', NULLIF(btrim(COALESCE(p_note, '')), '')));
END;
$$;

-- Workspaces ----------------------------------------------------------------

/*
 * Move a workspace to a different template. The screen shows the comparison
 * first; p_drop_keys are the overrides the person chose to drop. A live
 * workspace needs p_confirm. Recorded in the workspace's history.
 */
CREATE OR REPLACE FUNCTION public.config_switch_template(
  p_org_id uuid,
  p_template_id uuid,
  p_drop_keys text[] DEFAULT ARRAY[]::text[],
  p_confirm boolean DEFAULT false,
  p_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ws public.config_layers%ROWTYPE;
  v_status public.workspace_status;
  v_template_status text;
  v_template_version integer;
  v_old_template uuid;
BEGIN
  IF public.ws_end_user_request() THEN
    PERFORM public.ws_require_staff(p_org_id);
  END IF;
  SELECT status INTO v_status FROM public.organizations WHERE id = p_org_id;
  IF v_status = 'closed' THEN
    RAISE EXCEPTION 'This workspace is closed. Its configuration can be viewed but not changed.';
  END IF;
  IF v_status = 'active' AND NOT p_confirm THEN
    RAISE EXCEPTION 'This workspace is live. Review the comparison and confirm the switch.' USING HINT = 'config_switch_confirm';
  END IF;
  SELECT status INTO v_template_status FROM public.config_templates WHERE id = p_template_id;
  IF v_template_status IS NULL THEN
    RAISE EXCEPTION 'That template does not exist.';
  END IF;
  IF v_template_status <> 'active' THEN
    RAISE EXCEPTION 'Only active templates can be chosen. Ask a Platform Admin to activate this one first.';
  END IF;
  SELECT version INTO v_template_version FROM public.config_layers WHERE level = 'template' AND template_id = p_template_id;
  SELECT template_id INTO v_old_template FROM public.workspace_config_pins WHERE org_id = p_org_id;

  SELECT * INTO v_ws FROM public.config_layers WHERE level = 'workspace' AND org_id = p_org_id FOR UPDATE;
  UPDATE public.workspace_config_pins
  SET template_id = p_template_id, template_version = v_template_version, updated_at = now(), updated_by = auth.uid()
  WHERE org_id = p_org_id;
  UPDATE public.config_review_notices
  SET status = 'superseded', decided_at = now()
  WHERE org_id = p_org_id AND level = 'template' AND status IN ('pending', 'postponed');

  PERFORM public.config_write_layer(
    v_ws.id,
    v_ws.field_values - COALESCE(p_drop_keys, ARRAY[]::text[]),
    ARRAY[]::text[],
    'switch',
    COALESCE(NULLIF(btrim(COALESCE(p_note, '')), ''), 'Moved to a different template.')
  );
  -- The switch is a change even when no override was dropped.
  PERFORM public.ws_log(p_org_id, 'config.workspace.template_switched', 'workspace_config_pins', p_org_id::text,
    jsonb_build_object('from_template_id', v_old_template, 'to_template_id', p_template_id, 'dropped', to_jsonb(COALESCE(p_drop_keys, ARRAY[]::text[]))));
  PERFORM public.config_project_workspace(p_org_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.config_set_auto_accept(p_org_id uuid, p_on boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.ws_end_user_request() THEN
    PERFORM public.ws_require_staff(p_org_id);
  END IF;
  UPDATE public.workspace_config_pins
  SET auto_accept_while_onboarding = p_on, updated_at = now(), updated_by = auth.uid()
  WHERE org_id = p_org_id;
  PERFORM public.ws_log(p_org_id, 'config.workspace.auto_accept', 'workspace_config_pins', p_org_id::text, jsonb_build_object('on', p_on));
END;
$$;

-- Go-live readiness ---------------------------------------------------------

/*
 * Record a go-live check. The app runs the full validation (including
 * cross-field checks) and the test run; the database re-checks that every
 * required setting has a value and every value is valid for this exact
 * version before it records the workspace as ready.
 */
CREATE OR REPLACE FUNCTION public.config_record_readiness(
  p_org_id uuid,
  p_version text,
  p_ready boolean,
  p_missing jsonb DEFAULT '[]'::jsonb,
  p_problems jsonb DEFAULT '[]'::jsonb,
  p_test_run jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current text := public.config_version_stamp(p_org_id);
  v_values jsonb;
  v_missing text[];
  v_key text;
  v_error text;
BEGIN
  IF public.ws_end_user_request() THEN
    PERFORM public.ws_require_staff(p_org_id);
  END IF;
  IF p_version IS DISTINCT FROM v_current THEN
    RAISE EXCEPTION 'The configuration changed while it was being checked. Run the check again.' USING HINT = 'config_conflict';
  END IF;
  IF p_ready THEN
    v_values := public.config_effective_at(p_org_id) -> 'values';
    v_missing := public.config_missing_required(v_values, true);
    IF cardinality(v_missing) > 0 THEN
      RAISE EXCEPTION 'Not ready to go live. Still missing: %.',
        (SELECT string_agg(label, ', ' ORDER BY sort_order) FROM public.config_fields WHERE key = ANY (v_missing))
        USING HINT = 'config_incomplete';
    END IF;
    FOR v_key IN SELECT jsonb_object_keys(v_values) LOOP
      v_error := public.config_validate_value(v_key, v_values -> v_key);
      IF v_error IS NOT NULL THEN
        RAISE EXCEPTION 'Not ready to go live: %', v_error USING HINT = 'config_invalid';
      END IF;
    END LOOP;
  END IF;

  INSERT INTO public.config_readiness (org_id, config_version, ready, missing, problems, test_run, checked_at, checked_by, marked_ready_at, marked_ready_by)
  VALUES (p_org_id, p_version, p_ready, COALESCE(p_missing, '[]'::jsonb), COALESCE(p_problems, '[]'::jsonb), p_test_run, now(), auth.uid(),
          CASE WHEN p_ready THEN now() END, CASE WHEN p_ready THEN auth.uid() END)
  ON CONFLICT (org_id) DO UPDATE
  SET config_version = EXCLUDED.config_version, ready = EXCLUDED.ready, missing = EXCLUDED.missing, problems = EXCLUDED.problems,
      test_run = COALESCE(EXCLUDED.test_run, public.config_readiness.test_run), checked_at = now(), checked_by = auth.uid(),
      marked_ready_at = CASE WHEN EXCLUDED.ready THEN now() ELSE public.config_readiness.marked_ready_at END,
      marked_ready_by = CASE WHEN EXCLUDED.ready THEN auth.uid() ELSE public.config_readiness.marked_ready_by END;

  IF p_ready THEN
    PERFORM public.ws_log(p_org_id, 'config.workspace.marked_ready', 'config_readiness', p_org_id::text, jsonb_build_object('version', p_version));
  END IF;
END;
$$;

-- Going live from onboarding requires a passing check for the configuration
-- as it is now. A paused workspace that was live before can resume.
CREATE OR REPLACE FUNCTION public.set_workspace_status(
  p_org_id uuid,
  p_status public.workspace_status,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ready public.config_readiness%ROWTYPE;
BEGIN
  PERFORM public.ws_require_platform_admin();
  IF p_status = 'active' AND EXISTS (SELECT 1 FROM public.organizations WHERE id = p_org_id AND status = 'onboarding') THEN
    SELECT * INTO v_ready FROM public.config_readiness WHERE org_id = p_org_id;
    IF NOT FOUND OR NOT v_ready.ready OR v_ready.config_version IS DISTINCT FROM public.config_version_stamp(p_org_id) THEN
      RAISE EXCEPTION 'This workspace is not ready to go live. Open its configuration, complete the go-live checklist, and mark it ready first.'
        USING HINT = 'config_not_ready';
    END IF;
  END IF;
  UPDATE public.organizations
  SET status = p_status,
      status_reason = NULLIF(btrim(COALESCE(p_reason, '')), '')
  WHERE id = p_org_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace not found';
  END IF;
  IF p_status IN ('paused', 'closed') THEN
    PERFORM public.halt_org_follow_up_sequences(p_org_id, NULL);
  END IF;
END;
$$;

-- Owners --------------------------------------------------------------------

-- The small, safe subset an owner sees. Never configuration internals.
CREATE OR REPLACE FUNCTION public.config_owner_view(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_resolved jsonb;
  v_ws public.config_layers%ROWTYPE;
BEGIN
  IF NOT (p_org_id IN (SELECT public.user_owner_org_ids()) OR public.ws_is_staff(p_org_id)) THEN
    RAISE EXCEPTION 'Only an owner can see these settings.' USING ERRCODE = '42501';
  END IF;
  v_resolved := public.config_effective_at(p_org_id);
  SELECT * INTO v_ws FROM public.config_layers WHERE level = 'workspace' AND org_id = p_org_id;
  RETURN jsonb_build_object(
    'business_hours', v_resolved -> 'values' -> 'identity.business_hours',
    'timezone', v_resolved -> 'values' -> 'identity.timezone',
    'owners_can_edit_hours', COALESCE((v_resolved -> 'values' ->> 'identity.owners_can_edit_hours')::boolean, false),
    'workspace_version', COALESCE(v_ws.version, 0)
  );
END;
$$;

-- Owners change business hours only when the Service Team allows it.
CREATE OR REPLACE FUNCTION public.config_owner_set_hours(p_org_id uuid, p_hours jsonb, p_expected_version integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ws public.config_layers%ROWTYPE;
  v_error text;
  v_allowed boolean;
  v_version integer;
BEGIN
  IF NOT p_org_id IN (SELECT public.user_owner_org_ids()) THEN
    RAISE EXCEPTION 'Only an owner can change business hours here.' USING ERRCODE = '42501';
  END IF;
  v_allowed := COALESCE((public.config_effective_at(p_org_id) -> 'values' ->> 'identity.owners_can_edit_hours')::boolean, false);
  IF NOT v_allowed THEN
    RAISE EXCEPTION 'The Vistrial team manages business hours for this workspace. Ask them to change them.' USING ERRCODE = '42501';
  END IF;
  v_error := public.config_validate_value('identity.business_hours', p_hours);
  IF v_error IS NOT NULL THEN
    RAISE EXCEPTION '%', v_error USING HINT = 'config_invalid';
  END IF;
  SELECT * INTO v_ws FROM public.config_layers WHERE level = 'workspace' AND org_id = p_org_id FOR UPDATE;
  IF v_ws.version <> p_expected_version THEN
    RAISE EXCEPTION 'These hours were changed by someone else while you were editing. Reload and try again.' USING HINT = 'config_conflict';
  END IF;
  v_version := public.config_write_layer(v_ws.id, v_ws.field_values || jsonb_build_object('identity.business_hours', p_hours),
    ARRAY[]::text[], 'owner_edit', 'Business hours changed by an owner.');
  PERFORM public.config_project_workspace(p_org_id);
  RETURN v_version;
END;
$$;

-- Seeding (used by the generated block) --------------------------------------

CREATE OR REPLACE FUNCTION public.config_seed_platform(p_values jsonb, p_locks text[], p_launch jsonb, p_launch_note text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_layer uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.config_layers WHERE level = 'platform') THEN
    RETURN;
  END IF;
  INSERT INTO public.config_layers (level) VALUES ('platform') RETURNING id INTO v_layer;
  PERFORM public.config_write_layer(v_layer, p_values, p_locks, 'seed',
    'The platform default as the app behaved before the configuration system.');
  PERFORM public.config_write_layer(v_layer, p_values || p_launch, p_locks, 'launch', p_launch_note);
END;
$$;

CREATE OR REPLACE FUNCTION public.config_seed_template(p_slug text, p_name text, p_description text, p_values jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_layer uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.config_templates WHERE slug = p_slug) THEN
    RETURN;
  END IF;
  INSERT INTO public.config_templates (slug, name, description, status) VALUES (p_slug, p_name, p_description, 'draft') RETURNING id INTO v_id;
  INSERT INTO public.config_layers (level, template_id) VALUES ('template', v_id) RETURNING id INTO v_layer;
  PERFORM public.config_write_layer(v_layer, p_values, ARRAY[]::text[], 'seed', 'Starting template. Draft until a Platform Admin reviews and activates it.');
END;
$$;

-- Every workspace gets its own (empty) level and pins, however it is created.
CREATE OR REPLACE FUNCTION public.config_init_workspace()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_layer uuid;
  v_platform public.config_layers%ROWTYPE := public.config_platform_layer();
BEGIN
  IF v_platform.id IS NULL OR current_setting('vistrial.config_migrating', true) = '1' THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.config_layers (level, org_id) VALUES ('workspace', NEW.id) RETURNING id INTO v_layer;
  INSERT INTO public.workspace_config_pins (org_id, platform_version) VALUES (NEW.id, v_platform.version);
  PERFORM public.config_write_layer(v_layer,
    jsonb_strip_nulls(jsonb_build_object(
      'identity.business_name', NEW.name,
      'identity.display_name', NEW.name,
      'identity.timezone', NULLIF(NEW.timezone, (v_platform.field_values ->> 'identity.timezone'))
    )),
    ARRAY[]::text[], 'create', 'Workspace created.');
  RETURN NEW;
END;
$$;

CREATE TRIGGER organizations_config_init
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.config_init_workspace();

-- A new workspace starts from an active template, chosen at creation.
DROP FUNCTION IF EXISTS public.create_workspace(text, text, text, text);
CREATE OR REPLACE FUNCTION public.create_workspace(
  p_name text,
  p_timezone text,
  p_slug text DEFAULT NULL,
  p_owner_email text DEFAULT NULL,
  p_template_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text := btrim(COALESCE(p_name, ''));
  v_base text;
  v_slug text;
  v_n integer := 1;
  v_id uuid;
  v_member uuid;
  v_email text := NULLIF(lower(btrim(COALESCE(p_owner_email, ''))), '');
  v_token text;
  v_template_version integer;
  v_ws public.config_layers%ROWTYPE;
BEGIN
  PERFORM public.ws_require_platform_admin();
  IF char_length(v_name) < 2 THEN
    RAISE EXCEPTION 'A workspace name is required.';
  END IF;
  IF NULLIF(btrim(COALESCE(p_timezone, '')), '') IS NULL THEN
    RAISE EXCEPTION 'A timezone is required.';
  END IF;
  IF v_email IS NOT NULL AND v_email !~ '^[^@\s]+@[^@\s]+$' THEN
    RAISE EXCEPTION 'The owner email is not valid.';
  END IF;
  IF p_template_id IS NOT NULL THEN
    SELECT l.version INTO v_template_version
    FROM public.config_templates t
    JOIN public.config_layers l ON l.level = 'template' AND l.template_id = t.id
    WHERE t.id = p_template_id AND t.status = 'active';
    IF v_template_version IS NULL THEN
      RAISE EXCEPTION 'Choose an active template. Drafts and retired templates cannot be used for new workspaces.';
    END IF;
  END IF;

  v_base := trim(both '-' from lower(regexp_replace(COALESCE(NULLIF(btrim(p_slug), ''), v_name), '[^a-zA-Z0-9]+', '-', 'g')));
  IF v_base = '' THEN
    v_base := 'workspace';
  END IF;
  v_slug := v_base;
  WHILE EXISTS (SELECT 1 FROM public.organizations WHERE slug = v_slug) LOOP
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n::text;
  END LOOP;

  INSERT INTO public.organizations (name, slug, timezone, status, owner_contact_email)
  VALUES (v_name, v_slug, btrim(p_timezone), 'onboarding', v_email)
  RETURNING id INTO v_id;

  IF p_template_id IS NOT NULL THEN
    UPDATE public.workspace_config_pins
    SET template_id = p_template_id, template_version = v_template_version
    WHERE org_id = v_id;
  END IF;
  IF v_email IS NOT NULL THEN
    SELECT * INTO v_ws FROM public.config_layers WHERE level = 'workspace' AND org_id = v_id;
    PERFORM public.config_write_layer(v_ws.id,
      v_ws.field_values || jsonb_build_object('identity.primary_contact', jsonb_build_object('email', v_email)),
      ARRAY[]::text[], 'create', 'Owner email from workspace creation.');
  END IF;
  PERFORM public.config_project_workspace(v_id);

  IF v_email IS NOT NULL THEN
    SELECT id INTO v_member
    FROM public.org_members
    WHERE org_id = v_id AND user_id = auth.uid() AND seat = 'staff' AND active;
    v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
    INSERT INTO public.org_invites (org_id, email, role, token, invited_by, expires_at, surface_access)
    VALUES (v_id, v_email, 'owner', v_token, v_member, now() + interval '14 days', 'operator');
  END IF;

  -- The organizations and org_invites audit triggers record the creation and the invite.
  RETURN jsonb_build_object('org_id', v_id, 'slug', v_slug, 'invite_token', v_token);
END;
$$;

REVOKE ALL ON FUNCTION public.config_diff(jsonb, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.config_write_layer(uuid, jsonb, text[], text, text, uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.config_require_writer(public.config_layers) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.config_check_values(public.config_layers, jsonb, text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.config_record_push(text, uuid, integer, jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.config_fanout(text, uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.config_seed_platform(jsonb, text[], jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.config_seed_template(text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.config_init_workspace() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.config_save_layer(uuid, integer, jsonb, text[], text[], text[], text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.config_rollback_layer(uuid, integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.config_decide_notice(uuid, text, text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.config_create_template(text, text, text, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.config_update_template_details(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.config_set_template_status(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.config_switch_template(uuid, uuid, text[], boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.config_set_auto_accept(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.config_record_readiness(uuid, text, boolean, jsonb, jsonb, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_workspace_status(uuid, public.workspace_status, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.config_owner_view(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.config_owner_set_hours(uuid, jsonb, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_workspace(text, text, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.config_diff(jsonb, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.config_write_layer(uuid, jsonb, text[], text, text, uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.config_fanout(text, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.config_save_layer(uuid, integer, jsonb, text[], text[], text[], text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.config_rollback_layer(uuid, integer, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.config_decide_notice(uuid, text, text, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.config_create_template(text, text, text, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.config_update_template_details(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.config_set_template_status(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.config_switch_template(uuid, uuid, text[], boolean, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.config_set_auto_accept(uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.config_record_readiness(uuid, text, boolean, jsonb, jsonb, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_workspace_status(uuid, public.workspace_status, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.config_owner_view(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.config_owner_set_hours(uuid, jsonb, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_workspace(text, text, text, text, uuid) TO authenticated, service_role;

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
  ('response.warning_threshold_percent', 'response', 'number', 'Nudge at', false, false, false, NULL, NULL, $cfg${"min":50,"max":95,"integer":true}$cfg$::jsonb, 20),
  ('response.ghost_days_soft', 'response', 'number', 'Going quiet after', true, false, false, NULL, NULL, $cfg${"min":1,"max":365,"integer":true}$cfg$::jsonb, 21),
  ('response.ghost_days_hard', 'response', 'number', 'Gone quiet after', true, false, false, NULL, NULL, $cfg${"min":2,"max":365,"integer":true}$cfg$::jsonb, 22),
  ('response.max_sequence_length', 'response', 'number', 'Most follow-ups in a row', false, false, false, NULL, NULL, $cfg${"min":1,"max":8,"integer":true}$cfg$::jsonb, 23),
  ('response.max_sequence_days', 'response', 'number', 'Follow-up runs for at most', false, false, false, NULL, NULL, $cfg${"min":1,"max":90,"integer":true}$cfg$::jsonb, 24),
  ('response.draft_stale_days', 'response', 'number', 'Unapproved drafts expire after', false, false, false, NULL, NULL, $cfg${"min":1,"max":14,"integer":true}$cfg$::jsonb, 25),
  ('response.quiet_lead_hours', 'response', 'number', 'A lead is quiet after', false, false, false, NULL, NULL, $cfg${"min":1,"max":720,"integer":true}$cfg$::jsonb, 26),
  ('response.untouched_window_days', 'response', 'number', 'Look back for untouched leads', false, false, false, NULL, NULL, $cfg${"min":1,"max":30,"integer":true}$cfg$::jsonb, 27),
  ('response.no_show_window_days', 'response', 'number', 'Rebook no-shows within', false, false, false, NULL, NULL, $cfg${"min":1,"max":60,"integer":true}$cfg$::jsonb, 28),
  ('tone.formality', 'tone', 'choice', 'Formality', true, false, false, NULL, NULL, $cfg${"options":["formal","friendly","casual"]}$cfg$::jsonb, 29),
  ('tone.use_contractions', 'tone', 'boolean', 'Use contractions', false, false, false, NULL, NULL, $cfg${}$cfg$::jsonb, 30),
  ('tone.sender_identity', 'tone', 'text', 'Messages come from', false, false, false, NULL, NULL, $cfg${"maxLength":80}$cfg$::jsonb, 31),
  ('tone.greeting', 'tone', 'text', 'Greeting', false, false, false, NULL, NULL, $cfg${"maxLength":60}$cfg$::jsonb, 32),
  ('tone.sign_off', 'tone', 'text', 'Sign-off', false, false, false, NULL, NULL, $cfg${"maxLength":80}$cfg$::jsonb, 33),
  ('tone.sms_max_chars', 'tone', 'number', 'Longest text message', true, false, false, NULL, NULL, $cfg${"min":40,"max":480,"integer":true}$cfg$::jsonb, 34),
  ('tone.email_max_chars', 'tone', 'number', 'Longest email', true, false, false, NULL, NULL, $cfg${"min":120,"max":4000,"integer":true}$cfg$::jsonb, 35),
  ('tone.emoji', 'tone', 'choice', 'Emoji', false, false, false, NULL, NULL, $cfg${"options":["never","sparing","natural"]}$cfg$::jsonb, 36),
  ('tone.punctuation_rules', 'tone', 'long_text', 'Punctuation rules', false, false, false, NULL, NULL, $cfg${"maxLength":500}$cfg$::jsonb, 37),
  ('tone.language', 'tone', 'choice', 'Language and spelling', false, false, false, NULL, NULL, $cfg${"options":["en-US","en-GB","en-CA","en-AU","es-US"]}$cfg$::jsonb, 38),
  ('tone.preferred_terms', 'tone', 'list', 'Words to use', false, false, false, NULL, NULL, $cfg${"maxItems":50,"itemMaxLength":80}$cfg$::jsonb, 39),
  ('tone.banned_terms', 'tone', 'list', 'Words and phrases to avoid', false, false, false, NULL, NULL, $cfg${"maxItems":200,"itemMaxLength":120}$cfg$::jsonb, 40),
  ('tone.examples', 'tone', 'list', 'Example messages', false, false, false, NULL, NULL, $cfg${"maxItems":10,"itemFields":[{"key":"channel","type":"choice","required":true,"options":["sms","email"]},{"key":"body","type":"long_text","required":true,"maxLength":2000}]}$cfg$::jsonb, 41),
  ('industry.business_description', 'industry', 'text', 'What kind of business this is', true, false, false, NULL, NULL, $cfg${"minLength":5,"maxLength":200}$cfg$::jsonb, 42),
  ('industry.offers', 'industry', 'list', 'What the business sells', true, false, false, NULL, NULL, $cfg${"minItems":1,"maxItems":50,"uniqueBy":"name","itemFields":[{"key":"name","type":"text","required":true,"maxLength":100},{"key":"ticket_min","type":"number","min":0,"max":10000000},{"key":"ticket_max","type":"number","min":0,"max":10000000},{"key":"recurring","type":"boolean"}]}$cfg$::jsonb, 43),
  ('industry.case_facts', 'industry', 'list', 'Case-file facts', true, false, false, NULL, NULL, $cfg${"minItems":1,"maxItems":40,"uniqueBy":"key","itemFields":[{"key":"key","type":"text","required":true,"maxLength":60},{"key":"label","type":"text","required":true,"maxLength":80},{"key":"type","type":"choice","required":true,"options":["text","number","choice","yes_no","date"]},{"key":"required","type":"boolean"}]}$cfg$::jsonb, 44),
  ('industry.urgency_signals', 'industry', 'list', 'Act-now signals', false, false, false, NULL, NULL, $cfg${"maxItems":50,"itemMaxLength":120}$cfg$::jsonb, 45),
  ('industry.objections', 'industry', 'list', 'Objection library', false, false, false, NULL, NULL, $cfg${"maxItems":200,"uniqueBy":"label","itemFields":[{"key":"label","type":"text","required":true,"maxLength":80},{"key":"category","type":"choice","required":true,"options":["price","timing","spouse_partner","trust","fit","competitor","other"]},{"key":"recognize","type":"long_text","maxLength":500},{"key":"guidance","type":"long_text","maxLength":1000}]}$cfg$::jsonb, 46),
  ('industry.lead_sources', 'industry', 'list', 'Lead sources', false, false, false, NULL, NULL, $cfg${"maxItems":30,"uniqueBy":"source","itemFields":[{"key":"source","type":"text","required":true,"maxLength":80},{"key":"priority","type":"choice","required":true,"options":["high","normal","low"]},{"key":"treatment","type":"text","maxLength":300}]}$cfg$::jsonb, 47),
  ('escalation.levels', 'escalation', 'list', 'Who hears about what', true, false, false, NULL, NULL, $cfg${"minItems":1,"maxItems":8,"itemFields":[{"key":"severity","type":"choice","required":true,"options":["info","warning","urgent","critical"]},{"key":"trigger","type":"text","required":true,"maxLength":200},{"key":"after_windows","type":"number","min":1,"max":20},{"key":"notify","type":"multi_choice","required":true,"options":["assignee","setters","closers","managers","service_team"]},{"key":"channels","type":"multi_choice","required":true,"options":["push","email","sms","team_channel","discord"]}]}$cfg$::jsonb, 48),
  ('escalation.quiet_hours', 'escalation', 'choice', 'Quiet hours for the team', false, false, false, NULL, NULL, $cfg${"options":["outside_business_hours","none"]}$cfg$::jsonb, 49),
  ('escalation.urgent_exception', 'escalation', 'choice', 'Break quiet hours for', false, false, false, NULL, NULL, $cfg${"options":["critical","urgent_and_critical","none"]}$cfg$::jsonb, 50),
  ('escalation.unacknowledged_minutes', 'escalation', 'duration', 'If no one acknowledges within', false, false, false, NULL, NULL, $cfg${"min":5,"max":1440,"integer":true}$cfg$::jsonb, 51),
  ('escalation.unacknowledged_next', 'escalation', 'choice', 'Then tell', false, false, false, NULL, NULL, $cfg${"options":["assignee","setters","closers","managers","service_team"]}$cfg$::jsonb, 52),
  ('approval.actions', 'approval', 'list', 'What needs approval', true, false, false, NULL, NULL, $cfg${"minItems":1,"maxItems":30,"uniqueBy":"action","itemFields":[{"key":"action","type":"choice","required":true,"options":["first_reply","quiet_lead_follow_up","no_show_rebook","client_report","crm_stage_change","setter_nudge","owner_escalation","slack_post","discord_post","drive_store","send_text","send_email","create_asset"]},{"key":"mode","type":"choice","required":true,"options":["ask_first","auto_run","off"]},{"key":"approver","type":"choice","required":true,"options":["owners_and_managers","owner_only","assigned"]},{"key":"max_wait_minutes","type":"number","min":15,"max":10080},{"key":"auto_run_confirmed","type":"boolean"}]}$cfg$::jsonb, 53),
  ('approval.never_auto', 'approval', 'multi_choice', 'Always needs approval', false, false, true, 'superset_list', NULL, $cfg${"options":["first_reply","quiet_lead_follow_up","no_show_rebook","client_report","crm_stage_change","setter_nudge","owner_escalation","slack_post","discord_post","drive_store","send_text","send_email","create_asset"]}$cfg$::jsonb, 54),
  ('approval.timeout_minutes', 'approval', 'duration', 'Waiting too long after', false, false, false, NULL, NULL, $cfg${"min":15,"max":10080,"integer":true}$cfg$::jsonb, 55),
  ('approval.timeout_behavior', 'approval', 'choice', 'When no one approves in time', false, false, false, NULL, NULL, $cfg${"options":["nothing","escalate","proceed"]}$cfg$::jsonb, 56),
  ('approval.timeout_proceed_confirmed', 'approval', 'boolean', 'I understand waiting items will proceed without approval', false, false, false, NULL, NULL, $cfg${}$cfg$::jsonb, 57),
  ('integrations.crm', 'integrations', 'reference', 'CRM', false, false, false, NULL, NULL, $cfg${"referenceKinds":["integration"]}$cfg$::jsonb, 58),
  ('integrations.messaging_numbers', 'integrations', 'list', 'Messaging numbers', false, false, false, NULL, NULL, $cfg${"maxItems":20,"uniqueBy":"number","itemFields":[{"key":"label","type":"text","required":true,"maxLength":60},{"key":"number","type":"text","required":true,"maxLength":20},{"key":"provider","type":"choice","required":true,"options":["crm","telnyx"]},{"key":"sender_name","type":"text","maxLength":60}]}$cfg$::jsonb, 59),
  ('integrations.calendar', 'integrations', 'reference', 'Calendar', false, false, false, NULL, NULL, $cfg${"referenceKinds":["integration"]}$cfg$::jsonb, 60),
  ('integrations.email_domain', 'integrations', 'text', 'Email sending domain', false, false, false, NULL, NULL, $cfg${"maxLength":120,"pattern":"^$|^([a-z0-9-]+\\.)+[a-z]{2,}$"}$cfg$::jsonb, 61),
  ('integrations.chat_channels', 'integrations', 'list', 'Chat channels', false, false, false, NULL, NULL, $cfg${"maxItems":10,"itemFields":[{"key":"label","type":"text","required":true,"maxLength":60},{"key":"kind","type":"choice","required":true,"options":["slack","discord","teams"]},{"key":"connection_id","type":"text","required":true,"maxLength":64}]}$cfg$::jsonb, 62),
  ('integrations.file_folder', 'integrations', 'text', 'File storage folder', false, false, false, NULL, NULL, $cfg${"minLength":1,"maxLength":120}$cfg$::jsonb, 63),
  ('sources.allowed', 'sources', 'multi_choice', 'Agents may read', true, false, false, NULL, NULL, $cfg${"options":["call_transcripts","email","text_messages","forms","crm_notes"]}$cfg$::jsonb, 64),
  ('sources.retention_days', 'sources', 'key_value', 'Keep for (days)', false, false, false, NULL, NULL, $cfg${"min":30,"max":3650,"valueType":"number","keys":["call_transcripts","email","text_messages","forms","crm_notes"]}$cfg$::jsonb, 65),
  ('sources.excluded', 'sources', 'list', 'Never read', false, false, false, NULL, NULL, $cfg${"maxItems":10,"uniqueBy":"source","itemFields":[{"key":"source","type":"choice","required":true,"options":["call_transcripts","email","text_messages","forms","crm_notes"]},{"key":"reason","type":"text","required":true,"maxLength":200}]}$cfg$::jsonb, 66),
  ('sources.forsight_history_weeks', 'sources', 'number', 'Forsight shows (weeks)', false, false, false, NULL, NULL, $cfg${"min":4,"max":52,"integer":true}$cfg$::jsonb, 67),
  ('sources.forsight_quiet_days', 'sources', 'number', 'Forsight: going quiet after (days)', false, false, false, NULL, NULL, $cfg${"min":1,"max":60,"integer":true}$cfg$::jsonb, 68),
  ('sources.forsight_silent_days', 'sources', 'number', 'Forsight: silent after (days)', false, false, false, NULL, NULL, $cfg${"min":2,"max":120,"integer":true}$cfg$::jsonb, 69),
  ('sources.forsight_long_silent_days', 'sources', 'number', 'Forsight: long silent after (days)', false, false, false, NULL, NULL, $cfg${"min":3,"max":365,"integer":true}$cfg$::jsonb, 70),
  ('sources.stellar_stage_labels', 'sources', 'key_value', 'Stellar build stage names', false, false, false, NULL, NULL, $cfg${"valueType":"text","keys":["getting_set_up","building_system","testing","live","running_smoothly"]}$cfg$::jsonb, 71),
  ('operators.assignment_mode', 'operators', 'choice', 'How leads are assigned', true, false, false, NULL, NULL, $cfg${"options":["manual","round_robin","by_source","by_service"]}$cfg$::jsonb, 72),
  ('operators.extra_permissions', 'operators', 'multi_choice', 'Operators may also', false, false, false, NULL, NULL, $cfg${"options":["view_unassigned_details","reassign_own_leads"]}$cfg$::jsonb, 73),
  ('operators.summary_time', 'operators', 'choice', 'Daily summary', false, false, false, NULL, NULL, $cfg${"options":["start_of_day","end_of_day"]}$cfg$::jsonb, 74),
  ('operators.summary_confirmer', 'operators', 'choice', 'Summaries are confirmed by', false, false, false, NULL, NULL, $cfg${"options":["operator","owner","service_team"]}$cfg$::jsonb, 75),
  ('compliance.opt_out_words', 'compliance', 'list', 'Opt-out words', false, false, true, 'superset_list', NULL, $cfg${"maxItems":30,"itemMaxLength":30}$cfg$::jsonb, 76),
  ('compliance.quiet_hours', 'compliance', 'time_window', 'No messages between', true, false, true, 'wider_window', NULL, $cfg${}$cfg$::jsonb, 77),
  ('compliance.quiet_hours_basis', 'compliance', 'choice', 'Quiet hours follow', false, false, true, NULL, NULL, $cfg${"options":["lead_local","workspace"]}$cfg$::jsonb, 78),
  ('compliance.daily_cap_per_lead', 'compliance', 'number', 'Most messages per lead per day', true, false, true, 'lower_number', NULL, $cfg${"min":1,"max":20,"integer":true}$cfg$::jsonb, 79),
  ('compliance.cap_applies_to', 'compliance', 'choice', 'The daily limit covers', false, false, true, NULL, NULL, $cfg${"options":["every_send","auto_run_only"]}$cfg$::jsonb, 80),
  ('compliance.weekly_cap_per_lead', 'compliance', 'number', 'Most messages per lead per week', false, false, true, 'lower_number_zero_is_unlimited', NULL, $cfg${"min":0,"max":100,"integer":true}$cfg$::jsonb, 81),
  ('compliance.required_disclosures', 'compliance', 'list', 'Required disclosures', false, false, true, 'superset_list', NULL, $cfg${"maxItems":10,"itemMaxLength":300}$cfg$::jsonb, 82)
ON CONFLICT (key) DO UPDATE SET section = EXCLUDED.section, field_type = EXCLUDED.field_type, label = EXCLUDED.label, required = EXCLUDED.required, workspace_only = EXCLUDED.workspace_only, default_lock = EXCLUDED.default_lock, tighten = EXCLUDED.tighten, owner_editable = EXCLUDED.owner_editable, rules = EXCLUDED.rules, sort_order = EXCLUDED.sort_order;
CREATE OR REPLACE FUNCTION public.config_profile_labels() RETURNS jsonb LANGUAGE sql IMMUTABLE AS $fn$ SELECT $cfg${"signals":{"has_budget":"They can afford it","existing_revenue":"They already have revenue","urgent_timeline":"They want to start soon","sole_decision_maker":"They can decide alone","has_team":"They have a team behind them","clear_pain":"The problem is costing them now","tried_alternatives":"They have tried other things","right_industry":"They are in a market you serve","other":"Something else"},"disqualifiers":{"no_budget":"No budget at all","pre_revenue":"Pre-revenue","wrong_industry":"An industry you do not serve","needs_partner_approval":"Cannot decide without a partner","seeking_employment":"Looking for a job, not a service","out_of_geography":"Outside the places you work","competitor":"A competitor","other":"Something else"},"channels":{"meta_ads":"Facebook or Instagram ads","google_ads":"Google ads","youtube_ads":"YouTube ads","tiktok_ads":"TikTok ads","organic_social":"Organic social","email_list":"Your email list","referral":"Referrals","affiliate":"Affiliates or partners","webinar":"Webinars or masterclasses","cold_outbound":"Cold outbound","podcast":"Podcast","seo":"Search and content","events":"Live events","other":"Something else"},"offer_types":{"coaching":"Coaching","consulting":"Consulting","agency_service":"Agency service","course":"Course or programme","software":"Software","done_for_you":"Done-for-you delivery","other":"Something else"},"objection_types":{"price":"Price","timing":"Timing","spouse_partner":"Needs a partner's agreement","trust":"Trust","fit":"Fit","competitor":"Looking at someone else","other":"Something else"}}$cfg$::jsonb $fn$;
CREATE OR REPLACE FUNCTION public.config_legacy_banned_terms() RETURNS text[] LANGUAGE sql IMMUTABLE AS $fn$ SELECT ARRAY['I hope this message finds you well', 'I hope you''re doing well', 'I wanted to reach out', 'just circling back', 'circling back', 'touching base', 'following up on our conversation', 'as we discussed', 'leverage', 'utilize', 'synergy', 'streamline', 'robust', 'seamless', 'journey', 'solution']::text[] $fn$;
SELECT public.config_seed_platform($cfg${"identity.timezone":"America/New_York","identity.business_hours":{"days":{"mon":[{"start":"08:00","end":"18:00"}],"tue":[{"start":"08:00","end":"18:00"}],"wed":[{"start":"08:00","end":"18:00"}],"thu":[{"start":"08:00","end":"18:00"}],"fri":[{"start":"08:00","end":"18:00"}],"sat":[],"sun":[]},"closures":[]},"identity.owners_can_edit_hours":false,"qualification.not_ready_criteria":[],"qualification.disqualifiers":[],"qualification.scoring_bands":[{"name":"Cold","min_score":0,"meaning":"Interested, but not ready to decide.","next_step":"Keep in touch with useful, low-pressure follow-up."},{"name":"Warm","min_score":40,"meaning":"Engaged, with some of what they need in place.","next_step":"Fill the gaps: timing, budget, and who decides."},{"name":"Hot","min_score":60,"meaning":"Ready to buy now.","next_step":"Call today and book the next step."}],"qualification.ready_threshold":60,"qualification.factor_weights":{"timeline":35,"investment_capacity":30,"decision_authority":20,"pain_severity":15},"qualification.minimum_info":[],"response.first_touch_minutes":15,"response.follow_up_cadence":[{"stage":"working","max_gap_hours":48},{"stage":"follow_up","max_gap_hours":72},{"stage":"objection_hold","max_gap_hours":72},{"stage":"no_show","max_gap_hours":24}],"response.after_hours":"keep_running","response.after_hours_window_minutes":120,"response.counted_touch_types":["call","text","email"],"response.warning_threshold_percent":75,"response.ghost_days_soft":14,"response.ghost_days_hard":30,"response.max_sequence_length":3,"response.max_sequence_days":21,"response.draft_stale_days":5,"response.quiet_lead_hours":48,"response.untouched_window_days":3,"response.no_show_window_days":7,"tone.formality":"casual","tone.use_contractions":true,"tone.sender_identity":"","tone.greeting":"","tone.sign_off":"","tone.sms_max_chars":240,"tone.email_max_chars":900,"tone.emoji":"never","tone.punctuation_rules":"","tone.language":"en-US","tone.preferred_terms":[],"tone.banned_terms":["I hope this message finds you well","I hope you're doing well","I wanted to reach out","just circling back","circling back","touching base","following up on our conversation","as we discussed","leverage","utilize","synergy","streamline","robust","seamless","journey","solution"],"tone.examples":[],"industry.business_description":"a business that sells through conversations with its leads","industry.urgency_signals":[],"industry.objections":[],"industry.lead_sources":[],"escalation.levels":[{"severity":"warning","trigger":"A new lead has not had a first touch within the window.","after_windows":1,"notify":["assignee"],"channels":["push"]},{"severity":"urgent","trigger":"Still untouched at twice the window.","after_windows":2,"notify":["setters"],"channels":["push","team_channel"]},{"severity":"critical","trigger":"Still untouched at four times the window.","after_windows":4,"notify":["managers"],"channels":["push"]}],"escalation.quiet_hours":"outside_business_hours","escalation.urgent_exception":"critical","escalation.unacknowledged_minutes":60,"escalation.unacknowledged_next":"managers","approval.actions":[{"action":"first_reply","mode":"ask_first","approver":"owners_and_managers"},{"action":"quiet_lead_follow_up","mode":"ask_first","approver":"owners_and_managers"},{"action":"no_show_rebook","mode":"ask_first","approver":"owners_and_managers"},{"action":"client_report","mode":"ask_first","approver":"owners_and_managers"},{"action":"crm_stage_change","mode":"ask_first","approver":"owners_and_managers"},{"action":"setter_nudge","mode":"auto_run","approver":"owners_and_managers","auto_run_confirmed":true},{"action":"owner_escalation","mode":"auto_run","approver":"owners_and_managers","auto_run_confirmed":true},{"action":"slack_post","mode":"ask_first","approver":"owners_and_managers"},{"action":"discord_post","mode":"ask_first","approver":"owners_and_managers"},{"action":"drive_store","mode":"ask_first","approver":"owners_and_managers"},{"action":"send_text","mode":"ask_first","approver":"owners_and_managers"},{"action":"send_email","mode":"ask_first","approver":"owners_and_managers"},{"action":"create_asset","mode":"ask_first","approver":"owners_and_managers"}],"approval.never_auto":["first_reply","quiet_lead_follow_up","no_show_rebook","client_report","send_text","send_email"],"approval.timeout_minutes":240,"approval.timeout_behavior":"escalate","approval.timeout_proceed_confirmed":false,"integrations.crm":null,"integrations.messaging_numbers":[],"integrations.calendar":null,"integrations.email_domain":"","integrations.chat_channels":[],"integrations.file_folder":"Vistrial","sources.allowed":["call_transcripts","email","text_messages","forms","crm_notes"],"sources.retention_days":{"call_transcripts":365,"email":365,"text_messages":365,"forms":365,"crm_notes":365},"sources.excluded":[],"sources.forsight_history_weeks":12,"sources.forsight_quiet_days":7,"sources.forsight_silent_days":14,"sources.forsight_long_silent_days":30,"sources.stellar_stage_labels":{"getting_set_up":"Getting set up","building_system":"Building your system","testing":"Testing","live":"Live","running_smoothly":"Running smoothly"},"operators.assignment_mode":"manual","operators.extra_permissions":[],"operators.summary_time":"start_of_day","operators.summary_confirmer":"operator","compliance.opt_out_words":[],"compliance.quiet_hours":{"start":"20:00","end":"08:00"},"compliance.quiet_hours_basis":"workspace","compliance.daily_cap_per_lead":2,"compliance.cap_applies_to":"auto_run_only","compliance.weekly_cap_per_lead":0,"compliance.required_disclosures":[]}$cfg$::jsonb, ARRAY['approval.never_auto', 'compliance.opt_out_words', 'compliance.quiet_hours', 'compliance.quiet_hours_basis', 'compliance.daily_cap_per_lead', 'compliance.cap_applies_to', 'compliance.weekly_cap_per_lead', 'compliance.required_disclosures']::text[], $cfg${"compliance.opt_out_words":["STOP","STOPALL","UNSUBSCRIBE","CANCEL","END","QUIT"],"compliance.cap_applies_to":"every_send","compliance.quiet_hours_basis":"lead_local","response.after_hours":"pause"}$cfg$::jsonb, 'Launch compliance rules, switched on deliberately: opt-out words stop all messages; the daily per-lead limit covers every send; quiet hours (8pm to 8am) follow the lead''s local time; and the first-touch clock pauses outside business hours.');
SELECT public.config_seed_template('med-spa', 'Med Spa', 'Injectables, facials, laser and skin treatments, body contouring, and memberships.', $cfg${"industry.business_description":"a med spa offering injectables, facials, laser and skin treatments, and body contouring","industry.offers":[{"name":"Injectables (wrinkle relaxers and fillers)","ticket_min":300,"ticket_max":1500,"recurring":false},{"name":"Facials and peels","ticket_min":150,"ticket_max":400,"recurring":false},{"name":"Laser and skin treatments","ticket_min":300,"ticket_max":2500,"recurring":false},{"name":"Body contouring","ticket_min":600,"ticket_max":4000,"recurring":false},{"name":"Membership","ticket_min":99,"ticket_max":299,"recurring":true}],"industry.case_facts":[{"key":"treatment_interest","label":"Treatment of interest","type":"text","required":true},{"key":"concern","label":"What they want to change","type":"text","required":false},{"key":"prior_treatments","label":"Treatments they have had before","type":"text","required":false},{"key":"timeline","label":"When they want it done","type":"text","required":true},{"key":"budget_comfort","label":"Budget they are comfortable with","type":"text","required":false},{"key":"consultation_preference","label":"In-person or virtual consultation","type":"text","required":false}],"industry.urgency_signals":["An upcoming event, like a wedding, holiday, or trip","As soon as possible","This week","Asks about a promotion before it ends","Asks for the next available appointment"],"industry.objections":[{"label":"Cost","category":"price","recognize":"\"How much is it?\", \"That's more than I thought\", \"Do you have payment plans?\"","guidance":"Give the price range plainly, explain what is included, and mention memberships or payment options if you offer them. Never discount under pressure."},{"label":"Nervous about the treatment","category":"trust","recognize":"\"Does it hurt?\", \"I'm worried it will look fake\", \"What if something goes wrong?\"","guidance":"Acknowledge the worry, explain what the treatment involves in simple terms, and offer a consultation to talk it through with the provider. Make no medical claims or promises about results."},{"label":"Timing","category":"timing","recognize":"\"Not right now\", \"Maybe after the holidays\", \"I'm too busy this month\"","guidance":"Ask whether there is an event or date they have in mind, and offer to hold a time that suits them."},{"label":"Trust in the provider","category":"trust","recognize":"\"Who does the treatment?\", \"Are they certified?\", \"Can I see before-and-after photos?\"","guidance":"Share the provider's credentials and experience, and point to reviews or a gallery. Offer a consultation to meet them first."},{"label":"Needs to think about it","category":"fit","recognize":"\"Let me think about it\", \"I'll get back to you\"","guidance":"Respect it. Offer one clear, easy next step, like a free consultation, and check in once without pressure."}],"industry.lead_sources":[{"source":"Website booking form","priority":"high","treatment":"Reply quickly; they already chose a time slot or treatment."},{"source":"Google search","priority":"high","treatment":"Usually ready to book. Lead with availability."},{"source":"Instagram or Facebook ads","priority":"normal","treatment":"Often browsing. Start with the treatment they clicked on."},{"source":"Referral from a client","priority":"high","treatment":"Mention who referred them and thank them."}],"qualification.ready_criteria":["Asks about a specific treatment or its price.","Asks about availability or the next open appointment.","Has had a consultation or treatment with us before.","Mentions an event or a date they want to look their best for."],"qualification.not_ready_criteria":["General browsing with no treatment in mind.","Asks only about price, with no interest in a specific treatment.","Says they are \"just looking\"."],"qualification.disqualifiers":[{"reason":"Lives outside the area we serve.","closing_message":"Thanks so much for reaching out. We only see clients in our local area, so we're not the right fit, but we hope you find someone wonderful nearby."},{"reason":"Below the minimum age for treatment.","closing_message":"Thank you for your interest. We can only treat clients who are 18 or older, so we're not able to book you in."},{"reason":"Wants a treatment we do not offer.","closing_message":"Thanks for asking. That's not a treatment we offer, so we'd rather point you to a specialist who does."}],"qualification.minimum_info":["treatment_interest","timeline"],"response.first_touch_minutes":5,"response.follow_up_cadence":[{"stage":"working","max_gap_hours":4},{"stage":"follow_up","max_gap_hours":24},{"stage":"objection_hold","max_gap_hours":24},{"stage":"no_show","max_gap_hours":4}],"response.ghost_days_soft":3,"response.ghost_days_hard":7,"response.max_sequence_days":7,"tone.formality":"friendly","tone.emoji":"sparing","tone.sms_max_chars":300,"tone.punctuation_rules":"At most one exclamation mark per message. No capitals for emphasis.","tone.preferred_terms":["consultation","treatment plan","provider","results vary"],"tone.banned_terms":["I hope this message finds you well","I hope you're doing well","I wanted to reach out","just circling back","circling back","touching base","following up on our conversation","as we discussed","leverage","utilize","synergy","streamline","robust","seamless","journey","solution","guaranteed results","cure","permanent","risk-free","pain-free","act now","last chance","limited time only"],"tone.examples":[{"channel":"sms","body":"Hi Jess, it's Maya from Glow Studio. We have a lip filler consultation open Thursday at 4. Would that work for you?"},{"channel":"email","body":"Thanks for asking about laser skin resurfacing. A short consultation lets our provider look at your skin and talk through what to expect, including downtime and cost. We have openings this week on Tuesday and Thursday afternoon. Would either suit you?"}]}$cfg$::jsonb);
SELECT public.config_seed_template('home-services', 'Home Services', 'Recurring and one-time jobs: cleaning, HVAC, roofing, lawn care, plumbing, pest control, remodeling.', $cfg${"industry.business_description":"a local home services company doing recurring and one-time jobs at people's homes","identity.business_hours":{"days":{"mon":[{"start":"07:00","end":"18:00"}],"tue":[{"start":"07:00","end":"18:00"}],"wed":[{"start":"07:00","end":"18:00"}],"thu":[{"start":"07:00","end":"18:00"}],"fri":[{"start":"07:00","end":"18:00"}],"sat":[{"start":"08:00","end":"14:00"}],"sun":[]},"closures":[]},"industry.offers":[{"name":"Recurring service (cleaning, lawn care, pest control)","ticket_min":100,"ticket_max":400,"recurring":true},{"name":"One-time job","ticket_min":150,"ticket_max":1500,"recurring":false},{"name":"Repair or emergency call-out","ticket_min":150,"ticket_max":800,"recurring":false},{"name":"Large project (roofing, HVAC replacement, remodeling)","ticket_min":3000,"ticket_max":40000,"recurring":false}],"industry.case_facts":[{"key":"service_type","label":"Service needed","type":"text","required":true},{"key":"property_type","label":"Property type (house, apartment, business)","type":"text","required":false},{"key":"property_size","label":"Property size","type":"text","required":false},{"key":"service_area","label":"Address or area","type":"text","required":true},{"key":"timing","label":"When they need it","type":"text","required":true},{"key":"frequency","label":"One-time or recurring","type":"text","required":false},{"key":"access_notes","label":"Access notes (gate code, pets, parking)","type":"text","required":false}],"industry.urgency_signals":["today","leak","flooding","broken","no heat","no AC","emergency","A move-in or move-out date"],"industry.objections":[{"label":"Price","category":"price","recognize":"\"That's expensive\", \"Can you do it cheaper?\"","guidance":"Explain what the price includes and why. Offer a smaller first job or a recurring rate if you have one. Do not undercut yourself to win the job."},{"label":"Availability","category":"timing","recognize":"\"When can you come?\", \"I need it sooner than that\"","guidance":"Give the earliest real date. If an emergency, say what you can do today."},{"label":"Trust and reviews","category":"trust","recognize":"\"Are you insured?\", \"Do you have reviews?\"","guidance":"Confirm licensing and insurance, and share where to read reviews."},{"label":"Getting other quotes","category":"competitor","recognize":"\"I'm getting a few quotes\", \"Someone else quoted less\"","guidance":"That's sensible. Make your quote easy to compare: what is included, warranty, and timing. Follow up once after a couple of days."},{"label":"Timing","category":"timing","recognize":"\"Not until next month\", \"After the holidays\"","guidance":"Offer to book a date now so they keep the slot, and set a reminder."}],"industry.lead_sources":[{"source":"Google local listing","priority":"high","treatment":"Usually needs help soon. Reply with the earliest date."},{"source":"Website quote form","priority":"high","treatment":"Confirm the job and the address, then give a time."},{"source":"Referral","priority":"high","treatment":"Mention who referred them."},{"source":"Lead marketplace (Angi, Thumbtack)","priority":"normal","treatment":"Reply fast; they contacted several companies."},{"source":"Flyers and door hangers","priority":"low","treatment":"Often price shopping. Lead with a clear starting price."}],"qualification.ready_criteria":["Described a specific job.","Gave an address or the area they are in.","Asked for a quote or a date.","Mentioned something urgent, like a leak or a broken system."],"qualification.not_ready_criteria":["Curious about prices in general.","Comparing many providers with no date in mind."],"qualification.disqualifiers":[{"reason":"Outside our service area.","closing_message":"Thanks for getting in touch. That address is outside the area we cover, so we can't help with this one. Sorry we couldn't be more useful."},{"reason":"A job type we do not offer.","closing_message":"Thanks for asking. That's not a job we do, but a specialist will be able to help."},{"reason":"Below our minimum job size.","closing_message":"Thanks for reaching out. That job is smaller than we usually take on, so we're not the best fit this time."}],"qualification.minimum_info":["service_type","service_area","timing"],"response.first_touch_minutes":10,"response.follow_up_cadence":[{"stage":"working","max_gap_hours":24},{"stage":"follow_up","max_gap_hours":48},{"stage":"objection_hold","max_gap_hours":48},{"stage":"no_show","max_gap_hours":24}],"response.ghost_days_soft":7,"response.ghost_days_hard":21,"response.max_sequence_days":14,"escalation.levels":[{"severity":"warning","trigger":"A new lead has not had a first touch within the window.","after_windows":1,"notify":["assignee"],"channels":["push"]},{"severity":"urgent","trigger":"Still untouched at twice the window.","after_windows":2,"notify":["setters"],"channels":["push","team_channel"]},{"severity":"critical","trigger":"Still untouched at four times the window.","after_windows":4,"notify":["managers"],"channels":["push"]},{"severity":"urgent","trigger":"A lead mentions an emergency, like a leak, flooding, or no heat.","notify":["assignee","managers"],"channels":["push","sms"]}],"tone.formality":"friendly","tone.sms_max_chars":200,"tone.email_max_chars":600,"tone.punctuation_rules":"Plain words and short sentences. No exclamation marks in quotes or prices.","tone.banned_terms":["I hope this message finds you well","I hope you're doing well","I wanted to reach out","just circling back","circling back","touching base","following up on our conversation","as we discussed","leverage","utilize","synergy","streamline","robust","seamless","journey","solution","kindly","do not hesitate","per our conversation"],"tone.examples":[{"channel":"sms","body":"Hi Dan, it's Luis from Northside Plumbing. We can be there tomorrow between 8 and 10 to look at the leak. Does that work?"},{"channel":"sms","body":"Thanks for the photos. A full gutter clean for a two-story house is usually $180 to $240. Want me to book you in for Saturday morning?"}]}$cfg$::jsonb);
SELECT public.config_seed_template('coaches-consultants', 'Coaches and Consultants', 'High-ticket programs, group programs, one-to-one coaching, and consulting engagements.', $cfg${"industry.business_description":"a high-ticket coaching or consulting business that sells through sales calls","industry.offers":[{"name":"High-ticket program","ticket_min":3000,"ticket_max":25000,"recurring":false},{"name":"Group program","ticket_min":500,"ticket_max":5000,"recurring":false},{"name":"One-to-one coaching","ticket_min":1000,"ticket_max":10000,"recurring":true},{"name":"Consulting engagement","ticket_min":5000,"ticket_max":50000,"recurring":false}],"industry.case_facts":[{"key":"stated_goal","label":"What they want to achieve","type":"text","required":true},{"key":"current_situation","label":"Where they are now","type":"text","required":false},{"key":"budget_range","label":"Budget range","type":"text","required":true},{"key":"decision_maker","label":"Who makes the decision","type":"text","required":true},{"key":"timeline","label":"When they want to start","type":"text","required":true},{"key":"previous_coaching","label":"Coaching or consulting they have had before","type":"text","required":false},{"key":"objections_raised","label":"Objections raised on the call","type":"text","required":false}],"industry.urgency_signals":["A stated deadline","A launch date coming up","\"Ready to start\"","A recent trigger event, like losing a client or new funding"],"industry.objections":[{"label":"Price","category":"price","recognize":"\"It's a lot of money right now\", \"I can't justify that\"","guidance":"Tie the investment back to the goal they stated and what it is costing them to stay where they are. Offer a payment plan only if one exists."},{"label":"Timing","category":"timing","recognize":"\"Now's not the right time\", \"Maybe next quarter\"","guidance":"Ask what would need to be true for the timing to be right, and what waiting costs them."},{"label":"Needs to talk to a partner or team","category":"spouse_partner","recognize":"\"I need to talk to my partner\", \"I have to run it by my team\"","guidance":"Offer a short call with the other decision-maker, and send a one-page summary they can share."},{"label":"Skeptical about results","category":"trust","recognize":"\"How do I know this will work for me?\"","guidance":"Share a relevant client story with specifics, and be honest about what the program needs from them."},{"label":"Past bad experience","category":"trust","recognize":"\"I've done a program before and it didn't work\"","guidance":"Ask what went wrong, listen, and explain clearly how this differs. Never criticize the other provider."}],"industry.lead_sources":[{"source":"Referral","priority":"high","treatment":"Mention who referred them; trust is already there."},{"source":"Paid social ads","priority":"normal","treatment":"Confirm the problem they want solved before talking about the offer."},{"source":"Webinar or podcast","priority":"normal","treatment":"Reference what they watched or heard."},{"source":"Email list","priority":"normal","treatment":"They know you; ask what prompted them to reply now."}],"qualification.ready_criteria":["Has stated a clear problem and the goal they want.","Has acknowledged the budget.","The decision-maker is on the call.","Has stated a timeline for starting.","Has engaged with earlier touches."],"qualification.not_ready_criteria":["Curious, but with no clear goal.","No budget for this yet.","Needs approval from someone who is not on the call."],"qualification.disqualifiers":[{"reason":"Not at the right stage for the offer.","closing_message":"Thanks for the time today. Based on where you are right now, this isn't the right program yet. Here's what I'd focus on first, and I'm happy to talk again when you get there."},{"reason":"No decision-making authority, with no path to the person who has it.","closing_message":null},{"reason":"Unwilling to commit to the program format.","closing_message":"Thanks for being straight with me. The program only works with the full commitment, so it wouldn't be fair to take you on. I wish you the best with it."}],"qualification.minimum_info":["stated_goal","budget_range","decision_maker","timeline"],"response.first_touch_minutes":15,"response.follow_up_cadence":[{"stage":"working","max_gap_hours":48},{"stage":"follow_up","max_gap_hours":96},{"stage":"objection_hold","max_gap_hours":72},{"stage":"no_show","max_gap_hours":24}],"tone.formality":"friendly","tone.punctuation_rules":"Confident and plain. No hype, no exclamation marks in follow-ups after a call.","tone.banned_terms":["I hope this message finds you well","I hope you're doing well","I wanted to reach out","just circling back","circling back","touching base","following up on our conversation","as we discussed","leverage","utilize","synergy","streamline","robust","seamless","journey","solution","guaranteed","life-changing","secret","hack","only a few spots left"],"tone.examples":[{"channel":"sms","body":"Good talking today, Sam. You said the goal is 10 clients a month by March. I'll send the plan we walked through tonight; worth looking at before Thursday's call."},{"channel":"email","body":"Thanks for walking me through where the business is. You mentioned two things are holding growth back: no consistent lead flow and closing calls yourself. The program covers both, and the next step is a 20-minute call with your business partner so you can decide together. Does Thursday at 2 work?"}]}$cfg$::jsonb);
-- config-registry:end

-- ---------------------------------------------------------------------------
-- 5. The existing settings tables, kept in step.
--
--    Projection: whenever a workspace's effective configuration changes, the
--    values the existing code reads (score_configs, follow_up_settings,
--    org_voice_profiles, approval_gate_settings, approval_gate_actions, and
--    the workspace columns on organizations) are rewritten from it.
--
--    Capture: an edit made through an existing screen, or by onboarding,
--    becomes a workspace override (or removes one, when it matches what the
--    workspace would inherit). Locked rules cannot be loosened this way; the
--    projection puts the locked value straight back.
-- ---------------------------------------------------------------------------

-- The two Prompt 1 guards stand aside while the configuration system itself
-- writes a projection (an owner changing business hours, say).
CREATE OR REPLACE FUNCTION public.ws_guard_staff_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.org_id ELSE NEW.org_id END;
BEGIN
  IF current_setting('vistrial.config_projecting', true) = '1' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF public.ws_end_user_request() AND NOT public.ws_is_staff(v_org) THEN
    RAISE EXCEPTION 'This setting is managed by the Vistrial team.' USING ERRCODE = '42501';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE OR REPLACE FUNCTION public.organizations_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_changed text[];
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF public.ws_end_user_request() AND NOT public.is_platform_admin() THEN
      RAISE EXCEPTION 'Only a Platform Admin can change a workspace''s status.' USING ERRCODE = '42501';
    END IF;
    NEW.status_changed_at := now();
    NEW.status_changed_by := COALESCE(auth.uid(), NEW.status_changed_by);
    NEW.closed_at := CASE WHEN NEW.status = 'closed' THEN COALESCE(NEW.closed_at, now()) END;
    IF NEW.status = 'closed' AND NEW.delete_after IS NULL THEN
      NEW.delete_after := (now() + make_interval(days => NEW.closed_retention_days))::date;
    ELSIF NEW.status <> 'closed' AND OLD.status = 'closed' THEN
      NEW.delete_after := NULL;
    END IF;
  END IF;

  IF current_setting('vistrial.config_projecting', true) = '1' THEN
    RETURN NEW;
  END IF;
  IF NOT public.ws_end_user_request() OR public.ws_is_staff(NEW.id) THEN
    RETURN NEW;
  END IF;

  v_changed := public.ws_changed_columns(to_jsonb(OLD), to_jsonb(NEW));
  IF EXISTS (
    SELECT 1 FROM unnest(v_changed) c
    WHERE c NOT IN ('owner_contact_name', 'owner_contact_email', 'owner_contact_phone')
  ) THEN
    RAISE EXCEPTION 'Owners can change business contact details. Everything else is managed by the Vistrial team.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.config_time_text(p_time time)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$ SELECT to_char(p_time, 'HH24:MI') $$;

-- Business hours as one schedule, from the single start/end and day list the
-- organizations table holds (1 = Monday … 7 = Sunday).
CREATE OR REPLACE FUNCTION public.config_hours_from_legacy(p_start time, p_end time, p_days smallint[])
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'days',
    jsonb_object_agg(
      d.code,
      CASE WHEN d.n = ANY (p_days) AND p_end > p_start
        THEN jsonb_build_array(jsonb_build_object('start', public.config_time_text(p_start), 'end', public.config_time_text(p_end)))
        ELSE '[]'::jsonb END
    ),
    'closures', '[]'::jsonb
  )
  FROM (VALUES (1::smallint, 'mon'), (2::smallint, 'tue'), (3::smallint, 'wed'), (4::smallint, 'thu'),
               (5::smallint, 'fri'), (6::smallint, 'sat'), (7::smallint, 'sun')) AS d(n, code);
$$;

/*
 * Write a workspace's effective configuration into the tables the existing
 * code reads. Only rows whose values actually differ are touched, so the
 * Prompt 1 audit log records real changes only.
 */
CREATE OR REPLACE FUNCTION public.config_project_workspace(p_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v jsonb;
  v_hours jsonb;
  v_days smallint[];
  v_start time;
  v_end time;
  v_quiet_start time;
  v_quiet_end time;
  v_banned text[];
  v_examples jsonb;
  v_existing jsonb;
  v_row jsonb;
  v_action jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.config_layers WHERE level = 'workspace' AND org_id = p_org_id) THEN
    RETURN;
  END IF;
  v := public.config_effective_at(p_org_id) -> 'values';
  PERFORM set_config('vistrial.config_projecting', '1', true);

  -- Qualification and response windows → score_configs.
  UPDATE public.score_configs sc
  SET timeline_weight = n.tw, investment_capacity_weight = n.iw, decision_authority_weight = n.dw, pain_severity_weight = n.pw,
      ready_threshold = n.rt, speed_to_lead_minutes = n.stl, ghost_days_soft = n.gs, ghost_days_hard = n.gh, updated_at = now()
  FROM (
    SELECT
      COALESCE((v -> 'qualification.factor_weights' ->> 'timeline')::int, s.timeline_weight) AS tw,
      COALESCE((v -> 'qualification.factor_weights' ->> 'investment_capacity')::int, s.investment_capacity_weight) AS iw,
      COALESCE((v -> 'qualification.factor_weights' ->> 'decision_authority')::int, s.decision_authority_weight) AS dw,
      COALESCE((v -> 'qualification.factor_weights' ->> 'pain_severity')::int, s.pain_severity_weight) AS pw,
      COALESCE((v ->> 'qualification.ready_threshold')::int, s.ready_threshold) AS rt,
      COALESCE((v ->> 'response.first_touch_minutes')::int, s.speed_to_lead_minutes) AS stl,
      COALESCE((v ->> 'response.ghost_days_soft')::int, s.ghost_days_soft) AS gs,
      COALESCE((v ->> 'response.ghost_days_hard')::int, s.ghost_days_hard) AS gh
    FROM public.score_configs s WHERE s.org_id = p_org_id
  ) n
  WHERE sc.org_id = p_org_id
    AND (sc.timeline_weight, sc.investment_capacity_weight, sc.decision_authority_weight, sc.pain_severity_weight,
         sc.ready_threshold, sc.speed_to_lead_minutes, sc.ghost_days_soft, sc.ghost_days_hard)
      IS DISTINCT FROM (n.tw, n.iw, n.dw, n.pw, n.rt, n.stl, n.gs, n.gh);

  -- Follow-up limits and outbound quiet hours → follow_up_settings.
  v_quiet_start := COALESCE((v -> 'compliance.quiet_hours' ->> 'start')::time, '20:00');
  v_quiet_end := COALESCE((v -> 'compliance.quiet_hours' ->> 'end')::time, '08:00');
  UPDATE public.follow_up_settings fs
  SET max_sequence_length = COALESCE((v ->> 'response.max_sequence_length')::int, fs.max_sequence_length),
      max_sequence_duration_days = COALESCE((v ->> 'response.max_sequence_days')::int, fs.max_sequence_duration_days),
      draft_stale_days = COALESCE((v ->> 'response.draft_stale_days')::int, fs.draft_stale_days),
      quiet_hours_enabled = true,
      quiet_hours_start = v_quiet_start,
      quiet_hours_end = v_quiet_end,
      updated_at = now()
  WHERE fs.org_id = p_org_id
    AND (fs.max_sequence_length, fs.max_sequence_duration_days, fs.draft_stale_days, fs.quiet_hours_enabled, fs.quiet_hours_start, fs.quiet_hours_end)
      IS DISTINCT FROM (
        COALESCE((v ->> 'response.max_sequence_length')::int, fs.max_sequence_length),
        COALESCE((v ->> 'response.max_sequence_days')::int, fs.max_sequence_duration_days),
        COALESCE((v ->> 'response.draft_stale_days')::int, fs.draft_stale_days),
        true, v_quiet_start, v_quiet_end
      );

  -- Tone and voice → org_voice_profiles. The legacy banned list only adds to
  -- the words every draft already avoids, so project just the additions.
  v_banned := ARRAY(
    SELECT t FROM jsonb_array_elements_text(COALESCE(v -> 'tone.banned_terms', '[]'::jsonb)) t
    WHERE lower(t) NOT IN (SELECT lower(x) FROM unnest(public.config_legacy_banned_terms()) x)
  );
  SELECT examples INTO v_existing FROM public.org_voice_profiles WHERE org_id = p_org_id;
  SELECT COALESCE(jsonb_agg(
           COALESCE(
             (SELECT old FROM jsonb_array_elements(COALESCE(v_existing, '[]'::jsonb)) old
              WHERE old ->> 'body' = e ->> 'body' AND old ->> 'channel' = e ->> 'channel' LIMIT 1),
             jsonb_build_object('body', e ->> 'body', 'channel', e ->> 'channel', 'addedAt', now())
           ) ORDER BY ord), '[]'::jsonb)
  INTO v_examples
  FROM jsonb_array_elements(COALESCE(v -> 'tone.examples', '[]'::jsonb)) WITH ORDINALITY AS x(e, ord)
  WHERE ord <= 5;
  UPDATE public.org_voice_profiles vp
  SET formality = (CASE WHEN v ->> 'tone.formality' = 'formal' THEN 'professional' ELSE 'casual' END)::public.voice_formality,
      use_contractions = COALESCE((v ->> 'tone.use_contractions')::boolean, vp.use_contractions),
      use_greeting = COALESCE(btrim(v ->> 'tone.greeting'), '') <> '',
      greeting_text = NULLIF(btrim(COALESCE(v ->> 'tone.greeting', '')), ''),
      use_signoff = COALESCE(btrim(v ->> 'tone.sign_off'), '') <> '',
      signoff_text = NULLIF(btrim(COALESCE(v ->> 'tone.sign_off', '')), ''),
      sms_max_chars = COALESCE((v ->> 'tone.sms_max_chars')::int, vp.sms_max_chars),
      email_max_chars = COALESCE((v ->> 'tone.email_max_chars')::int, vp.email_max_chars),
      emoji_usage = COALESCE((v ->> 'tone.emoji')::public.voice_emoji, vp.emoji_usage),
      banned_words = v_banned,
      examples = v_examples,
      updated_at = now()
  WHERE vp.org_id = p_org_id
    AND (vp.formality::text, vp.use_contractions, vp.use_greeting, vp.greeting_text, vp.use_signoff, vp.signoff_text,
         vp.sms_max_chars, vp.email_max_chars, vp.emoji_usage::text, vp.banned_words, vp.examples)
      IS DISTINCT FROM (
        CASE WHEN v ->> 'tone.formality' = 'formal' THEN 'professional' ELSE 'casual' END,
        COALESCE((v ->> 'tone.use_contractions')::boolean, vp.use_contractions),
        COALESCE(btrim(v ->> 'tone.greeting'), '') <> '',
        NULLIF(btrim(COALESCE(v ->> 'tone.greeting', '')), ''),
        COALESCE(btrim(v ->> 'tone.sign_off'), '') <> '',
        NULLIF(btrim(COALESCE(v ->> 'tone.sign_off', '')), ''),
        COALESCE((v ->> 'tone.sms_max_chars')::int, vp.sms_max_chars),
        COALESCE((v ->> 'tone.email_max_chars')::int, vp.email_max_chars),
        COALESCE(v ->> 'tone.emoji', vp.emoji_usage::text),
        v_banned,
        v_examples
      );

  -- Approval gate → approval_gate_settings and approval_gate_actions.
  INSERT INTO public.approval_gate_settings (org_id, quiet_hours_start, quiet_hours_end, daily_send_limit_per_lead, queue_wait_limit_minutes)
  VALUES (
    p_org_id, v_quiet_start, v_quiet_end,
    COALESCE((v ->> 'compliance.daily_cap_per_lead')::int, 2),
    COALESCE((v ->> 'approval.timeout_minutes')::int, 240)
  )
  ON CONFLICT (org_id) DO UPDATE
  SET quiet_hours_start = EXCLUDED.quiet_hours_start,
      quiet_hours_end = EXCLUDED.quiet_hours_end,
      daily_send_limit_per_lead = EXCLUDED.daily_send_limit_per_lead,
      queue_wait_limit_minutes = EXCLUDED.queue_wait_limit_minutes,
      updated_at = now()
  WHERE (public.approval_gate_settings.quiet_hours_start, public.approval_gate_settings.quiet_hours_end,
         public.approval_gate_settings.daily_send_limit_per_lead, public.approval_gate_settings.queue_wait_limit_minutes)
    IS DISTINCT FROM (EXCLUDED.quiet_hours_start, EXCLUDED.quiet_hours_end, EXCLUDED.daily_send_limit_per_lead, EXCLUDED.queue_wait_limit_minutes);

  FOR v_action IN SELECT a FROM jsonb_array_elements(COALESCE(v -> 'approval.actions', '[]'::jsonb)) a LOOP
    CONTINUE WHEN NOT EXISTS (SELECT 1 FROM public.approval_action_types t WHERE t.action_type = v_action ->> 'action');
    INSERT INTO public.approval_gate_actions (org_id, action_type, mode, approver)
    VALUES (p_org_id, v_action ->> 'action', v_action ->> 'mode', COALESCE(v_action ->> 'approver', 'owners_and_managers'))
    ON CONFLICT (org_id, action_type) DO UPDATE
    SET mode = EXCLUDED.mode, approver = EXCLUDED.approver, updated_at = now()
    WHERE (public.approval_gate_actions.mode, public.approval_gate_actions.approver) IS DISTINCT FROM (EXCLUDED.mode, EXCLUDED.approver);
  END LOOP;

  -- Identity and sources → organizations.
  v_hours := v -> 'identity.business_hours';
  SELECT
    COALESCE(array_agg(d.n ORDER BY d.n) FILTER (WHERE jsonb_array_length(COALESCE(v_hours -> 'days' -> d.code, '[]'::jsonb)) > 0), ARRAY[1, 2, 3, 4, 5]::smallint[]),
    min((i ->> 'start')::time),
    max((i ->> 'end')::time)
  INTO v_days, v_start, v_end
  FROM (VALUES (1::smallint, 'mon'), (2::smallint, 'tue'), (3::smallint, 'wed'), (4::smallint, 'thu'),
               (5::smallint, 'fri'), (6::smallint, 'sat'), (7::smallint, 'sun')) AS d(n, code)
  LEFT JOIN LATERAL jsonb_array_elements(COALESCE(v_hours -> 'days' -> d.code, '[]'::jsonb)) i ON true;

  UPDATE public.organizations o
  SET timezone = COALESCE(v ->> 'identity.timezone', o.timezone),
      working_hours_start = COALESCE(v_start, o.working_hours_start),
      working_hours_end = COALESCE(v_end, o.working_hours_end),
      working_days = COALESCE(v_days, o.working_days),
      transcript_retention_days = LEAST(1095, GREATEST(30, COALESCE((v -> 'sources.retention_days' ->> 'call_transcripts')::int, o.transcript_retention_days))),
      owner_contact_name = NULLIF(btrim(COALESCE(v -> 'identity.primary_contact' ->> 'name', '')), ''),
      owner_contact_email = NULLIF(btrim(COALESCE(v -> 'identity.primary_contact' ->> 'email', '')), ''),
      owner_contact_phone = NULLIF(btrim(COALESCE(v -> 'identity.primary_contact' ->> 'phone', '')), '')
  WHERE o.id = p_org_id
    AND (o.timezone, o.working_hours_start, o.working_hours_end, o.working_days, o.transcript_retention_days,
         o.owner_contact_name, o.owner_contact_email, o.owner_contact_phone)
      IS DISTINCT FROM (
        COALESCE(v ->> 'identity.timezone', o.timezone),
        COALESCE(v_start, o.working_hours_start),
        COALESCE(v_end, o.working_hours_end),
        COALESCE(v_days, o.working_days),
        LEAST(1095, GREATEST(30, COALESCE((v -> 'sources.retention_days' ->> 'call_transcripts')::int, o.transcript_retention_days))),
        NULLIF(btrim(COALESCE(v -> 'identity.primary_contact' ->> 'name', '')), ''),
        NULLIF(btrim(COALESCE(v -> 'identity.primary_contact' ->> 'email', '')), ''),
        NULLIF(btrim(COALESCE(v -> 'identity.primary_contact' ->> 'phone', '')), '')
      );

  PERFORM set_config('vistrial.config_projecting', '', true);
END;
$$;

/*
 * Turn values from an existing screen (or from before this system) into
 * workspace overrides: equal to what it would inherit → no override; locked
 * → kept only if stricter; invalid → left out and logged. Then project, so
 * the existing table shows the effective value again.
 */
CREATE OR REPLACE FUNCTION public.config_capture_legacy(p_org_id uuid, p_desired jsonb, p_source text, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ws public.config_layers%ROWTYPE;
  v_inherited jsonb;
  v_platform public.config_layers%ROWTYPE := public.config_platform_layer();
  v_template_locks text[];
  v_values jsonb;
  v_key text;
  v_value jsonb;
  v_field public.config_fields%ROWTYPE;
  v_error text;
  v_skipped jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO v_ws FROM public.config_layers WHERE level = 'workspace' AND org_id = p_org_id FOR UPDATE;
  IF NOT FOUND OR p_desired IS NULL OR p_desired = '{}'::jsonb THEN
    RETURN;
  END IF;
  SELECT tl.locked_keys INTO v_template_locks
  FROM public.workspace_config_pins pin
  JOIN public.config_layers tl ON tl.level = 'template' AND tl.template_id = pin.template_id
  WHERE pin.org_id = p_org_id;

  v_inherited := public.config_effective_at(
    p_org_id,
    p_workspace_values => v_ws.field_values - ARRAY(SELECT jsonb_object_keys(p_desired))
  ) -> 'values';
  v_values := v_ws.field_values;

  FOR v_key, v_value IN SELECT key, value FROM jsonb_each(p_desired) LOOP
    SELECT * INTO v_field FROM public.config_fields WHERE key = v_key;
    CONTINUE WHEN NOT FOUND;
    IF v_value IS NULL OR jsonb_typeof(v_value) = 'null' THEN
      v_values := v_values - v_key;
      CONTINUE;
    END IF;
    v_error := public.config_validate_value(v_key, v_value);
    IF v_error IS NOT NULL THEN
      v_skipped := v_skipped || jsonb_build_object('key', v_key, 'reason', v_error);
      CONTINUE;
    END IF;
    IF v_key = ANY (v_platform.locked_keys) OR v_key = ANY (COALESCE(v_template_locks, ARRAY[]::text[])) THEN
      IF v_field.tighten IS NOT NULL AND v_value IS DISTINCT FROM v_inherited -> v_key
         AND public.config_is_stricter(v_field.tighten, v_inherited -> v_key, v_value) THEN
        v_values := v_values || jsonb_build_object(v_key, v_value);
      ELSE
        v_values := v_values - v_key;
        IF v_value IS DISTINCT FROM v_inherited -> v_key THEN
          v_skipped := v_skipped || jsonb_build_object('key', v_key, 'reason', 'locked rule; the locked value applies');
        END IF;
      END IF;
    ELSIF v_value = v_inherited -> v_key THEN
      v_values := v_values - v_key;
    ELSE
      v_values := v_values || jsonb_build_object(v_key, v_value);
    END IF;
  END LOOP;

  PERFORM public.config_write_layer(v_ws.id, v_values, ARRAY[]::text[], p_source, p_note);
  IF jsonb_array_length(v_skipped) > 0 THEN
    PERFORM public.ws_log(p_org_id, 'config.workspace.legacy_skipped', 'config_layers', v_ws.id::text,
      jsonb_build_object('skipped', v_skipped));
  END IF;
  PERFORM public.config_project_workspace(p_org_id);
END;
$$;

-- What a business profile says, as configuration values.
CREATE OR REPLACE FUNCTION public.config_values_from_profile(p_profile public.business_profiles, p_only text[] DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_labels jsonb := public.config_profile_labels();
  v_out jsonb := '{}'::jsonb;
  v_list jsonb;
BEGIN
  IF p_only IS NULL OR 'qualification.ready_criteria' = ANY (p_only) THEN
    SELECT jsonb_agg(DISTINCT x) INTO v_list FROM (
      SELECT (v_labels -> 'signals' ->> s::text) || '.' AS x FROM unnest(p_profile.qualification_signals) s WHERE s::text <> 'other'
      UNION SELECT btrim(p_profile.qualification_signals_other) WHERE COALESCE(btrim(p_profile.qualification_signals_other), '') <> ''
    ) items WHERE x IS NOT NULL;
    IF v_list IS NOT NULL THEN v_out := v_out || jsonb_build_object('qualification.ready_criteria', v_list); END IF;
  END IF;

  IF p_only IS NULL OR 'qualification.disqualifiers' = ANY (p_only) THEN
    SELECT jsonb_agg(jsonb_build_object('reason', x, 'closing_message', NULL)) INTO v_list FROM (
      SELECT DISTINCT (v_labels -> 'disqualifiers' ->> d::text) || '.' AS x FROM unnest(p_profile.disqualifiers) d WHERE d::text <> 'other'
      UNION SELECT btrim(p_profile.disqualifiers_other) WHERE COALESCE(btrim(p_profile.disqualifiers_other), '') <> ''
    ) items WHERE x IS NOT NULL;
    IF v_list IS NOT NULL THEN v_out := v_out || jsonb_build_object('qualification.disqualifiers', v_list); END IF;
  END IF;

  IF p_only IS NULL OR 'industry.objections' = ANY (p_only) THEN
    SELECT jsonb_agg(jsonb_build_object(
             'label', left(COALESCE(NULLIF(btrim(o ->> 'phrasing'), ''), v_labels -> 'objection_types' ->> (o ->> 'type')), 80),
             'category', CASE WHEN (v_labels -> 'objection_types') ? (o ->> 'type') THEN o ->> 'type' ELSE 'other' END,
             'recognize', NULLIF(btrim(COALESCE(o ->> 'phrasing', '')), ''),
             'guidance', NULLIF(btrim(COALESCE(o ->> 'response', '')), '')))
    INTO v_list
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_profile.top_objections) = 'array' THEN p_profile.top_objections ELSE '[]'::jsonb END) o;
    IF v_list IS NOT NULL THEN v_out := v_out || jsonb_build_object('industry.objections', v_list); END IF;
  END IF;

  IF (p_only IS NULL OR 'industry.offers' = ANY (p_only)) AND (p_profile.offer_name IS NOT NULL OR p_profile.offer_type IS NOT NULL) THEN
    v_out := v_out || jsonb_build_object('industry.offers', jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'name', COALESCE(NULLIF(btrim(p_profile.offer_name), ''), NULLIF(btrim(p_profile.offer_type_other), ''), v_labels -> 'offer_types' ->> p_profile.offer_type::text),
      'ticket_min', CASE WHEN p_profile.price_point_cents IS NOT NULL THEN round(p_profile.price_point_cents / 100.0) END,
      'ticket_max', CASE WHEN p_profile.price_point_cents IS NOT NULL THEN round(p_profile.price_point_cents / 100.0) END,
      'recurring', false
    ))));
  END IF;

  IF p_only IS NULL OR 'industry.lead_sources' = ANY (p_only) THEN
    SELECT jsonb_agg(jsonb_build_object('source', x, 'priority', 'normal', 'treatment', NULL)) INTO v_list FROM (
      SELECT DISTINCT v_labels -> 'channels' ->> c::text AS x FROM unnest(p_profile.lead_channels) c WHERE c::text <> 'other'
      UNION SELECT btrim(p_profile.lead_channels_other) WHERE COALESCE(btrim(p_profile.lead_channels_other), '') <> ''
    ) items WHERE x IS NOT NULL;
    IF v_list IS NOT NULL THEN v_out := v_out || jsonb_build_object('industry.lead_sources', v_list); END IF;
  END IF;

  RETURN v_out;
END;
$$;

-- Everything the existing tables say about one workspace, as configuration values.
CREATE OR REPLACE FUNCTION public.config_values_from_legacy(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_out jsonb := '{}'::jsonb;
  s public.score_configs%ROWTYPE;
  fs public.follow_up_settings%ROWTYPE;
  vp public.org_voice_profiles%ROWTYPE;
  g public.approval_gate_settings%ROWTYPE;
  o public.organizations%ROWTYPE;
  bp public.business_profiles%ROWTYPE;
  v_platform jsonb := (public.config_platform_layer()).field_values;
  v_actions jsonb;
BEGIN
  SELECT * INTO s FROM public.score_configs WHERE org_id = p_org_id;
  IF FOUND THEN
    v_out := v_out || jsonb_build_object(
      'qualification.factor_weights', jsonb_build_object(
        'timeline', s.timeline_weight, 'investment_capacity', s.investment_capacity_weight,
        'decision_authority', s.decision_authority_weight, 'pain_severity', s.pain_severity_weight),
      'qualification.ready_threshold', s.ready_threshold,
      'response.first_touch_minutes', s.speed_to_lead_minutes,
      'response.ghost_days_soft', s.ghost_days_soft,
      'response.ghost_days_hard', s.ghost_days_hard);
  END IF;

  SELECT * INTO fs FROM public.follow_up_settings WHERE org_id = p_org_id;
  IF FOUND THEN
    v_out := v_out || jsonb_build_object(
      'response.max_sequence_length', fs.max_sequence_length,
      'response.max_sequence_days', fs.max_sequence_duration_days,
      'response.draft_stale_days', fs.draft_stale_days);
    IF fs.quiet_hours_enabled THEN
      v_out := v_out || jsonb_build_object('compliance.quiet_hours', jsonb_build_object(
        'start', public.config_time_text(fs.quiet_hours_start), 'end', public.config_time_text(fs.quiet_hours_end)));
    END IF;
  END IF;

  SELECT * INTO vp FROM public.org_voice_profiles WHERE org_id = p_org_id;
  IF FOUND THEN
    v_out := v_out || jsonb_build_object(
      'tone.formality', CASE WHEN vp.formality::text = 'professional' THEN 'formal' ELSE 'casual' END,
      'tone.use_contractions', vp.use_contractions,
      'tone.greeting', CASE WHEN vp.use_greeting THEN COALESCE(vp.greeting_text, '') ELSE '' END,
      'tone.sign_off', CASE WHEN vp.use_signoff THEN COALESCE(vp.signoff_text, '') ELSE '' END,
      'tone.sms_max_chars', vp.sms_max_chars,
      'tone.email_max_chars', vp.email_max_chars,
      'tone.emoji', vp.emoji_usage::text,
      'tone.banned_terms', to_jsonb(ARRAY(
        SELECT DISTINCT ON (lower(t)) t FROM unnest(public.config_legacy_banned_terms() || COALESCE(vp.banned_words, ARRAY[]::text[])) t
      )),
      'tone.examples', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('channel', e ->> 'channel', 'body', e ->> 'body'))
        FROM jsonb_array_elements(vp.examples) e
        WHERE e ->> 'channel' IN ('sms', 'email') AND COALESCE(btrim(e ->> 'body'), '') <> ''
      ), '[]'::jsonb));
  END IF;

  SELECT * INTO g FROM public.approval_gate_settings WHERE org_id = p_org_id;
  IF FOUND THEN
    v_out := v_out || jsonb_build_object(
      'compliance.daily_cap_per_lead', g.daily_send_limit_per_lead,
      'approval.timeout_minutes', g.queue_wait_limit_minutes);
    -- The gate's quiet hours, if stricter than follow-up's, are what applied to sends from the queue.
    IF NOT v_out ? 'compliance.quiet_hours' OR public.config_is_stricter('wider_window', v_out -> 'compliance.quiet_hours',
         jsonb_build_object('start', public.config_time_text(g.quiet_hours_start), 'end', public.config_time_text(g.quiet_hours_end))) THEN
      v_out := v_out || jsonb_build_object('compliance.quiet_hours', jsonb_build_object(
        'start', public.config_time_text(g.quiet_hours_start), 'end', public.config_time_text(g.quiet_hours_end)));
    END IF;
  END IF;

  SELECT COALESCE(jsonb_agg(
           CASE WHEN a.org_id IS NULL THEN d ELSE d || jsonb_build_object('mode', a.mode, 'approver', a.approver)
                || CASE WHEN a.mode = 'auto_run' THEN jsonb_build_object('auto_run_confirmed', true) ELSE '{}'::jsonb END END
           ORDER BY ord), '[]'::jsonb)
  INTO v_actions
  FROM jsonb_array_elements(v_platform -> 'approval.actions') WITH ORDINALITY AS x(d, ord)
  LEFT JOIN public.approval_gate_actions a ON a.org_id = p_org_id AND a.action_type = d ->> 'action';
  IF EXISTS (SELECT 1 FROM public.approval_gate_actions WHERE org_id = p_org_id) THEN
    v_out := v_out || jsonb_build_object('approval.actions', v_actions);
  END IF;

  SELECT * INTO o FROM public.organizations WHERE id = p_org_id;
  v_out := v_out || jsonb_build_object(
    'identity.timezone', o.timezone,
    'identity.business_hours', public.config_hours_from_legacy(o.working_hours_start, o.working_hours_end, o.working_days),
    'sources.retention_days', COALESCE(v_platform -> 'sources.retention_days', '{}'::jsonb)
      || jsonb_build_object('call_transcripts', o.transcript_retention_days));
  IF COALESCE(o.owner_contact_name, o.owner_contact_email, o.owner_contact_phone) IS NOT NULL THEN
    v_out := v_out || jsonb_build_object('identity.primary_contact', jsonb_strip_nulls(jsonb_build_object(
      'name', o.owner_contact_name, 'email', o.owner_contact_email, 'phone', o.owner_contact_phone)));
  END IF;

  SELECT * INTO bp FROM public.business_profiles WHERE org_id = p_org_id;
  IF FOUND THEN
    v_out := v_out || public.config_values_from_profile(bp);
  END IF;
  RETURN v_out;
END;
$$;

-- Capture edits made through the existing screens --------------------------

CREATE OR REPLACE FUNCTION public.config_capture_from_legacy_table()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.org_id ELSE NEW.org_id END;
  v_all jsonb;
  v_desired jsonb := '{}'::jsonb;
  v_keys text[];
  v_effective jsonb;
  v_actions jsonb;
  v_added text[];
  v_removed text[];
  v_row jsonb;
BEGIN
  IF current_setting('vistrial.config_projecting', true) = '1'
     OR current_setting('vistrial.config_migrating', true) = '1'
     OR NOT EXISTS (SELECT 1 FROM public.config_layers WHERE level = 'workspace' AND org_id = v_org) THEN
    RETURN NULL;
  END IF;

  v_all := public.config_values_from_legacy(v_org);
  v_keys := CASE TG_TABLE_NAME
    WHEN 'score_configs' THEN ARRAY['qualification.factor_weights', 'qualification.ready_threshold', 'response.first_touch_minutes',
                                    'response.ghost_days_soft', 'response.ghost_days_hard']
    WHEN 'follow_up_settings' THEN ARRAY['response.max_sequence_length', 'response.max_sequence_days', 'response.draft_stale_days',
                                         'compliance.quiet_hours']
    WHEN 'org_voice_profiles' THEN ARRAY['tone.formality', 'tone.use_contractions', 'tone.greeting', 'tone.sign_off',
                                         'tone.sms_max_chars', 'tone.email_max_chars', 'tone.emoji', 'tone.examples']
    WHEN 'approval_gate_settings' THEN ARRAY['compliance.daily_cap_per_lead', 'approval.timeout_minutes', 'compliance.quiet_hours']
    ELSE ARRAY[]::text[]
  END;
  SELECT COALESCE(jsonb_object_agg(k, v_all -> k), '{}'::jsonb) INTO v_desired FROM unnest(v_keys) k WHERE v_all ? k;

  v_effective := public.config_effective_at(v_org) -> 'values';
  -- The legacy banned list only adds to the words every draft avoids: carry
  -- additions and removals into the full list rather than replacing it.
  IF TG_TABLE_NAME = 'org_voice_profiles' AND TG_OP = 'UPDATE'
     AND (to_jsonb(NEW) -> 'banned_words') IS DISTINCT FROM (to_jsonb(OLD) -> 'banned_words') THEN
    v_added := ARRAY(SELECT jsonb_array_elements_text(to_jsonb(NEW) -> 'banned_words')
                     EXCEPT SELECT jsonb_array_elements_text(to_jsonb(OLD) -> 'banned_words'));
    v_removed := ARRAY(SELECT jsonb_array_elements_text(to_jsonb(OLD) -> 'banned_words')
                       EXCEPT SELECT jsonb_array_elements_text(to_jsonb(NEW) -> 'banned_words'));
    v_desired := v_desired || jsonb_build_object('tone.banned_terms', to_jsonb(ARRAY(
      SELECT DISTINCT ON (lower(t)) t FROM (
        SELECT t FROM jsonb_array_elements_text(COALESCE(v_effective -> 'tone.banned_terms', '[]'::jsonb)) t
        WHERE lower(t) NOT IN (SELECT lower(r) FROM unnest(v_removed) r)
        UNION ALL SELECT unnest(v_added)
      ) terms(t)
    )));
  END IF;
  IF TG_TABLE_NAME = 'approval_gate_actions' THEN
    v_row := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
    SELECT jsonb_agg(
             CASE WHEN a ->> 'action' = v_row ->> 'action_type' THEN
               CASE WHEN TG_OP = 'DELETE' THEN
                 COALESCE((SELECT d FROM jsonb_array_elements((public.config_platform_layer()).field_values -> 'approval.actions') d
                           WHERE d ->> 'action' = v_row ->> 'action_type'), a)
               ELSE a || jsonb_build_object('mode', v_row ->> 'mode', 'approver', v_row ->> 'approver')
                      || CASE WHEN v_row ->> 'mode' = 'auto_run' THEN jsonb_build_object('auto_run_confirmed', true) ELSE '{}'::jsonb END
               END
             ELSE a END)
    INTO v_actions
    FROM jsonb_array_elements(COALESCE(v_effective -> 'approval.actions', '[]'::jsonb)) a;
    v_desired := jsonb_build_object('approval.actions', v_actions);
  END IF;

  PERFORM public.config_capture_legacy(v_org, v_desired, 'legacy_sync',
    format('Changed through the %s settings screen.', replace(TG_TABLE_NAME, '_', ' ')));
  RETURN NULL;
END;
$$;

CREATE TRIGGER score_configs_config_capture
  AFTER UPDATE ON public.score_configs
  FOR EACH ROW EXECUTE FUNCTION public.config_capture_from_legacy_table();
CREATE TRIGGER follow_up_settings_config_capture
  AFTER UPDATE ON public.follow_up_settings
  FOR EACH ROW EXECUTE FUNCTION public.config_capture_from_legacy_table();
CREATE TRIGGER org_voice_profiles_config_capture
  AFTER UPDATE ON public.org_voice_profiles
  FOR EACH ROW EXECUTE FUNCTION public.config_capture_from_legacy_table();
CREATE TRIGGER approval_gate_settings_config_capture
  AFTER INSERT OR UPDATE ON public.approval_gate_settings
  FOR EACH ROW EXECUTE FUNCTION public.config_capture_from_legacy_table();
CREATE TRIGGER approval_gate_actions_config_capture
  AFTER INSERT OR UPDATE OR DELETE ON public.approval_gate_actions
  FOR EACH ROW EXECUTE FUNCTION public.config_capture_from_legacy_table();

CREATE OR REPLACE FUNCTION public.config_capture_from_organizations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_desired jsonb := '{}'::jsonb;
  v_effective jsonb;
BEGIN
  IF current_setting('vistrial.config_projecting', true) = '1'
     OR current_setting('vistrial.config_migrating', true) = '1'
     OR NOT EXISTS (SELECT 1 FROM public.config_layers WHERE level = 'workspace' AND org_id = NEW.id) THEN
    RETURN NULL;
  END IF;
  v_effective := public.config_effective_at(NEW.id) -> 'values';
  IF NEW.timezone IS DISTINCT FROM OLD.timezone THEN
    v_desired := v_desired || jsonb_build_object('identity.timezone', NEW.timezone);
  END IF;
  -- Only when the hours themselves changed, so per-day hours set in the
  -- configuration are never flattened by an unrelated edit.
  IF (NEW.working_hours_start, NEW.working_hours_end, NEW.working_days)
     IS DISTINCT FROM (OLD.working_hours_start, OLD.working_hours_end, OLD.working_days) THEN
    v_desired := v_desired || jsonb_build_object('identity.business_hours',
      public.config_hours_from_legacy(NEW.working_hours_start, NEW.working_hours_end, NEW.working_days));
  END IF;
  IF NEW.transcript_retention_days IS DISTINCT FROM OLD.transcript_retention_days THEN
    v_desired := v_desired || jsonb_build_object('sources.retention_days',
      COALESCE(v_effective -> 'sources.retention_days', '{}'::jsonb) || jsonb_build_object('call_transcripts', NEW.transcript_retention_days));
  END IF;
  IF (NEW.owner_contact_name, NEW.owner_contact_email, NEW.owner_contact_phone)
     IS DISTINCT FROM (OLD.owner_contact_name, OLD.owner_contact_email, OLD.owner_contact_phone) THEN
    v_desired := v_desired || jsonb_build_object('identity.primary_contact', jsonb_strip_nulls(jsonb_build_object(
      'name', NEW.owner_contact_name, 'email', NEW.owner_contact_email, 'phone', NEW.owner_contact_phone)));
  END IF;
  IF v_desired <> '{}'::jsonb THEN
    PERFORM public.config_capture_legacy(NEW.id, v_desired, 'legacy_sync', 'Changed through the workspace settings screen.');
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER organizations_config_capture
  AFTER UPDATE OF timezone, working_hours_start, working_hours_end, working_days, transcript_retention_days,
                  owner_contact_name, owner_contact_email, owner_contact_phone
  ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.config_capture_from_organizations();

-- Onboarding answers become overrides too.
CREATE OR REPLACE FUNCTION public.config_capture_from_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_only text[] := ARRAY[]::text[];
BEGIN
  IF current_setting('vistrial.config_projecting', true) = '1'
     OR current_setting('vistrial.config_migrating', true) = '1'
     OR NOT EXISTS (SELECT 1 FROM public.config_layers WHERE level = 'workspace' AND org_id = NEW.org_id) THEN
    RETURN NULL;
  END IF;
  IF (NEW.qualification_signals, NEW.qualification_signals_other) IS DISTINCT FROM (OLD.qualification_signals, OLD.qualification_signals_other) THEN
    v_only := v_only || 'qualification.ready_criteria'::text;
  END IF;
  IF (NEW.disqualifiers, NEW.disqualifiers_other) IS DISTINCT FROM (OLD.disqualifiers, OLD.disqualifiers_other) THEN
    v_only := v_only || 'qualification.disqualifiers'::text;
  END IF;
  IF NEW.top_objections IS DISTINCT FROM OLD.top_objections THEN
    v_only := v_only || 'industry.objections'::text;
  END IF;
  IF (NEW.offer_name, NEW.offer_type, NEW.offer_type_other, NEW.price_point_cents)
     IS DISTINCT FROM (OLD.offer_name, OLD.offer_type, OLD.offer_type_other, OLD.price_point_cents) THEN
    v_only := v_only || 'industry.offers'::text;
  END IF;
  IF (NEW.lead_channels, NEW.lead_channels_other) IS DISTINCT FROM (OLD.lead_channels, OLD.lead_channels_other) THEN
    v_only := v_only || 'industry.lead_sources'::text;
  END IF;
  IF cardinality(v_only) > 0 THEN
    PERFORM public.config_capture_legacy(NEW.org_id, public.config_values_from_profile(NEW, v_only), 'legacy_sync',
      'Changed through onboarding (business profile).');
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER business_profiles_config_capture
  AFTER UPDATE ON public.business_profiles
  FOR EACH ROW EXECUTE FUNCTION public.config_capture_from_profile();

-- Every run and draft records the configuration version that produced it ----

CREATE OR REPLACE FUNCTION public.config_stamp_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.config_version IS NULL AND NEW.org_id IS NOT NULL THEN
    NEW.config_version := public.config_version_stamp(NEW.org_id);
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'agent_runs', 'operator_runs', 'follow_up_jobs', 'follow_up_drafts', 'extraction_jobs', 'call_extractions',
    'readiness_scores', 'ghost_detector_runs', 'approval_items', 'sales_os_messages', 'sales_os_executions', 'ghl_dispatches'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS config_version text', t);
    EXECUTE format('COMMENT ON COLUMN public.%I.config_version IS %L', t,
      'The configuration version (platform/template/workspace) this was produced under. See config_version_stamp().');
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.config_stamp_row()',
      t || '_config_stamp', t);
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.config_project_workspace(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.config_capture_legacy(uuid, jsonb, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.config_values_from_profile(public.business_profiles, text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.config_values_from_legacy(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.config_capture_from_legacy_table() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.config_capture_from_organizations() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.config_capture_from_profile() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.config_stamp_row() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.config_project_workspace(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.config_values_from_legacy(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 6. Existing workspaces.
--
--    Before anything is projected, the legacy settings rows are copied into
--    config_migration_legacy for the rollback. Then every existing workspace
--    is put on the Coaches and Consultants template, as decided, pinned to
--    the launch version of the platform default, with auto-accept off (these
--    workspaces are in use). Its own values from the existing tables become
--    its overrides, keeping only what differs from the template and default,
--    so its effective configuration reproduces what the app does today.
--
--    The only deliberate differences are the launch compliance rules, which
--    are locked: quiet hours 8pm to 8am in the lead's local time (follow-ups
--    used 9pm), opt-out words, the daily limit on every send, and the
--    first-touch clock pausing outside business hours. Platform version 2
--    records them.
-- ---------------------------------------------------------------------------

INSERT INTO public.config_migration_legacy (org_id, table_name, row_data)
SELECT org_id, 'score_configs', to_jsonb(t) FROM public.score_configs t
UNION ALL SELECT org_id, 'follow_up_settings', to_jsonb(t) FROM public.follow_up_settings t
UNION ALL SELECT org_id, 'org_voice_profiles', to_jsonb(t) FROM public.org_voice_profiles t
UNION ALL SELECT org_id, 'approval_gate_settings', to_jsonb(t) FROM public.approval_gate_settings t
UNION ALL SELECT org_id, 'approval_gate_actions', to_jsonb(t) FROM public.approval_gate_actions t
UNION ALL SELECT id, 'organizations', jsonb_build_object(
  'timezone', timezone, 'working_hours_start', working_hours_start, 'working_hours_end', working_hours_end,
  'working_days', working_days, 'transcript_retention_days', transcript_retention_days,
  'owner_contact_name', owner_contact_name, 'owner_contact_email', owner_contact_email, 'owner_contact_phone', owner_contact_phone
) FROM public.organizations;

DO $$
DECLARE
  v_org public.organizations%ROWTYPE;
  v_platform public.config_layers%ROWTYPE := public.config_platform_layer();
  v_template_id uuid;
  v_template_version integer;
  v_layer uuid;
BEGIN
  SELECT t.id, l.version INTO v_template_id, v_template_version
  FROM public.config_templates t
  JOIN public.config_layers l ON l.level = 'template' AND l.template_id = t.id
  WHERE t.slug = 'coaches-consultants';

  FOR v_org IN SELECT * FROM public.organizations ORDER BY created_at LOOP
    CONTINUE WHEN EXISTS (SELECT 1 FROM public.config_layers WHERE level = 'workspace' AND org_id = v_org.id);
    PERFORM set_config('vistrial.config_migrating', '1', true);

    INSERT INTO public.config_layers (level, org_id) VALUES ('workspace', v_org.id) RETURNING id INTO v_layer;
    INSERT INTO public.workspace_config_pins (org_id, template_id, template_version, platform_version, auto_accept_while_onboarding)
    VALUES (v_org.id, v_template_id, v_template_version, v_platform.version, false);
    PERFORM public.config_write_layer(v_layer,
      jsonb_build_object('identity.business_name', v_org.name, 'identity.display_name', v_org.name),
      ARRAY[]::text[], 'migration', 'Workspace names, from before the configuration system.');

    PERFORM set_config('vistrial.config_migrating', '', true);
    PERFORM public.config_capture_legacy(
      v_org.id,
      public.config_values_from_legacy(v_org.id),
      'migration',
      'Settings from before the configuration system, kept as this workspace''s own values so nothing changes.'
    );
  END LOOP;
END $$;
