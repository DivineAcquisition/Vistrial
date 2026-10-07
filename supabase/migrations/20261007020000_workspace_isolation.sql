-- Workspace roles, part 2 of 2: platform staff, assignments, workspace status,
-- the activity log, the inbound holding area, and data-layer isolation by role.
--
-- Model
--   Every customer is one workspace (organizations). Five roles:
--     Workspace Owner     org_members.role = 'owner',  seat 'customer'
--     Workspace Member    org_members.role = 'member', seat 'customer'
--                         (can_approve grants approvals, set by an owner)
--     Workspace Operator  org_members.role IN ('setter','closer','operator'),
--                         seat 'customer'
--     Service Team        platform_staff.role = 'service_team', plus an active
--                         workspace_assignments row per workspace
--     Platform Admin      platform_staff.role = 'platform_admin', every workspace
--
--   Staff work inside a workspace through a staff seat: an org_members row with
--   seat 'staff' and role 'admin'. Seats exist because touches, notes, files,
--   approvals and lead slots all point at org_members.id. A staff seat is never
--   written by hand: sync_staff_seats() keeps it active exactly while the
--   assignment (or the platform-admin role) is active.
--
-- Enforcement
--   Permissive policies already scope every table to user_org_ids(). This
--   migration redefines that function and user_has_org_role() so they honour
--   seats, assignments and workspace status, then layers RESTRICTIVE policies
--   on top. Restrictive policies only ever narrow access, so the existing,
--   per-table rules underneath keep working unchanged.
--
--   Configuration tables additionally carry a BEFORE trigger: a signed-in caller
--   who is not staff for that workspace cannot write them, whichever function
--   or screen the write came from. Jobs and webhooks run without a user JWT and
--   are unaffected.

-- ---------------------------------------------------------------------------
-- 0. Converge with objects the hosted project already has.
--
-- 20260825163916..20260825164650 (settings tiers) ran on the hosted project
-- but are no-op placeholders in this repo. Nothing in the app reads them, but
-- their guard triggers are live. Every statement here is idempotent so both
-- environments end in the same state, and the guards now mean "staff only".
-- ---------------------------------------------------------------------------

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS managed boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS managed_taken_over_at timestamptz,
  ADD COLUMN IF NOT EXISTS managed_taken_over_by uuid REFERENCES public.org_members (id) ON DELETE SET NULL;

ALTER TABLE public.org_members
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

ALTER TABLE public.org_voice_profiles
  ADD COLUMN IF NOT EXISTS sample_preview jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.request_jwt_role()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    CASE
      WHEN NULLIF(current_setting('request.jwt.claim.sub', true), '') IS NULL
        AND auth.uid() IS NULL THEN 'service_role'
      ELSE 'authenticated'
    END
  );
$$;

COMMENT ON FUNCTION public.request_jwt_role() IS
  'JWT role of the request. No JWT at all (jobs, seeds, SQL console) reads as service_role.';

REVOKE ALL ON FUNCTION public.request_jwt_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_jwt_role() TO authenticated, service_role;

-- True when a signed-in end user made this request (through the API as
-- `authenticated`), whatever SECURITY DEFINER function it is running inside.
-- Jobs, webhooks (service role) and console SQL are not end-user requests.
CREATE OR REPLACE FUNCTION public.ws_end_user_request()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  -- COALESCE throughout: an absent setting must read as false, never NULL,
  -- because callers branch on NOT ws_end_user_request().
  SELECT auth.uid() IS NOT NULL
    AND (
      COALESCE(NULLIF(current_setting('role', true), ''), 'none') IN ('authenticated', 'anon')
      OR COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), '') = 'authenticated'
      OR COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'authenticated'
    );
$$;

REVOKE ALL ON FUNCTION public.ws_end_user_request() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ws_end_user_request() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 1. Types and columns
-- ---------------------------------------------------------------------------

CREATE TYPE public.workspace_status AS ENUM ('onboarding', 'active', 'paused', 'closed');
CREATE TYPE public.platform_role AS ENUM ('service_team', 'platform_admin');
CREATE TYPE public.member_seat AS ENUM ('customer', 'staff', 'agent');

ALTER TABLE public.organizations
  ADD COLUMN status public.workspace_status NOT NULL DEFAULT 'onboarding',
  ADD COLUMN status_changed_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN status_changed_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  ADD COLUMN status_reason text,
  ADD COLUMN closed_at timestamptz,
  ADD COLUMN closed_retention_days integer NOT NULL DEFAULT 90,
  ADD COLUMN industry_template_id uuid,
  ADD COLUMN owner_contact_name text,
  ADD COLUMN owner_contact_email text,
  ADD COLUMN owner_contact_phone text,
  ADD COLUMN is_platform_workspace boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT organizations_closed_retention_days_range
    CHECK (closed_retention_days BETWEEN 1 AND 3650),
  ADD CONSTRAINT organizations_closed_at_matches_status
    CHECK ((status = 'closed') = (closed_at IS NOT NULL)),
  ADD CONSTRAINT organizations_owner_contact_email_format
    CHECK (owner_contact_email IS NULL OR owner_contact_email ~ '^[^@\s]+@[^@\s]+$');

COMMENT ON COLUMN public.organizations.status IS
  'onboarding: visible to staff and owner, not live. active: live. paused: data kept, every automation and outbound send stops. closed: customers lose access, staff read-only, data removed after closed_retention_days.';
COMMENT ON COLUMN public.organizations.industry_template_id IS
  'Industry template this workspace inherits configuration from. The templates table arrives with the configuration system; until then this stays null.';
COMMENT ON COLUMN public.organizations.is_platform_workspace IS
  'Owned by the platform itself: DA''s own acquisition pipeline, demos, and tests. Never a customer; kept apart from customer workspaces and customer reporting.';

-- Status from the timestamps the product already keeps. Offboarded wins over
-- inactive, inactive over activated.
UPDATE public.organizations
SET status = CASE
      WHEN offboarded_at IS NOT NULL THEN 'closed'::public.workspace_status
      WHEN inactive_at IS NOT NULL THEN 'paused'::public.workspace_status
      WHEN activated_at IS NOT NULL THEN 'active'::public.workspace_status
      ELSE 'onboarding'::public.workspace_status
    END,
    closed_at = CASE WHEN offboarded_at IS NOT NULL THEN offboarded_at END,
    status_changed_at = COALESCE(offboarded_at, inactive_at, activated_at, created_at);

CREATE INDEX organizations_status_idx ON public.organizations (status);

ALTER TABLE public.org_members
  ADD COLUMN seat public.member_seat NOT NULL DEFAULT 'customer',
  ADD COLUMN can_approve boolean NOT NULL DEFAULT false,
  ADD COLUMN deactivated_at timestamptz,
  ADD COLUMN deactivated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.org_members.seat IS
  'customer: the business''s own people. staff: a Service Team or Platform Admin seat, maintained by sync_staff_seats(), never edited directly. agent: the identity scheduled agents run as.';
COMMENT ON COLUMN public.org_members.can_approve IS
  'A Workspace Member may approve drafts and gated actions only when an owner grants this. Owners approve by role.';

-- ---------------------------------------------------------------------------
-- 2. Platform staff and assignments
-- ---------------------------------------------------------------------------

CREATE TABLE public.platform_staff (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE RESTRICT,
  role public.platform_role NOT NULL,
  active boolean NOT NULL DEFAULT true,
  template_access boolean NOT NULL DEFAULT false,
  display_name text NOT NULL,
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  deactivated_at timestamptz,
  deactivated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  CONSTRAINT platform_staff_display_name_present CHECK (btrim(display_name) <> ''),
  CONSTRAINT platform_staff_deactivated_consistent CHECK (active = (deactivated_at IS NULL))
);

COMMENT ON TABLE public.platform_staff IS
  'Service Team and Platform Admin accounts. Platform-level roles, not per workspace. One row per person: no shared staff accounts.';
COMMENT ON COLUMN public.platform_staff.template_access IS
  'Service Team may edit industry templates and platform defaults only with this grant. Platform Admins always can.';

CREATE TABLE public.workspace_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.platform_staff (user_id) ON DELETE RESTRICT,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  assigned_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  ended_at timestamptz,
  ended_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  note text,
  CONSTRAINT workspace_assignments_ended_after_start CHECK (ended_at IS NULL OR ended_at >= assigned_at)
);

COMMENT ON TABLE public.workspace_assignments IS
  'Which Service Team member works which workspace. History is the rows: ending an assignment stamps ended_at, it is never deleted. Only Platform Admins change it.';

CREATE UNIQUE INDEX workspace_assignments_one_active
  ON public.workspace_assignments (org_id, user_id)
  WHERE ended_at IS NULL;
CREATE INDEX workspace_assignments_user_active_idx
  ON public.workspace_assignments (user_id)
  WHERE ended_at IS NULL;
CREATE INDEX workspace_assignments_org_idx
  ON public.workspace_assignments (org_id, assigned_at DESC);

ALTER TABLE public.platform_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_assignments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.platform_staff FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.workspace_assignments FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.platform_staff TO authenticated;
GRANT SELECT ON TABLE public.workspace_assignments TO authenticated;
GRANT ALL ON TABLE public.platform_staff TO service_role;
GRANT ALL ON TABLE public.workspace_assignments TO service_role;

-- Carry the existing staff over before anything reads platform_staff.
INSERT INTO public.platform_staff (user_id, role, display_name, email, created_at)
SELECT
  pa.user_id,
  'platform_admin',
  COALESCE(
    (SELECT NULLIF(btrim(m.display_name), '') FROM public.org_members m
      WHERE m.user_id = pa.user_id ORDER BY m.created_at LIMIT 1),
    NULLIF(split_part(u.email, '@', 1), ''),
    'Platform admin'
  ),
  COALESCE(u.email, ''),
  pa.created_at
FROM public.platform_admins pa
JOIN auth.users u ON u.id = pa.user_id;

INSERT INTO public.platform_staff (user_id, role, display_name, email, created_at, created_by)
SELECT
  so.user_id,
  'service_team',
  COALESCE(
    (SELECT NULLIF(btrim(m.display_name), '') FROM public.org_members m
      WHERE m.user_id = so.user_id ORDER BY m.created_at LIMIT 1),
    NULLIF(split_part(u.email, '@', 1), ''),
    'Service team'
  ),
  COALESCE(u.email, ''),
  so.granted_at,
  so.granted_by
FROM public.stellar_da_operators so
JOIN auth.users u ON u.id = so.user_id
ON CONFLICT (user_id) DO NOTHING;

-- Stellar DA operators had standing access to every Stellar workspace. That
-- becomes an explicit assignment to each one, which a Platform Admin can now
-- narrow.
INSERT INTO public.workspace_assignments (org_id, user_id, assigned_at, assigned_by, note)
SELECT o.id, so.user_id, so.granted_at, so.granted_by, 'Carried over from Stellar DA operator access'
FROM public.stellar_da_operators so
JOIN public.platform_staff ps ON ps.user_id = so.user_id AND ps.role = 'service_team'
CROSS JOIN public.organizations o
WHERE o.product IN ('stellar', 'both');

-- ---------------------------------------------------------------------------
-- 3. Retire the old enrol-as-owner mechanism and map existing seats.
-- ---------------------------------------------------------------------------

-- Every seat's role and surface before this migration, so the rollback
-- restores them exactly instead of inferring them.
CREATE TABLE public.workspace_migration_role_map (
  member_id uuid PRIMARY KEY,
  org_id uuid NOT NULL,
  user_id uuid NOT NULL,
  old_role public.org_role NOT NULL,
  old_surface_access public.surface_access NOT NULL,
  old_active boolean NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.workspace_migration_role_map IS
  'Roles as they were before 20261007020000. Read only by its rollback.';
ALTER TABLE public.workspace_migration_role_map ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.workspace_migration_role_map FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.workspace_migration_role_map TO service_role;

INSERT INTO public.workspace_migration_role_map (member_id, org_id, user_id, old_role, old_surface_access, old_active)
SELECT id, org_id, user_id, role, surface_access, active FROM public.org_members;

CREATE TABLE public.workspace_migration_invite_map (
  invite_id uuid PRIMARY KEY,
  old_role public.org_role NOT NULL
);
ALTER TABLE public.workspace_migration_invite_map ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.workspace_migration_invite_map FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.workspace_migration_invite_map TO service_role;
INSERT INTO public.workspace_migration_invite_map (invite_id, old_role)
SELECT id, role FROM public.org_invites;

DROP TRIGGER IF EXISTS platform_admins_enroll ON public.platform_admins;
DROP TRIGGER IF EXISTS organizations_enroll_platform_admins ON public.organizations;
DROP TRIGGER IF EXISTS org_members_protect_platform_admin ON public.org_members;
DROP FUNCTION IF EXISTS public.enroll_platform_admin_row();
DROP FUNCTION IF EXISTS public.enroll_platform_admins_on_new_org();
DROP FUNCTION IF EXISTS public.enroll_platform_admin_in_orgs(uuid);
DROP FUNCTION IF EXISTS public.protect_platform_admin_membership();

ALTER TABLE public.org_members DROP CONSTRAINT IF EXISTS org_members_portal_role_check;
ALTER TABLE public.org_invites DROP CONSTRAINT IF EXISTS org_invites_portal_role_check;
ALTER TABLE public.org_invites DROP CONSTRAINT IF EXISTS org_invites_role_invitable;

-- Agent identities are not people.
UPDATE public.org_members SET seat = 'agent' WHERE is_agent_identity;

-- Platform admins were enrolled as owner everywhere: those rows are staff seats.
UPDATE public.org_members m
SET seat = 'staff', role = 'admin', can_approve = false
FROM public.platform_staff ps
WHERE ps.user_id = m.user_id
  AND ps.role = 'platform_admin'
  AND NOT m.is_agent_identity;

-- Stellar DA operators that do hold a seat somewhere become staff seats there.
UPDATE public.org_members m
SET seat = 'staff', role = 'admin', can_approve = false
FROM public.platform_staff ps
WHERE ps.user_id = m.user_id
  AND ps.role = 'service_team'
  AND m.seat = 'customer'
  AND NOT m.is_agent_identity;

-- Any other da_operator seat has no platform account to hang off. It cannot be
-- mapped with confidence, so it is deactivated and listed for review rather
-- than guessed into a customer role.
CREATE TABLE public.workspace_migration_review (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  subject_table text NOT NULL,
  subject_id uuid NOT NULL,
  org_id uuid,
  reason text NOT NULL,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users (id) ON DELETE SET NULL
);
COMMENT ON TABLE public.workspace_migration_review IS
  'Records the 20261007 workspace migration could not map with confidence. Platform admin only.';
ALTER TABLE public.workspace_migration_review ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.workspace_migration_review FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.workspace_migration_review TO authenticated;
GRANT ALL ON TABLE public.workspace_migration_review TO service_role;

INSERT INTO public.workspace_migration_review (subject_table, subject_id, org_id, reason)
SELECT 'org_members', m.id, m.org_id, 'da_operator seat with no platform staff account; deactivated'
FROM public.org_members m
WHERE m.seat = 'customer' AND m.role = 'da_operator';

UPDATE public.org_members
SET active = false, deactivated_at = now()
WHERE seat = 'customer' AND role = 'da_operator';
UPDATE public.org_members
SET role = 'member'
WHERE seat = 'customer' AND role = 'da_operator';

-- Customer admins are owners; a workspace may have several.
UPDATE public.org_members SET role = 'owner' WHERE seat = 'customer' AND role = 'admin';
-- Stellar client viewers are members.
UPDATE public.org_members SET role = 'member', surface_access = 'portal' WHERE seat = 'customer' AND role = 'client_viewer';

-- Open invites follow the same mapping.
UPDATE public.org_invites SET role = 'owner' WHERE role = 'admin' AND accepted_at IS NULL;
UPDATE public.org_invites SET role = 'member' WHERE role IN ('client_viewer', 'da_operator') AND accepted_at IS NULL;

ALTER TABLE public.org_members
  ADD CONSTRAINT org_members_seat_role_check CHECK (
    seat = 'agent'
    OR (seat = 'staff' AND role = 'admin')
    OR (seat = 'customer' AND role IN ('owner', 'member', 'setter', 'closer', 'operator'))
  ),
  ADD CONSTRAINT org_members_can_approve_member_only CHECK (NOT can_approve OR role = 'member');

UPDATE public.org_members
SET deactivated_at = COALESCE(deactivated_at, now())
WHERE NOT active;

-- Accepted invites keep the role they were sent with, as history.
ALTER TABLE public.org_invites
  ADD CONSTRAINT org_invites_role_invitable CHECK (
    accepted_at IS NOT NULL
    OR role IN ('owner', 'member', 'setter', 'closer', 'operator')
  );

-- Every customer member's org is its only org: two workspaces with similar
-- names or the same contact never share a row.
CREATE INDEX org_members_user_active_idx ON public.org_members (user_id) WHERE active;

-- ---------------------------------------------------------------------------
-- 4. Access functions. Every policy in the schema runs through these.
--
-- A seat counts when it is active and either
--   * a customer or agent seat in a workspace that is not closed, or
--   * a staff seat whose person is active platform staff and either a
--     Platform Admin or holding an active assignment to that workspace.
-- The assignment check is repeated here (not only trusted from the seat's
-- active flag) so unassigning takes effect on the very next query.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_staff
    WHERE user_id = auth.uid() AND active AND role = 'platform_admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_platform_admin_user(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_staff
    WHERE user_id = p_user_id AND active AND role = 'platform_admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_platform_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_staff WHERE user_id = auth.uid() AND active
  );
$$;

-- Whether a given person is (or was) platform staff. Used so owners can see
-- their own team's work without seeing the service team's.
CREATE OR REPLACE FUNCTION public.is_platform_staff_user(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.platform_staff WHERE user_id = p_user_id);
$$;

CREATE OR REPLACE FUNCTION public.platform_staff_role()
RETURNS public.platform_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.platform_staff WHERE user_id = auth.uid() AND active;
$$;

-- Workspaces the caller works as staff: all of them for a Platform Admin,
-- assigned ones for the Service Team.
CREATE OR REPLACE FUNCTION public.user_staff_org_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.id
  FROM public.organizations o
  WHERE public.is_platform_admin()
  UNION
  SELECT a.org_id
  FROM public.workspace_assignments a
  JOIN public.platform_staff s ON s.user_id = a.user_id
  WHERE a.user_id = auth.uid()
    AND a.ended_at IS NULL
    AND s.active;
$$;

CREATE OR REPLACE FUNCTION public.closed_org_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.organizations WHERE status = 'closed';
$$;

-- Customer seats the caller holds in workspaces that are not closed.
CREATE OR REPLACE FUNCTION public.user_customer_seats()
RETURNS TABLE (member_id uuid, org_id uuid, role public.org_role, can_approve boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.id, m.org_id, m.role, m.can_approve
  FROM public.org_members m
  JOIN public.organizations o ON o.id = m.org_id
  WHERE m.user_id = auth.uid()
    AND m.active
    AND m.seat = 'customer'
    AND o.status <> 'closed';
$$;

CREATE OR REPLACE FUNCTION public.user_operator_org_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT org_id FROM public.user_customer_seats()
  WHERE role IN ('setter', 'closer', 'operator');
$$;

-- Owners and Operators work leads. Owners do everything an Operator can.
CREATE OR REPLACE FUNCTION public.user_worker_org_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT org_id FROM public.user_customer_seats()
  WHERE role IN ('owner', 'setter', 'closer', 'operator');
$$;

CREATE OR REPLACE FUNCTION public.user_owner_org_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT org_id FROM public.user_customer_seats() WHERE role = 'owner';
$$;

CREATE OR REPLACE FUNCTION public.user_approver_org_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT org_id FROM public.user_customer_seats()
  WHERE role = 'owner' OR (role = 'member' AND can_approve);
$$;

CREATE OR REPLACE FUNCTION public.user_org_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT org_id FROM public.user_customer_seats()
  UNION
  SELECT m.org_id
  FROM public.org_members m
  JOIN public.organizations o ON o.id = m.org_id
  WHERE m.user_id = auth.uid() AND m.active AND m.seat = 'agent' AND o.status <> 'closed'
  UNION
  SELECT s.org_id FROM public.user_staff_org_ids() AS s(org_id);
$$;

CREATE OR REPLACE FUNCTION public.user_member_id(p_org_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.id
  FROM public.org_members m
  JOIN public.organizations o ON o.id = m.org_id
  WHERE m.org_id = p_org_id
    AND m.user_id = auth.uid()
    AND m.active
    AND (
      (m.seat = 'staff' AND p_org_id IN (SELECT public.user_staff_org_ids()))
      OR (m.seat <> 'staff' AND o.status <> 'closed')
    )
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.user_has_org_role(
  p_org_id uuid,
  VARIADIC p_roles public.org_role[]
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_platform_admin()
  OR EXISTS (
    SELECT 1
    FROM public.org_members m
    JOIN public.organizations o ON o.id = m.org_id
    WHERE m.org_id = p_org_id
      AND m.user_id = auth.uid()
      AND m.active
      AND m.role = ANY (p_roles)
      AND (
        (m.seat = 'staff' AND p_org_id IN (SELECT public.user_staff_org_ids()))
        OR (m.seat <> 'staff' AND o.status <> 'closed')
      )
  );
$$;

-- The caller's role in one workspace, in the five-role vocabulary.
CREATE OR REPLACE FUNCTION public.ws_access(p_org_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_org_id IN (SELECT public.user_staff_org_ids()) THEN
      CASE WHEN public.is_platform_admin() THEN 'platform_admin' ELSE 'service_team' END
    ELSE (
      SELECT CASE
        WHEN s.role = 'owner' THEN 'owner'
        WHEN s.role = 'member' THEN 'member'
        WHEN s.role IN ('setter', 'closer', 'operator') THEN 'operator'
      END
      FROM public.user_customer_seats() s
      WHERE s.org_id = p_org_id
      LIMIT 1
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public.ws_is_staff(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(p_org_id IN (SELECT public.user_staff_org_ids()), false);
$$;

-- Signed-in callers must be staff for this workspace. Jobs and webhooks (no
-- user JWT) pass, the same rule the advanced-settings guard always used.
CREATE OR REPLACE FUNCTION public.ws_require_staff(p_org_id uuid)
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
  IF NOT public.ws_is_staff(p_org_id) THEN
    RAISE EXCEPTION 'This is managed by the Vistrial team.' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.ws_can_approve(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.ws_is_staff(p_org_id)
    OR COALESCE(p_org_id IN (SELECT public.user_approver_org_ids()), false);
$$;

-- Automation (agents, follow-up sends, dispatches, notifications to leads) runs
-- only for onboarding and active workspaces that have not been halted.
CREATE OR REPLACE FUNCTION public.ws_automation_allowed(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organizations
    WHERE id = p_org_id AND status IN ('onboarding', 'active')
  );
$$;

-- Leads an Operator may see: assigned to them in either slot, or unassigned.
CREATE OR REPLACE FUNCTION public.operator_visible_lead_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT l.id
  FROM public.leads l
  JOIN public.user_customer_seats() s ON s.org_id = l.org_id
  WHERE s.role IN ('setter', 'closer', 'operator')
    AND (
      (l.assigned_setter_id IS NULL AND l.assigned_closer_id IS NULL)
      OR l.assigned_setter_id = s.member_id
      OR l.assigned_closer_id = s.member_id
    );
$$;

CREATE OR REPLACE FUNCTION public.ws_lead_visible(p_org_id uuid, p_lead_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    p_org_id IN (SELECT public.user_org_ids())
    AND (
      p_org_id NOT IN (SELECT public.user_operator_org_ids())
      OR p_lead_id IS NULL
      OR p_lead_id IN (SELECT public.operator_visible_lead_ids())
    ),
    false
  );
$$;

-- Whether the caller may work this lead: staff and owners work every lead in
-- the workspace, operators the ones they can see.
CREATE OR REPLACE FUNCTION public.ws_can_work_lead(p_org_id uuid, p_lead_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    public.ws_is_staff(p_org_id)
    OR p_org_id IN (SELECT public.user_owner_org_ids())
    OR (
      p_org_id IN (SELECT public.user_operator_org_ids())
      AND p_lead_id IN (SELECT public.operator_visible_lead_ids())
    ),
    false
  );
$$;

-- Stellar's "DA operator" is now any active platform staff; which workspaces
-- they see comes from user_org_ids(), i.e. their assignments.
CREATE OR REPLACE FUNCTION public.is_stellar_da_operator()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_platform_staff();
$$;

REVOKE ALL ON FUNCTION public.is_platform_staff() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_staff_role() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_platform_staff_user(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.user_staff_org_ids() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.closed_org_ids() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.user_customer_seats() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.user_operator_org_ids() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.user_owner_org_ids() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.user_worker_org_ids() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ws_can_work_lead(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.user_approver_org_ids() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ws_access(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ws_is_staff(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ws_require_staff(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ws_can_approve(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ws_automation_allowed(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.operator_visible_lead_ids() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ws_lead_visible(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_platform_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_platform_admin_user(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_stellar_da_operator() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.user_org_ids() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.user_member_id(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.user_has_org_role(uuid, public.org_role[]) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.is_platform_staff() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_staff_role() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_platform_staff_user(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_staff_org_ids() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.closed_org_ids() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_customer_seats() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_operator_org_ids() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_owner_org_ids() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_worker_org_ids() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ws_can_work_lead(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_approver_org_ids() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ws_access(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ws_is_staff(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ws_require_staff(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ws_can_approve(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ws_automation_allowed(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.operator_visible_lead_ids() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ws_lead_visible(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_platform_admin_user(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_stellar_da_operator() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_org_ids() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_member_id(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_has_org_role(uuid, public.org_role[]) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Compatibility views for the two tables platform_staff replaces.
--
-- platform_admins used to be readable by every signed-in user (USING true),
-- which let a customer enumerate DA staff. The view is security_invoker, so it
-- shows only what platform_staff's policy allows: your own row, or everything
-- to a Platform Admin.
-- ---------------------------------------------------------------------------

DROP TABLE public.platform_admins;

CREATE VIEW public.platform_admins
WITH (security_invoker = true) AS
SELECT user_id, created_at
FROM public.platform_staff
WHERE role = 'platform_admin' AND active;

COMMENT ON VIEW public.platform_admins IS
  'Compatibility view. The source of truth is platform_staff.';

REVOKE ALL ON public.platform_admins FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.platform_admins TO authenticated, service_role;

DROP TABLE public.stellar_da_operators;

CREATE VIEW public.stellar_da_operators
WITH (security_invoker = true) AS
SELECT user_id, created_by AS granted_by, created_at AS granted_at, NULL::text AS note
FROM public.platform_staff
WHERE active;

COMMENT ON VIEW public.stellar_da_operators IS
  'Compatibility view. Stellar DA access is platform staff plus assignments.';

REVOKE ALL ON public.stellar_da_operators FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.stellar_da_operators TO authenticated, service_role;

CREATE POLICY platform_staff_select
  ON public.platform_staff FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_platform_admin());

CREATE POLICY workspace_assignments_select
  ON public.workspace_assignments FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_platform_admin());

CREATE POLICY workspace_migration_review_select
  ON public.workspace_migration_review FOR SELECT TO authenticated
  USING (public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- 6. Staff seats follow assignments.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sync_staff_seat(p_user_id uuid, p_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff public.platform_staff%ROWTYPE;
  v_should boolean;
  v_existing public.org_members%ROWTYPE;
BEGIN
  SELECT * INTO v_staff FROM public.platform_staff WHERE user_id = p_user_id;

  v_should := FOUND AND v_staff.active AND (
    v_staff.role = 'platform_admin'
    OR EXISTS (
      SELECT 1 FROM public.workspace_assignments
      WHERE org_id = p_org_id AND user_id = p_user_id AND ended_at IS NULL
    )
  );

  SELECT * INTO v_existing FROM public.org_members
  WHERE org_id = p_org_id AND user_id = p_user_id;

  IF FOUND AND v_existing.seat <> 'staff' THEN
    -- A person never holds a customer seat and a staff seat in one workspace.
    -- Assignments refuse that up front; platform admins simply keep the
    -- customer seat, since is_platform_admin() reaches every workspace anyway.
    RETURN;
  END IF;

  -- The membership guard refuses hand-made staff seats; this is the one
  -- writer it lets through.
  PERFORM set_config('vistrial.staff_seat_sync', '1', true);

  IF v_should THEN
    INSERT INTO public.org_members (
      org_id, user_id, role, seat, display_name, email, active, surface_access
    )
    VALUES (
      p_org_id, p_user_id, 'admin', 'staff', v_staff.display_name, v_staff.email, true, 'operator'
    )
    ON CONFLICT (org_id, user_id) DO UPDATE
      SET active = true,
          role = 'admin',
          seat = 'staff',
          display_name = EXCLUDED.display_name,
          email = EXCLUDED.email,
          deactivated_at = NULL,
          deactivated_by = NULL;
  ELSIF FOUND THEN
    UPDATE public.org_members
    SET active = false,
        deactivated_at = COALESCE(deactivated_at, now())
    WHERE id = v_existing.id AND active;
  END IF;

  PERFORM set_config('vistrial.staff_seat_sync', '', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_staff_seats_for_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
BEGIN
  FOR v_org IN
    SELECT id FROM public.organizations
    UNION
    SELECT org_id FROM public.org_members WHERE user_id = p_user_id AND seat = 'staff'
  LOOP
    PERFORM public.sync_staff_seat(p_user_id, v_org);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.workspace_assignments_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.sync_staff_seat(NEW.user_id, NEW.org_id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER workspace_assignments_sync_seat
  AFTER INSERT OR UPDATE ON public.workspace_assignments
  FOR EACH ROW EXECUTE FUNCTION public.workspace_assignments_sync();

CREATE OR REPLACE FUNCTION public.workspace_assignments_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Assignments are history. End one instead of deleting it.';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.org_id IS DISTINCT FROM OLD.org_id
       OR NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.assigned_at IS DISTINCT FROM OLD.assigned_at
       OR (OLD.ended_at IS NOT NULL AND NEW.ended_at IS DISTINCT FROM OLD.ended_at) THEN
      RAISE EXCEPTION 'An assignment can only be ended, once.';
    END IF;
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.platform_staff WHERE user_id = NEW.user_id AND active AND role = 'service_team'
  ) THEN
    RAISE EXCEPTION 'Only active Service Team members are assigned to workspaces.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.org_members
    WHERE org_id = NEW.org_id AND user_id = NEW.user_id AND seat <> 'staff'
  ) THEN
    RAISE EXCEPTION 'This person is a customer user of that workspace. Remove them there before assigning them as staff.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER workspace_assignments_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.workspace_assignments
  FOR EACH ROW EXECUTE FUNCTION public.workspace_assignments_guard();

CREATE OR REPLACE FUNCTION public.platform_staff_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NOT NEW.active AND OLD.active THEN
    UPDATE public.workspace_assignments
    SET ended_at = now(), ended_by = COALESCE(auth.uid(), NEW.deactivated_by)
    WHERE user_id = NEW.user_id AND ended_at IS NULL;
  END IF;
  PERFORM public.sync_staff_seats_for_user(NEW.user_id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER platform_staff_sync_seats
  AFTER INSERT OR UPDATE ON public.platform_staff
  FOR EACH ROW EXECUTE FUNCTION public.platform_staff_sync();

CREATE OR REPLACE FUNCTION public.organizations_seat_platform_admins()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid;
BEGIN
  FOR v_user IN SELECT user_id FROM public.platform_staff WHERE active AND role = 'platform_admin' LOOP
    PERFORM public.sync_staff_seat(v_user, NEW.id);
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER organizations_seat_platform_admins
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.organizations_seat_platform_admins();

-- Seats for everything that exists now (the existing admin rows were turned
-- into staff seats above; this fills in any workspace they were missing from).
DO $$
DECLARE
  v_user uuid;
BEGIN
  FOR v_user IN SELECT user_id FROM public.platform_staff LOOP
    PERFORM public.sync_staff_seats_for_user(v_user);
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.sync_staff_seat(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_staff_seats_for_user(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_staff_seat(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_staff_seats_for_user(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 7. The activity log. Append-only, from the database outward.
--
-- Rows come from triggers (membership, invites, assignments, workspace status,
-- configuration, staff work inside a workspace, approvals) and from
-- log_workspace_activity() for what only the app sees (sign-ins). No role can
-- UPDATE, DELETE or TRUNCATE it; the retention job is the one exception and
-- must set vistrial.allow_activity_log_purge for its own transaction.
-- ---------------------------------------------------------------------------

CREATE TABLE public.workspace_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  org_id uuid,
  actor_user_id uuid,
  actor_label text NOT NULL,
  actor_kind text NOT NULL,
  action text NOT NULL,
  target_table text,
  target_id text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT workspace_activity_log_actor_kind_check CHECK (
    actor_kind IN ('customer', 'service_team', 'platform_admin', 'system')
  ),
  CONSTRAINT workspace_activity_log_action_present CHECK (btrim(action) <> '')
);

COMMENT ON TABLE public.workspace_activity_log IS
  'Who did what, to which record, in which workspace, when. org_id has no foreign key on purpose: history outlives a deleted workspace. Never updated or deleted through the application.';

CREATE INDEX workspace_activity_log_org_idx ON public.workspace_activity_log (org_id, created_at DESC);
CREATE INDEX workspace_activity_log_actor_idx ON public.workspace_activity_log (actor_user_id, created_at DESC);
CREATE INDEX workspace_activity_log_action_idx ON public.workspace_activity_log (action, created_at DESC);

ALTER TABLE public.workspace_activity_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.workspace_activity_log FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.workspace_activity_log TO authenticated;
GRANT SELECT, INSERT ON TABLE public.workspace_activity_log TO service_role;

-- Platform admins see everything; Service Team see their assigned workspaces;
-- customers see only what they themselves did, never staff activity.
CREATE POLICY workspace_activity_log_select
  ON public.workspace_activity_log FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR org_id IN (SELECT public.user_staff_org_ids())
    OR (
      actor_kind = 'customer'
      AND actor_user_id = auth.uid()
      AND org_id IN (SELECT public.user_org_ids())
    )
  );

CREATE OR REPLACE FUNCTION public.workspace_activity_log_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('vistrial.allow_activity_log_purge', true) = '1' AND TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'The activity log cannot be edited or deleted.' USING ERRCODE = '42501';
END;
$$;

CREATE TRIGGER workspace_activity_log_no_update
  BEFORE UPDATE OR DELETE ON public.workspace_activity_log
  FOR EACH ROW EXECUTE FUNCTION public.workspace_activity_log_immutable();

CREATE TRIGGER workspace_activity_log_no_truncate
  BEFORE TRUNCATE ON public.workspace_activity_log
  FOR EACH STATEMENT EXECUTE FUNCTION public.workspace_activity_log_immutable();

-- Who is acting, for a given workspace (or none).
CREATE OR REPLACE FUNCTION public.ws_actor(p_org_id uuid, p_user_id uuid DEFAULT NULL)
RETURNS TABLE (user_id uuid, label text, kind text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := COALESCE(p_user_id, auth.uid());
  v_staff public.platform_staff%ROWTYPE;
  v_label text;
BEGIN
  IF v_user IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, 'Vistrial'::text, 'system'::text;
    RETURN;
  END IF;

  SELECT * INTO v_staff FROM public.platform_staff ps WHERE ps.user_id = v_user;
  IF FOUND THEN
    RETURN QUERY SELECT
      v_user,
      v_staff.display_name,
      CASE WHEN v_staff.role = 'platform_admin' THEN 'platform_admin' ELSE 'service_team' END;
    RETURN;
  END IF;

  SELECT NULLIF(btrim(m.display_name), '') INTO v_label
  FROM public.org_members m
  WHERE m.user_id = v_user AND (p_org_id IS NULL OR m.org_id = p_org_id)
  ORDER BY (m.org_id = p_org_id) DESC NULLS LAST, m.created_at
  LIMIT 1;

  IF v_label IS NULL THEN
    SELECT NULLIF(split_part(u.email, '@', 1), '') INTO v_label FROM auth.users u WHERE u.id = v_user;
  END IF;

  RETURN QUERY SELECT v_user, COALESCE(v_label, 'Unknown user'), 'customer'::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.ws_log(
  p_org_id uuid,
  p_action text,
  p_target_table text DEFAULT NULL,
  p_target_id text DEFAULT NULL,
  p_detail jsonb DEFAULT '{}'::jsonb,
  p_actor_user_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor record;
  v_id uuid;
BEGIN
  SELECT * INTO v_actor FROM public.ws_actor(p_org_id, p_actor_user_id);
  INSERT INTO public.workspace_activity_log (
    org_id, actor_user_id, actor_label, actor_kind, action, target_table, target_id, detail
  )
  VALUES (
    p_org_id, v_actor.user_id, v_actor.label, v_actor.kind, p_action,
    p_target_table, p_target_id, COALESCE(p_detail, '{}'::jsonb)
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ws_actor(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ws_log(uuid, text, text, text, jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ws_actor(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.ws_log(uuid, text, text, text, jsonb, uuid) TO service_role;

-- For the app: things only it observes (sign-in, sign-out, a failed access).
-- Service role only; the app passes the actor explicitly.
CREATE OR REPLACE FUNCTION public.log_workspace_activity(
  p_actor_user_id uuid,
  p_org_id uuid,
  p_action text,
  p_target_table text DEFAULT NULL,
  p_target_id text DEFAULT NULL,
  p_detail jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.ws_log(p_org_id, p_action, p_target_table, p_target_id, p_detail, p_actor_user_id);
$$;

REVOKE ALL ON FUNCTION public.log_workspace_activity(uuid, uuid, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_workspace_activity(uuid, uuid, text, text, text, jsonb) TO service_role;

-- Changed column names only. Values can hold credentials (destinations,
-- connections), so the generic audit never copies them.
CREATE OR REPLACE FUNCTION public.ws_changed_columns(p_old jsonb, p_new jsonb)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(array_agg(n.key ORDER BY n.key), ARRAY[]::text[])
  FROM jsonb_each(p_new) n
  WHERE n.key NOT IN ('updated_at')
    AND n.value IS DISTINCT FROM p_old -> n.key;
$$;

-- Configuration tables: every change, by anyone, including jobs.
CREATE OR REPLACE FUNCTION public.ws_audit_config()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row jsonb := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  v_cols text[];
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_cols := public.ws_changed_columns(to_jsonb(OLD), to_jsonb(NEW));
    IF cardinality(v_cols) = 0 THEN
      RETURN NEW;
    END IF;
  END IF;
  PERFORM public.ws_log(
    (v_row ->> 'org_id')::uuid,
    'config.' || TG_TABLE_NAME || '.' || lower(TG_OP),
    TG_TABLE_NAME,
    COALESCE(v_row ->> 'id', v_row ->> 'org_id'),
    CASE WHEN v_cols IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('changed', to_jsonb(v_cols)) END
  );
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

-- Configuration tables: only staff may write them from a signed-in session.
CREATE OR REPLACE FUNCTION public.ws_guard_staff_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.org_id ELSE NEW.org_id END;
BEGIN
  IF public.ws_end_user_request() AND NOT public.ws_is_staff(v_org) THEN
    RAISE EXCEPTION 'This setting is managed by the Vistrial team.' USING ERRCODE = '42501';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

-- Data tables: record what staff do inside a customer workspace, and the
-- approvals customers make (their own history). Jobs and webhooks are not
-- people and are not logged here.
CREATE OR REPLACE FUNCTION public.ws_audit_people_action()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row jsonb := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  v_org uuid := (v_row ->> 'org_id')::uuid;
  v_cols text[];
  v_is_approval boolean := TG_TABLE_NAME IN (
    'follow_up_drafts', 'approval_items', 'agent_run_approvals', 'sales_os_executions'
  );
BEGIN
  IF NOT public.ws_end_user_request() THEN
    RETURN NULL;
  END IF;
  IF NOT (public.ws_is_staff(v_org) OR v_is_approval) THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    v_cols := public.ws_changed_columns(to_jsonb(OLD), to_jsonb(NEW));
    IF cardinality(v_cols) = 0 THEN
      RETURN NULL;
    END IF;
  END IF;
  PERFORM public.ws_log(
    v_org,
    TG_TABLE_NAME || '.' || lower(TG_OP),
    TG_TABLE_NAME,
    v_row ->> 'id',
    jsonb_strip_nulls(jsonb_build_object(
      'changed', CASE WHEN v_cols IS NULL THEN NULL ELSE to_jsonb(v_cols) END,
      'lead_id', v_row ->> 'lead_id',
      'status', CASE WHEN v_is_approval THEN v_row ->> 'status' END
    ))
  );
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.ws_audit_config() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ws_guard_staff_write() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ws_audit_people_action() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.workspace_activity_log_immutable() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8. Membership rules.
-- ---------------------------------------------------------------------------

-- What a signed-in customer may and may not do to org_members rows. Staff
-- seats are managed only by sync_staff_seat(); only staff make owners.
CREATE OR REPLACE FUNCTION public.org_members_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_staff boolean;
  v_other_owners integer;
  v_status public.workspace_status;
BEGIN
  -- Stamp deactivation, clear it on reactivation.
  IF TG_OP = 'UPDATE' THEN
    IF OLD.active AND NOT NEW.active THEN
      NEW.deactivated_at := COALESCE(NEW.deactivated_at, now());
      NEW.deactivated_by := COALESCE(NEW.deactivated_by, auth.uid());
    ELSIF NOT OLD.active AND NEW.active THEN
      NEW.deactivated_at := NULL;
      NEW.deactivated_by := NULL;
    END IF;
  END IF;

  -- A workspace keeps at least one active owner while it is open.
  IF TG_OP IN ('UPDATE', 'DELETE')
     AND OLD.seat = 'customer' AND OLD.role = 'owner' AND OLD.active
     AND (TG_OP = 'DELETE' OR NEW.role IS DISTINCT FROM 'owner' OR NOT NEW.active OR NEW.seat <> 'customer')
     AND current_setting('vistrial.allow_last_owner_removal', true) IS DISTINCT FROM '1' THEN
    SELECT status INTO v_status FROM public.organizations WHERE id = OLD.org_id;
    IF v_status IS NOT NULL AND v_status <> 'closed' THEN
      SELECT count(*) INTO v_other_owners
      FROM public.org_members
      WHERE org_id = OLD.org_id AND seat = 'customer' AND role = 'owner' AND active AND id <> OLD.id;
      IF v_other_owners = 0 THEN
        RAISE EXCEPTION 'A workspace must keep at least one owner. Make someone else an owner first.'
          USING ERRCODE = 'P0001', HINT = 'last_owner';
      END IF;
    END IF;
  END IF;

  IF NOT public.ws_end_user_request()
     OR current_setting('vistrial.staff_seat_sync', true) = '1' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  v_is_staff := public.ws_is_staff(CASE WHEN TG_OP = 'DELETE' THEN OLD.org_id ELSE NEW.org_id END);
  IF v_is_staff THEN
    IF TG_OP <> 'DELETE' AND NEW.seat = 'staff' AND (TG_OP = 'INSERT' OR OLD.seat <> 'staff') THEN
      RAISE EXCEPTION 'Staff seats come from assignments.' USING ERRCODE = '42501';
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.seat <> 'customer' THEN
    RAISE EXCEPTION 'That seat is managed by the Vistrial team.' USING ERRCODE = '42501';
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    IF NEW.seat <> 'customer' THEN
      RAISE EXCEPTION 'That seat is managed by the Vistrial team.' USING ERRCODE = '42501';
    END IF;
    IF NEW.role = 'owner' AND (TG_OP = 'INSERT' OR OLD.role IS DISTINCT FROM 'owner') THEN
      RAISE EXCEPTION 'Only the Vistrial team can make someone an owner.' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE TRIGGER org_members_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.org_members
  FOR EACH ROW EXECUTE FUNCTION public.org_members_guard();

CREATE OR REPLACE FUNCTION public.org_members_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.org_members%ROWTYPE := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  v_action text;
BEGIN
  IF v_row.seat = 'staff' THEN
    RETURN NULL; -- staff seats are logged as assignment changes
  END IF;
  IF TG_OP = 'INSERT' THEN
    v_action := 'member.added';
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'member.deleted';
  ELSIF OLD.active AND NOT NEW.active THEN
    v_action := 'member.removed';
  ELSIF NOT OLD.active AND NEW.active THEN
    v_action := 'member.restored';
  ELSIF OLD.role IS DISTINCT FROM NEW.role THEN
    v_action := 'member.role_changed';
  ELSIF OLD.can_approve IS DISTINCT FROM NEW.can_approve THEN
    v_action := 'member.approval_permission_changed';
  ELSE
    RETURN NULL;
  END IF;
  PERFORM public.ws_log(
    v_row.org_id, v_action, 'org_members', v_row.id::text,
    jsonb_strip_nulls(jsonb_build_object(
      'member', v_row.display_name,
      'role', v_row.role,
      'from_role', CASE WHEN TG_OP = 'UPDATE' AND OLD.role IS DISTINCT FROM NEW.role THEN OLD.role::text END,
      'can_approve', CASE WHEN v_row.role = 'member' THEN v_row.can_approve END
    ))
  );
  RETURN NULL;
END;
$$;

CREATE TRIGGER org_members_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.org_members
  FOR EACH ROW EXECUTE FUNCTION public.org_members_audit();

CREATE OR REPLACE FUNCTION public.org_invites_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.ws_end_user_request() AND NEW.role = 'owner' AND NOT public.ws_is_staff(NEW.org_id) THEN
    RAISE EXCEPTION 'Only the Vistrial team can invite an owner.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER org_invites_guard
  BEFORE INSERT ON public.org_invites
  FOR EACH ROW EXECUTE FUNCTION public.org_invites_guard();

CREATE OR REPLACE FUNCTION public.org_invites_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.ws_log(NEW.org_id, 'invite.sent', 'org_invites', NEW.id::text,
      jsonb_build_object('email', NEW.email, 'role', NEW.role, 'expires_at', NEW.expires_at));
  ELSIF TG_OP = 'UPDATE' AND OLD.accepted_at IS NULL AND NEW.accepted_at IS NOT NULL THEN
    PERFORM public.ws_log(NEW.org_id, 'invite.accepted', 'org_invites', NEW.id::text,
      jsonb_build_object('email', NEW.email, 'role', NEW.role),
      (SELECT id FROM auth.users WHERE lower(email) = lower(NEW.email) LIMIT 1));
  ELSIF TG_OP = 'DELETE' AND OLD.accepted_at IS NULL THEN
    PERFORM public.ws_log(OLD.org_id, 'invite.revoked', 'org_invites', OLD.id::text,
      jsonb_build_object('email', OLD.email, 'role', OLD.role));
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER org_invites_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.org_invites
  FOR EACH ROW EXECUTE FUNCTION public.org_invites_audit();

CREATE OR REPLACE FUNCTION public.workspace_assignments_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
BEGIN
  SELECT display_name INTO v_name FROM public.platform_staff WHERE user_id = NEW.user_id;
  IF TG_OP = 'INSERT' THEN
    PERFORM public.ws_log(NEW.org_id, 'assignment.added', 'workspace_assignments', NEW.id::text,
      jsonb_build_object('staff_user_id', NEW.user_id, 'staff', v_name));
  ELSIF OLD.ended_at IS NULL AND NEW.ended_at IS NOT NULL THEN
    PERFORM public.ws_log(NEW.org_id, 'assignment.ended', 'workspace_assignments', NEW.id::text,
      jsonb_build_object('staff_user_id', NEW.user_id, 'staff', v_name));
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER workspace_assignments_audit
  AFTER INSERT OR UPDATE ON public.workspace_assignments
  FOR EACH ROW EXECUTE FUNCTION public.workspace_assignments_audit();

CREATE OR REPLACE FUNCTION public.platform_staff_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'staff.added';
  ELSIF OLD.active AND NOT NEW.active THEN
    v_action := 'staff.deactivated';
  ELSIF NOT OLD.active AND NEW.active THEN
    v_action := 'staff.reactivated';
  ELSIF OLD.role IS DISTINCT FROM NEW.role THEN
    v_action := 'staff.role_changed';
  ELSIF OLD.template_access IS DISTINCT FROM NEW.template_access THEN
    v_action := 'staff.template_access_changed';
  ELSE
    RETURN NULL;
  END IF;
  PERFORM public.ws_log(NULL, v_action, 'platform_staff', NEW.user_id::text,
    jsonb_strip_nulls(jsonb_build_object(
      'staff', NEW.display_name,
      'role', NEW.role,
      'from_role', CASE WHEN TG_OP = 'UPDATE' AND OLD.role IS DISTINCT FROM NEW.role THEN OLD.role::text END,
      'template_access', NEW.template_access
    )));
  RETURN NULL;
END;
$$;

CREATE TRIGGER platform_staff_audit
  AFTER INSERT OR UPDATE ON public.platform_staff
  FOR EACH ROW EXECUTE FUNCTION public.platform_staff_audit();

-- ---------------------------------------------------------------------------
-- 9. Workspace rules.
-- ---------------------------------------------------------------------------

-- Owners may change their business contact details. Status, and every other
-- column, belongs to staff; status belongs to Platform Admins.
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

CREATE TRIGGER organizations_guard
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.organizations_guard();

CREATE OR REPLACE FUNCTION public.organizations_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_changed text[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.ws_log(NEW.id, 'workspace.created', 'organizations', NEW.id::text,
      jsonb_build_object('name', NEW.name, 'status', NEW.status));
    RETURN NULL;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.ws_log(NEW.id, 'workspace.status_changed', 'organizations', NEW.id::text,
      jsonb_strip_nulls(jsonb_build_object('from', OLD.status, 'to', NEW.status, 'reason', NEW.status_reason)));
  END IF;
  v_changed := ARRAY(
    SELECT c FROM unnest(public.ws_changed_columns(to_jsonb(OLD), to_jsonb(NEW))) c
    WHERE c NOT IN ('status', 'status_changed_at', 'status_changed_by', 'closed_at', 'last_interactive_at')
  );
  IF cardinality(v_changed) > 0 AND public.ws_end_user_request() THEN
    PERFORM public.ws_log(NEW.id, 'workspace.updated', 'organizations', NEW.id::text,
      jsonb_build_object('changed', to_jsonb(v_changed)));
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER organizations_audit
  AFTER INSERT OR UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.organizations_audit();

REVOKE ALL ON FUNCTION public.org_members_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.org_members_audit() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.org_invites_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.org_invites_audit() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.workspace_assignments_audit() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.workspace_assignments_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.workspace_assignments_sync() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.platform_staff_audit() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.platform_staff_sync() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.organizations_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.organizations_audit() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.organizations_seat_platform_admins() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 10. Platform-admin operations. The app's admin screens call these; each
-- checks the caller itself, so a direct call from a browser is no shortcut.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ws_require_platform_admin()
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
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Only a Platform Admin can do this.' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_staff_to_workspace(p_org_id uuid, p_user_id uuid, p_note text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  PERFORM public.ws_require_platform_admin();
  SELECT id INTO v_id FROM public.workspace_assignments
  WHERE org_id = p_org_id AND user_id = p_user_id AND ended_at IS NULL;
  IF FOUND THEN
    RETURN v_id;
  END IF;
  INSERT INTO public.workspace_assignments (org_id, user_id, assigned_by, note)
  VALUES (p_org_id, p_user_id, auth.uid(), NULLIF(btrim(COALESCE(p_note, '')), ''))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.end_staff_assignment(p_org_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.ws_require_platform_admin();
  UPDATE public.workspace_assignments
  SET ended_at = now(), ended_by = auth.uid()
  WHERE org_id = p_org_id AND user_id = p_user_id AND ended_at IS NULL;
END;
$$;

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
BEGIN
  PERFORM public.ws_require_platform_admin();
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

CREATE OR REPLACE FUNCTION public.upsert_platform_staff(
  p_user_id uuid,
  p_role public.platform_role,
  p_active boolean DEFAULT true,
  p_template_access boolean DEFAULT false,
  p_display_name text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
BEGIN
  PERFORM public.ws_require_platform_admin();
  IF p_user_id = auth.uid() AND (NOT p_active OR p_role <> 'platform_admin') THEN
    RAISE EXCEPTION 'You cannot remove your own Platform Admin access.';
  END IF;
  SELECT email INTO v_email FROM auth.users WHERE id = p_user_id;
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'user not found';
  END IF;
  INSERT INTO public.platform_staff (user_id, role, active, template_access, display_name, email, created_by,
    deactivated_at, deactivated_by)
  VALUES (
    p_user_id, p_role, p_active, p_template_access,
    COALESCE(NULLIF(btrim(COALESCE(p_display_name, '')), ''), split_part(v_email, '@', 1)),
    v_email, auth.uid(),
    CASE WHEN p_active THEN NULL ELSE now() END,
    CASE WHEN p_active THEN NULL ELSE auth.uid() END
  )
  ON CONFLICT (user_id) DO UPDATE
    SET role = EXCLUDED.role,
        active = EXCLUDED.active,
        template_access = EXCLUDED.template_access,
        display_name = COALESCE(NULLIF(btrim(COALESCE(p_display_name, '')), ''), public.platform_staff.display_name),
        email = EXCLUDED.email,
        deactivated_at = CASE WHEN EXCLUDED.active THEN NULL ELSE COALESCE(public.platform_staff.deactivated_at, now()) END,
        deactivated_by = CASE WHEN EXCLUDED.active THEN NULL ELSE COALESCE(public.platform_staff.deactivated_by, auth.uid()) END;
END;
$$;

-- Deactivating a person stops their access everywhere and keeps their history:
-- every seat goes inactive, every assignment ends, staff access ends. The auth
-- account itself is banned by the app through the Auth admin API.
CREATE OR REPLACE FUNCTION public.deactivate_user_everywhere(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.ws_require_platform_admin();
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot deactivate yourself.';
  END IF;
  UPDATE public.platform_staff
  SET active = false, deactivated_at = now(), deactivated_by = auth.uid()
  WHERE user_id = p_user_id AND active;
  PERFORM set_config('vistrial.allow_last_owner_removal', '1', true);
  UPDATE public.org_members
  SET active = false, deactivated_by = auth.uid()
  WHERE user_id = p_user_id AND active;
  PERFORM set_config('vistrial.allow_last_owner_removal', '', true);
  PERFORM public.ws_log(NULL, 'user.deactivated', 'auth.users', p_user_id::text, '{}'::jsonb);
END;
$$;

-- A new client workspace starts in onboarding, with an owner invite when an
-- email is given. Platform admins get their seat from the insert trigger, and
-- the invite is sent from that seat.
CREATE OR REPLACE FUNCTION public.create_workspace(
  p_name text,
  p_timezone text,
  p_slug text DEFAULT NULL,
  p_owner_email text DEFAULT NULL
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

REVOKE ALL ON FUNCTION public.ws_require_platform_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.assign_staff_to_workspace(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.end_staff_assignment(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_workspace_status(uuid, public.workspace_status, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upsert_platform_staff(uuid, public.platform_role, boolean, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.deactivate_user_everywhere(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_workspace(text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ws_require_platform_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assign_staff_to_workspace(uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.end_staff_assignment(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_workspace_status(uuid, public.workspace_status, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.upsert_platform_staff(uuid, public.platform_role, boolean, boolean, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.deactivate_user_everywhere(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_workspace(text, text, text, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 11. The holding area for inbound events.
--
-- Every inbound source resolves to exactly one workspace before anything is
-- stored against a workspace or acted on. When it cannot (no match, more than
-- one match, the workspace is paused or closed, or the source is not plugged
-- in yet), the event lands here and nothing else happens. Platform admins
-- review it; nobody else can read it.
-- ---------------------------------------------------------------------------

CREATE TABLE public.inbound_event_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  received_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL,
  event_type text,
  external_ref text,
  routing_key text,
  reason text NOT NULL,
  candidate_org_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  org_id uuid REFERENCES public.organizations (id) ON DELETE SET NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  review_status text NOT NULL DEFAULT 'open',
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  review_note text,
  CONSTRAINT inbound_event_holds_reason_check CHECK (reason IN (
    'unmatched', 'ambiguous', 'workspace_paused', 'workspace_closed', 'source_not_enabled'
  )),
  CONSTRAINT inbound_event_holds_review_status_check CHECK (review_status IN ('open', 'released', 'discarded')),
  CONSTRAINT inbound_event_holds_source_present CHECK (btrim(source) <> '')
);

COMMENT ON TABLE public.inbound_event_holds IS
  'Inbound events that could not be matched to exactly one open workspace, or arrived for a source that is not plugged in. Stored, never acted on. Platform admin only.';

CREATE UNIQUE INDEX inbound_event_holds_source_ref_key
  ON public.inbound_event_holds (source, external_ref)
  WHERE external_ref IS NOT NULL;
CREATE INDEX inbound_event_holds_open_idx
  ON public.inbound_event_holds (received_at DESC)
  WHERE review_status = 'open';

ALTER TABLE public.inbound_event_holds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.inbound_event_holds FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.inbound_event_holds TO authenticated;
GRANT ALL ON TABLE public.inbound_event_holds TO service_role;

CREATE POLICY inbound_event_holds_select
  ON public.inbound_event_holds FOR SELECT TO authenticated
  USING (public.is_platform_admin());

CREATE OR REPLACE FUNCTION public.review_inbound_event_hold(p_id uuid, p_status text, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.ws_require_platform_admin();
  IF p_status NOT IN ('released', 'discarded') THEN
    RAISE EXCEPTION 'review status must be released or discarded';
  END IF;
  UPDATE public.inbound_event_holds
  SET review_status = p_status, reviewed_at = now(), reviewed_by = auth.uid(),
      review_note = NULLIF(btrim(COALESCE(p_note, '')), '')
  WHERE id = p_id AND review_status = 'open';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'hold not found or already reviewed';
  END IF;
  PERFORM public.ws_log(NULL, 'inbound_hold.' || p_status, 'inbound_event_holds', p_id::text, '{}'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.review_inbound_event_hold(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_inbound_event_hold(uuid, text, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 12. Guards inside existing functions, rewritten for the five roles.
--
-- These bodies are byte-identical on the hosted project and in this repo
-- (checked by md5 before writing), so replacing them changes only the guard.
-- Each one names what moved:
--   agent/operator run and Ask Vistrial visibility: other people's runs and
--     conversations are visible to staff; owners see their own team's, never
--     the service team's
--   halt_org_follow_up_sequences, mark_approval_gate_reviewed: staff
--   assign_org_lead: staff reassign; operators self-assign leads they can see
--   change_org_lead_status, load_org_case_timeline: operators only for their leads
--   baseline and calibration tools: staff
--   Stellar placements: staff see assigned workspaces only
--   org_scoped_row_counts: the activity log, like org_deletion_records, is
--     the audit that outlives a deleted workspace
-- ---------------------------------------------------------------------------

-- agent_run_visible
CREATE OR REPLACE FUNCTION public.agent_run_visible(p_run_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.agent_runs r
    WHERE r.id = p_run_id
      AND r.org_id IN (SELECT public.user_org_ids())
      AND (
        r.actor_user_id = auth.uid()
        OR r.org_id IN (SELECT public.user_staff_org_ids())
      OR (r.org_id IN (SELECT public.user_owner_org_ids()) AND NOT public.is_platform_staff_user(r.actor_user_id))
        OR public.is_platform_admin()
      )
  );
$function$;

-- operator_run_visible
CREATE OR REPLACE FUNCTION public.operator_run_visible(p_run_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.operator_runs r
    WHERE r.id = p_run_id
      AND r.org_id IN (SELECT public.user_org_ids())
      AND (
        r.user_id = auth.uid()
        OR r.org_id IN (SELECT public.user_staff_org_ids())
      OR (r.org_id IN (SELECT public.user_owner_org_ids()) AND NOT public.is_platform_staff_user(r.user_id))
        OR public.is_platform_admin()
      )
  );
$function$;

-- sales_os_conversation_visible
CREATE OR REPLACE FUNCTION public.sales_os_conversation_visible(p_conversation_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.sales_os_conversations c
    WHERE c.id = p_conversation_id
      AND c.org_id IN (SELECT public.user_org_ids())
      AND (
        c.user_id = auth.uid()
        OR c.org_id IN (SELECT public.user_staff_org_ids())
      OR (c.org_id IN (SELECT public.user_owner_org_ids()) AND NOT public.is_platform_staff_user(c.user_id))
      )
  );
$function$;

-- sales_os_destination_credential
CREATE OR REPLACE FUNCTION public.sales_os_destination_credential(p_destination_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT d.secret_ciphertext
  FROM public.sales_os_destinations d
  WHERE d.id = p_destination_id
    AND d.active
    AND d.org_id IN (SELECT public.user_org_ids())
    AND d.org_id IN (SELECT public.user_staff_org_ids());
$function$;

-- halt_org_follow_up_sequences
CREATE OR REPLACE FUNCTION public.halt_org_follow_up_sequences(p_org_id uuid, p_actor uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer := 0;
BEGIN
  IF auth.uid() IS NOT NULL
    AND NOT (
      public.ws_is_staff(p_org_id)
    ) THEN
    RAISE EXCEPTION 'not authorized for this organization';
  END IF;

  UPDATE public.follow_up_settings
  SET
    sequences_halted = true,
    sequences_halted_at = now(),
    sequences_halted_by = p_actor
  WHERE org_id = p_org_id;

  UPDATE public.follow_up_sequence_runs
  SET
    status = 'halted',
    halt_reason = 'org_stop',
    halted_at = now(),
    halted_by_member_id = p_actor
  WHERE org_id = p_org_id
    AND status = 'active';
  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE public.follow_up_jobs j
  SET status = 'dead', last_error = 'sequence_halted:org_stop'
  WHERE j.org_id = p_org_id
    AND j.status = 'pending'
    AND j.sequence_position > 1;

  UPDATE public.follow_up_drafts
  SET
    status = 'discarded',
    discarded_reason = 'org_stop'
  WHERE org_id = p_org_id
    AND status IN ('pending', 'approved', 'expired');

  UPDATE public.ghl_dispatches
  SET
    status = 'failed',
    failure_reason = 'sequence_halted:org_stop',
    body_text = NULL,
    claimed_at = NULL
  WHERE org_id = p_org_id
    AND status = 'queued';

  RETURN v_count;
END;
$function$;

-- mark_approval_gate_reviewed
CREATE OR REPLACE FUNCTION public.mark_approval_gate_reviewed(p_org_id uuid, p_skipped boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor record;
  v_was timestamptz;
BEGIN
  IF auth.uid() IS NULL OR NOT public.ws_is_staff(p_org_id) THEN
    RAISE EXCEPTION 'This is managed by the Vistrial team.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.approval_gate_settings (org_id) VALUES (p_org_id)
  ON CONFLICT (org_id) DO NOTHING;
  SELECT reviewed_at INTO v_was FROM public.approval_gate_settings WHERE org_id = p_org_id FOR UPDATE;
  IF v_was IS NOT NULL THEN
    RETURN;
  END IF;
  UPDATE public.approval_gate_settings SET reviewed_at = now() WHERE org_id = p_org_id;

  SELECT * INTO v_actor FROM public.approval_gate_actor(p_org_id);
  INSERT INTO public.approval_gate_changes
    (org_id, actor_member_id, actor_user_id, actor_label, action_type, field, from_value, to_value)
  VALUES
    (p_org_id, v_actor.member_id, auth.uid(), v_actor.label, NULL, 'reviewed', NULL,
     CASE WHEN p_skipped THEN 'skipped' ELSE 'saved' END);
END;
$function$;

-- assign_org_lead
CREATE OR REPLACE FUNCTION public.assign_org_lead(p_org_id uuid, p_lead_id uuid, p_setter_id uuid, p_closer_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_self uuid;
  v_old_setter uuid;
  v_old_closer uuid;
BEGIN
  IF p_org_id IS NULL OR p_org_id NOT IN (SELECT public.user_org_ids()) THEN
    RAISE EXCEPTION 'not authorized to reassign leads';
  END IF;

  v_self := public.user_member_id(p_org_id);

  SELECT assigned_setter_id, assigned_closer_id
  INTO v_old_setter, v_old_closer
  FROM public.leads
  WHERE id = p_lead_id
    AND org_id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'lead not found';
  END IF;

  IF p_setter_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.org_members
    WHERE id = p_setter_id AND org_id = p_org_id AND active = true
  ) THEN
    RAISE EXCEPTION 'The setter must be an active member of this workspace.';
  END IF;

  IF p_closer_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.org_members
    WHERE id = p_closer_id AND org_id = p_org_id AND active = true
  ) THEN
    RAISE EXCEPTION 'The closer must be an active member of this workspace.';
  END IF;

  IF NOT public.user_has_org_role(p_org_id, 'owner', 'admin') THEN
    IF NOT public.ws_can_work_lead(p_org_id, p_lead_id) THEN
      RAISE EXCEPTION 'not authorized to reassign leads';
    END IF;
    IF v_self IS NULL THEN
      RAISE EXCEPTION 'not authorized to reassign leads';
    END IF;
    IF p_setter_id IS DISTINCT FROM v_old_setter
      AND p_setter_id IS DISTINCT FROM v_self THEN
      RAISE EXCEPTION 'not authorized to reassign leads';
    END IF;
    IF p_closer_id IS DISTINCT FROM v_old_closer
      AND p_closer_id IS DISTINCT FROM v_self THEN
      RAISE EXCEPTION 'not authorized to reassign leads';
    END IF;
  END IF;

  UPDATE public.leads
  SET
    assigned_setter_id = p_setter_id,
    assigned_closer_id = p_closer_id
  WHERE id = p_lead_id
    AND org_id = p_org_id;
END;
$function$;

-- change_org_lead_status
CREATE OR REPLACE FUNCTION public.change_org_lead_status(p_org_id uuid, p_lead_id uuid, p_status lead_status, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_org_id IS NULL OR p_org_id NOT IN (SELECT public.user_org_ids()) THEN
    RAISE EXCEPTION 'not authorized for this organization';
  END IF;
  IF NOT public.ws_can_work_lead(p_org_id, p_lead_id) THEN
    RAISE EXCEPTION 'lead not found';
  END IF;
  IF p_status = 'closed_won' THEN
    RAISE EXCEPTION 'closed_won follows a recorded payment';
  END IF;

  PERFORM set_config('vistrial.status_source', 'manual', true);
  PERFORM set_config('vistrial.status_note', COALESCE(p_note, ''), true);

  UPDATE public.leads
  SET status = p_status
  WHERE id = p_lead_id
    AND org_id = p_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'lead not found';
  END IF;

  PERFORM set_config('vistrial.status_source', 'event', true);
  PERFORM set_config('vistrial.status_note', '', true);
END;
$function$;

-- load_org_case_timeline
CREATE OR REPLACE FUNCTION public.load_org_case_timeline(p_org_id uuid, p_lead_id uuid, p_cursor jsonb DEFAULT NULL::jsonb, p_limit integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_limit integer;
  v_cursor_at timestamptz;
  v_cursor_id uuid;
  v_rows jsonb;
  v_has_more boolean;
BEGIN
  IF p_org_id IS NULL OR p_org_id NOT IN (SELECT public.user_org_ids()) THEN
    RAISE EXCEPTION 'not authorized for this organization';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.leads WHERE id = p_lead_id AND org_id = p_org_id
  ) OR NOT public.ws_lead_visible(p_org_id, p_lead_id) THEN
    RETURN NULL;
  END IF;

  v_limit := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
  IF p_cursor IS NOT NULL AND jsonb_typeof(p_cursor) = 'object' THEN
    v_cursor_at := NULLIF(p_cursor->>'at', '')::timestamptz;
    v_cursor_id := NULLIF(p_cursor->>'id', '')::uuid;
  END IF;

  SELECT COALESCE(jsonb_agg(page.elem ORDER BY page.at DESC, page.id DESC), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT stream.elem, stream.at, stream.id
    FROM (
      SELECT jsonb_build_object(
        'kind', 'touch',
        'id', t.id,
        'at', t.occurred_at,
        'touchType', t.type,
        'channel', t.channel,
        'direction', t.direction,
        'outcome', t.outcome,
        'actorName', actor.display_name,
        'note', t.summary
      ) AS elem,
      t.occurred_at AS at,
      t.id AS id
      FROM public.touches t
      LEFT JOIN public.org_members actor ON actor.id = t.actor_member_id
      WHERE t.org_id = p_org_id AND t.lead_id = p_lead_id

      UNION ALL

      SELECT jsonb_build_object(
        'kind', 'call',
        'id', c.id,
        'at', COALESCE(c.occurred_at, c.scheduled_at, c.created_at),
        'callType', c.type,
        'outcome', c.outcome,
        'actorName', runner.display_name,
        'durationSeconds', c.duration_seconds,
        'scheduledAt', c.scheduled_at,
        'occurredAt', c.occurred_at
      ),
      COALESCE(c.occurred_at, c.scheduled_at, c.created_at),
      c.id
      FROM public.calls c
      LEFT JOIN public.org_members runner ON runner.id = c.ran_by_member_id
      WHERE c.org_id = p_org_id AND c.lead_id = p_lead_id

      UNION ALL

      SELECT jsonb_build_object(
        'kind', 'status',
        'id', s.id,
        'at', s.created_at,
        'fromStatus', s.from_status,
        'toStatus', s.to_status,
        'source', s.source,
        'actorName', actor.display_name,
        'note', s.note,
        'supersedesManual', s.supersedes_manual
      ),
      s.created_at,
      s.id
      FROM (
        SELECT
          sc.*,
          (
            sc.source = 'event'
            AND LAG(sc.source) OVER (ORDER BY sc.created_at, sc.id) = 'manual'
          ) IS TRUE AS supersedes_manual
        FROM public.lead_status_changes sc
        WHERE sc.org_id = p_org_id AND sc.lead_id = p_lead_id
      ) s
      LEFT JOIN public.org_members actor ON actor.id = s.actor_member_id

      UNION ALL

      SELECT jsonb_build_object(
        'kind', 'activity',
        'id', a.id,
        'at', a.occurred_at,
        'category', a.category,
        'activityKind', a.kind,
        'headline', a.headline,
        'actorName', a.actor_label,
        'result', a.result,
        'resultReason', a.result_reason,
        'retryable', a.retryable,
        'retryKind', a.retry_kind,
        'retryId', a.retry_id,
        'detail', a.detail - 'outboundBody' - 'emailSubject' - 'outbound_body'
      ),
      a.occurred_at,
      a.id
      FROM public.activity_stream_source(p_org_id, NULL, NULL) a
      WHERE a.lead_id = p_lead_id
        AND a.kind NOT IN (
          'reply_received',
          'outcome_logged',
          'appointment_booked',
          'appointment_noshow',
          'appointment_rescheduled',
          'appointment_cancelled',
          'call_completed',
          'status_changed',
          'contact_updated',
          'opportunity_updated',
          'webhook_other',
          'ghost_job',
          'job_ran'
        )
    ) stream
    WHERE v_cursor_id IS NULL
      OR (stream.at, stream.id) < (v_cursor_at, v_cursor_id)
    ORDER BY stream.at DESC, stream.id DESC
    LIMIT v_limit + 1
  ) page;

  v_has_more := jsonb_array_length(COALESCE(v_rows, '[]'::jsonb)) > v_limit;
  IF v_has_more THEN
    SELECT COALESCE(jsonb_agg(elem ORDER BY n), '[]'::jsonb)
    INTO v_rows
    FROM jsonb_array_elements(v_rows) WITH ORDINALITY AS t(elem, n)
    WHERE n <= v_limit;
  END IF;

  RETURN jsonb_build_object(
    'entries', COALESCE(v_rows, '[]'::jsonb),
    'hasMore', v_has_more
  );
END;
$function$;

-- skip_baseline_backfill
CREATE OR REPLACE FUNCTION public.skip_baseline_backfill(p_org_id uuid, p_member_id uuid)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_run uuid;
  v_status public.baseline_run_status;
BEGIN
  PERFORM public.ws_require_staff(p_org_id);

  SELECT id, status INTO v_run, v_status
  FROM public.baseline_runs
  WHERE org_id = p_org_id
  ORDER BY created_at DESC, id DESC
  LIMIT 1;

  IF v_run IS NOT NULL AND v_status IN ('queued', 'running', 'failed') THEN
    UPDATE public.baseline_runs
    SET
      status = 'skipped',
      grade = 'unusable',
      grade_reasons = ARRAY['explicitly skipped by an admin'],
      finished_at = now(),
      triggered_by_member_id = COALESCE(triggered_by_member_id, p_member_id),
      progress = jsonb_build_object('phase', 'skipped')
    WHERE id = v_run;
  ELSE
    INSERT INTO public.baseline_runs (
      org_id, status, grade, grade_reasons, lookback_days,
      window_start, window_end, triggered_by_member_id, finished_at, progress
    )
    SELECT
      p_org_id,
      'skipped',
      'unusable',
      ARRAY['explicitly skipped by an admin'],
      o.baseline_lookback_days,
      now() - make_interval(days => o.baseline_lookback_days),
      now(),
      p_member_id,
      now(),
      jsonb_build_object('phase', 'skipped')
    FROM public.organizations o
    WHERE o.id = p_org_id;
  END IF;

  -- Skipping resolves the backfill. It does not activate. An unusable grade
  -- still has to be answered with stated figures or an explicit decline.
  RETURN (SELECT activated_at FROM public.organizations WHERE id = p_org_id);
END;
$function$;

-- decline_baseline_fallback
CREATE OR REPLACE FUNCTION public.decline_baseline_fallback(p_org_id uuid, p_member_id uuid, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.ws_require_staff(p_org_id);
  INSERT INTO public.baseline_fallback_declines (org_id, declined_by_member_id, note)
  VALUES (p_org_id, p_member_id, nullif(trim(COALESCE(p_note, '')), ''))
  ON CONFLICT (org_id) DO UPDATE
    SET declined_at = now(),
        declined_by_member_id = EXCLUDED.declined_by_member_id,
        note = EXCLUDED.note;
END;
$function$;

-- load_calibration_report
CREATE OR REPLACE FUNCTION public.load_calibration_report(p_org_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_holdout jsonb;
  v_all jsonb;
  v_hold jsonb;
  v_cfg public.score_configs%ROWTYPE;
  v_pending jsonb;
  v_voice jsonb;
  v_mature integer;
  v_well boolean;
BEGIN
  PERFORM public.ws_require_staff(p_org_id);
  SELECT * INTO v_cfg FROM public.score_configs WHERE org_id = p_org_id;
  v_holdout := public.calibration_holdout_state(p_org_id);
  v_all := public.calibration_band_curve(p_org_id, false);
  v_hold := public.calibration_band_curve(p_org_id, true);
  SELECT count(*)::integer INTO v_mature
  FROM public.calibration_mature_resolved(p_org_id);

  v_well := COALESCE((v_holdout ->> 'enabled')::boolean, false)
    AND NOT COALESCE((v_holdout ->> 'too_small')::boolean, true)
    AND COALESCE((v_hold ->> 'monotonic')::boolean, false)
    AND COALESCE((v_hold ->> 'shown_count')::integer, 0) >= 2;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', s.id,
    'kind', s.kind,
    'status', s.status,
    'sample_n', s.sample_n,
    'evidence_sentence', s.evidence_sentence,
    'withheld_reason', s.withheld_reason,
    'payload', s.payload,
    'created_at', s.created_at,
    'applied_at', s.applied_at,
    'applied_by_member_id', s.applied_by_member_id
  ) ORDER BY s.created_at DESC), '[]'::jsonb)
  INTO v_pending
  FROM public.calibration_suggestions s
  WHERE s.org_id = p_org_id
    AND s.status IN ('pending', 'withheld')
    AND s.created_at > now() - interval '30 days';

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', v.id,
    'kind', v.kind,
    'phrase', v.phrase,
    'evidence', v.evidence,
    'status', v.status
  ) ORDER BY v.created_at DESC), '[]'::jsonb)
  INTO v_voice
  FROM public.voice_profile_suggestions v
  WHERE v.org_id = p_org_id AND v.status = 'pending';

  RETURN jsonb_build_object(
    'holdout', v_holdout,
    'mature_resolved_n', COALESCE(v_mature, 0),
    'min_n', public.reporting_diag_min(),
    'current_weights', jsonb_build_object(
      'timeline', v_cfg.timeline_weight,
      'investment_capacity', v_cfg.investment_capacity_weight,
      'decision_authority', v_cfg.decision_authority_weight,
      'pain_severity', v_cfg.pain_severity_weight,
      'ready_threshold', v_cfg.ready_threshold
    ),
    'all_leads_curve', v_all,
    'holdout_curve', v_hold,
    'factor_validity_all', public.calibration_factor_validity(p_org_id, false),
    'factor_validity_holdout', public.calibration_factor_validity(p_org_id, true),
    'threshold', public.calibration_threshold_placement(p_org_id),
    'extraction', public.calibration_extraction_report(p_org_id),
    'drafts', public.calibration_draft_report(p_org_id),
    'cross_client', public.calibration_cross_client_context(p_org_id),
    'suggestions', v_pending,
    'voice_suggestions', v_voice,
    'well_calibrated', v_well,
    'working_plain', CASE
      WHEN v_well THEN
        'The score is lining up with who actually closes on the holdout sample. Leave the weights.'
      ELSE NULL
    END,
    'honesty', 'A higher score among leads that closed is association, not proof the score caused the close.',
    'all_leads_caveat', CASE
      WHEN COALESCE((v_holdout ->> 'too_small')::boolean, true) THEN
        'The all-leads curve is biased by who got called first. It is shown so you can see the distortion. It is not validation.'
      ELSE
        'The gap between the holdout curve and the all-leads curve is how much calling-by-score is shaping the picture.'
    END
  );
END;
$function$;

-- preview_score_config_change
CREATE OR REPLACE FUNCTION public.preview_score_config_change(p_org_id uuid, p_timeline integer, p_investment integer, p_authority integer, p_pain integer, p_threshold integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cur public.score_configs%ROWTYPE;
  v_cross jsonb := '[]'::jsonb;
  v_position jsonb := '[]'::jsonb;
  v_open integer := 0;
  rec record;
  v_new integer;
  v_old_ready boolean;
  v_new_ready boolean;
BEGIN
  PERFORM public.ws_require_staff(p_org_id);
  IF p_timeline + p_investment + p_authority + p_pain <> 100 THEN
    RAISE EXCEPTION 'weights must add to 100';
  END IF;
  IF p_threshold < 0 OR p_threshold > 100 THEN
    RAISE EXCEPTION 'threshold out of range';
  END IF;
  SELECT * INTO v_cur FROM public.score_configs WHERE org_id = p_org_id;

  FOR rec IN
    SELECT
      l.id,
      COALESCE(NULLIF(btrim(concat_ws(' ', l.first_name, l.last_name)), ''), NULLIF(btrim(l.email), ''), 'Unnamed lead') AS name,
      l.current_score,
      l.lead_type,
      l.is_holdout,
      s.timeline_raw,
      s.investment_capacity_raw,
      s.decision_authority_raw,
      s.pain_severity_raw
    FROM public.leads l
    LEFT JOIN LATERAL (
      SELECT timeline_raw, investment_capacity_raw, decision_authority_raw, pain_severity_raw
      FROM public.readiness_scores rs
      WHERE rs.lead_id = l.id AND rs.org_id = l.org_id
      ORDER BY rs.created_at DESC, rs.id DESC
      LIMIT 1
    ) s ON true
    WHERE l.org_id = p_org_id
      AND NOT l.is_test
      AND l.status NOT IN ('closed_won', 'closed_lost', 'ghost')
    ORDER BY l.opted_in_at DESC
  LOOP
    v_open := v_open + 1;
    v_new := public.calibration_recompute_total(
      rec.timeline_raw, rec.investment_capacity_raw, rec.decision_authority_raw, rec.pain_severity_raw,
      p_timeline, p_investment, p_authority, p_pain
    );
    v_old_ready := COALESCE(rec.is_holdout, false)
      OR rec.lead_type = 'ready_track'
      OR (rec.current_score IS NOT NULL AND rec.current_score >= v_cur.ready_threshold);
    v_new_ready := COALESCE(rec.is_holdout, false)
      OR (v_new IS NOT NULL AND v_new >= p_threshold);
    IF v_old_ready IS DISTINCT FROM v_new_ready THEN
      v_cross := v_cross || jsonb_build_array(jsonb_build_object(
        'lead_id', rec.id,
        'name', rec.name,
        'current_score', rec.current_score,
        'proposed_score', v_new,
        'direction', CASE WHEN v_new_ready THEN 'onto_ready' ELSE 'off_ready' END
      ));
    ELSIF v_new IS NOT NULL AND rec.current_score IS NOT NULL AND v_new <> rec.current_score THEN
      v_position := v_position || jsonb_build_array(jsonb_build_object(
        'lead_id', rec.id,
        'name', rec.name,
        'current_score', rec.current_score,
        'proposed_score', v_new
      ));
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'open_leads', v_open,
    'threshold_moves', v_cross,
    'threshold_move_count', jsonb_array_length(v_cross),
    'score_moves', v_position,
    'score_move_count', jsonb_array_length(v_position),
    'plain',
      (jsonb_array_length(v_cross))::text
      || ' open leads would move across the ready line. '
      || (jsonb_array_length(v_position))::text
      || ' would change score without crossing it. Existing score history is not rewritten.'
  );
END;
$function$;

-- calibration_cross_client_context
CREATE OR REPLACE FUNCTION public.calibration_cross_client_context(p_org_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_key text;
  v_min integer := public.benchmark_min_cohort();
  v_rows jsonb;
  v_opted_out boolean;
  v_self_n integer;
  v_self_k integer;
  v_median numeric;
  v_contrast text;
BEGIN
  PERFORM public.ws_require_staff(p_org_id);
  SELECT
    public.profile_cohort_key(p.offer_type, p.price_point_cents, p.monthly_lead_volume),
    p.aggregate_opt_out
  INTO v_key, v_opted_out
  FROM public.business_profiles p
  WHERE p.org_id = p_org_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'metric', b.metric,
    'median_value', b.median_value,
    'org_count', b.org_count,
    'sample_n', b.sample_n
  ) ORDER BY b.metric), '[]'::jsonb)
  INTO v_rows
  FROM public.calibration_benchmarks b
  WHERE b.cohort_key = v_key
    AND b.org_count >= v_min
    AND b.sample_n >= public.reporting_diag_min();

  SELECT
    count(*)::integer,
    count(*) FILTER (WHERE r.closed)::integer
  INTO v_self_n, v_self_k
  FROM public.calibration_mature_resolved(p_org_id) r
  WHERE r.is_holdout AND r.score IS NOT NULL;

  SELECT b.median_value INTO v_median
  FROM public.calibration_benchmarks b
  WHERE b.cohort_key = v_key
    AND b.metric = 'holdout_close_rate'
  LIMIT 1;

  IF v_key IS NOT NULL
     AND COALESCE(v_self_n, 0) >= public.reporting_diag_min()
     AND v_median IS NOT NULL
     AND abs((v_self_k::numeric / v_self_n) - v_median) >= 0.10 THEN
    v_contrast :=
      'This workspace''s holdout close rate sits apart from the median of similar businesses. That is context about the market, not a recommendation to change this workspace''s scoring.';
  END IF;

  RETURN jsonb_build_object(
    'opted_out', COALESCE(v_opted_out, false),
    'min_orgs', v_min,
    'rows', v_rows,
    'contrast', v_contrast,
    'plain',
      'Figures from similar businesses are context. They are not a reason to change this workspace''s scoring. Only this workspace''s holdout curve can justify a weight change.'
  );
END;
$function$;

-- org_scoped_row_counts
CREATE OR REPLACE FUNCTION public.org_scoped_row_counts(p_org_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_out jsonb := '{}'::jsonb;
  r record;
  v_n bigint;
BEGIN
  FOR r IN
    SELECT c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'org_id' AND NOT a.attisdropped
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname NOT IN ('org_deletion_records', 'workspace_activity_log', 'workspace_migration_review', 'workspace_migration_role_map')
    ORDER BY 1
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE org_id = $1', r.table_name)
      INTO v_n
      USING p_org_id;
    IF v_n > 0 THEN
      v_out := v_out || jsonb_build_object(r.table_name, v_n);
    END IF;
  END LOOP;
  RETURN v_out;
END;
$function$;

-- stellar_da_list_placements
CREATE OR REPLACE FUNCTION public.stellar_da_list_placements()
 RETURNS TABLE(placement_id uuid, org_id uuid, org_name text, setter_member_id uuid, setter_name text, agreement_status placement_agreement_status, build_stage placement_build_stage, build_stage_updated_at timestamp with time zone, started_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    AND p.org_id IN (SELECT public.user_staff_org_ids())
  ORDER BY o.name;
END;
$function$;

-- stellar_da_get_placement
CREATE OR REPLACE FUNCTION public.stellar_da_get_placement(p_org_id uuid)
 RETURNS TABLE(placement_id uuid, org_id uuid, org_name text, setter_member_id uuid, setter_name text, agreement_status placement_agreement_status, agreement_document_url text, agreement_signed_at timestamp with time zone, build_stage placement_build_stage, build_stage_updated_at timestamp with time zone, started_at timestamp with time zone, ended_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_stellar_da_operator() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF p_org_id NOT IN (SELECT public.user_staff_org_ids()) THEN
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
$function$;

-- ---------------------------------------------------------------------------
-- 13. Shared guards, rewritten for the five roles.
-- ---------------------------------------------------------------------------

-- Customer-facing results (portal, reporting panels): staff, owners and
-- members. Operators are excluded because results carry revenue.
CREATE OR REPLACE FUNCTION public.reporting_caller_allowed(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    CASE
      WHEN auth.uid() IS NOT NULL THEN
        COALESCE(public.ws_access(p_org_id), '') IN ('platform_admin', 'service_team', 'owner', 'member')
      ELSE
        public.request_jwt_role() = 'service_role'
        OR current_user IN ('postgres', 'service_role', 'supabase_admin')
    END;
$$;

-- The business profile, activation, and leak report are onboarding tools.
CREATE OR REPLACE FUNCTION public.profile_require_access(p_org_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.ws_require_staff(p_org_id);
END;
$$;

-- Approval rules are configured during onboarding by the team.
CREATE OR REPLACE FUNCTION public.approval_gate_require_owner(p_org_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.ws_is_staff(p_org_id) THEN
    RAISE EXCEPTION 'Approval settings are managed by the Vistrial team.' USING ERRCODE = '42501';
  END IF;
END;
$$;

-- Advanced settings: staff, or a job. The old "managed" switch is kept as a
-- column but no longer lets a customer take Advanced settings over.
CREATE OR REPLACE FUNCTION public.org_advanced_writable(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.ws_is_staff(p_org_id);
$$;

CREATE OR REPLACE FUNCTION public.assert_advanced_writable(p_org_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.ws_require_staff(p_org_id);
END;
$$;

REVOKE ALL ON FUNCTION public.org_advanced_writable(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.assert_advanced_writable(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.org_advanced_writable(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assert_advanced_writable(uuid) TO authenticated, service_role;

-- A customer can no longer take over management or delete a workspace on the
-- hosted project's leftover settings-tier functions. Closing a workspace is a
-- Platform Admin status change; deletion follows its retention window.
DO $$
BEGIN
  IF to_regprocedure('public.take_over_org_management(uuid)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.take_over_org_management(uuid) FROM PUBLIC, anon, authenticated;
  END IF;
  IF to_regprocedure('public.owner_delete_org(uuid, text)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.owner_delete_org(uuid, text) FROM PUBLIC, anon, authenticated;
  END IF;
  IF to_regprocedure('public.set_org_managed(uuid, boolean)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.set_org_managed(uuid, boolean) FROM PUBLIC, anon, authenticated;
  END IF;
END $$;

-- The full activity stream shows staff work, so it is staff only. The bodies
-- differ between environments, so the original is kept under another name and
-- reached only through this guard.
ALTER FUNCTION public.load_org_activity(
  uuid, uuid, uuid, text, text, boolean, boolean, boolean, text, timestamptz, timestamptz, integer, jsonb
) RENAME TO load_org_activity_unguarded;

REVOKE ALL ON FUNCTION public.load_org_activity_unguarded(
  uuid, uuid, uuid, text, text, boolean, boolean, boolean, text, timestamptz, timestamptz, integer, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.load_org_activity_unguarded(
  uuid, uuid, uuid, text, text, boolean, boolean, boolean, text, timestamptz, timestamptz, integer, jsonb
) TO service_role;

CREATE FUNCTION public.load_org_activity(
  p_org_id uuid,
  p_lead_id uuid DEFAULT NULL,
  p_actor_user_id uuid DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_integration text DEFAULT NULL,
  p_failures_only boolean DEFAULT false,
  p_include_sync_noise boolean DEFAULT false,
  p_include_routine boolean DEFAULT false,
  p_q text DEFAULT NULL,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_limit integer DEFAULT 40,
  p_cursor jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_org_id IS NULL OR NOT public.ws_is_staff(p_org_id) THEN
    RAISE EXCEPTION 'not authorized for the full activity stream';
  END IF;
  RETURN public.load_org_activity_unguarded(
    p_org_id, p_lead_id, p_actor_user_id, p_category, p_integration, p_failures_only,
    p_include_sync_noise, p_include_routine, p_q, p_from, p_to, p_limit, p_cursor
  );
END;
$$;

REVOKE ALL ON FUNCTION public.load_org_activity(
  uuid, uuid, uuid, text, text, boolean, boolean, boolean, text, timestamptz, timestamptz, integer, jsonb
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.load_org_activity(
  uuid, uuid, uuid, text, text, boolean, boolean, boolean, text, timestamptz, timestamptz, integer, jsonb
) TO authenticated, service_role;

-- Invites now carry the five-role vocabulary, and accepting one never turns a
-- staff seat into a customer seat. A person with an account elsewhere simply
-- gains a seat here.
CREATE OR REPLACE FUNCTION public.redeem_org_invite(p_token text, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite public.org_invites%ROWTYPE;
  v_user_email text;
  v_display_name text;
  v_member_id uuid;
  v_status public.workspace_status;
BEGIN
  SELECT email INTO v_user_email
  FROM auth.users
  WHERE id = p_user_id;

  IF v_user_email IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_not_found');
  END IF;

  SELECT * INTO v_invite
  FROM public.org_invites
  WHERE token = p_token
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_invite.accepted_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_accepted');
  END IF;

  IF v_invite.expires_at <= now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'expired');
  END IF;

  IF lower(v_invite.email) <> lower(v_user_email) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'email_mismatch');
  END IF;

  SELECT status INTO v_status FROM public.organizations WHERE id = v_invite.org_id;
  IF v_status IS NULL OR v_status = 'closed' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.org_members
    WHERE org_id = v_invite.org_id AND user_id = p_user_id AND seat <> 'customer'
  ) OR EXISTS (
    SELECT 1 FROM public.platform_staff WHERE user_id = p_user_id AND active
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'staff_account');
  END IF;

  v_display_name := split_part(v_user_email, '@', 1);

  INSERT INTO public.org_members (
    org_id, user_id, role, seat, display_name, email, active, surface_access
  )
  VALUES (
    v_invite.org_id,
    p_user_id,
    v_invite.role,
    'customer',
    v_display_name,
    v_user_email,
    true,
    CASE WHEN v_invite.role = 'member' THEN 'portal'::public.surface_access
         ELSE 'operator'::public.surface_access END
  )
  ON CONFLICT (org_id, user_id) DO UPDATE
    SET active = true,
        role = EXCLUDED.role,
        email = EXCLUDED.email,
        surface_access = EXCLUDED.surface_access,
        can_approve = CASE WHEN EXCLUDED.role = 'member' THEN public.org_members.can_approve ELSE false END,
        display_name = CASE
          WHEN public.org_members.display_name = '' THEN EXCLUDED.display_name
          ELSE public.org_members.display_name
        END
  RETURNING id INTO v_member_id;

  UPDATE public.org_invites
  SET accepted_at = now()
  WHERE id = v_invite.id
    AND accepted_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_accepted');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'member_id', v_member_id,
    'org_id', v_invite.org_id,
    'role', v_invite.role
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 14. Policies that named retired roles.
-- ---------------------------------------------------------------------------

-- Operators (setter, closer, VA) work leads assigned to them in either slot,
-- and the unassigned queue.
DROP POLICY IF EXISTS leads_update_assigned_setter ON public.leads;
DROP POLICY IF EXISTS leads_update_assigned_closer ON public.leads;

CREATE POLICY leads_update_operator
  ON public.leads FOR UPDATE TO authenticated
  USING (
    org_id IN (SELECT public.user_operator_org_ids())
    AND id IN (SELECT public.operator_visible_lead_ids())
  )
  WITH CHECK (org_id IN (SELECT public.user_operator_org_ids()));

-- Approval-rule history: owners always could; the staff who now make the
-- changes can read it too.
DROP POLICY IF EXISTS approval_gate_changes_select ON public.approval_gate_changes;
CREATE POLICY approval_gate_changes_select
  ON public.approval_gate_changes FOR SELECT TO authenticated
  USING (
    org_id IN (SELECT public.user_staff_org_ids())
    OR org_id IN (SELECT public.user_owner_org_ids())
  );

DROP POLICY IF EXISTS placements_select ON public.placements;
CREATE POLICY placements_select
  ON public.placements FOR SELECT TO authenticated
  USING (
    org_id IN (SELECT public.user_staff_org_ids())
    OR org_id IN (
      SELECT org_id FROM public.user_customer_seats() WHERE role IN ('owner', 'member')
    )
  );

-- ---------------------------------------------------------------------------
-- 15. The restrictive layer.
--
-- Every table here already has permissive policies scoping it to the caller's
-- workspaces. These only narrow. Table lists are explicit so a reviewer can
-- read, per table, who may see and change it.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  t text;
  -- Internal workings and configuration. Customers neither read nor write.
  staff_only text[] := ARRAY[
    'activation_changes', 'activation_records', 'agent_escalations', 'agent_research_facts',
    'agent_run_steps', 'agent_runs', 'baseline_calls', 'baseline_fallback_declines',
    'baseline_leads', 'baseline_revenue', 'baseline_runs', 'baseline_touches',
    'business_profile_stages', 'business_profile_versions', 'calibration_suggestions',
    'execution_connections', 'execution_writes', 'extraction_audits', 'extraction_jobs',
    'extraction_usage', 'follow_up_jobs', 'follow_up_quality_check_failures',
    'follow_up_reply_signals', 'follow_up_routing_rules', 'follow_up_sequence_runs',
    'follow_up_settings', 'forsight_sync_runs', 'ghl_connections',
    'ghl_dispatches', 'ghl_field_maps', 'ghl_oauth_sessions', 'ghl_rate_windows',
    'ghost_detector_runs', 'ingestion_alerts', 'notification_digest_log',
    'notification_escalations', 'notification_team_channels', 'org_agent_settings',
    'org_benchmark_metrics', 'org_voice_profiles', 'profile_contradictions',
    'profile_review_prompts', 'sales_os_destinations', 'sales_os_gates', 'sales_os_routes',
    'score_config_versions', 'score_field_maps', 'score_field_rules', 'self_reported_baselines',
    'settings_activity', 'transcript_connections', 'verification_false_positives',
    'verification_runs', 'verification_sample_audits', 'verification_usage',
    'voice_profile_suggestions'
  ];
  -- Customer-facing, read-only to customers. Staff write.
  customer_read text[] := ARRAY[
    'ad_spend_days', 'agent_assets', 'agent_events', 'approval_gate_actions',
    'approval_gate_changes', 'approval_gate_settings', 'business_profiles', 'calendar_blocks',
    'call_coaching_findings', 'call_coaching_gaming_signals', 'call_objection_handlings',
    'call_quality_measures', 'form_events', 'forsight_report_sends', 'forsight_reports',
    'forsight_sources',
    'lead_assignment_changes', 'lead_status_changes', 'lead_type_changes', 'leak_reports',
    'objection_vocabulary', 'placements', 'processor_events', 'reporting_cohorts',
    'reporting_snapshots', 'revenue_log', 'sales_os_assets', 'score_configs',
    'source_connections'
  ];
  -- Lead work. Staff, Owners and Operators write; Members read.
  operator_work text[] := ARRAY[
    'brief_openings', 'call_extractions', 'calls', 'eod_submission_leads', 'eod_submissions',
    'extraction_corrections', 'lead_files', 'leads', 'next_actions', 'objections',
    'readiness_scores', 'touches', 'unmatched_transcripts'
  ];
  -- Approvals. Staff, Owners, and Members granted approval write.
  approvals text[] := ARRAY[
    'agent_run_approvals', 'approval_items', 'follow_up_drafts', 'follow_up_events',
    'sales_os_executions'
  ];
  -- Revenue and results. Operators never read them.
  revenue text[] := ARRAY[
    'ad_spend_days', 'baseline_revenue', 'forsight_report_sends', 'forsight_reports',
    'leak_reports', 'processor_events', 'reporting_cohorts', 'reporting_snapshots',
    'revenue_log', 'self_reported_baselines'
  ];
  -- Tables keyed to a lead. Operators read only rows for leads they may see.
  lead_scoped text[] := ARRAY[
    'brief_openings', 'calls', 'eod_submission_leads', 'follow_up_drafts', 'follow_up_events',
    'lead_assignment_changes', 'lead_files', 'lead_status_changes', 'lead_type_changes',
    'next_actions', 'objections', 'readiness_scores', 'touches'
  ];
BEGIN
  -- 15a. Closed workspaces are read-only for everyone, on every table that
  -- carries a workspace.
  FOR t IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'org_id' AND NOT a.attisdropped
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
      AND c.relname NOT IN ('workspace_activity_log', 'inbound_event_holds', 'workspace_assignments')
  LOOP
    EXECUTE format(
      'CREATE POLICY ws_open_insert ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated
         WITH CHECK (org_id IS NULL OR org_id NOT IN (SELECT public.closed_org_ids()))', t);
    EXECUTE format(
      'CREATE POLICY ws_open_update ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated
         USING (org_id IS NULL OR org_id NOT IN (SELECT public.closed_org_ids()))
         WITH CHECK (org_id IS NULL OR org_id NOT IN (SELECT public.closed_org_ids()))', t);
    EXECUTE format(
      'CREATE POLICY ws_open_delete ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated
         USING (org_id IS NULL OR org_id NOT IN (SELECT public.closed_org_ids()))', t);
  END LOOP;

  FOREACH t IN ARRAY staff_only LOOP
    CONTINUE WHEN to_regclass('public.' || t) IS NULL;
    EXECUTE format(
      'CREATE POLICY ws_staff_only ON public.%I AS RESTRICTIVE FOR ALL TO authenticated
         USING (org_id IN (SELECT public.user_staff_org_ids()))
         WITH CHECK (org_id IN (SELECT public.user_staff_org_ids()))', t);
  END LOOP;

  FOREACH t IN ARRAY customer_read LOOP
    EXECUTE format(
      'CREATE POLICY ws_staff_insert ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated
         WITH CHECK (org_id IN (SELECT public.user_staff_org_ids()))', t);
    EXECUTE format(
      'CREATE POLICY ws_staff_update ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated
         USING (org_id IN (SELECT public.user_staff_org_ids()))', t);
    EXECUTE format(
      'CREATE POLICY ws_staff_delete ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated
         USING (org_id IN (SELECT public.user_staff_org_ids()))', t);
  END LOOP;

  FOREACH t IN ARRAY operator_work LOOP
    EXECUTE format(
      'CREATE POLICY ws_worker_insert ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated
         WITH CHECK (org_id IN (SELECT public.user_staff_org_ids())
           OR org_id IN (SELECT public.user_worker_org_ids()))', t);
    EXECUTE format(
      'CREATE POLICY ws_worker_update ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated
         USING (org_id IN (SELECT public.user_staff_org_ids())
           OR org_id IN (SELECT public.user_worker_org_ids()))', t);
    EXECUTE format(
      'CREATE POLICY ws_worker_delete ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated
         USING (org_id IN (SELECT public.user_staff_org_ids())
           OR org_id IN (SELECT public.user_worker_org_ids()))', t);
  END LOOP;

  FOREACH t IN ARRAY approvals LOOP
    EXECUTE format(
      'CREATE POLICY ws_approver_insert ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated
         WITH CHECK (org_id IN (SELECT public.user_staff_org_ids())
           OR org_id IN (SELECT public.user_approver_org_ids()))', t);
    EXECUTE format(
      'CREATE POLICY ws_approver_update ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated
         USING (org_id IN (SELECT public.user_staff_org_ids())
           OR org_id IN (SELECT public.user_approver_org_ids()))', t);
    EXECUTE format(
      'CREATE POLICY ws_approver_delete ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated
         USING (org_id IN (SELECT public.user_staff_org_ids()))', t);
  END LOOP;

  FOREACH t IN ARRAY revenue LOOP
    EXECUTE format(
      'CREATE POLICY ws_no_operator_revenue ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated
         USING (org_id NOT IN (SELECT public.user_operator_org_ids()))', t);
  END LOOP;

  FOREACH t IN ARRAY lead_scoped LOOP
    EXECUTE format(
      'CREATE POLICY ws_operator_lead_scope ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated
         USING (org_id NOT IN (SELECT public.user_operator_org_ids())
           OR lead_id IS NULL
           OR lead_id IN (SELECT public.operator_visible_lead_ids()))', t);
  END LOOP;
END $$;

CREATE POLICY ws_operator_lead_scope
  ON public.leads AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    org_id NOT IN (SELECT public.user_operator_org_ids())
    OR id IN (SELECT public.operator_visible_lead_ids())
  );

-- Members are read-only on the people tables; owners manage customer users.
CREATE POLICY ws_people_owner_write
  ON public.org_invites AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    org_id IN (SELECT public.user_staff_org_ids())
    OR org_id IN (SELECT public.user_owner_org_ids())
  );

-- ---------------------------------------------------------------------------
-- 16. Triggers: configuration is staff-only from any path, and audited.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  t text;
  config_tables text[] := ARRAY[
    'approval_gate_actions', 'approval_gate_settings', 'business_profile_stages',
    'business_profiles', 'execution_connections', 'follow_up_routing_rules', 'follow_up_settings',
    'forsight_sources', 'ghl_field_maps', 'notification_team_channels', 'objection_vocabulary',
    'org_agent_settings', 'org_voice_profiles', 'sales_os_destinations', 'sales_os_gates',
    'sales_os_routes', 'score_configs', 'score_field_maps', 'score_field_rules',
    'self_reported_baselines', 'source_connections', 'transcript_connections',
    'voice_profile_suggestions'
  ];
  -- Staff-only from a signed-in session, but written constantly by jobs, so
  -- not audited row by row.
  guard_only_tables text[] := ARRAY[
    'baseline_fallback_declines', 'baseline_runs', 'calibration_suggestions'
  ];
  people_tables text[] := ARRAY[
    'agent_run_approvals', 'approval_items', 'call_extractions', 'calls', 'eod_submissions',
    'extraction_corrections', 'follow_up_drafts', 'lead_files', 'leads', 'next_actions',
    'objections', 'placements', 'readiness_scores', 'revenue_log', 'sales_os_executions',
    'touches', 'unmatched_transcripts'
  ];
BEGIN
  FOREACH t IN ARRAY config_tables LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OR DELETE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.ws_guard_staff_write()', t || '_ws_staff_write', t);
    EXECUTE format(
      'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.ws_audit_config()', t || '_ws_audit', t);
  END LOOP;

  FOREACH t IN ARRAY guard_only_tables LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OR DELETE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.ws_guard_staff_write()', t || '_ws_staff_write', t);
  END LOOP;

  FOREACH t IN ARRAY people_tables LOOP
    EXECUTE format(
      'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.ws_audit_people_action()', t || '_ws_audit', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 17. Hardening the advisors flagged.
-- ---------------------------------------------------------------------------

ALTER TABLE public.stellar_build_stage_mappings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.stellar_build_stage_mappings FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.stellar_build_stage_mappings TO authenticated;
GRANT ALL ON TABLE public.stellar_build_stage_mappings TO service_role;
DROP POLICY IF EXISTS stellar_build_stage_mappings_select ON public.stellar_build_stage_mappings;
CREATE POLICY stellar_build_stage_mappings_select
  ON public.stellar_build_stage_mappings FOR SELECT TO authenticated
  USING (public.is_platform_staff());

-- No SECURITY DEFINER function is callable by a signed-out visitor. Each one
-- that relied on the PUBLIC grant keeps working for signed-in users and jobs.
DO $$
DECLARE
  f regprocedure;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  LOOP
    IF has_function_privilege('authenticated', f, 'EXECUTE') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
    END IF;
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 18. The platform's own workspace.
--
-- The hosted project has one workspace, "DivineAcquisition", whose only seat
-- is a Platform Admin. It is DA's own acquisition pipeline, so it is
-- platform-owned, not a customer. Matched by slug and only when no customer
-- holds a seat in it.
-- ---------------------------------------------------------------------------

UPDATE public.organizations
SET is_platform_workspace = true
WHERE slug = 'divine-acquisition'
  AND NOT EXISTS (
    SELECT 1 FROM public.org_members m
    WHERE m.org_id = organizations.id AND m.seat = 'customer' AND m.active
  );
