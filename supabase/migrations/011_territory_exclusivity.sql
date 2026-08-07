-- Territory exclusivity and cross-client duplicate flags.
--
-- Exclusivity is service category × territory. The appointment-definition
-- service_area stays a separate free-text field on definitions; nothing here
-- derives one from the other.

/* -------------------------------------------------------------------------- */
/* Service categories                                                          */
/* -------------------------------------------------------------------------- */

create table public.service_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  sort int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.client_categories (
  client_id uuid not null references public.clients(id) on delete cascade,
  category_id uuid not null references public.service_categories(id) on delete restrict,
  primary key (client_id, category_id)
);

create index on public.client_categories (category_id);

insert into public.service_categories (slug, name, sort) values
  ('roofing', 'Roofing', 10),
  ('siding', 'Siding', 20),
  ('windows-and-doors', 'Windows and doors', 30),
  ('gutters', 'Gutters', 40),
  ('solar', 'Solar', 50),
  ('hvac', 'HVAC', 60),
  ('kitchen-remodeling', 'Kitchen remodeling', 70),
  ('bathroom-remodeling', 'Bathroom remodeling', 80),
  ('whole-home-remodeling', 'Whole-home remodeling', 90),
  ('decks-and-outdoor-living', 'Decks and outdoor living', 100),
  ('flooring', 'Flooring', 110),
  ('painting', 'Painting', 120),
  ('pools', 'Pools', 130),
  ('foundation-and-waterproofing', 'Foundation and waterproofing', 140),
  ('concrete-and-hardscaping', 'Concrete and hardscaping', 150);

/* -------------------------------------------------------------------------- */
/* Territories                                                                 */
/* -------------------------------------------------------------------------- */

create table public.territories (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  kind text not null check (kind in ('radius', 'postal_codes', 'named_regions')),
  label text,

  -- Radius. Center is stored as coordinates; the address is a label only.
  center_lat double precision,
  center_lng double precision,
  center_address text,
  radius_miles numeric,

  -- Explicit lists for irregular areas.
  postal_codes text[] not null default '{}',
  region_names text[] not null default '{}',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint territories_radius_complete check (
    kind <> 'radius'
    or (
      center_lat is not null
      and center_lng is not null
      and radius_miles is not null
      and radius_miles > 0
    )
  ),
  constraint territories_postal_complete check (
    kind <> 'postal_codes' or cardinality(postal_codes) > 0
  ),
  constraint territories_regions_complete check (
    kind <> 'named_regions' or cardinality(region_names) > 0
  )
);

create index on public.territories (client_id);
create trigger territories_updated_at
  before update on public.territories
  for each row execute function public.set_updated_at();

/* -------------------------------------------------------------------------- */
/* Exclusivity status and overrides                                            */
/* -------------------------------------------------------------------------- */

alter table public.clients
  add column exclusivity_status text not null default 'active'
    check (exclusivity_status in ('active', 'overridden', 'not_offered'));

-- A conscious decision not to enforce exclusivity between two clients. Kept
-- forever on both sides of the pair so anyone opening either account sees it.
create table public.exclusivity_overrides (
  id uuid primary key default gen_random_uuid(),
  client_a_id uuid not null references public.clients(id) on delete cascade,
  client_b_id uuid not null references public.clients(id) on delete cascade,
  shared_category_ids uuid[] not null default '{}',
  overlap_summary text not null,
  reason text not null,
  overridden_by uuid,
  overridden_by_label text,
  created_at timestamptz not null default now(),
  constraint exclusivity_overrides_ordered check (client_a_id < client_b_id),
  constraint exclusivity_overrides_distinct check (client_a_id <> client_b_id)
);

create unique index exclusivity_overrides_pair
  on public.exclusivity_overrides (client_a_id, client_b_id);

create index on public.exclusivity_overrides (client_b_id);

/* -------------------------------------------------------------------------- */
/* Cross-client duplicate flags                                                */
/* -------------------------------------------------------------------------- */

-- Raised when the same phone or email appears as a lead for two clients.
-- Never blocks either lead. Acknowledgement clears the attention item.
create table public.cross_client_matches (
  id uuid primary key default gen_random_uuid(),
  lead_a_id uuid not null references public.leads(id) on delete cascade,
  lead_b_id uuid not null references public.leads(id) on delete cascade,
  client_a_id uuid not null references public.clients(id) on delete cascade,
  client_b_id uuid not null references public.clients(id) on delete cascade,
  match_on text not null check (match_on in ('phone', 'email')),
  match_key text not null,
  acknowledged_at timestamptz,
  acknowledged_by uuid,
  acknowledged_by_label text,
  created_at timestamptz not null default now(),
  constraint cross_client_matches_ordered check (lead_a_id < lead_b_id),
  constraint cross_client_matches_distinct check (lead_a_id <> lead_b_id)
);

create unique index cross_client_matches_pair
  on public.cross_client_matches (lead_a_id, lead_b_id);

create index on public.cross_client_matches (client_a_id, acknowledged_at);
create index on public.cross_client_matches (client_b_id, acknowledged_at);
create index on public.cross_client_matches (match_key);

-- Default window for cross-client matching (days). Editable via app_settings.
insert into public.app_settings (key, value)
values ('cross_client_window_days', '90')
on conflict (key) do nothing;

/* -------------------------------------------------------------------------- */
/* Access                                                                      */
/* -------------------------------------------------------------------------- */

alter table public.service_categories enable row level security;
alter table public.client_categories enable row level security;
alter table public.territories enable row level security;
alter table public.exclusivity_overrides enable row level security;
alter table public.cross_client_matches enable row level security;
