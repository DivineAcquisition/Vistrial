-- Charge assembly, the pre-charge notification, payment, and failure handling.
--
-- This is where mistakes cost real money and real relationships, so the rules
-- that prevent a chargeback are constraints rather than conventions: a client
-- cannot hold two charges for overlapping periods, a paid charge cannot be
-- edited, and a charge cannot be processed before the client has actually been
-- sent the itemisation it contains.

create extension if not exists btree_gist;

/* -------------------------------------------------------------------------- */
/* Clients: the payment method and the cycle anchor                            */
/* -------------------------------------------------------------------------- */

alter table public.clients
  -- Processor references only. Vistrial never stores, transmits, or displays a
  -- card number: the four fields below are metadata the processor reports back,
  -- which is all the billing screen ever shows.
  add column card_brand text,
  add column card_last4 text,
  add column card_exp_month int check (card_exp_month between 1 and 12),
  add column card_exp_year int,
  add column payment_method_added_at timestamptz,
  -- The in-flight hosted setup session, so a link can be reissued and finished.
  add column payment_setup_session_id text,

  -- The cycle anchors to activation rather than to the calendar, so a client
  -- activated on the ninth on a fourteen day cycle closes on the twenty-third
  -- and the sixth thereafter.
  add column activated_at timestamptz,
  add column next_cycle_close date,
  -- Where the last period ended, so the next one starts the day after it.
  add column last_cycle_close date;

alter table public.clients
  add constraint clients_billing_cycle_days_check
  check (billing_cycle_days in (7, 14, 30));

-- A client cannot move to active without a payment method on file. Appointments
-- still accumulate where one is missing; it is the commercial relationship that
-- is gated, not the work.
create or replace function public.guard_client_activation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status = 'Active'
     and (new.stripe_customer_id is null or new.stripe_payment_method_id is null) then
    raise exception
      'This client cannot be made active until a payment method is on file.';
  end if;

  if new.status = 'Active' and new.activated_at is null then
    new.activated_at := now();
    new.last_cycle_close := current_date;
    new.next_cycle_close := current_date + new.billing_cycle_days;
  end if;

  return new;
end $$;

create trigger clients_activation_guard
  before insert or update on public.clients
  for each row execute function public.guard_client_activation();

/* -------------------------------------------------------------------------- */
/* Charges                                                                     */
/* -------------------------------------------------------------------------- */

alter table public.charges
  add column currency text not null default 'usd',
  add column credits_applied numeric not null default 0 check (credits_applied >= 0),
  -- The calendar month a minimum adjustment on this charge covers, so the same
  -- month can never be topped up twice.
  add column minimum_month date,
  -- No earlier than twenty four hours after the notification was sent.
  add column scheduled_for timestamptz,
  add column attempts int not null default 0,
  add column last_attempt_at timestamptz,
  add column next_attempt_at timestamptz,
  add column failure_code text,
  add column updated_at timestamptz not null default now();

alter table public.charges
  add constraint charges_period_order check (period_end >= period_start);

-- A client never receives two charges for overlapping periods. An exclusion
-- constraint is the only way to mean that when more than one job run is awake.
alter table public.charges
  add constraint charges_no_overlapping_periods
  exclude using gist (
    client_id with =,
    daterange(period_start, period_end, '[]') with &&
  );

create unique index charges_one_minimum_per_month
  on public.charges (client_id, minimum_month)
  where minimum_month is not null;

create index on public.charges (status, scheduled_for);
create index on public.charges (status, next_attempt_at);
create index on public.charges (client_id, period_end desc);

create trigger charges_updated_at
  before update on public.charges
  for each row execute function public.set_updated_at();

-- The itemisation, exactly as the client was shown it. Appointment lines carry
-- the rate that was applied so a later rate change cannot rewrite an invoice.
create table public.charge_lines (
  id uuid primary key default gen_random_uuid(),
  charge_id uuid not null references public.charges(id) on delete cascade,
  kind text not null check (kind in ('appointment', 'minimum_adjustment', 'credit')),
  appointment_id uuid references public.appointments(id) on delete set null,
  credit_id uuid,
  description text not null,
  amount numeric not null,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

create index on public.charge_lines (charge_id, sort);
create unique index charge_lines_one_per_appointment
  on public.charge_lines (appointment_id)
  where appointment_id is not null;

-- Every payment attempt, successful or not, with the processor's own reason.
create table public.charge_attempts (
  id uuid primary key default gen_random_uuid(),
  charge_id uuid not null references public.charges(id) on delete cascade,
  attempt_no int not null,
  attempted_at timestamptz not null default now(),
  outcome text not null check (outcome in ('succeeded', 'failed')),
  processor_reference text,
  failure_code text,
  failure_message text,
  unique (charge_id, attempt_no)
);

create index on public.charge_attempts (charge_id, attempted_at);

-- What the client was told about a charge and whether it arrived. A charge
-- whose notification did not deliver does not process.
create table public.charge_notifications (
  id uuid primary key default gen_random_uuid(),
  charge_id uuid not null references public.charges(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  kind text not null
    check (kind in ('pre_charge', 'receipt', 'payment_failed', 'payment_failed_final')),
  channel text check (channel in ('email')),
  recipient text,
  subject text,
  body text,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  error text,
  attempts int not null default 0,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on public.charge_notifications (charge_id, created_at);
create index on public.charge_notifications (status, created_at);

create trigger charge_notifications_updated_at
  before update on public.charge_notifications
  for each row execute function public.set_updated_at();

/* -------------------------------------------------------------------------- */
/* Credits                                                                     */
/* -------------------------------------------------------------------------- */

-- A processed charge never changes, so a correction is a credit. A credit with
-- no explanation is indistinguishable from an error, and both parties need the
-- record, which is why the reason cannot be blank.
create table public.credits (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  amount numeric not null check (amount > 0),
  reason text not null check (btrim(reason) <> ''),
  -- Set where the credit corrects a specific appointment that was billed in
  -- error. The appointment stays on its charge; only the money comes back.
  appointment_id uuid references public.appointments(id) on delete set null,
  created_by uuid,
  created_by_label text,
  applied_charge_id uuid references public.charges(id) on delete set null,
  applied_at timestamptz,
  created_at timestamptz not null default now()
);

create index on public.credits (client_id, created_at);
create index on public.credits (client_id) where applied_charge_id is null;

alter table public.charge_lines
  add constraint charge_lines_credit_fk
  foreign key (credit_id) references public.credits(id) on delete set null;

/* -------------------------------------------------------------------------- */
/* Immutability                                                                */
/* -------------------------------------------------------------------------- */

-- A processed charge never changes: not its total, not its appointments, not
-- its period. Corrections are credits.
create or replace function public.guard_charge()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.status in ('paid', 'processing') then
      raise exception 'A % charge cannot be deleted.', old.status;
    end if;
    return old;
  end if;

  if old.status = 'paid' then
    raise exception 'A paid charge is immutable. Correct it with a credit.';
  end if;

  if new.period_start is distinct from old.period_start
     or new.period_end is distinct from old.period_end
     or new.client_id is distinct from old.client_id then
    raise exception 'The period a charge covers is fixed when it is assembled.';
  end if;

  if new.status = 'paid' then
    if new.processed_at is null then
      new.processed_at := now();
    end if;

    -- A client can never be charged for something they were not sent in
    -- advance, itemised, with the processing time stated.
    if not exists (
      select 1 from public.charge_notifications
      where charge_id = new.id and kind = 'pre_charge' and status = 'sent'
    ) then
      raise exception
        'This charge cannot be marked paid: the client was never sent the itemisation.';
    end if;
  end if;

  return new;
end $$;

create trigger charges_guard
  before update or delete on public.charges
  for each row execute function public.guard_charge();

-- Lines are the invoice as it was shown. They are written once.
create or replace function public.guard_charge_line()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_status text;
begin
  select status into v_status
  from public.charges
  where id = coalesce(new.charge_id, old.charge_id);

  if v_status in ('paid', 'processing') then
    raise exception 'The itemisation of a % charge cannot be changed.', v_status;
  end if;

  if tg_op = 'UPDATE' then
    raise exception 'A charge line is written once and never edited.';
  end if;

  return coalesce(new, old);
end $$;

create trigger charge_lines_guard
  before insert or update or delete on public.charge_lines
  for each row execute function public.guard_charge_line();

/* -------------------------------------------------------------------------- */
/* Appointments                                                                */
/* -------------------------------------------------------------------------- */

-- The rate is stamped when the charge is assembled, not when the appointment is
-- confirmed, so what a client is billed is the rate in force at the moment the
-- invoice was built and is unaffected by any later change. Confirming no longer
-- writes it; everything else about the guard is unchanged.
create or replace function public.guard_appointment()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_client public.clients;
begin
  if tg_op = 'INSERT' then
    if new.definition_version is null then
      raise exception
        'An appointment must carry the appointment definition version in effect when it was created.';
    end if;

    if new.last_actor is null then
      raise exception 'An appointment must record who created it.';
    end if;

    if new.status <> 'pending' then
      raise exception
        'An appointment is created pending and reviewed afterwards, not created as %.', new.status;
    end if;

    if new.showed is not null then
      new.show_recorded_at := now();
    end if;

    return new;
  end if;

  if old.status = 'billed' then
    raise exception 'A billed appointment is immutable.';
  end if;

  if new.definition_version is distinct from old.definition_version
     or new.definition_id is distinct from old.definition_id then
    raise exception
      'The appointment definition version stamped at creation never changes.';
  end if;

  if new.client_id is distinct from old.client_id
     or new.lead_id is distinct from old.lead_id then
    raise exception 'An appointment cannot be moved to another lead or client.';
  end if;

  if new.scheduled_for is distinct from old.scheduled_for then
    if old.status = 'rejected' then
      raise exception 'A rejected appointment is not rescheduled; a new booking creates a new appointment.';
    end if;

    new.previous_scheduled_for := old.scheduled_for;
    new.reschedule_count := old.reschedule_count + 1;
  end if;

  if new.showed is distinct from old.showed and new.showed is not null then
    new.show_recorded_at := now();
  end if;

  if new.status is distinct from old.status then
    if new.last_actor is null then
      raise exception 'Every status change records who made it.';
    end if;

    if not (
      (old.status = 'pending' and new.status in ('confirmed', 'rejected'))
      or (old.status = 'confirmed' and new.status in ('disputed', 'billed'))
      or (old.status = 'disputed' and new.status in ('confirmed', 'rejected'))
    ) then
      raise exception 'An appointment cannot move from % to %.', old.status, new.status;
    end if;

    if new.status in ('rejected', 'disputed')
       and coalesce(btrim(new.last_reason), '') = '' then
      raise exception 'Moving an appointment to % requires a reason.', new.status;
    end if;

    if old.status = 'disputed' and coalesce(btrim(new.last_reason), '') = '' then
      raise exception 'Settling a dispute requires the reasoning behind the outcome.';
    end if;

    select * into v_client from public.clients where id = new.client_id;

    if new.status = 'confirmed' then
      if v_client.bill_on = 'showed' and new.showed is distinct from true then
        raise exception
          'This client bills on showed, so the appointment cannot be confirmed until a show is recorded.';
      end if;

      new.confirmed_at := now();
      new.review_window_ends_at :=
        now() + make_interval(hours => v_client.review_window_hours);
      new.dispute_resolution := case
        when old.status = 'disputed' then new.last_reason
        else new.dispute_resolution
      end;
    end if;

    if new.status = 'rejected' then
      new.rejected_reason := new.last_reason;
      if old.status = 'disputed' then
        new.dispute_resolution := new.last_reason;
      end if;
    end if;

    if new.status = 'disputed' then
      new.disputed_at := now();
      new.dispute_reason := new.last_reason;
    end if;

    if new.status = 'billed' then
      if new.review_window_ends_at is null or new.review_window_ends_at > now() then
        raise exception
          'An appointment cannot be billed until its review window has elapsed.';
      end if;

      if not exists (
        select 1 from public.appointment_notifications
        where appointment_id = new.id and status = 'sent'
      ) then
        raise exception
          'An appointment cannot be billed before the client has been notified that it entered their review window.';
      end if;

      if new.charge_id is null then
        raise exception 'An appointment becomes billed by being paid for, not on its own.';
      end if;
    end if;
  end if;

  return new;
end $$;

/* -------------------------------------------------------------------------- */
/* The cycle job log                                                           */
/* -------------------------------------------------------------------------- */

-- A cycle that silently did not run is a week of revenue that quietly did not
-- happen, so every run is recorded whether or not it did anything.
create table public.job_runs (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'cycle',
  trigger text not null default 'schedule' check (trigger in ('schedule', 'manual')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  assembled int not null default 0,
  notified int not null default 0,
  processed int not null default 0,
  failed int not null default 0,
  skipped int not null default 0,
  error text
);

create index on public.job_runs (started_at desc);

-- Including clients skipped and why.
create table public.job_run_entries (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.job_runs(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  charge_id uuid references public.charges(id) on delete set null,
  action text not null
    check (action in ('assembled', 'notified', 'processed', 'failed', 'retried', 'skipped')),
  detail text not null,
  created_at timestamptz not null default now()
);

create index on public.job_run_entries (run_id, created_at);

/* -------------------------------------------------------------------------- */
/* Access                                                                      */
/* -------------------------------------------------------------------------- */

alter table public.charge_lines enable row level security;
alter table public.charge_attempts enable row level security;
alter table public.charge_notifications enable row level security;
alter table public.credits enable row level security;
alter table public.job_runs enable row level security;
alter table public.job_run_entries enable row level security;
-- No policies, matching every other table: service role only.
