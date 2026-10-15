-- Billing catalog, hard caps, idempotent usage, and role isolation.

CREATE FUNCTION pg_temp.check(p_ok boolean, p_message text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_ok IS NOT TRUE THEN
    RAISE EXCEPTION 'billing check failed: %', p_message;
  END IF;
END;
$$;

SELECT pg_temp.check(
  (SELECT count(*) FROM public.billing_plans) = 4,
  'expected four plans'
);
SELECT pg_temp.check(
  (SELECT overage_enabled OR trial_enabled OR annual_enabled OR setup_fee_enabled FROM public.billing_settings) IS FALSE,
  'overage, trial, annual, and setup fee must stay off'
);
SELECT pg_temp.check(
  (SELECT limit_review_on = DATE '2026-11-14' AND timezone = 'America/New_York' FROM public.billing_settings),
  'review date or timezone is wrong'
);
SELECT pg_temp.check(
  (SELECT jsonb_array_length(public.billing_public_catalog()) = 2),
  'public catalog should be Private Access and Custom only'
);

INSERT INTO public.organizations (name, slug, timezone)
VALUES ('Billing Isolation', 'billing-isolation', 'America/New_York');

SELECT pg_temp.check(
  (SELECT plan_id = 'internal' AND state = 'not_billed' FROM public.billing_accounts a JOIN public.organizations o ON o.id = a.org_id WHERE o.slug = 'billing-isolation'),
  'a raw workspace should land on the internal plan with no charge'
);

SELECT pg_temp.check(
  public.billing_consume(o.id, 'compass_questions', 1, 'same-key', 'live')
  AND public.billing_consume(o.id, 'compass_questions', 1, 'same-key', 'live')
  AND (SELECT count(*) FROM public.usage_ledger u WHERE u.org_id = o.id AND u.idempotency_key = 'same-key') = 1,
  'a retried usage key counted twice'
) FROM public.organizations o WHERE o.slug = 'billing-isolation';

SELECT pg_temp.check(
  NOT public.billing_consume(o.id, 'compass_questions', 1, 'historic-key', 'historic')
  OR (SELECT billable FROM public.usage_ledger WHERE org_id = o.id AND idempotency_key = 'historic-key') IS FALSE,
  'historic usage was billable'
) FROM public.organizations o WHERE o.slug = 'billing-isolation';
