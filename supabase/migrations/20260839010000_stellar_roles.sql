-- Prompt S1: Stellar roles, added to the shared org_role enum.
-- Split into its own migration/transaction because Postgres will not let a
-- newly added enum value be used (e.g. in a policy body) inside the same
-- transaction that added it.

-- 'setter' already exists and means the same thing it means in core
-- Vistrial: the person logging activity. 'client_viewer' and 'da_operator'
-- are new.
ALTER TYPE public.org_role ADD VALUE IF NOT EXISTS 'client_viewer';
ALTER TYPE public.org_role ADD VALUE IF NOT EXISTS 'da_operator';

COMMENT ON TYPE public.org_role IS
  'Shared across core Vistrial and Stellar. client_viewer and da_operator are Stellar-only in practice; da_operator is rarely (if ever) an org_members row — see stellar_da_operators for the real DA access path.';
