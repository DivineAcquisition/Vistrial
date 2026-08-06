-- The attention view itself needs no tables: it reads conditions that already
-- exist. What does need storing is the daily digest — when it should go out,
-- and whether each morning's send actually left.

create table public.app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

create trigger app_settings_updated_at
  before update on public.app_settings
  for each row execute function public.set_updated_at();

-- Default: 07:00 UTC. Configurable from Settings.
insert into public.app_settings (key, value)
values ('attention_digest_hour_utc', '7');

create table public.attention_digests (
  id uuid primary key default gen_random_uuid(),
  -- The calendar day the digest covers (UTC). One successful send per day.
  digest_for date not null,
  recipient text,
  subject text,
  body text,
  item_count int not null default 0,
  escalated_count int not null default 0,
  value_at_risk numeric not null default 0,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed', 'skipped')),
  error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

-- A successful send is unique per day. Failed attempts may retry.
create unique index attention_digests_one_sent_per_day
  on public.attention_digests (digest_for)
  where status = 'sent';

alter table public.app_settings enable row level security;
alter table public.attention_digests enable row level security;
-- No policies: every read goes through the server with the service role.
