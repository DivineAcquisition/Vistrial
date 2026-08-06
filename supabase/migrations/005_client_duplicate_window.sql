-- The duplicate window is a commercial term, so it belongs in the create form
-- alongside the rate and the cycle. Dropped and recreated rather than replaced:
-- adding a parameter changes the signature, and leaving both versions in place
-- would make the call ambiguous.
drop function if exists public.create_client_with_definition(
  text, text, text, text, text, text, numeric, numeric, int, int, text, text, text[], text
);

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
  p_ghl_location_id text default null,
  p_duplicate_window_days int default 30
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
    ghl_location_id, duplicate_window_days
  ) values (
    p_name, p_contact_name, p_contact_email, p_contact_phone, p_status,
    p_rate_per_appointment, p_monthly_minimum, p_billing_cycle_days,
    p_review_window_hours, p_bill_on, p_service_area, p_accepted_job_types,
    p_ghl_location_id, p_duplicate_window_days
  )
  returning * into v_client;

  insert into public.appointment_definitions (
    client_id, version, criteria, service_area, accepted_job_types
  ) values (
    v_client.id, 1, p_criteria, p_service_area, p_accepted_job_types
  );

  return v_client;
end $$;
