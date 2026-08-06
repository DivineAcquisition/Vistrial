-- What a live Stripe key needs that a test one lets you get away with.
--
-- Three things change once real money is moving. Payment outcomes stop being
-- purely synchronous: a bank can accept after the request has timed out, and a
-- cardholder can reverse a payment weeks later. Chargebacks become real, and a
-- chargeback lands on a charge that is already paid — which the immutability
-- rule would otherwise refuse to record. And every attempt needs to say which
-- mode it happened in, because a test-mode row and a live-mode row are not the
-- same fact.

/* -------------------------------------------------------------------------- */
/* Which mode a payment happened in                                            */
/* -------------------------------------------------------------------------- */

alter table public.charges
  add column processor_mode text check (processor_mode in ('live', 'test'));

alter table public.charge_attempts
  add column processor_mode text check (processor_mode in ('live', 'test'));

/* -------------------------------------------------------------------------- */
/* Chargebacks                                                                 */
/* -------------------------------------------------------------------------- */

-- A chargeback is the outcome this whole product exists to avoid, so when one
-- arrives it is recorded against the charge rather than inferred from Stripe
-- later. The charge stays `paid`, because it was: the reversal is its own fact.
alter table public.charges
  add column chargeback_at timestamptz,
  add column chargeback_status text
    check (chargeback_status in ('warning', 'open', 'under_review', 'won', 'lost')),
  add column chargeback_reason text,
  add column chargeback_amount numeric,
  add column chargeback_reference text;

create index on public.charges (chargeback_status)
  where chargeback_status is not null;

-- The immutability rule has to bend exactly this far and no further: a paid
-- charge can record that it was reversed, and nothing else.
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
    if new.status is distinct from old.status
       or new.total is distinct from old.total
       or new.appointment_count is distinct from old.appointment_count
       or new.appointments_subtotal is distinct from old.appointments_subtotal
       or new.minimum_adjustment is distinct from old.minimum_adjustment
       or new.credits_applied is distinct from old.credits_applied
       or new.period_start is distinct from old.period_start
       or new.period_end is distinct from old.period_end
       or new.client_id is distinct from old.client_id
       or new.stripe_payment_intent_id is distinct from old.stripe_payment_intent_id
       or new.processed_at is distinct from old.processed_at then
      raise exception 'A paid charge is immutable. Correct it with a credit.';
    end if;

    return new;
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

/* -------------------------------------------------------------------------- */
/* The event log                                                               */
/* -------------------------------------------------------------------------- */

-- Every event Stripe sends, stored before it is interpreted, exactly as the
-- inbound webhook already does for leads. The unique index on the provider's
-- own event id is the idempotency gate: Stripe retries for three days, and a
-- retried `payment_intent.succeeded` must not settle a charge twice.
create table public.stripe_events (
  id uuid primary key default gen_random_uuid(),
  stripe_event_id text not null unique,
  type text not null,
  livemode boolean not null default false,
  payload jsonb not null,
  status text not null default 'pending'
    check (status in ('pending', 'processed', 'ignored', 'failed')),
  charge_id uuid references public.charges(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  note text,
  error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create index on public.stripe_events (status, received_at desc);
create index on public.stripe_events (type, received_at desc);

alter table public.stripe_events enable row level security;
-- No policies, matching every other table: service role only.
