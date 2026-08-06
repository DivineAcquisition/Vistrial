-- Lead ingestion: idempotent inbound events, duplicate resolution, first-touch stamping.
-- Response times are never stored; they are derived from the first touch of each type.

-- The window inside which a second submission is the same person, not a new lead.
alter table public.clients
  add column duplicate_window_days int not null default 30
    check (duplicate_window_days > 0);

-- A response time computed from a receipt timestamp is slightly generous. Record
-- which source was used so an audit can tell the two apart.
alter table public.leads
  add column arrival_source text not null default 'received'
    check (arrival_source in ('payload', 'received'));

-- Match keys for duplicate resolution. Generated so they can never drift from the
-- contact details they are derived from, whoever writes the row.
alter table public.leads
  add column phone_key text generated always as (
    nullif(right(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g'), 10), '')
  ) stored,
  add column email_key text generated always as (
    nullif(lower(btrim(coalesce(email, ''))), '')
  ) stored;

create index on public.leads (client_id, phone_key) where phone_key is not null;
create index on public.leads (client_id, email_key) where email_key is not null;

-- Attribution is created on demand: an unknown campaign id is created rather than
-- dropped, so these are the keys a get-or-create looks up.
create unique index campaigns_client_external_id
  on public.campaigns (client_id, external_campaign_id)
  where external_campaign_id is not null;

create unique index campaigns_client_utm_campaign
  on public.campaigns (client_id, utm_campaign)
  where utm_campaign is not null;

-- inbound_events is the evidence table. Every authenticated request lands here
-- before anything is interpreted, including payloads that cannot be parsed.
alter table public.inbound_events
  drop column processed;

alter table public.inbound_events
  add column provider_event_id text,
  add column idempotency_key text,
  add column canonical_type text
    check (canonical_type in ('lead_received', 'system_touch', 'human_touch', 'contact_updated')),
  add column status text not null default 'pending'
    check (status in ('pending', 'processed', 'unattributed', 'unknown', 'unclassified', 'failed', 'dismissed')),
  add column declared_location_id text,
  add column location_mismatch boolean not null default false,
  add column lead_id uuid references public.leads(id) on delete set null,
  add column resolved_at timestamptz,
  add column resolution_note text;

-- The idempotency gate. Providers retry routinely; the second delivery of the
-- same event loses this insert and is acknowledged without being processed.
create unique index inbound_events_idempotency_key
  on public.inbound_events (idempotency_key)
  where idempotency_key is not null;

create index on public.inbound_events (status, received_at desc);
create index on public.inbound_events (client_id, received_at desc);

-- Touches: every contact attempt is recorded, but only the first of each type
-- carries the flag response times are read from. The partial unique index is what
-- makes "stamps once, never overwritten" a database guarantee rather than a hope.
alter table public.touches
  add column is_first_of_type boolean not null default false,
  add column inbound_event_id uuid references public.inbound_events(id) on delete set null;

create unique index touches_one_first_per_type
  on public.touches (lead_id, touch_type)
  where is_first_of_type;

alter table public.inbound_events
  add column touch_id uuid references public.touches(id) on delete set null;

-- A repeat submission does not create a second lead. It is recorded against the
-- original, with its own timestamp and payload, and stays visible to the admin.
create table public.lead_submissions (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  inbound_event_id uuid references public.inbound_events(id) on delete set null,
  is_original boolean not null default false,
  submitted_at timestamptz not null default now(),
  payload jsonb,
  created_at timestamptz not null default now()
);

create index on public.lead_submissions (lead_id, submitted_at);

alter table public.lead_submissions enable row level security;
-- No policies, matching every other table: service role only until auth lands.
