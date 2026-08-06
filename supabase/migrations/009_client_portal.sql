-- The client portal: accounts, share links, ad spend, and the notices that go
-- with them.
--
-- The portal is the retention layer, so almost everything here exists to make
-- one number trustworthy: the combined cost per appointment. The rest is the
-- boundary around it. Scope is enforced where the data is read rather than by
-- hiding parts of the interface, and the tables below are shaped so a query
-- that forgets to scope itself has nothing sensible to return.

/* -------------------------------------------------------------------------- */
/* Client accounts                                                             */
/* -------------------------------------------------------------------------- */

-- One person at one client business. There is no signup anywhere: a row here
-- is created by an administrator and nowhere else, which is also the invariant
-- that lets an authenticated user with no row here be treated as an admin.
create table public.client_users (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  -- Null until the invitation is accepted and the auth user exists.
  user_id uuid unique,
  name text not null,
  email text not null,

  status text not null default 'invited'
    check (status in ('invited', 'active', 'archived', 'closed')),

  -- Appointment confirmations and billing notices cannot be turned off: both
  -- are the basis on which the client is charged.
  weekly_summary boolean not null default true,

  -- The invitation expires, works once, and is stored only as a hash.
  invitation_token_hash text unique,
  invitation_expires_at timestamptz,
  invited_by uuid,
  invited_by_label text,
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,

  -- An ended engagement keeps read-only access until this passes.
  archived_at timestamptz,
  access_ends_at timestamptz,
  last_seen_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index client_users_one_per_email
  on public.client_users (client_id, lower(email));

create index on public.client_users (client_id, status);

create trigger client_users_updated_at
  before update on public.client_users
  for each row execute function public.set_updated_at();

-- Cutting a client off the day they cancel turns a neutral ending into a bad
-- review, so churning a client archives their people rather than closing them.
create or replace function public.archive_client_users()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status = 'Churned' and old.status is distinct from 'Churned' then
    update public.client_users
    set status = 'archived',
        archived_at = now(),
        access_ends_at = now() + interval '90 days'
    where client_id = new.id and status in ('invited', 'active');
  end if;

  if old.status = 'Churned' and new.status <> 'Churned' then
    update public.client_users
    set status = 'active', archived_at = null, access_ends_at = null
    where client_id = new.id and status = 'archived' and user_id is not null;
  end if;

  return new;
end $$;

create trigger clients_archive_portal_users
  after update on public.clients
  for each row execute function public.archive_client_users();

/* -------------------------------------------------------------------------- */
/* Share links                                                                 */
/* -------------------------------------------------------------------------- */

-- Some clients will never create an account, and forcing one costs the
-- retention benefit entirely. A link shows the same dashboard under the same
-- boundary, and can do nothing else.
create table public.share_links (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  token_hash text not null unique,
  label text,
  created_by uuid,
  created_by_label text,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index on public.share_links (client_id, created_at desc);

create table public.share_link_views (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references public.share_links(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  user_agent text
);

create index on public.share_link_views (link_id, viewed_at desc);

/* -------------------------------------------------------------------------- */
/* Notices                                                                     */
/* -------------------------------------------------------------------------- */

-- Invitations, the weekly summary, and the alert an administrator gets when a
-- client disputes. Recorded with a delivery status like every other notice in
-- this system.
create table public.client_notifications (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  client_user_id uuid references public.client_users(id) on delete set null,
  audience text not null default 'client' check (audience in ('client', 'admin')),
  kind text not null
    check (kind in ('invitation', 'weekly_summary', 'dispute_alert')),
  channel text check (channel in ('email')),
  recipient text,
  subject text,
  body text,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed')),
  error text,
  attempts int not null default 0,
  sent_at timestamptz,
  -- The week a summary covers, so the same week is never sent twice.
  period_start date,
  period_end date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on public.client_notifications (client_id, created_at desc);
create unique index client_notifications_one_summary_per_week
  on public.client_notifications (client_user_id, kind, period_start)
  where kind = 'weekly_summary' and client_user_id is not null;

create trigger client_notifications_updated_at
  before update on public.client_notifications
  for each row execute function public.set_updated_at();

/* -------------------------------------------------------------------------- */
/* Ad spend                                                                    */
/* -------------------------------------------------------------------------- */

-- A day with no row is unknown, not zero. That distinction is the whole reason
-- a cost per appointment can be trusted: an admin who spent nothing on a day
-- records a zero deliberately, and a day nobody has recorded renders the figure
-- unavailable rather than flattering.
alter table public.ad_spend
  add column entered_by uuid,
  add column entered_by_label text,
  add column note text,
  add column updated_at timestamptz not null default now();

alter table public.ad_spend
  add constraint ad_spend_amount_not_negative check (amount >= 0);

create unique index ad_spend_client_day_without_campaign
  on public.ad_spend (client_id, spend_date)
  where campaign_id is null;

create index on public.ad_spend (client_id, spend_date);

create trigger ad_spend_updated_at
  before update on public.ad_spend
  for each row execute function public.set_updated_at();

/* -------------------------------------------------------------------------- */
/* Access                                                                      */
/* -------------------------------------------------------------------------- */

alter table public.client_users enable row level security;
alter table public.share_links enable row level security;
alter table public.share_link_views enable row level security;
alter table public.client_notifications enable row level security;
-- No policies, matching every other table: every read goes through the server,
-- which scopes it to the client on the session before it asks.
