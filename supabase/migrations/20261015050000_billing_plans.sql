-- Billing plans, entitlements, usage, and the subscription lifecycle.
--
-- Stripe remains the source of truth for money. This database stores the plan
-- catalog, the workspace's assignment, usage that counts against a limit, and
-- an audit trail. Card numbers are never stored.
--
-- Limits reset on the billing period in America/New_York. There is no
-- automatic overage charge, no setup fee, no free trial, and no annual price.
-- A missing payment method stays a go-live warning a Platform Admin can accept.
-- Past-due billing still blocks go-live, as it already did.
--
-- Rollback: supabase/rollbacks/20261015050000_billing_plans.sql.

-- ---------------------------------------------------------------------------
-- Settings the Platform Admin can change without a deploy
-- ---------------------------------------------------------------------------

CREATE TABLE public.billing_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  timezone text NOT NULL DEFAULT 'America/New_York',
  grace_through_day integer NOT NULL DEFAULT 7 CHECK (grace_through_day BETWEEN 0 AND 30),
  restrict_on_day integer NOT NULL DEFAULT 8 CHECK (restrict_on_day BETWEEN 1 AND 45),
  suspend_on_day integer NOT NULL DEFAULT 30 CHECK (suspend_on_day BETWEEN 2 AND 90),
  close_on_day integer NOT NULL DEFAULT 60 CHECK (close_on_day BETWEEN 3 AND 180),
  reminder_days integer[] NOT NULL DEFAULT ARRAY[1, 3, 6],
  warn_at_percent integer NOT NULL DEFAULT 80 CHECK (warn_at_percent BETWEEN 50 AND 99),
  setup_fee_enabled boolean NOT NULL DEFAULT false,
  setup_fee_cents integer NOT NULL DEFAULT 0 CHECK (setup_fee_cents >= 0),
  annual_enabled boolean NOT NULL DEFAULT false,
  overage_enabled boolean NOT NULL DEFAULT false,
  trial_enabled boolean NOT NULL DEFAULT false,
  stripe_tax_enabled boolean NOT NULL DEFAULT false,
  quoted_floor_cents integer NOT NULL DEFAULT 9700 CHECK (quoted_floor_cents >= 0),
  limit_review_on date NOT NULL DEFAULT DATE '2026-11-14',
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.billing_settings (id) VALUES (true);

ALTER TABLE public.billing_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY billing_settings_admin ON public.billing_settings
  FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());
GRANT SELECT, UPDATE ON public.billing_settings TO authenticated;
GRANT ALL ON public.billing_settings TO service_role;

-- ---------------------------------------------------------------------------
-- Catalog. Versions apply to new assignments unless staff migrate a workspace.
-- ---------------------------------------------------------------------------

CREATE TABLE public.billing_plans (
  id text PRIMARY KEY CHECK (id ~ '^[a-z0-9_]{2,40}$'),
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 80),
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('draft', 'available', 'hidden', 'retired')),
  currency text NOT NULL DEFAULT 'usd' CHECK (currency = 'usd'),
  interval text NOT NULL DEFAULT 'month' CHECK (interval = 'month'),
  price_cents integer CHECK (price_cents IS NULL OR price_cents >= 0),
  starting_at boolean NOT NULL DEFAULT false,
  public_display boolean NOT NULL DEFAULT false,
  self_select boolean NOT NULL DEFAULT false,
  counts_as_revenue boolean NOT NULL DEFAULT true,
  bullets text[] NOT NULL DEFAULT '{}',
  stripe_product_id text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.billing_plan_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id text NOT NULL REFERENCES public.billing_plans (id),
  version integer NOT NULL CHECK (version >= 1),
  entitlements jsonb NOT NULL,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_id, version)
);

ALTER TABLE public.billing_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_plan_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY billing_plans_read ON public.billing_plans FOR SELECT TO authenticated USING (true);
CREATE POLICY billing_plans_admin ON public.billing_plans FOR ALL TO authenticated
  USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());
CREATE POLICY billing_plan_versions_read ON public.billing_plan_versions FOR SELECT TO authenticated USING (true);
CREATE POLICY billing_plan_versions_admin ON public.billing_plan_versions FOR ALL TO authenticated
  USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());
GRANT SELECT ON public.billing_plans, public.billing_plan_versions TO authenticated;
GRANT ALL ON public.billing_plans, public.billing_plan_versions TO service_role;

INSERT INTO public.billing_plans (id, name, description, status, price_cents, starting_at, public_display, self_select, counts_as_revenue, bullets)
VALUES
  ('private_access', 'Private Access', 'Vistrial for one business.', 'available', 9700, true, true, false, true,
    ARRAY[
      'Up to 5 people on the team',
      'Up to 500 leads with a full case file each month',
      'Up to 20 hours of call transcription each month',
      'Up to 300 Compass questions each month',
      'Sentry, Scribe, Relay, and Compass',
      'One CRM connection, plus a webhook and file import',
      'Writing back to the CRM is off'
    ]),
  ('custom', 'Custom', 'A price and limits set for one workspace.', 'available', NULL, false, true, false, true,
    ARRAY['Limits and price are agreed for this workspace']),
  ('internal', 'Internal', 'Demo and test workspaces. Not billed.', 'hidden', NULL, false, false, false, false,
    ARRAY['Not billed', 'Excluded from revenue']),
  ('pilot', 'Pilot', 'Free or discounted access with an end date.', 'hidden', NULL, false, false, false, false,
    ARRAY['Approved one workspace at a time', 'Ends on the date recorded with the reason']);

INSERT INTO public.billing_plan_versions (plan_id, version, entitlements, note)
VALUES
  ('private_access', 1, '{"team_members":5,"leads_processed":500,"transcript_minutes":1200,"compass_questions":300,"connectors":1,"compass":true,"writeback":false,"transcripts":true,"agents":true,"sso":false,"api_access":false}'::jsonb,
    'Starting Private Access. Review the limits on the date in billing settings.'),
  ('custom', 1, '{"team_members":5,"leads_processed":500,"transcript_minutes":1200,"compass_questions":300,"connectors":1,"compass":true,"writeback":false,"transcripts":true,"agents":true,"sso":false,"api_access":false}'::jsonb,
    'Starting point for a custom plan. Staff replace this version per workspace.'),
  ('internal', 1, '{"team_members":null,"leads_processed":null,"transcript_minutes":null,"compass_questions":null,"connectors":null,"compass":true,"writeback":true,"transcripts":true,"agents":true,"sso":false,"api_access":false}'::jsonb,
    'Unlimited for demo and test. Not revenue.'),
  ('pilot', 1, '{"team_members":5,"leads_processed":500,"transcript_minutes":1200,"compass_questions":300,"connectors":1,"compass":true,"writeback":false,"transcripts":true,"agents":true,"sso":false,"api_access":false}'::jsonb,
    'Same included amounts as Private Access until a custom pilot is approved.');

-- ---------------------------------------------------------------------------
-- One plan per workspace. Existing workspaces are placed on Internal.
-- ---------------------------------------------------------------------------

CREATE TABLE public.billing_accounts (
  org_id uuid PRIMARY KEY REFERENCES public.organizations (id) ON DELETE CASCADE,
  plan_id text NOT NULL REFERENCES public.billing_plans (id),
  version_id uuid NOT NULL REFERENCES public.billing_plan_versions (id),
  state text NOT NULL DEFAULT 'not_billed' CHECK (state IN (
    'not_billed', 'pending_payment', 'active', 'past_due', 'restricted', 'suspended', 'canceling', 'canceled', 'paused'
  )),
  quoted_price_cents integer CHECK (quoted_price_cents IS NULL OR quoted_price_cents >= 0),
  quote_reason text,
  quote_by uuid,
  quote_second_by uuid,
  single_admin_approval boolean NOT NULL DEFAULT false,
  billing_start text NOT NULL DEFAULT 'go_live' CHECK (billing_start IN ('go_live', 'date')),
  billing_start_on date,
  billing_start_reason text,
  pilot_ends_on date,
  pilot_reason text,
  payment_method boolean NOT NULL DEFAULT false,
  payment_exception boolean NOT NULL DEFAULT false,
  payment_exception_reason text,
  path_paused boolean NOT NULL DEFAULT false,
  path_pause_reason text,
  grace_extra_days integer NOT NULL DEFAULT 0 CHECK (grace_extra_days BETWEEN 0 AND 90),
  failed_at timestamptz,
  restricted_at timestamptz,
  suspended_at timestamptz,
  cancel_at timestamptz,
  cancel_reason text,
  recovering_until timestamptz,
  stripe_price_id text,
  stripe_sync text NOT NULL DEFAULT 'pending' CHECK (stripe_sync IN ('pending', 'synced', 'skipped', 'error')),
  stripe_sync_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.billing_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  entitlement_key text NOT NULL CHECK (entitlement_key ~ '^[a-z_]{2,40}$'),
  amount integer,
  enabled boolean,
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 2 AND 500),
  expires_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX billing_overrides_org_idx ON public.billing_overrides (org_id, entitlement_key);

CREATE TABLE public.usage_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  meter text NOT NULL CHECK (meter ~ '^[a-z_]{2,40}$'),
  idempotency_key text NOT NULL CHECK (char_length(idempotency_key) BETWEEN 1 AND 200),
  quantity integer NOT NULL,
  period_start date NOT NULL,
  billable boolean NOT NULL DEFAULT true,
  kind text NOT NULL DEFAULT 'live' CHECK (kind IN ('live', 'historic', 'sample', 'replay', 'demo', 'correction')),
  cost_micros bigint NOT NULL DEFAULT 0 CHECK (cost_micros >= 0),
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, idempotency_key)
);
CREATE INDEX usage_ledger_period_idx ON public.usage_ledger (org_id, meter, period_start) WHERE billable;

CREATE TABLE public.billing_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES public.organizations (id) ON DELETE CASCADE,
  action text NOT NULL,
  actor_user_id uuid,
  actor_label text NOT NULL DEFAULT 'Vistrial',
  reason text,
  single_admin_approval boolean NOT NULL DEFAULT false,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX billing_audit_org_idx ON public.billing_audit (org_id, created_at DESC);

CREATE TABLE public.billing_notices (
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  kind text NOT NULL,
  period_key text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, kind, period_key)
);

ALTER TABLE public.billing_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_notices ENABLE ROW LEVEL SECURITY;

CREATE POLICY billing_accounts_select ON public.billing_accounts FOR SELECT TO authenticated
  USING (public.portal_can_see_billing(org_id));
CREATE POLICY billing_overrides_select ON public.billing_overrides FOR SELECT TO authenticated
  USING (public.portal_can_see_billing(org_id));
CREATE POLICY usage_ledger_select ON public.usage_ledger FOR SELECT TO authenticated
  USING (public.portal_can_see_billing(org_id));
CREATE POLICY billing_audit_select ON public.billing_audit FOR SELECT TO authenticated
  USING (org_id IS NULL AND public.is_platform_admin() OR org_id IS NOT NULL AND public.portal_can_see_billing(org_id));
CREATE POLICY billing_notices_admin ON public.billing_notices FOR SELECT TO authenticated
  USING (public.is_platform_admin());

GRANT SELECT ON public.billing_accounts, public.billing_overrides, public.usage_ledger, public.billing_audit TO authenticated;
GRANT SELECT ON public.billing_notices TO authenticated;
GRANT ALL ON public.billing_accounts, public.billing_overrides, public.usage_ledger, public.billing_audit, public.billing_notices TO service_role;

CREATE OR REPLACE FUNCTION public.billing_audit_freeze()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Billing history cannot be changed.';
END;
$$;
CREATE TRIGGER billing_audit_no_update BEFORE UPDATE OR DELETE ON public.billing_audit
  FOR EACH ROW EXECUTE FUNCTION public.billing_audit_freeze();
CREATE TRIGGER usage_ledger_no_update BEFORE UPDATE OR DELETE ON public.usage_ledger
  FOR EACH ROW EXECUTE FUNCTION public.billing_audit_freeze();

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.billing_today()
RETURNS date
LANGUAGE sql
STABLE
AS $$
  SELECT (now() AT TIME ZONE 'America/New_York')::date
$$;

CREATE OR REPLACE FUNCTION public.billing_period_start(p_org_id uuid)
RETURNS date
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start timestamptz;
BEGIN
  SELECT current_period_start INTO v_start FROM public.workspace_billing WHERE org_id = p_org_id;
  IF v_start IS NOT NULL THEN
    RETURN (v_start AT TIME ZONE 'America/New_York')::date;
  END IF;
  RETURN date_trunc('month', now() AT TIME ZONE 'America/New_York')::date;
END;
$$;

CREATE OR REPLACE FUNCTION public.billing_period_end(p_org_id uuid)
RETURNS date
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_end timestamptz;
  v_start date;
BEGIN
  SELECT current_period_end INTO v_end FROM public.workspace_billing WHERE org_id = p_org_id;
  IF v_end IS NOT NULL THEN
    RETURN (v_end AT TIME ZONE 'America/New_York')::date;
  END IF;
  v_start := public.billing_period_start(p_org_id);
  RETURN (v_start + interval '1 month')::date;
END;
$$;

CREATE OR REPLACE FUNCTION public.billing_latest_version(p_plan_id text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.billing_plan_versions
  WHERE plan_id = p_plan_id
  ORDER BY version DESC
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.billing_write_audit(
  p_org_id uuid,
  p_action text,
  p_reason text,
  p_detail jsonb DEFAULT '{}'::jsonb,
  p_single boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_label text := 'Vistrial';
BEGIN
  IF auth.uid() IS NOT NULL THEN
    SELECT COALESCE(display_name, email, 'Platform Admin') INTO v_label
    FROM public.platform_staff WHERE user_id = auth.uid();
    v_label := COALESCE(v_label, 'Platform Admin');
  END IF;
  INSERT INTO public.billing_audit (org_id, action, actor_user_id, actor_label, reason, single_admin_approval, detail)
  VALUES (p_org_id, p_action, auth.uid(), v_label, NULLIF(btrim(COALESCE(p_reason, '')), ''), p_single, COALESCE(p_detail, '{}'::jsonb));
  INSERT INTO public.workspace_activity_log (org_id, actor_user_id, actor_label, actor_kind, action, target_table, target_id, detail)
  SELECT p_org_id, auth.uid(), v_label,
    CASE WHEN public.is_platform_admin() THEN 'platform_admin' WHEN auth.uid() IS NULL THEN 'system' ELSE 'service_team' END,
    p_action, 'billing_accounts', p_org_id::text,
    COALESCE(p_detail, '{}'::jsonb) || jsonb_build_object('reason', p_reason, 'single_admin_approval', p_single)
  WHERE p_org_id IS NOT NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.billing_require_admin()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Not found.' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.billing_active_admin_count()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::integer FROM public.platform_staff WHERE active AND role = 'platform_admin'
$$;

-- Numeric entitlements. null means no cap. Overrides win until they expire.
CREATE OR REPLACE FUNCTION public.billing_limit(p_org_id uuid, p_key text)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_raw jsonb;
  v_override integer;
BEGIN
  SELECT o.amount INTO v_override
  FROM public.billing_overrides o
  WHERE o.org_id = p_org_id AND o.entitlement_key = p_key AND o.amount IS NOT NULL
    AND (o.expires_at IS NULL OR o.expires_at > now())
  ORDER BY o.created_at DESC
  LIMIT 1;
  IF v_override IS NOT NULL THEN
    RETURN v_override;
  END IF;
  SELECT v.entitlements -> p_key INTO v_raw
  FROM public.billing_accounts a
  JOIN public.billing_plan_versions v ON v.id = a.version_id
  WHERE a.org_id = p_org_id;
  IF v_raw IS NULL OR v_raw = 'null'::jsonb THEN
    RETURN NULL;
  END IF;
  IF jsonb_typeof(v_raw) = 'number' THEN
    RETURN (v_raw #>> '{}')::integer;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.billing_feature(p_org_id uuid, p_key text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_override boolean;
  v_raw jsonb;
BEGIN
  SELECT o.enabled INTO v_override
  FROM public.billing_overrides o
  WHERE o.org_id = p_org_id AND o.entitlement_key = p_key AND o.enabled IS NOT NULL
    AND (o.expires_at IS NULL OR o.expires_at > now())
  ORDER BY o.created_at DESC
  LIMIT 1;
  IF v_override IS NOT NULL THEN
    RETURN v_override;
  END IF;
  SELECT v.entitlements -> p_key INTO v_raw
  FROM public.billing_accounts a
  JOIN public.billing_plan_versions v ON v.id = a.version_id
  WHERE a.org_id = p_org_id;
  RETURN COALESCE(v_raw = 'true'::jsonb, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.billing_used(p_org_id uuid, p_meter text)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(sum(quantity), 0)::integer
  FROM public.usage_ledger
  WHERE org_id = p_org_id AND meter = p_meter AND billable
    AND period_start = public.billing_period_start(p_org_id)
$$;

CREATE OR REPLACE FUNCTION public.billing_blocks_cost(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT state IN ('restricted', 'suspended', 'canceled') FROM public.billing_accounts WHERE org_id = p_org_id), false)
$$;

-- Record usage once. Historic, sample, replay, and demo rows are not billable.
-- Returns false when a hard cap or a billing restriction blocks the action.
-- A repeated idempotency key does not count twice and still returns the first result.
CREATE OR REPLACE FUNCTION public.billing_consume(
  p_org_id uuid,
  p_meter text,
  p_quantity integer,
  p_key text,
  p_kind text DEFAULT 'live'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_billable boolean := p_kind = 'live';
  v_limit integer;
  v_used integer;
  v_inserted uuid;
BEGIN
  IF p_quantity = 0 THEN
    RETURN true;
  END IF;
  IF p_kind NOT IN ('live', 'historic', 'sample', 'replay', 'demo', 'correction') THEN
    RAISE EXCEPTION 'Unknown usage kind.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.usage_ledger WHERE org_id = p_org_id AND idempotency_key = p_key) THEN
    RETURN true;
  END IF;
  IF p_kind <> 'live' THEN
    INSERT INTO public.usage_ledger (org_id, meter, idempotency_key, quantity, period_start, billable, kind, created_by)
    VALUES (p_org_id, p_meter, p_key, p_quantity, public.billing_period_start(p_org_id), false, p_kind, auth.uid());
    RETURN true;
  END IF;
  IF public.billing_blocks_cost(p_org_id) AND p_meter IN ('leads_processed', 'transcript_minutes', 'compass_questions', 'relay_drafts') THEN
    RETURN false;
  END IF;
  v_limit := public.billing_limit(p_org_id, p_meter);
  v_used := public.billing_used(p_org_id, p_meter);
  IF v_limit IS NOT NULL AND v_used + p_quantity > v_limit THEN
    RETURN false;
  END IF;
  INSERT INTO public.usage_ledger (org_id, meter, idempotency_key, quantity, period_start, billable, kind, created_by)
  VALUES (p_org_id, p_meter, p_key, p_quantity, public.billing_period_start(p_org_id), v_billable, p_kind, auth.uid())
  ON CONFLICT (org_id, idempotency_key) DO NOTHING
  RETURNING id INTO v_inserted;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.entitlement_check(p_org_id uuid, p_key text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_access text := public.ws_access(p_org_id);
  v_limit integer;
  v_used integer;
  v_reset date := public.billing_period_end(p_org_id);
  v_feature boolean;
  v_blocked boolean := public.billing_blocks_cost(p_org_id);
  v_recovering boolean;
BEGIN
  IF auth.uid() IS NOT NULL AND v_access IS NULL AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Not found.' USING ERRCODE = '42501';
  END IF;
  SELECT recovering_until > now() INTO v_recovering FROM public.billing_accounts WHERE org_id = p_org_id;

  IF p_key IN ('compass', 'writeback', 'transcripts', 'agents', 'sso', 'api_access') THEN
    v_feature := public.billing_feature(p_org_id, p_key);
    IF p_key = 'compass' AND (v_blocked OR COALESCE(v_recovering, false)) THEN
      RETURN jsonb_build_object('allowed', false, 'feature', false, 'reason',
        'Compass is paused until billing is sorted. Ask your Owner.', 'reset_on', v_reset);
    END IF;
    RETURN jsonb_build_object('allowed', v_feature, 'feature', v_feature, 'limit', null, 'used', 0, 'remaining', null,
      'reason', CASE WHEN v_feature THEN 'Included.' ELSE 'Not included on this plan.' END, 'reset_on', v_reset);
  END IF;

  IF p_key = 'team_members' THEN
    SELECT count(*)::integer INTO v_used FROM public.org_members
    WHERE org_id = p_org_id AND seat = 'customer' AND active;
    v_used := v_used + COALESCE((
      SELECT count(*)::integer FROM public.org_invites
      WHERE org_id = p_org_id AND accepted_at IS NULL AND expires_at > now()
    ), 0);
  ELSE
    v_used := public.billing_used(p_org_id, p_key);
  END IF;
  v_limit := public.billing_limit(p_org_id, p_key);

  IF v_blocked AND p_key IN ('leads_processed', 'transcript_minutes', 'compass_questions', 'relay_drafts') THEN
    RETURN jsonb_build_object(
      'allowed', false, 'capture', p_key = 'leads_processed', 'limit', v_limit, 'used', v_used,
      'remaining', CASE WHEN v_limit IS NULL THEN NULL ELSE greatest(v_limit - v_used, 0) END,
      'reason', 'This is paused until the workspace billing is sorted. Ask your Owner. Nothing already saved is removed.',
      'reset_on', v_reset
    );
  END IF;

  IF v_limit IS NOT NULL AND v_used >= v_limit AND p_key IN ('team_members', 'leads_processed', 'transcript_minutes', 'compass_questions') THEN
    RETURN jsonb_build_object(
      'allowed', false, 'capture', p_key = 'leads_processed', 'limit', v_limit, 'used', v_used, 'remaining', 0,
      'reason', 'The limit for this period has been reached. It resets on ' || to_char(v_reset, 'FMMonth FMDD') || '. Ask your Owner.',
      'reset_on', v_reset
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', true, 'capture', true, 'limit', v_limit, 'used', v_used,
    'remaining', CASE WHEN v_limit IS NULL THEN NULL ELSE greatest(v_limit - v_used, 0) END,
    'reason', 'Within the plan.', 'reset_on', v_reset
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Assignment, quotes, credits
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.billing_assign_plan(
  p_org_id uuid,
  p_plan_id text,
  p_reason text,
  p_pilot_ends_on date DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_version uuid := public.billing_latest_version(p_plan_id);
  v_revenue boolean;
BEGIN
  PERFORM public.billing_require_admin();
  IF NULLIF(btrim(COALESCE(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'A reason is required.';
  END IF;
  IF v_version IS NULL THEN
    RAISE EXCEPTION 'Unknown plan.';
  END IF;
  SELECT counts_as_revenue INTO v_revenue FROM public.billing_plans WHERE id = p_plan_id AND status <> 'retired';
  IF v_revenue IS NULL THEN
    RAISE EXCEPTION 'That plan is not available.';
  END IF;
  IF p_plan_id = 'pilot' AND p_pilot_ends_on IS NULL THEN
    RAISE EXCEPTION 'A pilot needs an end date.';
  END IF;
  INSERT INTO public.billing_accounts (org_id, plan_id, version_id, state, pilot_ends_on, pilot_reason)
  VALUES (p_org_id, p_plan_id, v_version, 'not_billed', CASE WHEN p_plan_id = 'pilot' THEN p_pilot_ends_on END, CASE WHEN p_plan_id = 'pilot' THEN btrim(p_reason) END)
  ON CONFLICT (org_id) DO UPDATE SET
    plan_id = EXCLUDED.plan_id,
    version_id = EXCLUDED.version_id,
    pilot_ends_on = EXCLUDED.pilot_ends_on,
    pilot_reason = EXCLUDED.pilot_reason,
    updated_at = now();
  PERFORM public.billing_write_audit(p_org_id, 'billing.plan_assigned', btrim(p_reason),
    jsonb_build_object('plan_id', p_plan_id, 'pilot_ends_on', p_pilot_ends_on));
END;
$$;

CREATE OR REPLACE FUNCTION public.billing_set_quote(
  p_org_id uuid,
  p_cents integer,
  p_reason text,
  p_second_admin uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_floor integer;
  v_admins integer := public.billing_active_admin_count();
  v_single boolean := false;
BEGIN
  PERFORM public.billing_require_admin();
  IF p_cents IS NULL OR p_cents < 0 THEN
    RAISE EXCEPTION 'Enter a price in cents.';
  END IF;
  IF NULLIF(btrim(COALESCE(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'A reason is required.';
  END IF;
  SELECT quoted_floor_cents INTO v_floor FROM public.billing_settings WHERE id;
  IF p_cents < v_floor THEN
    IF v_admins >= 2 THEN
      IF p_second_admin IS NULL OR p_second_admin = auth.uid() THEN
        RAISE EXCEPTION 'A price under $97 needs a second Platform Admin.';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM public.platform_staff WHERE user_id = p_second_admin AND active AND role = 'platform_admin') THEN
        RAISE EXCEPTION 'The second approver must be an active Platform Admin.';
      END IF;
    ELSE
      v_single := true;
    END IF;
  END IF;
  UPDATE public.billing_accounts
  SET quoted_price_cents = p_cents,
      quote_reason = btrim(p_reason),
      quote_by = auth.uid(),
      quote_second_by = CASE WHEN p_cents < v_floor AND NOT v_single THEN p_second_admin ELSE NULL END,
      single_admin_approval = v_single,
      updated_at = now()
  WHERE org_id = p_org_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not found.' USING ERRCODE = '42501';
  END IF;
  PERFORM public.billing_write_audit(p_org_id, 'billing.quote_set', btrim(p_reason),
    jsonb_build_object('price_cents', p_cents, 'second_admin', p_second_admin), v_single);
END;
$$;

CREATE OR REPLACE FUNCTION public.billing_set_start(p_org_id uuid, p_mode text, p_on date, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.billing_require_admin();
  IF p_mode NOT IN ('go_live', 'date') THEN
    RAISE EXCEPTION 'Choose go-live or a date.';
  END IF;
  IF NULLIF(btrim(COALESCE(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'A reason is required.';
  END IF;
  IF p_mode = 'date' AND p_on IS NULL THEN
    RAISE EXCEPTION 'A start date is required.';
  END IF;
  UPDATE public.billing_accounts
  SET billing_start = p_mode, billing_start_on = p_on, billing_start_reason = btrim(p_reason), updated_at = now()
  WHERE org_id = p_org_id;
  PERFORM public.billing_write_audit(p_org_id, 'billing.start_changed', btrim(p_reason),
    jsonb_build_object('mode', p_mode, 'on', p_on));
END;
$$;

CREATE OR REPLACE FUNCTION public.billing_grant_override(
  p_org_id uuid,
  p_key text,
  p_amount integer,
  p_enabled boolean,
  p_reason text,
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.billing_require_admin();
  IF NULLIF(btrim(COALESCE(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'A reason is required.';
  END IF;
  INSERT INTO public.billing_overrides (org_id, entitlement_key, amount, enabled, reason, expires_at, created_by)
  VALUES (p_org_id, p_key, p_amount, p_enabled, btrim(p_reason), p_expires_at, auth.uid());
  PERFORM public.billing_write_audit(p_org_id, 'billing.override_granted', btrim(p_reason),
    jsonb_build_object('key', p_key, 'amount', p_amount, 'enabled', p_enabled, 'expires_at', p_expires_at));
END;
$$;

CREATE OR REPLACE FUNCTION public.billing_correct_usage(p_org_id uuid, p_meter text, p_quantity integer, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text := 'correction:' || gen_random_uuid()::text;
BEGIN
  PERFORM public.billing_require_admin();
  IF NULLIF(btrim(COALESCE(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'A reason is required.';
  END IF;
  INSERT INTO public.usage_ledger (org_id, meter, idempotency_key, quantity, period_start, billable, kind, note, created_by)
  VALUES (p_org_id, p_meter, v_key, p_quantity, public.billing_period_start(p_org_id), true, 'correction', btrim(p_reason), auth.uid());
  PERFORM public.billing_write_audit(p_org_id, 'billing.usage_corrected', btrim(p_reason),
    jsonb_build_object('meter', p_meter, 'quantity', p_quantity));
END;
$$;

-- A credit up to one month of price needs one Platform Admin. Above that, a second admin,
-- unless only one active Platform Admin exists. Service Team cannot call this.
CREATE OR REPLACE FUNCTION public.billing_request_credit(
  p_org_id uuid,
  p_cents integer,
  p_reason text,
  p_kind text,
  p_second_admin uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month integer;
  v_admins integer := public.billing_active_admin_count();
  v_single boolean := false;
BEGIN
  PERFORM public.billing_require_admin();
  IF p_kind NOT IN ('credit', 'refund') THEN
    RAISE EXCEPTION 'Choose a credit or a refund.';
  END IF;
  IF p_cents IS NULL OR p_cents <= 0 THEN
    RAISE EXCEPTION 'Enter an amount.';
  END IF;
  IF NULLIF(btrim(COALESCE(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'A reason is required.';
  END IF;
  SELECT COALESCE(a.quoted_price_cents, p.price_cents, 0) INTO v_month
  FROM public.billing_accounts a
  JOIN public.billing_plans p ON p.id = a.plan_id
  WHERE a.org_id = p_org_id;
  IF p_cents > COALESCE(v_month, 0) THEN
    IF v_admins >= 2 THEN
      IF p_second_admin IS NULL OR p_second_admin = auth.uid()
        OR NOT EXISTS (SELECT 1 FROM public.platform_staff WHERE user_id = p_second_admin AND active AND role = 'platform_admin') THEN
        RAISE EXCEPTION 'Above one month of price, a second Platform Admin has to approve.';
      END IF;
    ELSE
      v_single := true;
    END IF;
  END IF;
  PERFORM public.billing_write_audit(p_org_id, 'billing.' || p_kind || '_requested', btrim(p_reason),
    jsonb_build_object('cents', p_cents, 'second_admin', p_second_admin, 'stripe', 'pending'), v_single);
END;
$$;

CREATE OR REPLACE FUNCTION public.billing_extend_grace(p_org_id uuid, p_days integer, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.billing_require_admin();
  IF NULLIF(btrim(COALESCE(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'A reason is required.';
  END IF;
  UPDATE public.billing_accounts
  SET grace_extra_days = grace_extra_days + GREATEST(p_days, 0), updated_at = now()
  WHERE org_id = p_org_id;
  PERFORM public.billing_write_audit(p_org_id, 'billing.grace_extended', btrim(p_reason), jsonb_build_object('days', p_days));
END;
$$;

CREATE OR REPLACE FUNCTION public.billing_pause_path(p_org_id uuid, p_paused boolean, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.billing_require_admin();
  IF NULLIF(btrim(COALESCE(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'A reason is required.';
  END IF;
  UPDATE public.billing_accounts
  SET path_paused = p_paused, path_pause_reason = btrim(p_reason), updated_at = now()
  WHERE org_id = p_org_id;
  PERFORM public.billing_write_audit(p_org_id, CASE WHEN p_paused THEN 'billing.path_paused' ELSE 'billing.path_resumed' END, btrim(p_reason), '{}'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.billing_pause_workspace(p_org_id uuid, p_paused boolean, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.billing_require_admin();
  IF NULLIF(btrim(COALESCE(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'A reason is required.';
  END IF;
  UPDATE public.billing_accounts
  SET state = CASE WHEN p_paused THEN 'paused' ELSE 'active' END, updated_at = now()
  WHERE org_id = p_org_id;
  UPDATE public.organizations
  SET status = CASE WHEN p_paused THEN 'paused' ELSE 'active' END::public.workspace_status,
      status_reason = CASE WHEN p_paused THEN 'billing: ' || btrim(p_reason) ELSE NULL END
  WHERE id = p_org_id;
  IF p_paused THEN
    PERFORM public.halt_org_follow_up_sequences(p_org_id, auth.uid());
  END IF;
  PERFORM public.billing_write_audit(p_org_id, CASE WHEN p_paused THEN 'billing.paused' ELSE 'billing.resumed' END, btrim(p_reason), '{}'::jsonb);
END;
$$;

-- Owner cancellation. Never hidden. Optional one question. Access runs to the period end.
CREATE OR REPLACE FUNCTION public.billing_cancel(p_org_id uuid, p_reason text DEFAULT NULL)
RETURNS date
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_end date := public.billing_period_end(p_org_id);
BEGIN
  IF public.ws_access(p_org_id) IS DISTINCT FROM 'owner' AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Not found.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.billing_accounts
  SET state = 'canceling', cancel_at = v_end::timestamptz, cancel_reason = NULLIF(btrim(COALESCE(p_reason, '')), ''), updated_at = now()
  WHERE org_id = p_org_id;
  UPDATE public.workspace_billing SET cancel_at_period_end = true, updated_at = now() WHERE org_id = p_org_id;
  PERFORM public.billing_write_audit(p_org_id, 'billing.cancel_scheduled', NULLIF(btrim(COALESCE(p_reason, '')), ''),
    jsonb_build_object('ends_on', v_end));
  RETURN v_end;
END;
$$;

CREATE OR REPLACE FUNCTION public.billing_payment_exception(p_org_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.billing_require_admin();
  IF NULLIF(btrim(COALESCE(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'A reason is required.';
  END IF;
  UPDATE public.billing_accounts
  SET payment_exception = true, payment_exception_reason = btrim(p_reason), updated_at = now()
  WHERE org_id = p_org_id;
  PERFORM public.billing_write_audit(p_org_id, 'billing.payment_exception', btrim(p_reason), '{}'::jsonb);
END;
$$;

-- ---------------------------------------------------------------------------
-- Lifecycle driven by Stripe mirrors and the daily job
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.billing_note_failure(p_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_revenue boolean;
BEGIN
  SELECT p.counts_as_revenue INTO v_revenue
  FROM public.billing_accounts a JOIN public.billing_plans p ON p.id = a.plan_id
  WHERE a.org_id = p_org_id;
  IF NOT COALESCE(v_revenue, false) THEN
    RETURN;
  END IF;
  UPDATE public.billing_accounts
  SET failed_at = COALESCE(failed_at, now()),
      state = CASE WHEN state IN ('active', 'pending_payment', 'not_billed', 'canceling') THEN 'past_due' ELSE state END,
      updated_at = now()
  WHERE org_id = p_org_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.billing_note_paid(p_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.billing_accounts
  SET failed_at = NULL,
      state = 'active',
      restricted_at = NULL,
      suspended_at = NULL,
      payment_method = true,
      recovering_until = now() + interval '5 minutes',
      updated_at = now()
  WHERE org_id = p_org_id AND state IN ('past_due', 'restricted', 'suspended', 'canceled', 'pending_payment');
  UPDATE public.organizations
  SET status = 'active', status_reason = NULL
  WHERE id = p_org_id AND status_reason LIKE 'billing:%' AND status IN ('paused', 'closed');
  PERFORM public.billing_write_audit(p_org_id, 'billing.restored', NULL, jsonb_build_object('compass_resumes_in', '5 minutes'));
END;
$$;

CREATE OR REPLACE FUNCTION public.billing_on_go_live()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_revenue boolean;
  v_exception text;
BEGIN
  IF OLD.go_live_approved_at IS NOT NULL OR NEW.go_live_approved_at IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT p.counts_as_revenue INTO v_revenue
  FROM public.billing_accounts a JOIN public.billing_plans p ON p.id = a.plan_id
  WHERE a.org_id = NEW.org_id;
  IF NOT COALESCE(v_revenue, false) THEN
    RETURN NEW;
  END IF;
  SELECT reason INTO v_exception FROM public.onboarding_check_acceptances
  WHERE org_id = NEW.org_id AND check_key = 'billing';
  UPDATE public.billing_accounts a
  SET billing_start_on = COALESCE(a.billing_start_on, public.billing_today()),
      payment_exception = a.payment_exception OR v_exception IS NOT NULL,
      payment_exception_reason = COALESCE(a.payment_exception_reason, v_exception),
      state = CASE
        WHEN a.payment_method OR a.payment_exception OR v_exception IS NOT NULL THEN 'active'
        ELSE 'pending_payment'
      END,
      updated_at = now()
  WHERE a.org_id = NEW.org_id AND a.billing_start = 'go_live' AND a.state = 'not_billed';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS billing_on_go_live ON public.workspace_onboarding_status;
CREATE TRIGGER billing_on_go_live
  BEFORE UPDATE ON public.workspace_onboarding_status
  FOR EACH ROW EXECUTE FUNCTION public.billing_on_go_live();

-- Advance past-due workspaces. Day 0 through the grace day stay fully on.
-- Restriction, suspension, and close use the settings row. Safety work is not touched.
CREATE OR REPLACE FUNCTION public.billing_advance(p_now timestamptz DEFAULT now())
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.billing_settings%ROWTYPE;
  r record;
  v_day integer;
  v_n integer := 0;
BEGIN
  SELECT * INTO s FROM public.billing_settings WHERE id;
  FOR r IN
    SELECT a.org_id, a.failed_at, a.state, a.path_paused, a.grace_extra_days, a.cancel_at, p.counts_as_revenue
    FROM public.billing_accounts a
    JOIN public.billing_plans p ON p.id = a.plan_id
  LOOP
    IF r.cancel_at IS NOT NULL AND r.cancel_at::date <= (p_now AT TIME ZONE 'America/New_York')::date AND r.state = 'canceling' THEN
      UPDATE public.billing_accounts SET state = 'canceled', updated_at = p_now WHERE org_id = r.org_id;
      UPDATE public.organizations SET status = 'paused', status_reason = 'billing: canceled' WHERE id = r.org_id AND status <> 'closed';
      PERFORM public.halt_org_follow_up_sequences(r.org_id, NULL);
      v_n := v_n + 1;
      CONTINUE;
    END IF;
    IF NOT r.counts_as_revenue OR r.failed_at IS NULL OR r.path_paused OR r.state NOT IN ('past_due', 'restricted', 'suspended') THEN
      CONTINUE;
    END IF;
    v_day := ((p_now AT TIME ZONE 'America/New_York')::date - (r.failed_at AT TIME ZONE 'America/New_York')::date);
    IF v_day >= s.close_on_day + r.grace_extra_days AND r.state <> 'canceled' THEN
      UPDATE public.billing_accounts SET state = 'canceled', updated_at = p_now WHERE org_id = r.org_id;
      UPDATE public.organizations SET status = 'closed', status_reason = 'billing: closed after non-payment' WHERE id = r.org_id;
      PERFORM public.halt_org_follow_up_sequences(r.org_id, NULL);
      PERFORM public.billing_write_audit(r.org_id, 'billing.closed', 'Closed after the non-payment period. Data follows the existing retention rules.', '{}'::jsonb);
      v_n := v_n + 1;
    ELSIF v_day >= s.suspend_on_day + r.grace_extra_days AND r.state IN ('past_due', 'restricted') THEN
      UPDATE public.billing_accounts SET state = 'suspended', suspended_at = COALESCE(suspended_at, p_now), updated_at = p_now WHERE org_id = r.org_id;
      UPDATE public.organizations SET status = 'paused', status_reason = 'billing: suspended' WHERE id = r.org_id AND status = 'active';
      PERFORM public.halt_org_follow_up_sequences(r.org_id, NULL);
      PERFORM public.billing_write_audit(r.org_id, 'billing.suspended', 'Suspended for non-payment. The Owner can still pay, export, and cancel.', '{}'::jsonb);
      v_n := v_n + 1;
    ELSIF v_day >= s.restrict_on_day + r.grace_extra_days AND r.state = 'past_due' THEN
      UPDATE public.billing_accounts SET state = 'restricted', restricted_at = COALESCE(restricted_at, p_now), updated_at = p_now WHERE org_id = r.org_id;
      PERFORM public.billing_write_audit(r.org_id, 'billing.restricted', 'Costly automation is paused. The workspace stays readable.', '{}'::jsonb);
      v_n := v_n + 1;
    END IF;
  END LOOP;
  RETURN v_n;
END;
$$;

-- Notices the daily job should send. Inserts a row so the same notice is not repeated.
CREATE OR REPLACE FUNCTION public.billing_due_notices()
RETURNS TABLE (org_id uuid, kind text, period_key text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.billing_settings%ROWTYPE;
  r record;
  v_day integer;
  v_key text;
  v_kind text;
BEGIN
  SELECT * INTO s FROM public.billing_settings WHERE id;
  FOR r IN
    SELECT a.org_id, a.failed_at, a.state, a.pilot_ends_on, a.grace_extra_days
    FROM public.billing_accounts a
    JOIN public.billing_plans p ON p.id = a.plan_id
    WHERE p.counts_as_revenue OR a.pilot_ends_on IS NOT NULL
  LOOP
    IF r.pilot_ends_on IS NOT NULL AND r.pilot_ends_on <= public.billing_today() + 7 THEN
      v_kind := 'pilot_ending';
      v_key := r.pilot_ends_on::text;
      IF NOT EXISTS (SELECT 1 FROM public.billing_notices n WHERE n.org_id = r.org_id AND n.kind = v_kind AND n.period_key = v_key) THEN
        INSERT INTO public.billing_notices (org_id, kind, period_key) VALUES (r.org_id, v_kind, v_key);
        org_id := r.org_id; kind := v_kind; period_key := v_key;
        RETURN NEXT;
      END IF;
    END IF;
    IF r.failed_at IS NULL THEN
      CONTINUE;
    END IF;
    v_day := (public.billing_today() - (r.failed_at AT TIME ZONE 'America/New_York')::date);
    v_kind := CASE
      WHEN v_day = ANY (s.reminder_days) THEN 'grace_reminder'
      WHEN r.state = 'restricted' THEN 'restricted'
      WHEN r.state = 'suspended' THEN 'suspended'
      ELSE NULL
    END;
    IF v_kind IS NULL THEN
      CONTINUE;
    END IF;
    v_key := r.failed_at::date::text || ':' || v_day::text || ':' || v_kind;
    IF NOT EXISTS (SELECT 1 FROM public.billing_notices n WHERE n.org_id = r.org_id AND n.kind = v_kind AND n.period_key = v_key) THEN
      INSERT INTO public.billing_notices (org_id, kind, period_key) VALUES (r.org_id, v_kind, v_key);
      org_id := r.org_id; kind := v_kind; period_key := v_key;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;

-- 80% and 100% warnings, once per meter per period.
CREATE OR REPLACE FUNCTION public.billing_usage_warnings()
RETURNS TABLE (org_id uuid, meter text, percent integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.billing_settings%ROWTYPE;
  r record;
  v_limit integer;
  v_used integer;
  v_pct integer;
  v_key text;
BEGIN
  SELECT * INTO s FROM public.billing_settings WHERE id;
  FOR r IN SELECT a.org_id FROM public.billing_accounts a LOOP
    FOREACH v_key IN ARRAY ARRAY['leads_processed', 'transcript_minutes', 'compass_questions', 'team_members'] LOOP
      v_limit := public.billing_limit(r.org_id, v_key);
      IF v_limit IS NULL OR v_limit = 0 THEN
        CONTINUE;
      END IF;
      IF v_key = 'team_members' THEN
        v_used := (public.entitlement_check(r.org_id, v_key) ->> 'used')::integer;
      ELSE
        v_used := public.billing_used(r.org_id, v_key);
      END IF;
      v_pct := (v_used * 100) / v_limit;
      IF v_pct >= 100 THEN
        v_pct := 100;
      ELSIF v_pct >= s.warn_at_percent THEN
        v_pct := s.warn_at_percent;
      ELSE
        CONTINUE;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM public.billing_notices n
        WHERE n.org_id = r.org_id AND n.kind = 'usage_' || v_pct::text AND n.period_key = public.billing_period_start(r.org_id)::text || ':' || v_key
      ) THEN
        INSERT INTO public.billing_notices (org_id, kind, period_key)
        VALUES (r.org_id, 'usage_' || v_pct::text, public.billing_period_start(r.org_id)::text || ':' || v_key);
        org_id := r.org_id; meter := v_key; percent := v_pct;
        RETURN NEXT;
      END IF;
    END LOOP;
  END LOOP;
END;
$$;

-- Compare Compass questions on the ledger with compass_usage rows. Staff read the difference.
CREATE OR REPLACE FUNCTION public.billing_reconcile_compass(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start timestamptz := public.billing_period_start(p_org_id)::timestamp AT TIME ZONE 'America/New_York';
  v_ledger integer;
  v_source integer;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Not found.' USING ERRCODE = '42501';
  END IF;
  v_ledger := public.billing_used(p_org_id, 'compass_questions');
  SELECT count(*)::integer INTO v_source FROM public.compass_usage
  WHERE org_id = p_org_id AND created_at >= v_start AND outcome NOT IN ('limited', 'unavailable');
  RETURN jsonb_build_object('ledger', v_ledger, 'compass_usage', v_source, 'difference', v_source - v_ledger);
END;
$$;

-- ---------------------------------------------------------------------------
-- Views for screens. Service Team gets status and usage, not price.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.billing_screen(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_access text := public.ws_access(p_org_id);
  a public.billing_accounts%ROWTYPE;
  p public.billing_plans%ROWTYPE;
  v_price integer;
  v_meters jsonb := '[]'::jsonb;
  v_key text;
  v_row jsonb;
  v_money boolean;
BEGIN
  IF v_access IS NULL OR v_access NOT IN ('owner', 'platform_admin', 'service_team') THEN
    RAISE EXCEPTION 'Not found.' USING ERRCODE = '42501';
  END IF;
  IF v_access = 'service_team' AND NOT public.portal_can_see_billing(p_org_id) THEN
    RAISE EXCEPTION 'Not found.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO a FROM public.billing_accounts WHERE org_id = p_org_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('state', 'not_billed');
  END IF;
  SELECT * INTO p FROM public.billing_plans WHERE id = a.plan_id;
  v_money := v_access IN ('owner', 'platform_admin');
  v_price := COALESCE(a.quoted_price_cents, p.price_cents);
  FOREACH v_key IN ARRAY ARRAY['team_members', 'leads_processed', 'transcript_minutes', 'compass_questions'] LOOP
    v_row := public.entitlement_check(p_org_id, v_key);
    v_meters := v_meters || jsonb_build_array(v_row || jsonb_build_object('key', v_key));
  END LOOP;
  RETURN jsonb_build_object(
    'plan_id', a.plan_id,
    'plan_name', p.name,
    'description', p.description,
    'bullets', p.bullets,
    'starting_at', p.starting_at,
    'price_cents', CASE WHEN v_money THEN v_price ELSE NULL END,
    'state', a.state,
    'reset_on', public.billing_period_end(p_org_id),
    'timezone', 'America/New_York',
    'failed_at', a.failed_at,
    'cancel_at', a.cancel_at,
    'pilot_ends_on', a.pilot_ends_on,
    'payment_method', a.payment_method,
    'payment_exception', a.payment_exception,
    'quoted', a.quoted_price_cents IS NOT NULL,
    'single_admin_approval', CASE WHEN v_access = 'platform_admin' THEN a.single_admin_approval ELSE NULL END,
    'meters', v_meters,
    'money', v_money
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.billing_revenue()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_review date;
  v_mrr integer;
  v_cost bigint;
BEGIN
  PERFORM public.billing_require_admin();
  SELECT limit_review_on INTO v_review FROM public.billing_settings WHERE id;
  SELECT COALESCE(sum(COALESCE(a.quoted_price_cents, p.price_cents)), 0)::integer INTO v_mrr
  FROM public.billing_accounts a
  JOIN public.billing_plans p ON p.id = a.plan_id
  WHERE p.counts_as_revenue AND a.state IN ('active', 'past_due', 'canceling');
  SELECT
    COALESCE((SELECT sum(cost_micros) FROM public.usage_ledger WHERE billable), 0)
    + COALESCE((SELECT sum(cost_micros) FROM public.compass_usage), 0)
    + COALESCE((SELECT sum(cost_micros) FROM public.relay_drafts), 0)
  INTO v_cost;
  RETURN jsonb_build_object(
    'mrr_cents', v_mrr,
    'arr_cents', v_mrr * 12,
    'review_on', v_review,
    'timezone', 'America/New_York',
    'states', (
      SELECT COALESCE(jsonb_object_agg(state, n), '{}'::jsonb) FROM (
        SELECT a.state, count(*) AS n
        FROM public.billing_accounts a
        JOIN public.billing_plans p ON p.id = a.plan_id
        WHERE p.counts_as_revenue
        GROUP BY a.state
      ) s
    ),
    'by_plan', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('plan', p.name, 'workspaces', n, 'mrr_cents', mrr)), '[]'::jsonb)
      FROM (
        SELECT a.plan_id, count(*) AS n, COALESCE(sum(COALESCE(a.quoted_price_cents, p.price_cents)), 0) AS mrr
        FROM public.billing_accounts a
        JOIN public.billing_plans p ON p.id = a.plan_id
        WHERE p.counts_as_revenue AND a.state IN ('active', 'past_due', 'canceling')
        GROUP BY a.plan_id
      ) x
      JOIN public.billing_plans p ON p.id = x.plan_id
    ),
    'accounts', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'org_id', a.org_id, 'plan_id', a.plan_id, 'state', a.state,
        'quoted_price_cents', a.quoted_price_cents, 'single_admin_approval', a.single_admin_approval
      )), '[]'::jsonb)
      FROM public.billing_accounts a
    ),
    'recorded_cost_micros', v_cost,
    'margin_note', 'Estimate. Revenue is the monthly price of revenue workspaces. Cost is recorded provider usage only. Missing cost is shown as a gap, not a zero that means free.',
    'internal_excluded', true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.billing_public_catalog()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id,
    'name', name,
    'description', description,
    'price_cents', price_cents,
    'starting_at', starting_at,
    'interval', interval,
    'bullets', bullets
  ) ORDER BY CASE id WHEN 'private_access' THEN 0 WHEN 'custom' THEN 1 ELSE 2 END), '[]'::jsonb)
  FROM public.billing_plans
  WHERE public_display AND status = 'available'
$$;

-- ---------------------------------------------------------------------------
-- Guards at the point of use
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.billing_guard_invite()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_check jsonb;
BEGIN
  v_check := public.entitlement_check(NEW.org_id, 'team_members');
  IF COALESCE((v_check ->> 'allowed')::boolean, true) IS FALSE THEN
    RAISE EXCEPTION 'Your team has reached its limit for people. Ask your Owner.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS billing_guard_invite ON public.org_invites;
CREATE TRIGGER billing_guard_invite
  BEFORE INSERT ON public.org_invites
  FOR EACH ROW EXECUTE FUNCTION public.billing_guard_invite();

CREATE OR REPLACE FUNCTION public.billing_guard_case_file()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_test boolean := false;
  v_historic boolean := false;
BEGIN
  IF NEW.depth IS DISTINCT FROM 'full' OR OLD.depth IS NOT DISTINCT FROM 'full' THEN
    RETURN NEW;
  END IF;
  -- A billing restriction stops new AI case files. The basic file already on the row stays.
  IF public.billing_blocks_cost(NEW.org_id) THEN
    RAISE EXCEPTION 'billing_capped' USING ERRCODE = '42501';
  END IF;
  SELECT COALESCE(is_test, false) INTO v_test FROM public.leads WHERE id = NEW.lead_id;
  v_historic := public.lead_is_historic(NEW.lead_id);
  IF v_test OR v_historic THEN
    PERFORM public.billing_consume(NEW.org_id, 'leads_processed', 1, 'case:' || NEW.lead_id::text, CASE WHEN v_test THEN 'sample' ELSE 'historic' END);
    RETURN NEW;
  END IF;
  IF NOT public.billing_consume(NEW.org_id, 'leads_processed', 1, 'case:' || NEW.lead_id::text, 'live') THEN
    RAISE EXCEPTION 'billing_capped' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS billing_guard_case_file ON public.case_files;
CREATE TRIGGER billing_guard_case_file
  BEFORE UPDATE ON public.case_files
  FOR EACH ROW EXECUTE FUNCTION public.billing_guard_case_file();

-- ---------------------------------------------------------------------------
-- Default plan for a new workspace, and a no-charge plan for ones that exist
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.billing_assign_new_workspace()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan text := COALESCE(NULLIF(current_setting('vistrial.billing_plan', true), ''), 'internal');
  v_version uuid;
BEGIN
  v_version := public.billing_latest_version(v_plan);
  IF v_version IS NULL THEN
    v_plan := 'internal';
    v_version := public.billing_latest_version('internal');
  END IF;
  INSERT INTO public.billing_accounts (org_id, plan_id, version_id, state, stripe_sync)
  VALUES (NEW.id, v_plan, v_version, 'not_billed', 'skipped')
  ON CONFLICT (org_id) DO NOTHING;
  INSERT INTO public.billing_audit (org_id, action, actor_label, reason, detail)
  VALUES (NEW.id, 'billing.plan_assigned', 'Vistrial', 'Plan recorded when the workspace was created. No charge yet.',
    jsonb_build_object('plan_id', v_plan));
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS billing_assign_new_workspace ON public.organizations;
CREATE TRIGGER billing_assign_new_workspace
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.billing_assign_new_workspace();

INSERT INTO public.billing_accounts (org_id, plan_id, version_id, state, stripe_sync)
SELECT o.id, 'internal', public.billing_latest_version('internal'), 'not_billed', 'skipped'
FROM public.organizations o
WHERE NOT EXISTS (SELECT 1 FROM public.billing_accounts a WHERE a.org_id = o.id);

INSERT INTO public.billing_audit (org_id, action, actor_label, reason, detail)
SELECT o.id, 'billing.migrated_internal', 'Vistrial',
  'Existing workspace placed on the internal plan. No charge.',
  jsonb_build_object('plan_id', 'internal')
FROM public.organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM public.billing_audit b WHERE b.org_id = o.id AND b.action = 'billing.migrated_internal'
);

-- create_workspace asks for Private Access. Raw inserts used by tests stay internal.
CREATE OR REPLACE FUNCTION public.create_workspace(
  p_name text,
  p_timezone text,
  p_slug text DEFAULT NULL,
  p_owner_email text DEFAULT NULL,
  p_template_id uuid DEFAULT NULL,
  p_contact_name text DEFAULT NULL,
  p_staff_ids uuid[] DEFAULT NULL,
  p_price_id text DEFAULT NULL,
  p_plan_label text DEFAULT NULL,
  p_internal_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text := btrim(COALESCE(p_name, ''));
  v_base text;
  v_slug text;
  v_n integer := 1;
  v_id uuid;
  v_member uuid;
  v_email text := NULLIF(lower(btrim(COALESCE(p_owner_email, ''))), '');
  v_token text;
  v_template_version integer;
  v_ws public.config_layers%ROWTYPE;
  v_admin boolean := public.is_platform_admin();
  v_staff uuid;
BEGIN
  IF NOT public.onboarding_can_create_workspaces() THEN
    RAISE EXCEPTION 'Only a Platform Admin, or Service Team given permission, can create a workspace.' USING ERRCODE = '42501';
  END IF;
  IF char_length(v_name) < 2 THEN
    RAISE EXCEPTION 'A workspace name is required.';
  END IF;
  IF NULLIF(btrim(COALESCE(p_timezone, '')), '') IS NULL THEN
    RAISE EXCEPTION 'A timezone is required.';
  END IF;
  IF v_email IS NOT NULL AND v_email !~ '^[^@\s]+@[^@\s]+$' THEN
    RAISE EXCEPTION 'The owner email is not valid.';
  END IF;
  IF p_price_id IS NOT NULL AND btrim(p_price_id) <> '' AND btrim(p_price_id) !~ '^price_[A-Za-z0-9]{6,}$' THEN
    RAISE EXCEPTION 'Choose a plan from the billing list.';
  END IF;
  IF p_template_id IS NOT NULL THEN
    SELECT l.version INTO v_template_version
    FROM public.config_templates t
    JOIN public.config_layers l ON l.level = 'template' AND l.template_id = t.id
    WHERE t.id = p_template_id AND t.status = 'active';
    IF v_template_version IS NULL THEN
      RAISE EXCEPTION 'Choose an active template. Drafts and retired templates cannot be used for new workspaces.';
    END IF;
  END IF;
  IF p_staff_ids IS NOT NULL AND EXISTS (
    SELECT 1 FROM unnest(p_staff_ids) x WHERE NOT EXISTS (SELECT 1 FROM public.platform_staff s WHERE s.user_id = x AND s.active)
  ) THEN
    RAISE EXCEPTION 'Assign only active Vistrial team members.';
  END IF;

  v_base := trim(both '-' from lower(regexp_replace(COALESCE(NULLIF(btrim(p_slug), ''), v_name), '[^a-zA-Z0-9]+', '-', 'g')));
  IF v_base = '' THEN
    v_base := 'workspace';
  END IF;
  v_slug := v_base;
  WHILE EXISTS (SELECT 1 FROM public.organizations WHERE slug = v_slug) LOOP
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n::text;
  END LOOP;

  PERFORM set_config('vistrial.config_projecting', '1', true);
  PERFORM set_config('vistrial.billing_plan', 'private_access', true);
  INSERT INTO public.organizations (name, slug, timezone, status, owner_contact_email, owner_contact_name)
  VALUES (v_name, v_slug, btrim(p_timezone), 'onboarding', v_email, left(NULLIF(btrim(COALESCE(p_contact_name, '')), ''), 120))
  RETURNING id INTO v_id;
  PERFORM set_config('vistrial.config_projecting', '0', true);
  PERFORM set_config('vistrial.billing_plan', '', true);

  FOREACH v_staff IN ARRAY COALESCE(p_staff_ids, '{}'::uuid[]) || CASE WHEN v_admin THEN '{}'::uuid[] ELSE ARRAY[auth.uid()] END LOOP
    IF NOT EXISTS (SELECT 1 FROM public.workspace_assignments a WHERE a.org_id = v_id AND a.user_id = v_staff AND a.ended_at IS NULL) THEN
      INSERT INTO public.workspace_assignments (org_id, user_id, assigned_by, note)
      VALUES (v_id, v_staff, auth.uid(), 'Assigned when the workspace was created.');
    END IF;
  END LOOP;

  IF p_template_id IS NOT NULL THEN
    UPDATE public.workspace_config_pins
    SET template_id = p_template_id, template_version = v_template_version
    WHERE org_id = v_id;
  END IF;
  IF v_email IS NOT NULL THEN
    SELECT * INTO v_ws FROM public.config_layers WHERE level = 'workspace' AND org_id = v_id;
    PERFORM public.config_write_layer(v_ws.id,
      v_ws.field_values || jsonb_build_object('identity.primary_contact', jsonb_strip_nulls(jsonb_build_object(
        'email', v_email, 'name', NULLIF(btrim(COALESCE(p_contact_name, '')), '')))),
      ARRAY[]::text[], 'create', 'Owner contact from workspace creation.');
  END IF;
  PERFORM public.config_project_workspace(v_id);

  INSERT INTO public.onboarding_staff_details (org_id, internal_note, intended_price_id, intended_plan_label, created_by, created_by_role)
  VALUES (v_id, left(NULLIF(btrim(COALESCE(p_internal_note, '')), ''), 2000), NULLIF(btrim(COALESCE(p_price_id, '')), ''),
    left(NULLIF(btrim(COALESCE(p_plan_label, '')), ''), 120), auth.uid(), CASE WHEN v_admin THEN 'platform_admin' ELSE 'service_team' END)
  ON CONFLICT (org_id) DO UPDATE SET internal_note = EXCLUDED.internal_note, intended_price_id = EXCLUDED.intended_price_id,
    intended_plan_label = EXCLUDED.intended_plan_label, created_by = EXCLUDED.created_by, created_by_role = EXCLUDED.created_by_role;

  IF v_email IS NOT NULL THEN
    SELECT id INTO v_member
    FROM public.org_members
    WHERE org_id = v_id AND user_id = auth.uid() AND seat = 'staff' AND active;
    v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
    INSERT INTO public.org_invites (org_id, email, role, token, invited_by, expires_at, surface_access)
    VALUES (v_id, v_email, 'owner', v_token, v_member, now() + interval '7 days', 'operator');
  END IF;

  IF NOT v_admin THEN
    PERFORM public.ws_log(v_id, 'workspace.created_by_service_team', 'organizations', v_id::text, '{}'::jsonb, auth.uid());
  END IF;
  PERFORM public.onboarding_refresh(v_id);
  RETURN jsonb_build_object('org_id', v_id, 'slug', v_slug, 'invite_token', v_token);
END;
$$;

GRANT EXECUTE ON FUNCTION
  public.billing_today(),
  public.billing_period_start(uuid),
  public.billing_period_end(uuid),
  public.billing_latest_version(text),
  public.billing_limit(uuid, text),
  public.billing_feature(uuid, text),
  public.billing_used(uuid, text),
  public.billing_blocks_cost(uuid),
  public.billing_consume(uuid, text, integer, text, text),
  public.entitlement_check(uuid, text),
  public.billing_assign_plan(uuid, text, text, date),
  public.billing_set_quote(uuid, integer, text, uuid),
  public.billing_set_start(uuid, text, date, text),
  public.billing_grant_override(uuid, text, integer, boolean, text, timestamptz),
  public.billing_correct_usage(uuid, text, integer, text),
  public.billing_request_credit(uuid, integer, text, text, uuid),
  public.billing_extend_grace(uuid, integer, text),
  public.billing_pause_path(uuid, boolean, text),
  public.billing_pause_workspace(uuid, boolean, text),
  public.billing_cancel(uuid, text),
  public.billing_payment_exception(uuid, text),
  public.billing_note_failure(uuid),
  public.billing_note_paid(uuid),
  public.billing_advance(timestamptz),
  public.billing_due_notices(),
  public.billing_usage_warnings(),
  public.billing_reconcile_compass(uuid),
  public.billing_screen(uuid),
  public.billing_revenue(),
  public.billing_public_catalog()
TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.billing_public_catalog() TO anon;

-- Members and Operators see a plain state, never a price.
CREATE OR REPLACE FUNCTION public.billing_notice(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_access text := public.ws_access(p_org_id);
  v_state text;
BEGIN
  IF v_access IS NULL THEN
    RAISE EXCEPTION 'Not found.' USING ERRCODE = '42501';
  END IF;
  SELECT state INTO v_state FROM public.billing_accounts WHERE org_id = p_org_id;
  RETURN jsonb_build_object('state', COALESCE(v_state, 'not_billed'));
END;
$$;
GRANT EXECUTE ON FUNCTION public.billing_notice(uuid) TO authenticated, service_role;

INSERT INTO public.ops_job_catalog (job_name, cron_expr, interval_seconds, grace_seconds, check_first)
VALUES (
  'billing',
  '30 13 * * *',
  86400,
  172800,
  'Open /api/cron/billing logs. Confirm the failed-payment path advanced and notices were queued once.'
)
ON CONFLICT (job_name) DO UPDATE
  SET cron_expr = EXCLUDED.cron_expr, interval_seconds = EXCLUDED.interval_seconds,
      grace_seconds = EXCLUDED.grace_seconds, check_first = EXCLUDED.check_first;
INSERT INTO public.ops_job_runs (job_name, last_success_at, updated_at)
SELECT job_name, now(), now() FROM public.ops_job_catalog WHERE job_name = 'billing'
ON CONFLICT (job_name) DO NOTHING;
