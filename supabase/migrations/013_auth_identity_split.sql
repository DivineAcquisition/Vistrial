-- Lets one human email hold a team account and a client portal account at once.
--
-- Supabase Auth allows exactly one identity per address, so two populations
-- cannot both own `dana@example.com`. The contact address stays in `email` —
-- that is what invitations, notices, and sign-in forms use. When the address is
-- already claimed in Auth by the other population, onboarding mints a tagged
-- alias (`dana+vt-team-3f9c1a@example.com`) and records it here. Sign-in
-- translates the typed contact address to the alias before it reaches Auth, so
-- the alias is never shown to anyone.
--
-- Null means "the Auth identity uses the contact address" — the common case.

alter table public.team_users
  add column auth_email text;

comment on column public.team_users.auth_email is
  'Supabase Auth identity address when it differs from the contact email. Never displayed.';

create unique index team_users_auth_email_unique
  on public.team_users (lower(auth_email))
  where auth_email is not null;

alter table public.client_users
  add column auth_email text;

comment on column public.client_users.auth_email is
  'Supabase Auth identity address when it differs from the contact email. Never displayed.';

create unique index client_users_auth_email_unique
  on public.client_users (lower(auth_email))
  where auth_email is not null;
