create extension if not exists pgcrypto;

-- Clients: home improvement companies DA runs ads for
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_name text,
  contact_email text,
  contact_phone text,
  status text not null default 'Onboarding'
    check (status in ('Onboarding','Active','Paused','Churned')),

  -- commercial terms
  rate_per_appointment numeric not null default 150,
  monthly_minimum numeric not null default 0,
  billing_cycle_days int not null default 14,
  review_window_hours int not null default 72,
  bill_on text not null default 'booked' check (bill_on in ('booked','showed')),

  -- appointment definition (versioned via appointment_definitions)
  service_area text,
  accepted_job_types text[],

  -- integrations
  ghl_location_id text unique,
  webhook_secret text not null default encode(gen_random_bytes(24),'hex'),
  stripe_customer_id text,
  stripe_payment_method_id text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Versioned appointment definitions: changing the rules never reclassifies past appointments
create table public.appointment_definitions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  version int not null,
  criteria text not null,
  service_area text,
  accepted_job_types text[],
  effective_from timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (client_id, version)
);

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  name text not null,
  platform text not null default 'facebook',
  external_campaign_id text,
  utm_campaign text,
  created_at timestamptz not null default now()
);

create table public.ad_spend (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  spend_date date not null,
  amount numeric not null default 0,
  created_at timestamptz not null default now(),
  unique (campaign_id, spend_date)
);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  name text,
  phone text,
  email text,
  source text not null default 'Direct'
    check (source in ('Paid','Direct','Referral','Organic','Other')),
  utm_source text, utm_medium text, utm_campaign text, utm_content text,
  job_type text,
  raw_payload jsonb,
  arrived_at timestamptz not null default now(),
  duplicate_of uuid references public.leads(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.leads (client_id, arrived_at);
create index on public.leads (client_id, phone);

-- Touches: stamped once, never overwritten. Response time is derived from these.
create table public.touches (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  touch_type text not null check (touch_type in ('system','human')),
  channel text check (channel in ('sms','email','call','dm','other')),
  occurred_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index on public.touches (lead_id, touch_type, occurred_at);

-- Appointments: the billing unit
create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  definition_version int,
  scheduled_for timestamptz not null,
  appointment_type text,
  status text not null default 'pending'
    check (status in ('pending','confirmed','rejected','disputed','billed')),
  showed boolean,
  confirmed_at timestamptz,
  review_window_ends_at timestamptz,
  rejected_reason text,
  disputed_at timestamptz,
  dispute_reason text,
  dispute_resolution text,
  charge_id uuid,
  rate_applied numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.appointments (client_id, status, scheduled_for);

create table public.charges (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  appointment_count int not null default 0,
  appointments_subtotal numeric not null default 0,
  minimum_adjustment numeric not null default 0,
  total numeric not null default 0,
  status text not null default 'draft'
    check (status in ('draft','notified','processing','paid','failed','credited')),
  notified_at timestamptz,
  processed_at timestamptz,
  stripe_payment_intent_id text,
  failure_reason text,
  created_at timestamptz not null default now()
);

alter table public.appointments
  add constraint appointments_charge_fk
  foreign key (charge_id) references public.charges(id) on delete set null;

-- Immutable audit of every inbound webhook, before processing
create table public.inbound_events (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete set null,
  event_type text,
  payload jsonb not null,
  processed boolean not null default false,
  error text,
  received_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger clients_updated_at before update on public.clients
for each row execute function public.set_updated_at();
create trigger appointments_updated_at before update on public.appointments
for each row execute function public.set_updated_at();

alter table public.clients enable row level security;
alter table public.appointment_definitions enable row level security;
alter table public.campaigns enable row level security;
alter table public.ad_spend enable row level security;
alter table public.leads enable row level security;
alter table public.touches enable row level security;
alter table public.appointments enable row level security;
alter table public.charges enable row level security;
alter table public.inbound_events enable row level security;
-- No policies yet: service role only until auth lands in Prompt 2.
