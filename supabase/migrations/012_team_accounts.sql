-- Team accounts, roles, invitations, sessions, and the security activity log.
--
-- Team users and client_users are separate populations. A row here never grants
-- portal access, and a client_users row never grants team access. There is one
-- workspace: Divine Acquisition.

/* -------------------------------------------------------------------------- */
/* Team users                                                                  */
/* -------------------------------------------------------------------------- */

create table public.team_users (
  id uuid primary key default gen_random_uuid(),
  -- Null until the invitation is accepted (or the Prompt-2 admin is migrated).
  user_id uuid unique,
  email text not null,
  full_name text,
  job_title text,
  phone text,
  timezone text,

  role text not null
    check (role in ('owner', 'admin', 'member')),

  status text not null default 'pending'
    check (status in ('pending', 'active', 'deactivated', 'locked')),

  -- Invitation: hash only, seven days, one use. Resend invalidates the prior.
  invitation_token_hash text unique,
  invitation_expires_at timestamptz,
  invited_by uuid,
  invited_by_label text,
  invited_at timestamptz,
  invitation_accepted_at timestamptz,
  -- pending | accepted | expired | cancelled — denormalised for the list.
  invitation_status text
    check (invitation_status is null or invitation_status in (
      'pending', 'accepted', 'expired', 'cancelled'
    )),

  -- Onboarding: password | profile | mfa | orientation | done
  onboarding_step text not null default 'password'
    check (onboarding_step in (
      'password', 'profile', 'mfa', 'orientation', 'done'
    )),
  password_set_at timestamptz,
  -- Members may skip MFA; they are prompted again at next sign-in.
  mfa_enabled boolean not null default false,
  mfa_skipped boolean not null default false,
  force_password_reset boolean not null default false,
  -- Prompt-2 migration: existing password, skip the password onboarding step.
  migrated_from_single_admin boolean not null default false,

  failed_sign_in_count integer not null default 0
    check (failed_sign_in_count >= 0),
  locked_at timestamptz,
  last_sign_in_at timestamptz,
  joined_at timestamptz,
  deactivated_at timestamptz,
  deactivated_by uuid,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index team_users_email_unique
  on public.team_users (lower(email));

create index team_users_status_idx on public.team_users (status);
create index team_users_role_idx on public.team_users (role);
create index team_users_user_id_idx on public.team_users (user_id);

create trigger team_users_updated_at
  before update on public.team_users
  for each row execute function public.set_updated_at();

-- There must always be at least one Owner among active team users.
-- Enforced in application code on role change / deactivation; a DB trigger
-- would race with migrations that create the first Owner.

/* -------------------------------------------------------------------------- */
/* MFA recovery codes (shown once; hashed at rest)                             */
/* -------------------------------------------------------------------------- */

create table public.team_mfa_recovery_codes (
  id uuid primary key default gen_random_uuid(),
  team_user_id uuid not null references public.team_users(id) on delete cascade,
  code_hash text not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index team_mfa_recovery_codes_user_idx
  on public.team_mfa_recovery_codes (team_user_id)
  where used_at is null;

/* -------------------------------------------------------------------------- */
/* Password reset tokens                                                       */
/* -------------------------------------------------------------------------- */

create table public.team_password_resets (
  id uuid primary key default gen_random_uuid(),
  team_user_id uuid not null references public.team_users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index team_password_resets_user_idx
  on public.team_password_resets (team_user_id);

/* -------------------------------------------------------------------------- */
/* Tracked sessions (device / approximate location; revoke individually)       */
/* -------------------------------------------------------------------------- */

create table public.team_sessions (
  id uuid primary key default gen_random_uuid(),
  team_user_id uuid not null references public.team_users(id) on delete cascade,
  -- Supabase auth session id when known; otherwise our own opaque id.
  auth_session_id text,
  user_agent text,
  ip_address text,
  approx_location text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index team_sessions_user_active_idx
  on public.team_sessions (team_user_id)
  where revoked_at is null;

/* -------------------------------------------------------------------------- */
/* Append-only security / permission activity log                              */
/* -------------------------------------------------------------------------- */

create table public.team_activity_log (
  id uuid primary key default gen_random_uuid(),
  actor_team_user_id uuid,
  actor_email text,
  action text not null,
  subject_team_user_id uuid,
  detail jsonb not null default '{}'::jsonb,
  ip_address text,
  created_at timestamptz not null default now()
);

create index team_activity_log_created_idx
  on public.team_activity_log (created_at desc);
create index team_activity_log_actor_idx
  on public.team_activity_log (actor_team_user_id);
create index team_activity_log_action_idx
  on public.team_activity_log (action);

-- No UPDATE or DELETE policies will ever be added. Service role is the only
-- writer; the application never updates or deletes rows.

/* -------------------------------------------------------------------------- */
/* Settings                                                                    */
/* -------------------------------------------------------------------------- */

insert into public.app_settings (key, value)
values
  ('team_max_failed_sign_ins', '5'),
  ('team_lockout_enabled', 'true')
on conflict (key) do nothing;

/* -------------------------------------------------------------------------- */
/* RLS: enabled, no policies — service role only (same pattern as the ledger)  */
/* -------------------------------------------------------------------------- */

alter table public.team_users enable row level security;
alter table public.team_mfa_recovery_codes enable row level security;
alter table public.team_password_resets enable row level security;
alter table public.team_sessions enable row level security;
alter table public.team_activity_log enable row level security;
