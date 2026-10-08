-- The configuration system, checked as real users at the data layer.
-- Runs after seed.sql and the other verify files. IDs use the c0f1 prefix.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Run a query as a user and return its single value as jsonb (NULL on error).
CREATE FUNCTION pg_temp.q(p_user uuid, p_sql text)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v jsonb;
  v_hint text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_user::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    EXECUTE 'SELECT to_jsonb((' || p_sql || '))' INTO v;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_hint = PG_EXCEPTION_HINT;
    v := jsonb_build_object('error', SQLERRM, 'hint', COALESCE(v_hint, ''));
    RESET ROLE;
    PERFORM set_config('request.jwt.claim.sub', '', true);
    RETURN jsonb_build_object('failed', v);
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RETURN v;
END;
$$;

-- Did a call as this user fail?
CREATE FUNCTION pg_temp.fails(p_user uuid, p_sql text)
RETURNS boolean
LANGUAGE sql
AS $$ SELECT pg_temp.q(p_user, p_sql) ? 'failed' $$;

CREATE FUNCTION pg_temp.err(p_user uuid, p_sql text)
RETURNS text
LANGUAGE sql
AS $$ SELECT CASE WHEN r ? 'failed' THEN (r -> 'failed' ->> 'error') || ' ' || (r -> 'failed' ->> 'hint') ELSE '' END
      FROM (SELECT pg_temp.q(p_user, p_sql) AS r) x $$;

CREATE FUNCTION pg_temp.check(p_ok boolean, p_message text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_ok IS NOT TRUE THEN
    RAISE EXCEPTION 'config check failed: %', p_message;
  END IF;
END;
$$;

-- Effective value of one field, as the database resolves it.
CREATE FUNCTION pg_temp.eff(p_org uuid, p_key text)
RETURNS jsonb
LANGUAGE sql
AS $$ SELECT public.config_effective_at(p_org) -> 'values' -> p_key $$;

CREATE FUNCTION pg_temp.src(p_org uuid, p_key text)
RETURNS text
LANGUAGE sql
AS $$ SELECT public.config_effective_at(p_org) -> 'sources' -> p_key ->> 'source' $$;

CREATE FUNCTION pg_temp.layer(p_org uuid)
RETURNS uuid
LANGUAGE sql
AS $$ SELECT id FROM public.config_layers WHERE level = 'workspace' AND org_id = p_org $$;

CREATE FUNCTION pg_temp.ver(p_layer uuid)
RETURNS integer
LANGUAGE sql
AS $$ SELECT version FROM public.config_layers WHERE id = p_layer $$;

CREATE FUNCTION pg_temp.tlayer(p_slug text)
RETURNS uuid
LANGUAGE sql
AS $$ SELECT l.id FROM public.config_layers l JOIN public.config_templates t ON t.id = l.template_id WHERE t.slug = p_slug $$;

-- ---------------------------------------------------------------------------
-- Fixture: an admin, a Service Team member assigned to W1 only, one with
-- template access, and W1's owner, member and operator.
-- ---------------------------------------------------------------------------

SELECT set_config('request.jwt.claim.sub', '', false);

INSERT INTO auth.users (id, email) VALUES
  ('c0f10000-0000-4000-8000-0000000000ad', 'cfg-admin@vistrial.test'),
  ('c0f10000-0000-4000-8000-0000000000a1', 'cfg-staff@vistrial.test'),
  ('c0f10000-0000-4000-8000-0000000000a2', 'cfg-templates@vistrial.test'),
  ('c0f10000-0000-4000-8000-0000000000b1', 'cfg-owner@spa.test'),
  ('c0f10000-0000-4000-8000-0000000000b2', 'cfg-member@spa.test'),
  ('c0f10000-0000-4000-8000-0000000000b3', 'cfg-operator@spa.test')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.platform_staff (user_id, role, display_name, email, template_access) VALUES
  ('c0f10000-0000-4000-8000-0000000000ad', 'platform_admin', 'Cfg Admin', 'cfg-admin@vistrial.test', true),
  ('c0f10000-0000-4000-8000-0000000000a1', 'service_team', 'Cfg Staff', 'cfg-staff@vistrial.test', false),
  ('c0f10000-0000-4000-8000-0000000000a2', 'service_team', 'Cfg Templates', 'cfg-templates@vistrial.test', true);

-- Templates start as drafts; only a Platform Admin activates, and only when complete.
SELECT pg_temp.check(
  pg_temp.fails('c0f10000-0000-4000-8000-0000000000a2',
    $q$SELECT public.config_set_template_status((SELECT id FROM public.config_templates WHERE slug = 'med-spa'), 'active')$q$),
  'a Service Team member activated a template');
SELECT pg_temp.check(
  NOT pg_temp.fails('c0f10000-0000-4000-8000-0000000000ad',
    $q$SELECT public.config_set_template_status((SELECT id FROM public.config_templates WHERE slug = 'med-spa'), 'active')$q$),
  'the Platform Admin could not activate Med Spa');
SELECT pg_temp.check(
  pg_temp.fails('c0f10000-0000-4000-8000-0000000000ad',
    $q$SELECT public.create_workspace('Draft Spa', 'America/Denver', NULL, NULL, (SELECT id FROM public.config_templates WHERE slug = 'home-services'))$q$),
  'a workspace was created from a draft template');

-- Two workspaces on Med Spa.
SELECT pg_temp.q('c0f10000-0000-4000-8000-0000000000ad',
  $q$public.create_workspace('Glow One', 'America/Denver', 'glow-one', 'owner@glow-one.test', (SELECT id FROM public.config_templates WHERE slug = 'med-spa'))$q$);
SELECT pg_temp.q('c0f10000-0000-4000-8000-0000000000ad',
  $q$public.create_workspace('Glow Two', 'America/Denver', 'glow-two', 'owner@glow-two.test', (SELECT id FROM public.config_templates WHERE slug = 'med-spa'))$q$);

CREATE TEMP TABLE w AS
SELECT (SELECT id FROM public.organizations WHERE slug = 'glow-one') AS w1,
       (SELECT id FROM public.organizations WHERE slug = 'glow-two') AS w2;
GRANT SELECT ON w TO authenticated;

INSERT INTO public.workspace_assignments (org_id, user_id)
SELECT w1, 'c0f10000-0000-4000-8000-0000000000a1' FROM w;
INSERT INTO public.org_members (org_id, user_id, role, display_name, email)
SELECT w1, 'c0f10000-0000-4000-8000-0000000000b1'::uuid, 'owner'::public.org_role, 'Cfg Owner', 'cfg-owner@spa.test' FROM w
UNION ALL SELECT w1, 'c0f10000-0000-4000-8000-0000000000b2', 'member', 'Cfg Member', 'cfg-member@spa.test' FROM w
UNION ALL SELECT w1, 'c0f10000-0000-4000-8000-0000000000b3', 'operator', 'Cfg Operator', 'cfg-operator@spa.test' FROM w;

-- ---------------------------------------------------------------------------
-- Seeded templates produce a complete configuration; going live needs a check.
-- ---------------------------------------------------------------------------

SELECT pg_temp.check(
  cardinality(public.config_missing_required(public.config_effective_at(w1) -> 'values')) = 0,
  'a new Med Spa workspace is missing required settings: ' || array_to_string(public.config_missing_required(public.config_effective_at(w1) -> 'values'), ', '))
FROM w;

DO $$
DECLARE
  t record;
  v_platform public.config_layers%ROWTYPE := public.config_platform_layer();
  v_resolved jsonb;
BEGIN
  FOR t IN SELECT tl.field_values, tl.locked_keys, ct.slug FROM public.config_layers tl JOIN public.config_templates ct ON ct.id = tl.template_id LOOP
    v_resolved := public.config_resolve(
      jsonb_build_object('values', v_platform.field_values, 'locks', to_jsonb(v_platform.locked_keys)),
      jsonb_build_object('values', v_platform.field_values, 'locks', to_jsonb(v_platform.locked_keys)),
      jsonb_build_object('values', t.field_values, 'locks', to_jsonb(t.locked_keys)),
      jsonb_build_object('values', t.field_values, 'locks', to_jsonb(t.locked_keys)),
      jsonb_build_object('values', '{"identity.business_name":"X Co","identity.display_name":"X","identity.primary_contact":{"email":"x@x.test"}}'::jsonb)
    ) -> 'values';
    PERFORM pg_temp.check(cardinality(public.config_missing_required(v_resolved)) = 0, t.slug || ' is not complete on its own');
    PERFORM pg_temp.check(NOT EXISTS (
      SELECT 1 FROM jsonb_each(t.field_values) e WHERE public.config_validate_value(e.key, e.value) IS NOT NULL
    ), t.slug || ' has an invalid value');
  END LOOP;
END $$;

SELECT pg_temp.check(
  pg_temp.fails('c0f10000-0000-4000-8000-0000000000ad', format($q$public.set_workspace_status(%L, 'active')$q$, w1)),
  'a workspace went live without a go-live check') FROM w;
SELECT pg_temp.check(
  pg_temp.fails('c0f10000-0000-4000-8000-0000000000a1', format($q$public.config_record_readiness(%L, 'p0/0.t:none.w0', true)$q$, w1)),
  'a go-live check was recorded against an old configuration version') FROM w;
SELECT pg_temp.check(e = '', 'staff could not mark a complete workspace ready: ' || e)
FROM w, pg_temp.err('c0f10000-0000-4000-8000-0000000000a1',
  format($q$public.config_record_readiness(%L, %L, true)$q$, w1, public.config_version_stamp(w1))) e;
SELECT pg_temp.check(
  (SELECT ready AND marked_ready_by = 'c0f10000-0000-4000-8000-0000000000a1' FROM public.config_readiness WHERE org_id = w1),
  'the go-live check did not record who marked it ready') FROM w;
SELECT pg_temp.check(
  NOT pg_temp.fails('c0f10000-0000-4000-8000-0000000000ad', format($q$public.set_workspace_status(%L, 'active')$q$, w1)),
  'a ready workspace could not go live') FROM w;

-- ---------------------------------------------------------------------------
-- An override changes that workspace only, and reaches the existing tables.
-- ---------------------------------------------------------------------------

SELECT pg_temp.q('c0f10000-0000-4000-8000-0000000000a1',
  format($q$public.config_save_layer(%L, %s, '{"response.first_touch_minutes": 3}'::jsonb)$q$, pg_temp.layer(w1), pg_temp.ver(pg_temp.layer(w1)))) FROM w;
SELECT pg_temp.check(pg_temp.eff(w1, 'response.first_touch_minutes') = '3' AND pg_temp.src(w1, 'response.first_touch_minutes') = 'workspace',
  'the override did not apply') FROM w;
SELECT pg_temp.check(pg_temp.eff(w2, 'response.first_touch_minutes') = '5' AND pg_temp.src(w2, 'response.first_touch_minutes') = 'template',
  'the override leaked into another workspace') FROM w;
SELECT pg_temp.check(
  (SELECT speed_to_lead_minutes FROM public.score_configs WHERE org_id = w1) = 3
  AND (SELECT speed_to_lead_minutes FROM public.score_configs WHERE org_id = w2) = 5,
  'the existing scoring settings did not follow the effective configuration') FROM w;

-- Staff of W1 only cannot touch W2; customers cannot touch configuration at all.
SELECT pg_temp.check(
  pg_temp.fails('c0f10000-0000-4000-8000-0000000000a1',
    format($q$public.config_save_layer(%L, %s, '{"tone.emoji": "never"}'::jsonb)$q$, pg_temp.layer(w2), pg_temp.ver(pg_temp.layer(w2)))),
  'staff changed a workspace they are not assigned to') FROM w;
SELECT pg_temp.check(
  (pg_temp.q('c0f10000-0000-4000-8000-0000000000a1', format($q$(SELECT count(*) FROM public.config_layers WHERE org_id = %L)$q$, w2)) #>> '{}')::int = 0,
  'staff read the configuration of a workspace they are not assigned to') FROM w;
SELECT pg_temp.check(
  (pg_temp.q(u, 'SELECT count(*) FROM public.config_layers') #>> '{}')::int = 0
  AND (pg_temp.q(u, 'SELECT count(*) FROM public.config_versions') #>> '{}')::int = 0
  AND (pg_temp.q(u, 'SELECT count(*) FROM public.config_templates') #>> '{}')::int = 0,
  'a customer read configuration internals')
FROM unnest(ARRAY['c0f10000-0000-4000-8000-0000000000b1', 'c0f10000-0000-4000-8000-0000000000b2', 'c0f10000-0000-4000-8000-0000000000b3']::uuid[]) u;
SELECT pg_temp.check(
  pg_temp.fails(u, format($q$public.config_effective(%L)$q$, w1)),
  'a customer read the effective configuration')
FROM w, unnest(ARRAY['c0f10000-0000-4000-8000-0000000000b1', 'c0f10000-0000-4000-8000-0000000000b2', 'c0f10000-0000-4000-8000-0000000000b3']::uuid[]) u;
SELECT pg_temp.check(
  pg_temp.fails(u, format($q$public.config_save_layer(%L, %s, '{"tone.emoji": "never"}'::jsonb)$q$, pg_temp.layer(w1), pg_temp.ver(pg_temp.layer(w1)))),
  'a customer changed configuration')
FROM w, unnest(ARRAY['c0f10000-0000-4000-8000-0000000000b1', 'c0f10000-0000-4000-8000-0000000000b2', 'c0f10000-0000-4000-8000-0000000000b3']::uuid[]) u;

-- ---------------------------------------------------------------------------
-- Owners: their small subset only, and business hours only when allowed.
-- ---------------------------------------------------------------------------

SELECT pg_temp.check(
  (pg_temp.q('c0f10000-0000-4000-8000-0000000000b1', format($q$public.config_owner_view(%L)$q$, w1)) ? 'business_hours')
  AND NOT (pg_temp.q('c0f10000-0000-4000-8000-0000000000b1', format($q$public.config_owner_view(%L)$q$, w1)) ? 'values'),
  'the owner view is missing or shows internals') FROM w;
SELECT pg_temp.check(
  pg_temp.fails(u, format($q$public.config_owner_view(%L)$q$, w1)),
  'a member or operator saw owner settings')
FROM w, unnest(ARRAY['c0f10000-0000-4000-8000-0000000000b2', 'c0f10000-0000-4000-8000-0000000000b3']::uuid[]) u;
SELECT pg_temp.check(
  pg_temp.fails('c0f10000-0000-4000-8000-0000000000b1',
    format($q$public.config_owner_set_hours(%L, '{"days":{"mon":[{"start":"10:00","end":"16:00"}]},"closures":[]}'::jsonb, %s)$q$, w1, pg_temp.ver(pg_temp.layer(w1)))),
  'an owner changed business hours without permission') FROM w;
SELECT pg_temp.q('c0f10000-0000-4000-8000-0000000000a1',
  format($q$public.config_save_layer(%L, %s, '{"identity.owners_can_edit_hours": true}'::jsonb)$q$, pg_temp.layer(w1), pg_temp.ver(pg_temp.layer(w1)))) FROM w;
SELECT pg_temp.check(
  NOT pg_temp.fails('c0f10000-0000-4000-8000-0000000000b1',
    format($q$public.config_owner_set_hours(%L, '{"days":{"mon":[{"start":"10:00","end":"16:00"}],"tue":[{"start":"10:00","end":"16:00"}]},"closures":[]}'::jsonb, %s)$q$, w1, pg_temp.ver(pg_temp.layer(w1)))),
  'an allowed owner could not change business hours') FROM w;
SELECT pg_temp.check(
  (SELECT working_hours_start = '10:00' AND working_days = ARRAY[1, 2]::smallint[] FROM public.organizations WHERE id = w1),
  'owner hours did not reach the workspace') FROM w;

-- ---------------------------------------------------------------------------
-- Template edits never change a live workspace silently.
-- ---------------------------------------------------------------------------

UPDATE public.workspace_config_pins SET auto_accept_while_onboarding = true WHERE org_id = (SELECT w2 FROM w);

SELECT pg_temp.check(
  pg_temp.fails('c0f10000-0000-4000-8000-0000000000a1',
    format($q$public.config_save_layer(%L, %s, '{"tone.emoji": "natural"}'::jsonb)$q$, pg_temp.tlayer('med-spa'), pg_temp.ver(pg_temp.tlayer('med-spa')))),
  'staff without template access edited a template');
SELECT pg_temp.q('c0f10000-0000-4000-8000-0000000000a2',
  format($q$public.config_save_layer(%L, %s, '{"tone.emoji": "natural", "response.first_touch_minutes": 7}'::jsonb, p_note => 'Warmer voice')$q$,
    pg_temp.tlayer('med-spa'), pg_temp.ver(pg_temp.tlayer('med-spa'))));

SELECT pg_temp.check(pg_temp.eff(w1, 'tone.emoji') = '"sparing"', 'a live workspace changed without review') FROM w;
SELECT pg_temp.check(
  (SELECT changes FROM public.config_review_notices WHERE org_id = w1 AND status = 'pending')
    = '[{"key":"tone.emoji","before":"sparing","after":"natural"}]'::jsonb,
  'the review notice does not show exactly what would change for this workspace') FROM w;
SELECT pg_temp.check(pg_temp.eff(w2, 'tone.emoji') = '"natural"' AND pg_temp.eff(w2, 'response.first_touch_minutes') = '7',
  'an onboarding workspace with auto-accept did not take the change') FROM w;
SELECT pg_temp.check(
  EXISTS (SELECT 1 FROM public.config_review_notices WHERE org_id = w2 AND status = 'auto_accepted'),
  'the automatic acceptance was not recorded') FROM w;

-- Accepting applies it; the workspace's own override survives.
SELECT pg_temp.q('c0f10000-0000-4000-8000-0000000000a1',
  format($q$public.config_decide_notice((SELECT id FROM public.config_review_notices WHERE org_id = %L AND status = 'pending'), 'accept')$q$, w1)) FROM w;
SELECT pg_temp.check(pg_temp.eff(w1, 'tone.emoji') = '"natural"', 'accepting a notice did not apply it') FROM w;
SELECT pg_temp.check(pg_temp.eff(w1, 'response.first_touch_minutes') = '3', 'the workspace override did not survive the template change') FROM w;

-- Declined changes are remembered for that version.
SELECT pg_temp.q('c0f10000-0000-4000-8000-0000000000a2',
  format($q$public.config_save_layer(%L, %s, '{"tone.sms_max_chars": 280}'::jsonb)$q$, pg_temp.tlayer('med-spa'), pg_temp.ver(pg_temp.tlayer('med-spa'))));
SELECT pg_temp.q('c0f10000-0000-4000-8000-0000000000a1',
  format($q$public.config_decide_notice((SELECT id FROM public.config_review_notices WHERE org_id = %L AND status = 'pending'), 'decline', 'Keep it shorter')$q$, w1)) FROM w;
SELECT pg_temp.check(pg_temp.eff(w1, 'tone.sms_max_chars') = '300', 'a declined change applied anyway') FROM w;
SELECT pg_temp.check(
  (SELECT count(*) FROM public.config_review_notices WHERE org_id = w1 AND status = 'declined') = 1
  AND NOT EXISTS (SELECT 1 FROM public.config_review_notices WHERE org_id = w1 AND status = 'pending'),
  'the declined notice came back') FROM w;

-- ---------------------------------------------------------------------------
-- Locked rules: tighten only, and a Platform Admin push applies everywhere
-- with a reason on record.
-- ---------------------------------------------------------------------------

SELECT pg_temp.check(
  pg_temp.fails('c0f10000-0000-4000-8000-0000000000a1',
    format($q$public.config_save_layer(%L, %s, '{"compliance.daily_cap_per_lead": 5}'::jsonb)$q$, pg_temp.layer(w1), pg_temp.ver(pg_temp.layer(w1)))),
  'a workspace loosened a locked compliance rule') FROM w;
SELECT pg_temp.check(
  pg_temp.fails('c0f10000-0000-4000-8000-0000000000a1',
    format($q$public.config_save_layer(%L, %s, '{"compliance.quiet_hours_basis": "workspace"}'::jsonb)$q$, pg_temp.layer(w1), pg_temp.ver(pg_temp.layer(w1)))),
  'a workspace changed a locked rule that cannot be tightened') FROM w;
SELECT pg_temp.check(
  NOT pg_temp.fails('c0f10000-0000-4000-8000-0000000000a1',
    format($q$public.config_save_layer(%L, %s, '{"compliance.daily_cap_per_lead": 1}'::jsonb)$q$, pg_temp.layer(w1), pg_temp.ver(pg_temp.layer(w1)))),
  'a workspace could not tighten a locked rule') FROM w;
SELECT pg_temp.check(pg_temp.eff(w1, 'compliance.daily_cap_per_lead') = '1'
  AND (public.config_effective_at(w1) -> 'sources' -> 'compliance.daily_cap_per_lead' ->> 'locked_at') = 'platform',
  'the tightened value is not in effect, or is not shown as locked') FROM w;

SELECT pg_temp.check(
  pg_temp.fails('c0f10000-0000-4000-8000-0000000000a2',
    format($q$public.config_save_layer(%L, %s, '{"compliance.daily_cap_per_lead": 3}'::jsonb, p_note => 'More room')$q$,
      (public.config_platform_layer()).id, (public.config_platform_layer()).version)),
  'someone other than a Platform Admin changed the platform default');
SELECT pg_temp.check(
  pg_temp.err('c0f10000-0000-4000-8000-0000000000ad',
    format($q$public.config_save_layer(%L, %s, '{"compliance.daily_cap_per_lead": 3}'::jsonb)$q$,
      (public.config_platform_layer()).id, (public.config_platform_layer()).version)) LIKE '%config_push_needs_reason%',
  'a locked rule was pushed without a reason');
SELECT pg_temp.check(
  pg_temp.err('c0f10000-0000-4000-8000-0000000000ad',
    format($q$public.config_save_layer(%L, %s, '{"compliance.daily_cap_per_lead": 3, "tone.emoji": "sparing"}'::jsonb, p_note => 'Both')$q$,
      (public.config_platform_layer()).id, (public.config_platform_layer()).version)) LIKE '%config_push_mixed%',
  'a locked push was mixed with other changes');
SELECT pg_temp.check(v = '', 'the Platform Admin could not push a locked rule: ' || v)
FROM pg_temp.err('c0f10000-0000-4000-8000-0000000000ad',
  format($q$public.config_save_layer(%L, %s, '{"compliance.daily_cap_per_lead": 3}'::jsonb, p_note => 'Client feedback: two a day was too few')$q$,
    (public.config_platform_layer()).id, (public.config_platform_layer()).version)) v;
SELECT pg_temp.check(pg_temp.eff(w2, 'compliance.daily_cap_per_lead') = '3', 'the pushed locked rule did not apply at once') FROM w;
SELECT pg_temp.check(pg_temp.eff(w1, 'compliance.daily_cap_per_lead') = '1', 'a stricter workspace was loosened by the push') FROM w;
SELECT pg_temp.check(
  (SELECT count(*) FROM public.config_review_notices WHERE status = 'pushed' AND note = 'Client feedback: two a day was too few'
     AND org_id IN (SELECT w1 FROM w UNION SELECT w2 FROM w)) = 2
  AND EXISTS (SELECT 1 FROM public.config_versions WHERE level = 'platform' AND source = 'push'
                AND changed_by = 'c0f10000-0000-4000-8000-0000000000ad' AND note = 'Client feedback: two a day was too few'),
  'the push was not recorded with who and why on every workspace');
SELECT pg_temp.check(
  (SELECT daily_send_limit_per_lead FROM public.approval_gate_settings WHERE org_id = w2) = 3,
  'the pushed rule did not reach the existing tables') FROM w;

-- ---------------------------------------------------------------------------
-- History, rollback, conflicts, secrets, live required values, closed.
-- ---------------------------------------------------------------------------

SELECT pg_temp.check(
  EXISTS (SELECT 1 FROM public.config_versions
          WHERE org_id = w1 AND changed_by = 'c0f10000-0000-4000-8000-0000000000a1'
            AND changes @> '[{"key":"response.first_touch_minutes","after":3}]'::jsonb),
  'history does not record who changed what') FROM w;
SELECT pg_temp.check(
  pg_temp.fails('c0f10000-0000-4000-8000-0000000000ad', 'UPDATE public.config_versions SET note = ''x''') OR
  (pg_temp.q('c0f10000-0000-4000-8000-0000000000ad', 'SELECT count(*) FROM public.config_versions WHERE note = ''x''') #>> '{}')::int = 0,
  'history could be edited');

DO $$
DECLARE
  v_w1 uuid := (SELECT w1 FROM w);
  v_layer uuid := pg_temp.layer(v_w1);
  v_before integer := pg_temp.ver(v_layer);
  v_target integer;
BEGIN
  SELECT max(version) INTO v_target FROM public.config_versions
  WHERE layer_id = v_layer AND NOT field_values ? 'response.first_touch_minutes';
  PERFORM pg_temp.q('c0f10000-0000-4000-8000-0000000000a1', format('public.config_rollback_layer(%L, %s)', v_layer, v_target));
  PERFORM pg_temp.check(pg_temp.ver(v_layer) = v_before + 1, 'rollback did not create a new version');
  PERFORM pg_temp.check(pg_temp.src(v_w1, 'response.first_touch_minutes') <> 'workspace', 'rollback did not restore the earlier value');
  PERFORM pg_temp.check((SELECT source FROM public.config_versions WHERE layer_id = v_layer AND version = v_before + 1) = 'edit'
    AND (SELECT note FROM public.config_versions WHERE layer_id = v_layer AND version = v_before + 1) LIKE 'Rolled back to version%',
    'the rollback is not recorded as such');
END $$;

SELECT pg_temp.check(
  pg_temp.err('c0f10000-0000-4000-8000-0000000000a1',
    format($q$public.config_save_layer(%L, %s, '{"tone.emoji": "never"}'::jsonb)$q$, pg_temp.layer(w1), pg_temp.ver(pg_temp.layer(w1)) - 1)) LIKE '%config_conflict%',
  'two people editing at once was not detected') FROM w;
SELECT pg_temp.check(
  pg_temp.err('c0f10000-0000-4000-8000-0000000000a1',
    format($q$public.config_save_layer(%L, %s, '{"integrations.file_folder": "xoxb-1234567890-abcdefghij"}'::jsonb)$q$, pg_temp.layer(w1), pg_temp.ver(pg_temp.layer(w1)))) LIKE '%password, key%',
  'a credential was accepted into configuration') FROM w;
SELECT pg_temp.check(
  pg_temp.fails('c0f10000-0000-4000-8000-0000000000a1',
    format($q$public.config_save_layer(%L, %s, '{"compliance.quiet_hours": {"start":"20:00","end":"20:00"}}'::jsonb)$q$, pg_temp.layer(w1), pg_temp.ver(pg_temp.layer(w1)))),
  'quiet hours covering the whole day were accepted') FROM w;
SELECT pg_temp.check(
  pg_temp.err('c0f10000-0000-4000-8000-0000000000a1',
    format($q$public.config_save_layer(%L, %s, '{}'::jsonb, ARRAY['identity.business_name'])$q$, pg_temp.layer(w1), pg_temp.ver(pg_temp.layer(w1)))) LIKE '%config_required_live%',
  'a required value was cleared on a live workspace') FROM w;

-- ---------------------------------------------------------------------------
-- The existing screens stay in step: their edits become overrides, and a
-- locked rule edited there snaps back.
-- ---------------------------------------------------------------------------

UPDATE public.score_configs SET ghost_days_soft = 5 WHERE org_id = (SELECT w1 FROM w);
SELECT pg_temp.check(pg_temp.eff(w1, 'response.ghost_days_soft') = '5' AND pg_temp.src(w1, 'response.ghost_days_soft') = 'workspace',
  'an edit on the scoring screen did not become an override') FROM w;
UPDATE public.follow_up_settings SET quiet_hours_start = '22:00' WHERE org_id = (SELECT w1 FROM w);
SELECT pg_temp.check(
  (SELECT quiet_hours_start FROM public.follow_up_settings WHERE org_id = w1) = '20:00'
  AND pg_temp.eff(w1, 'compliance.quiet_hours') = '{"start":"20:00","end":"08:00"}'::jsonb,
  'a looser quiet-hours edit on an existing screen got through') FROM w;

-- ---------------------------------------------------------------------------
-- Every run and draft records the configuration version.
-- ---------------------------------------------------------------------------

INSERT INTO public.leads (id, org_id, first_name) SELECT 'c0f10000-0000-4000-8000-00000000ead1', w1, 'Jess' FROM w;
INSERT INTO public.calls (id, org_id, lead_id, type) SELECT 'c0f10000-0000-4000-8000-0000000ca111', w1, 'c0f10000-0000-4000-8000-00000000ead1', 'discovery' FROM w;
INSERT INTO public.follow_up_drafts (id, org_id, lead_id, call_id, branch, channel, generated_body, edited_body, model_version, expires_at)
SELECT 'c0f10000-0000-4000-8000-0000000d0001', w1, 'c0f10000-0000-4000-8000-00000000ead1', 'c0f10000-0000-4000-8000-0000000ca111',
       'follow_up_scheduled', 'sms', 'Hi Jess', 'Hi Jess', 'test', now() + interval '1 day' FROM w;
SELECT pg_temp.check(
  (SELECT config_version FROM public.follow_up_drafts WHERE id = 'c0f10000-0000-4000-8000-0000000d0001') = public.config_version_stamp(w1)
  AND public.config_version_stamp(w1) LIKE 'p%/%.t:med-spa@%/%.w%',
  'a draft did not record the configuration version') FROM w;

-- ---------------------------------------------------------------------------
-- Switching templates, retiring, and closed workspaces.
-- ---------------------------------------------------------------------------

SELECT pg_temp.check(
  pg_temp.fails('c0f10000-0000-4000-8000-0000000000a1',
    format($q$public.config_switch_template(%L, (SELECT id FROM public.config_templates WHERE slug = 'home-services'))$q$, w1)),
  'a workspace moved to a draft template') FROM w;
SELECT pg_temp.q('c0f10000-0000-4000-8000-0000000000ad', $q$public.config_set_template_status((SELECT id FROM public.config_templates WHERE slug = 'home-services'), 'active')$q$);
SELECT pg_temp.check(
  pg_temp.err('c0f10000-0000-4000-8000-0000000000a1',
    format($q$public.config_switch_template(%L, (SELECT id FROM public.config_templates WHERE slug = 'home-services'))$q$, w1)) LIKE '%config_switch_confirm%',
  'a live workspace switched template without confirmation') FROM w;
SELECT pg_temp.check(e = '', 'a confirmed switch failed: ' || e)
FROM w, pg_temp.err('c0f10000-0000-4000-8000-0000000000a1',
  format($q$public.config_switch_template(%L, (SELECT id FROM public.config_templates WHERE slug = 'home-services'), ARRAY['tone.examples'], true, 'Moving to home services')$q$, w1)) e;
SELECT pg_temp.check(
  public.config_effective_at(w1) ->> 'template_slug' = 'home-services'
  AND EXISTS (SELECT 1 FROM public.config_versions WHERE org_id = w1 AND source = 'switch' AND note = 'Moving to home services'),
  'the template switch was not applied and recorded') FROM w;

SELECT pg_temp.q('c0f10000-0000-4000-8000-0000000000ad', $q$public.config_set_template_status((SELECT id FROM public.config_templates WHERE slug = 'med-spa'), 'retired')$q$);
SELECT pg_temp.check(
  pg_temp.fails('c0f10000-0000-4000-8000-0000000000ad',
    $q$public.create_workspace('Late Spa', 'America/Denver', NULL, NULL, (SELECT id FROM public.config_templates WHERE slug = 'med-spa'))$q$),
  'a retired template was chosen for a new workspace');
SELECT pg_temp.check(public.config_effective_at(w2) ->> 'template_slug' = 'med-spa', 'retiring a template broke a workspace on it') FROM w;

UPDATE public.organizations SET status = 'closed' WHERE id = (SELECT w2 FROM w);
SELECT pg_temp.check(
  pg_temp.fails('c0f10000-0000-4000-8000-0000000000ad',
    format($q$public.config_save_layer(%L, %s, '{"tone.emoji": "never"}'::jsonb)$q$, pg_temp.layer(w2), pg_temp.ver(pg_temp.layer(w2)))),
  'a closed workspace''s configuration was changed') FROM w;
SELECT pg_temp.check(
  (pg_temp.q('c0f10000-0000-4000-8000-0000000000ad', format($q$public.config_effective(%L) ->> 'version'$q$, w2)) #>> '{}') IS NOT NULL,
  'a closed workspace''s configuration cannot be viewed by staff') FROM w;

-- ---------------------------------------------------------------------------
-- Agents in a person's session check configuration without seeing it, and a
-- stop is recorded once with its reason, then cleared when they run cleanly.
-- ---------------------------------------------------------------------------

SELECT pg_temp.check(
  (pg_temp.q('c0f10000-0000-4000-8000-0000000000b3',
     format($q$public.config_agent_gate(%L, 'operator', 'The Operator', ARRAY['identity','qualification','response','approval','compliance','operators'])$q$, w1))
   - 'version' - 'business_description') = '{"ok": true}'::jsonb
  AND pg_temp.q('c0f10000-0000-4000-8000-0000000000b3',
     format($q$public.config_agent_gate(%L, 'operator', 'The Operator', ARRAY['identity'])$q$, w1)) ->> 'business_description' IS NOT NULL,
  'an operator''s agent could not pass a complete configuration, or saw more than it needs') FROM w;
SELECT pg_temp.check(
  pg_temp.fails('c0f10000-0000-4000-8000-0000000000b1',
    format($q$public.config_agent_gate(%L, 'operator', 'The Operator', ARRAY['identity'])$q$, w2)),
  'a person checked the configuration of a workspace they do not belong to') FROM w;

DO $$
DECLARE
  v_w2 uuid := (SELECT w2 FROM w);
  v_result jsonb;
BEGIN
  -- Break a required value the drafter reads, as the platform default would never allow.
  UPDATE public.config_layers SET field_values = field_values || '{"industry.business_description": ""}'::jsonb
  WHERE level = 'workspace' AND org_id = v_w2;
  v_result := public.config_agent_gate(v_w2, 'sales_os', 'Ask Vistrial', ARRAY['identity','industry']);
  PERFORM pg_temp.check(NOT (v_result ->> 'ok')::boolean AND v_result ->> 'reason' LIKE 'Ask Vistrial stopped because%',
    'a missing required value did not stop the agent with a reason');
  PERFORM public.config_agent_gate(v_w2, 'sales_os', 'Ask Vistrial', ARRAY['identity','industry']);
  PERFORM pg_temp.check(
    (SELECT occurrences FROM public.config_stops WHERE org_id = v_w2 AND consumer = 'sales_os' AND resolved_at IS NULL) = 2,
    'a repeated stop was not counted on the one open record');
  UPDATE public.config_layers SET field_values = field_values - 'industry.business_description'
  WHERE level = 'workspace' AND org_id = v_w2;
  PERFORM public.config_agent_gate(v_w2, 'sales_os', 'Ask Vistrial', ARRAY['identity','industry']);
  PERFORM pg_temp.check(
    NOT EXISTS (SELECT 1 FROM public.config_stops WHERE org_id = v_w2 AND consumer = 'sales_os' AND resolved_at IS NULL),
    'the stop stayed open after the agent ran cleanly');
END $$;
SELECT pg_temp.check(
  (pg_temp.q('c0f10000-0000-4000-8000-0000000000b1', format($q$(SELECT count(*) FROM public.config_stops WHERE org_id = %L)$q$, w2)) #>> '{}')::int = 0
  AND (pg_temp.q('c0f10000-0000-4000-8000-0000000000ad', format($q$(SELECT count(*) FROM public.config_stops WHERE org_id = %L)$q$, w2)) #>> '{}')::int = 1,
  'configuration stops are not visible to staff only') FROM w;

-- Opt-outs are visible to the people who can see the lead, and to nobody else.
INSERT INTO public.lead_opt_outs (lead_id, org_id, word, channel)
SELECT 'c0f10000-0000-4000-8000-00000000ead1', w1, 'STOP', 'sms' FROM w;
SELECT pg_temp.check(
  (pg_temp.q('c0f10000-0000-4000-8000-0000000000b2', 'SELECT count(*) FROM public.lead_opt_outs') #>> '{}')::int = 1
  AND (pg_temp.q('c0f10000-0000-4000-8000-0000000000b2', $q$public.config_agent_gate((SELECT w2 FROM w), 'operator', 'x', ARRAY['identity'])$q$) ? 'failed'),
  'a member could not see an opt-out on their own workspace');
SELECT pg_temp.check(
  pg_temp.fails('c0f10000-0000-4000-8000-0000000000b2',
    format($q$(WITH x AS (INSERT INTO public.lead_opt_outs (lead_id, org_id, word) VALUES ('c0f10000-0000-4000-8000-00000000ead1', %L, 'STOP') ON CONFLICT DO NOTHING RETURNING 1) SELECT count(*) FROM x)$q$, w1))
  AND pg_temp.fails('c0f10000-0000-4000-8000-0000000000b2', 'DELETE FROM public.lead_opt_outs'),
  'a member changed an opt-out directly') FROM w;

-- Customer screens get only their display values, and only for their own workspace.
SELECT pg_temp.check(
  (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(
     pg_temp.q('c0f10000-0000-4000-8000-0000000000b3', format($q$public.config_display_settings(%L)$q$, w1))) k)
  = ARRAY['forsight_history_weeks','forsight_long_silent_days','forsight_quiet_days','forsight_silent_days','stellar_stage_labels'],
  'a member saw more than the display values') FROM w;
SELECT pg_temp.check(
  pg_temp.fails('c0f10000-0000-4000-8000-0000000000b3', format($q$public.config_display_settings(%L)$q$, w2)),
  'a member read another workspace''s display values') FROM w;

-- Every new table has row-level security, and none is open to signed-out visitors.
SELECT pg_temp.check(
  NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
              WHERE n.nspname = 'public' AND c.relkind = 'r' AND (c.relname LIKE '%config%' OR c.relname = 'lead_opt_outs') AND NOT c.relrowsecurity),
  'a configuration table has row-level security off');
SELECT pg_temp.check(
  NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public' AND p.proname LIKE 'config\_%' AND p.prosecdef AND has_function_privilege('anon', p.oid, 'EXECUTE')),
  'a configuration function is open to signed-out visitors');

SELECT 'verify-config: ok' AS result;
