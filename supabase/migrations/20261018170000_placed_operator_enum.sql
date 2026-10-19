-- Postgres cannot use a new enum value in the same transaction that adds it.
-- The rename of stored rows is in the following migration.
ALTER TYPE public.org_role ADD VALUE IF NOT EXISTS 'placed_operator';
