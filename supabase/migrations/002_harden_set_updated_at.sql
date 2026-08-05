-- Pin the trigger function's search_path. Without this, a role-mutable
-- search_path lets a caller's schema shadow objects the function resolves,
-- which Supabase's security linter flags as function_search_path_mutable.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin new.updated_at = now(); return new; end $$;
