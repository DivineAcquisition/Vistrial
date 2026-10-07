-- Workspace roles, part 1 of 2: the two new customer roles.
--
-- Split into its own migration because Postgres will not let a newly added
-- enum value be used (in a constraint, policy, or UPDATE) inside the
-- transaction that added it. 20261007020000_workspace_isolation uses both.
--
-- Customer roles after this change:
--   owner                      Workspace Owner
--   member                     Workspace Member (read-only, approval by grant)
--   setter, closer, operator   Workspace Operator. Setter and closer keep their
--                              meaning for lead slots and analytics; operator
--                              is a VA or generalist. All three share one set
--                              of permissions.
--
-- 'admin' stops being a customer role: it marks a staff seat (Service Team or
-- Platform Admin), which 20261007020000 enforces with a CHECK.
-- 'client_viewer' and 'da_operator' are retired; existing rows move to
-- 'member' and to staff seats. Enum values cannot be dropped, so they stay in
-- the type and the CHECK keeps them off org_members.

ALTER TYPE public.org_role ADD VALUE IF NOT EXISTS 'member';
ALTER TYPE public.org_role ADD VALUE IF NOT EXISTS 'operator';
