-- Appointment capture, the status lifecycle, the review window, and disputes.
--
-- An appointment is the proof of work, the future invoice line, and the
-- analytics row at once, so the rules that protect its accuracy live in the
-- database rather than in the application. Two triggers carry almost all of it:
-- `appointments_guard` decides whether a change is allowed and derives the
-- values nobody should be trusted to supply, and `appointments_history` writes
-- the audit that a charge is defended with months later.

/* -------------------------------------------------------------------------- */
/* Booking events                                                              */
/* -------------------------------------------------------------------------- */

-- Bookings and show outcomes arrive through the same endpoint as leads and
-- touches, so they join the canonical types the pipeline already recognises.
alter table public.inbound_events
  drop constraint if exists inbound_events_canonical_type_check;

alter table public.inbound_events
  add constraint inbound_events_canonical_type_check
  check (canonical_type in (
    'lead_received',
    'system_touch',
    'human_touch',
    'contact_updated',
    'appointment_booked',
    'appointment_showed',
    'appointment_no_show'
  ));

alter table public.inbound_events
  add column appointment_id uuid references public.appointments(id) on delete set null;

-- A booking for someone who never submitted an enquiry still needs a lead, and
-- where that lead came from changes how its response times should be read.
alter table public.leads
  add column origin text not null default 'inquiry'
    check (origin in ('inquiry', 'booking'));

/* -------------------------------------------------------------------------- */
/* Appointments                                                                */
/* -------------------------------------------------------------------------- */

alter table public.appointments
  -- The stamped version resolved to the row it was read from, so the criteria
  -- an appointment was judged against can be shown in full without guesswork.
  add column definition_id uuid references public.appointment_definitions(id),
  add column booking_source text not null default 'webhook'
    check (booking_source in ('webhook', 'manual')),
  -- The provider's own identifier for the booking. The same booking delivered
  -- twice carries the same one; a reschedule carries it with a different time.
  add column provider_appointment_id text,
  add column previous_scheduled_for timestamptz,
  add column reschedule_count int not null default 0,
  add column show_recorded_at timestamptz,
  add column notified_at timestamptz,
  add column created_by uuid,
  -- Who made the most recent change and why. Written by the caller in the same
  -- statement as the change itself, which is what lets the audit trigger record
  -- an attributed history without a second round trip that could be lost.
  add column last_actor text check (last_actor in ('admin', 'client', 'system')),
  add column last_actor_id uuid,
  add column last_actor_label text,
  add column last_reason_code text,
  add column last_reason text;

-- An appointment with no definition version is unbillable and indefensible.
alter table public.appointments
  alter column definition_version set not null;

-- Idempotency. A provider that supplies its own booking id gets deduplicated on
-- it; everything else falls back to one appointment per lead per moment.
--
-- Both indexes cover live appointments only. A rejected appointment is a
-- judgement that has already been made and a billed one is immutable, so a
-- later booking that lands on the same slot or carries the same provider id is
-- a genuinely new appointment rather than a duplicate of a closed one.
create unique index appointments_provider_booking
  on public.appointments (client_id, provider_appointment_id)
  where provider_appointment_id is not null
    and status in ('pending', 'confirmed', 'disputed');

create unique index appointments_lead_slot
  on public.appointments (client_id, lead_id, scheduled_for)
  where status in ('pending', 'confirmed', 'disputed');

create index on public.appointments (status, created_at);
create index on public.appointments (lead_id);
create index on public.appointments (review_window_ends_at) where status = 'confirmed';

/* -------------------------------------------------------------------------- */
/* History                                                                     */
/* -------------------------------------------------------------------------- */

-- Every material change to an appointment, in order, with who and why. Written
-- only by the audit trigger; nothing here is ever updated or deleted.
create table public.appointment_events (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  kind text not null
    check (kind in ('created', 'status_changed', 'rescheduled', 'show_recorded')),
  from_status text,
  to_status text,
  previous_scheduled_for timestamptz,
  new_scheduled_for timestamptz,
  showed boolean,
  actor text not null check (actor in ('admin', 'client', 'system')),
  actor_id uuid,
  actor_label text,
  reason_code text,
  reason text,
  occurred_at timestamptz not null default now()
);

create index on public.appointment_events (appointment_id, occurred_at);

-- The permanent dispute record. A client's dispute rate is itself a signal, and
-- this is what protects Divine Acquisition if a relationship later goes bad, so
-- rows survive the outcome rather than being cleared by it.
create table public.appointment_disputes (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  raised_by text not null check (raised_by in ('client', 'admin')),
  raised_at timestamptz not null default now(),
  reason_code text,
  reason text not null,
  -- Null while the dispute is open.
  outcome text check (outcome in ('upheld', 'resolved')),
  outcome_reason text,
  resolved_at timestamptz,
  resolved_by uuid,
  -- The window the dispute was raised inside, kept so lateness is provable.
  window_ended_at timestamptz,
  created_at timestamptz not null default now()
);

create index on public.appointment_disputes (appointment_id, raised_at);
create index on public.appointment_disputes (client_id, raised_at);
create unique index appointment_disputes_one_open
  on public.appointment_disputes (appointment_id)
  where outcome is null;

-- What the client was told and when. The row is created by the trigger at the
-- moment of confirmation, before anything is sent, so a confirmed appointment
-- can never exist without a record of the notification it owed.
create table public.appointment_notifications (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  kind text not null default 'confirmation' check (kind in ('confirmation')),
  channel text check (channel in ('email')),
  recipient text,
  subject text,
  body text,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed')),
  error text,
  attempts int not null default 0,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on public.appointment_notifications (appointment_id, created_at);
create index on public.appointment_notifications (status, created_at);

create trigger appointment_notifications_updated_at
  before update on public.appointment_notifications
  for each row execute function public.set_updated_at();

/* -------------------------------------------------------------------------- */
/* The guard                                                                   */
/* -------------------------------------------------------------------------- */

-- Five statuses, and only the permitted moves between them. Everything the
-- application must not be trusted to get right — the length of a review window,
-- the rate that was in force, whether a window has genuinely elapsed — is
-- derived here instead of being accepted from the caller.
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

    -- The time that was replaced is retained whether or not the caller thought
    -- to keep it. A reschedule must never look like a second appointment.
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

      -- The window is opened by the database from the client's configured
      -- length, in real time, with no adjustment for weekends or holidays. A
      -- dispute resolved in DA's favour therefore always gets a fresh one.
      new.confirmed_at := now();
      new.review_window_ends_at :=
        now() + make_interval(hours => v_client.review_window_hours);
      new.rate_applied := coalesce(new.rate_applied, v_client.rate_per_appointment);
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
      -- Never allow an appointment to become billable without its window having
      -- genuinely elapsed. Chargebacks end engagements.
      if new.review_window_ends_at is null or new.review_window_ends_at > now() then
        raise exception
          'An appointment cannot be billed until its review window has elapsed.';
      end if;

      -- A client can never be charged for an appointment they were never told about.
      if not exists (
        select 1 from public.appointment_notifications
        where appointment_id = new.id and status = 'sent'
      ) then
        raise exception
          'An appointment cannot be billed before the client has been notified that it entered their review window.';
      end if;
    end if;
  end if;

  return new;
end $$;

create trigger appointments_guard
  before insert or update on public.appointments
  for each row execute function public.guard_appointment();

/* -------------------------------------------------------------------------- */
/* The audit                                                                   */
/* -------------------------------------------------------------------------- */

-- The evidence file, written as a side effect of the change itself so a status
-- can never move without the history that explains it.
create or replace function public.record_appointment_history()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_client public.clients;
begin
  if tg_op = 'INSERT' then
    insert into public.appointment_events (
      appointment_id, kind, to_status, new_scheduled_for,
      actor, actor_id, actor_label, reason_code, reason
    ) values (
      new.id, 'created', new.status, new.scheduled_for,
      new.last_actor, new.last_actor_id, new.last_actor_label,
      new.last_reason_code, new.last_reason
    );

    if new.showed is not null then
      insert into public.appointment_events (
        appointment_id, kind, showed, actor, actor_id, actor_label
      ) values (
        new.id, 'show_recorded', new.showed,
        new.last_actor, new.last_actor_id, new.last_actor_label
      );
    end if;

    return null;
  end if;

  if new.scheduled_for is distinct from old.scheduled_for then
    insert into public.appointment_events (
      appointment_id, kind, previous_scheduled_for, new_scheduled_for,
      actor, actor_id, actor_label, reason_code, reason
    ) values (
      new.id, 'rescheduled', old.scheduled_for, new.scheduled_for,
      coalesce(new.last_actor, 'system'), new.last_actor_id, new.last_actor_label,
      new.last_reason_code, new.last_reason
    );
  end if;

  if new.showed is distinct from old.showed then
    insert into public.appointment_events (
      appointment_id, kind, showed, actor, actor_id, actor_label, reason_code, reason
    ) values (
      new.id, 'show_recorded', new.showed,
      coalesce(new.last_actor, 'system'), new.last_actor_id, new.last_actor_label,
      new.last_reason_code, new.last_reason
    );
  end if;

  if new.status is distinct from old.status then
    insert into public.appointment_events (
      appointment_id, kind, from_status, to_status,
      actor, actor_id, actor_label, reason_code, reason
    ) values (
      new.id, 'status_changed', old.status, new.status,
      new.last_actor, new.last_actor_id, new.last_actor_label,
      new.last_reason_code, new.last_reason
    );

    if new.status = 'disputed' then
      insert into public.appointment_disputes (
        appointment_id, client_id, raised_by, reason_code, reason, window_ended_at
      ) values (
        new.id,
        new.client_id,
        case when new.last_actor = 'admin' then 'admin' else 'client' end,
        new.last_reason_code,
        new.last_reason,
        old.review_window_ends_at
      );
    end if;

    if old.status = 'disputed' then
      update public.appointment_disputes
      set outcome = case when new.status = 'rejected' then 'upheld' else 'resolved' end,
          outcome_reason = new.last_reason,
          resolved_at = now(),
          resolved_by = new.last_actor_id
      where appointment_id = new.id and outcome is null;
    end if;

    if new.status = 'confirmed' then
      select * into v_client from public.clients where id = new.client_id;

      insert into public.appointment_notifications (
        appointment_id, client_id, kind, recipient, status
      ) values (
        new.id, new.client_id, 'confirmation', v_client.contact_email, 'pending'
      );
    end if;
  end if;

  return null;
end $$;

create trigger appointments_history
  after insert or update on public.appointments
  for each row execute function public.record_appointment_history();

/* -------------------------------------------------------------------------- */
/* Capture                                                                     */
/* -------------------------------------------------------------------------- */

-- Stamping the definition version has to happen in the same statement as the
-- insert, or a version created in between would govern an appointment that was
-- booked before it existed.
create or replace function public.capture_appointment(
  p_client_id uuid,
  p_lead_id uuid,
  p_scheduled_for timestamptz,
  p_actor text,
  p_appointment_type text default null,
  p_provider_appointment_id text default null,
  p_booking_source text default 'webhook',
  p_actor_id uuid default null,
  p_actor_label text default null,
  p_showed boolean default null
)
returns public.appointments
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_definition public.appointment_definitions;
  v_appointment public.appointments;
begin
  select * into v_definition
  from public.appointment_definitions
  where client_id = p_client_id
  order by version desc
  limit 1;

  if v_definition.id is null then
    raise exception 'This client has no appointment definition to judge the appointment against.';
  end if;

  insert into public.appointments (
    client_id, lead_id, definition_version, definition_id, scheduled_for,
    appointment_type, provider_appointment_id, booking_source, showed,
    created_by, last_actor, last_actor_id, last_actor_label
  ) values (
    p_client_id, p_lead_id, v_definition.version, v_definition.id, p_scheduled_for,
    p_appointment_type, p_provider_appointment_id, p_booking_source, p_showed,
    case when p_booking_source = 'manual' then p_actor_id else null end,
    p_actor, p_actor_id, p_actor_label
  )
  returning * into v_appointment;

  return v_appointment;
end $$;

/* -------------------------------------------------------------------------- */
/* Access                                                                      */
/* -------------------------------------------------------------------------- */

alter table public.appointment_events enable row level security;
alter table public.appointment_disputes enable row level security;
alter table public.appointment_notifications enable row level security;
-- No policies, matching every other table: service role only until auth lands
-- for clients as well as admins.
