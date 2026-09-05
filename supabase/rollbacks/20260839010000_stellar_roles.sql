-- Rollback for 20260839010000_stellar_roles.sql.
--
-- Postgres cannot remove a value from an enum, so the client_viewer and
-- da_operator labels stay on org_role permanently once added. That is why
-- adding them was split into its own migration in the first place.
--
-- Leaving the labels in place is harmless: with the Stellar foundation rolled
-- back, no policy or code path grants either role anything. What does matter
-- is that no member row is left holding a role the rest of the schema no
-- longer understands, so demote any that exist.

UPDATE public.org_members
   SET role = 'setter', active = false
 WHERE role IN ('client_viewer', 'da_operator');

COMMENT ON TYPE public.org_role IS
  'Organization role. client_viewer and da_operator remain as unused labels after the Stellar rollback; enum values cannot be dropped in Postgres.';
