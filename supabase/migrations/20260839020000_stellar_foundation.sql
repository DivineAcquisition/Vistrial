-- Prompt S1: Stellar Foundation.
-- Shared foundation with core Vistrial: same organizations, org_members, and
-- auth tables. Stellar adds a product flag on organizations, three roles,
-- the placement object, and a DA elevated-access pattern that is never a
-- backdoor membership.
--
-- AMBIGUITY (flagged, not guessed): the internal-DA-tool -> build-stage
-- mapping described in Prompt S1 Part 3 has no confirmed source system in
-- this codebase yet. `stellar_build_stage_mappings` exists as the
-- configuration surface DA will populate once that mapping is confirmed.
-- Nothing in this migration or in the app reads it to *set* a build stage;
-- `placements.build_stage` is written directly (by a future DA workflow in
-- S2+), never guessed from an assumed source.

-- ---------------------------------------------------------------------------
-- Product flag, added to the existing shared organizations table. Roles
-- (client_viewer, da_operator) were added to org_role in the prior
-- migration, in their own transaction.
-- ---------------------------------------------------------------------------

CREATE TYPE public.org_product AS ENUM ('stellar', 'core', 'both');

ALTER TABLE public.organizations
  ADD COLUMN product public.org_product NOT NULL DEFAULT 'core';

COMMENT ON COLUMN public.organizations.product IS
  'Which product line this org belongs to. Existing orgs default to core; Stellar client orgs are created with stellar.';

CREATE INDEX organizations_product_idx ON public.organizations (product);

-- ---------------------------------------------------------------------------
-- Placements (Part 2)
-- ---------------------------------------------------------------------------

CREATE TYPE public.placement_agreement_status AS ENUM ('draft', 'sent', 'signed', 'void');

-- Exactly five, plain language, per Part 3. This is the only vocabulary the
-- client portal is allowed to show.
CREATE TYPE public.placement_build_stage AS ENUM (
  'getting_set_up',
  'building_system',
  'testing',
  'live',
  'running_smoothly'
);

CREATE TABLE public.placements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  setter_member_id uuid REFERENCES public.org_members (id) ON DELETE SET NULL,
  agreement_status public.placement_agreement_status NOT NULL DEFAULT 'draft',
  agreement_document_url text,
  agreement_signed_at timestamptz,
  build_stage public.placement_build_stage NOT NULL DEFAULT 'getting_set_up',
  build_stage_updated_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT placements_signed_requires_timestamp CHECK (
    agreement_status <> 'signed' OR agreement_signed_at IS NOT NULL
  ),
  CONSTRAINT placements_ended_after_started CHECK (ended_at IS NULL OR ended_at >= started_at)
);

COMMENT ON TABLE public.placements IS
  'One setter, installed at one org, under one agreement. History is preserved: a setter change or renewal is a new row, not an overwrite. The active placement for an org is the one with ended_at null.';

COMMENT ON COLUMN public.placements.build_stage IS
  'One of exactly five plain-language stages (Part 3). Written directly by DA workflow; never inferred client-side.';

-- At most one active (ended_at IS NULL) placement per org at a time. History
-- itself (ended rows) is unconstrained so multiple past placements persist.
CREATE UNIQUE INDEX placements_org_active_key
  ON public.placements (org_id)
  WHERE ended_at IS NULL;

CREATE INDEX placements_org_started_idx ON public.placements (org_id, started_at DESC);
CREATE INDEX placements_setter_idx
  ON public.placements (setter_member_id)
  WHERE setter_member_id IS NOT NULL;
CREATE INDEX placements_active_idx ON public.placements (started_at) WHERE ended_at IS NULL;

CREATE TRIGGER placements_set_updated_at
  BEFORE UPDATE ON public.placements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.stamp_placement_build_stage_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.build_stage IS DISTINCT FROM OLD.build_stage THEN
    NEW.build_stage_updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER placements_stamp_build_stage
  BEFORE UPDATE ON public.placements
  FOR EACH ROW EXECUTE FUNCTION public.stamp_placement_build_stage_updated_at();

-- ---------------------------------------------------------------------------
-- Build-stage mapping configuration (Part 3). Configuration, not code, so DA
-- can adjust it without a deploy. See the file-header ambiguity note: this
-- table has no confirmed source keys yet and nothing reads it to auto-set a
-- stage. It exists so that work is not blocked once the mapping is confirmed.
-- ---------------------------------------------------------------------------

CREATE TABLE public.stellar_build_stage_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  internal_state_key text NOT NULL,
  build_stage public.placement_build_stage NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stellar_build_stage_mappings_key_key UNIQUE (internal_state_key)
);

COMMENT ON TABLE public.stellar_build_stage_mappings IS
  'Maps DA''s internal project-tool states or task-completion patterns to the five plain build stages. Empty until that mapping is confirmed against DA''s actual process (Part 3). Configuration only — no code path reads this yet.';

CREATE TRIGGER stellar_build_stage_mappings_set_updated_at
  BEFORE UPDATE ON public.stellar_build_stage_mappings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- DA elevated access (Part 4): standing read grant, never a membership row.
-- ---------------------------------------------------------------------------

CREATE TABLE public.stellar_da_operators (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  granted_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  note text
);

COMMENT ON TABLE public.stellar_da_operators IS
  'Standing cross-org read access for DA staff running Stellar placements. Distinct from platform_admins: holding a row here grants no org_members row anywhere. Never a backdoor membership.';

ALTER TABLE public.stellar_da_operators ENABLE ROW LEVEL SECURITY;

CREATE POLICY stellar_da_operators_select
  ON public.stellar_da_operators
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.is_platform_admin());

REVOKE ALL ON TABLE public.stellar_da_operators FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.stellar_da_operators TO authenticated;
GRANT ALL ON TABLE public.stellar_da_operators TO service_role;

CREATE OR REPLACE FUNCTION public.is_stellar_da_operator()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_platform_admin()
    OR EXISTS (SELECT 1 FROM public.stellar_da_operators WHERE user_id = auth.uid());
$$;

REVOKE ALL ON FUNCTION public.is_stellar_da_operator() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_stellar_da_operator() TO authenticated, service_role;

-- Every cross-org read a DA operator performs is logged here, separate from
-- the org's own settings_activity / activity stream, because this is DA
-- looking into a client's workspace, not the client's own team acting.
CREATE TABLE public.stellar_da_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  org_id uuid REFERENCES public.organizations (id) ON DELETE SET NULL,
  action text NOT NULL,
  resource text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.stellar_da_access_log IS
  'Every DA cross-org read against Stellar data, attributed to the operator. org_id null means an all-orgs listing (e.g. the DA console). Append-only.';

CREATE INDEX stellar_da_access_log_user_idx ON public.stellar_da_access_log (user_id, occurred_at DESC);
CREATE INDEX stellar_da_access_log_org_idx
  ON public.stellar_da_access_log (org_id, occurred_at DESC)
  WHERE org_id IS NOT NULL;

ALTER TABLE public.stellar_da_access_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY stellar_da_access_log_select
  ON public.stellar_da_access_log
  FOR SELECT
  TO authenticated
  USING (public.is_platform_admin());

REVOKE ALL ON TABLE public.stellar_da_access_log FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.stellar_da_access_log TO authenticated;
GRANT ALL ON TABLE public.stellar_da_access_log TO service_role;

CREATE OR REPLACE FUNCTION public.record_stellar_da_access(
  p_org_id uuid,
  p_action text,
  p_resource text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_stellar_da_operator() THEN
    RAISE EXCEPTION 'not a stellar da_operator';
  END IF;
  INSERT INTO public.stellar_da_access_log (user_id, org_id, action, resource)
  VALUES (auth.uid(), p_org_id, p_action, p_resource);
END;
$$;

REVOKE ALL ON FUNCTION public.record_stellar_da_access(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_stellar_da_access(uuid, text, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RLS on placements (Part 2)
-- ---------------------------------------------------------------------------

ALTER TABLE public.placements ENABLE ROW LEVEL SECURITY;

-- Direct org access: an org's own owner/admin/client_viewer can see every
-- placement in their org; a setter sees only the placement they are
-- assigned to. da_operator access never runs through this policy — it has
-- no org_members row to satisfy it — and instead goes through the logged
-- RPCs below.
CREATE POLICY placements_select
  ON public.placements
  FOR SELECT
  TO authenticated
  USING (
    public.user_has_org_role(org_id, 'owner', 'admin', 'client_viewer')
    OR (
      public.user_has_org_role(org_id, 'setter')
      AND setter_member_id = public.user_member_id(org_id)
    )
  );

REVOKE ALL ON TABLE public.placements FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.placements TO authenticated;
GRANT ALL ON TABLE public.placements TO service_role;

-- ---------------------------------------------------------------------------
-- DA console RPCs. Logged reads, service-role-strength access without an
-- org_members row. Writes on behalf of a client are out of scope for S1
-- (Part 6) — no write RPC ships here.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.stellar_da_list_placements()
RETURNS TABLE (
  placement_id uuid,
  org_id uuid,
  org_name text,
  setter_member_id uuid,
  setter_name text,
  agreement_status public.placement_agreement_status,
  build_stage public.placement_build_stage,
  build_stage_updated_at timestamptz,
  started_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_stellar_da_operator() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  PERFORM public.record_stellar_da_access(NULL, 'list', 'placements');

  RETURN QUERY
  SELECT
    p.id,
    p.org_id,
    o.name,
    p.setter_member_id,
    m.display_name,
    p.agreement_status,
    p.build_stage,
    p.build_stage_updated_at,
    p.started_at
  FROM public.placements p
  JOIN public.organizations o ON o.id = p.org_id
  LEFT JOIN public.org_members m ON m.id = p.setter_member_id
  WHERE p.ended_at IS NULL
    AND o.product IN ('stellar', 'both')
  ORDER BY o.name;
END;
$$;

REVOKE ALL ON FUNCTION public.stellar_da_list_placements() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stellar_da_list_placements() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.stellar_da_get_placement(p_org_id uuid)
RETURNS TABLE (
  placement_id uuid,
  org_id uuid,
  org_name text,
  setter_member_id uuid,
  setter_name text,
  agreement_status public.placement_agreement_status,
  agreement_document_url text,
  agreement_signed_at timestamptz,
  build_stage public.placement_build_stage,
  build_stage_updated_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_stellar_da_operator() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  PERFORM public.record_stellar_da_access(p_org_id, 'read', 'placement');

  RETURN QUERY
  SELECT
    p.id,
    p.org_id,
    o.name,
    p.setter_member_id,
    m.display_name,
    p.agreement_status,
    p.agreement_document_url,
    p.agreement_signed_at,
    p.build_stage,
    p.build_stage_updated_at,
    p.started_at,
    p.ended_at
  FROM public.placements p
  JOIN public.organizations o ON o.id = p.org_id
  LEFT JOIN public.org_members m ON m.id = p.setter_member_id
  WHERE p.org_id = p_org_id
  ORDER BY p.started_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.stellar_da_get_placement(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stellar_da_get_placement(uuid) TO authenticated, service_role;
