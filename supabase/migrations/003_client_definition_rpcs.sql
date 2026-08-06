-- A client without an appointment definition is a client whose appointments have
-- no rule to be judged against, so the two writes must not be able to come
-- apart. A function body is one transaction: if either insert fails, both roll
-- back and no client is left behind.
create or replace function public.create_client_with_definition(
  p_name text,
  p_criteria text,
  p_contact_name text default null,
  p_contact_email text default null,
  p_contact_phone text default null,
  p_status text default 'Onboarding',
  p_rate_per_appointment numeric default 150,
  p_monthly_minimum numeric default 0,
  p_billing_cycle_days int default 14,
  p_review_window_hours int default 72,
  p_bill_on text default 'booked',
  p_service_area text default null,
  p_accepted_job_types text[] default null,
  p_ghl_location_id text default null
)
returns public.clients
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_client public.clients;
begin
  insert into public.clients (
    name, contact_name, contact_email, contact_phone, status,
    rate_per_appointment, monthly_minimum, billing_cycle_days,
    review_window_hours, bill_on, service_area, accepted_job_types,
    ghl_location_id
  ) values (
    p_name, p_contact_name, p_contact_email, p_contact_phone, p_status,
    p_rate_per_appointment, p_monthly_minimum, p_billing_cycle_days,
    p_review_window_hours, p_bill_on, p_service_area, p_accepted_job_types,
    p_ghl_location_id
  )
  returning * into v_client;

  insert into public.appointment_definitions (
    client_id, version, criteria, service_area, accepted_job_types
  ) values (
    v_client.id, 1, p_criteria, p_service_area, p_accepted_job_types
  );

  return v_client;
end $$;

-- Definitions are versioned, never edited: an appointment is judged against the
-- version in effect when it was created. The next version number is computed
-- inside the insert so two callers cannot read the same maximum; the
-- (client_id, version) unique constraint turns a genuine race into an error
-- rather than a duplicate version.
create or replace function public.create_appointment_definition_version(
  p_client_id uuid,
  p_criteria text,
  p_service_area text default null,
  p_accepted_job_types text[] default null
)
returns public.appointment_definitions
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_definition public.appointment_definitions;
begin
  insert into public.appointment_definitions (
    client_id, version, criteria, service_area, accepted_job_types, effective_from
  )
  select
    p_client_id,
    coalesce(max(version), 0) + 1,
    p_criteria,
    p_service_area,
    p_accepted_job_types,
    now()
  from public.appointment_definitions
  where client_id = p_client_id
  returning * into v_definition;

  return v_definition;
end $$;
