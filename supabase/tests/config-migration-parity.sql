-- Run by scripts/test-config-migration.sh against a database that had the
-- seed and a live-like workspace loaded BEFORE 20261007030000 was applied.
-- Proves the migration reproduces what each workspace did before, apart from
-- the deliberate, locked launch compliance rules.

CREATE OR REPLACE FUNCTION pg_temp.check(p_ok boolean, p_message text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_ok IS NOT TRUE THEN
    RAISE EXCEPTION 'config migration check failed: %', p_message;
  END IF;
END;
$$;

-- Every workspace is on Coaches and Consultants, pinned to the launch default, auto-accept off.
SELECT pg_temp.check(
  (SELECT count(*) FROM public.organizations) =
  (SELECT count(*) FROM public.workspace_config_pins p JOIN public.config_templates t ON t.id = p.template_id
   WHERE t.slug = 'coaches-consultants' AND p.platform_version = 2 AND NOT p.auto_accept_while_onboarding),
  'not every existing workspace was put on Coaches and Consultants at the launch default');

-- Parity: every legacy settings row is unchanged, except the locked launch
-- rules (follow-up quiet hours move from 9pm to 8pm and are always on) and
-- updated_at. Gate rows the app treated as "missing means default" may now
-- exist, holding those same defaults.
CREATE TEMP TABLE parity_diffs AS
WITH now_rows AS (
  SELECT org_id, 'score_configs' AS t, to_jsonb(x) - 'updated_at' AS r FROM public.score_configs x
  UNION ALL SELECT org_id, 'follow_up_settings', to_jsonb(x) - 'updated_at' - 'quiet_hours_start' - 'quiet_hours_end' - 'quiet_hours_enabled' FROM public.follow_up_settings x
  UNION ALL SELECT org_id, 'org_voice_profiles', to_jsonb(x) - 'updated_at' FROM public.org_voice_profiles x
  UNION ALL SELECT id, 'organizations', jsonb_build_object(
    'timezone', timezone, 'working_hours_start', working_hours_start, 'working_hours_end', working_hours_end,
    'working_days', working_days, 'transcript_retention_days', transcript_retention_days,
    'owner_contact_name', owner_contact_name, 'owner_contact_email', owner_contact_email, 'owner_contact_phone', owner_contact_phone
  ) FROM public.organizations
),
before_rows AS (
  SELECT org_id, table_name AS t,
    CASE table_name
      WHEN 'follow_up_settings' THEN row_data - 'updated_at' - 'quiet_hours_start' - 'quiet_hours_end' - 'quiet_hours_enabled'
      WHEN 'organizations' THEN row_data
      ELSE row_data - 'updated_at'
    END AS r
  FROM public.config_migration_legacy
  WHERE table_name IN ('score_configs', 'follow_up_settings', 'org_voice_profiles', 'organizations')
)
SELECT b.org_id, b.t, b.r AS before_row, n.r AS after_row
FROM before_rows b
LEFT JOIN now_rows n ON n.org_id = b.org_id AND n.t = b.t
WHERE n.r IS DISTINCT FROM b.r;

SELECT pg_temp.check(
  NOT EXISTS (SELECT 1 FROM parity_diffs),
  'a legacy settings row changed: ' || COALESCE((SELECT string_agg(t || ' for ' || org_id, ', ') FROM parity_diffs), ''));

-- The gate: what the queue applied is unchanged (cap, wait), and quiet hours
-- are now the locked 8pm to 8am.
SELECT pg_temp.check(
  NOT EXISTS (
    SELECT 1 FROM public.approval_gate_settings g
    LEFT JOIN public.config_migration_legacy l ON l.org_id = g.org_id AND l.table_name = 'approval_gate_settings'
    WHERE g.daily_send_limit_per_lead <> COALESCE((l.row_data ->> 'daily_send_limit_per_lead')::int, 2)
       OR g.queue_wait_limit_minutes <> COALESCE((l.row_data ->> 'queue_wait_limit_minutes')::int, 240)
       OR g.quiet_hours_start <> '20:00' OR g.quiet_hours_end <> '08:00'
  ),
  'the approval gate limits changed');
SELECT pg_temp.check(
  NOT EXISTS (
    SELECT 1 FROM public.approval_gate_actions a
    JOIN public.approval_action_types t ON t.action_type = a.action_type
    LEFT JOIN public.config_migration_legacy l ON l.org_id = a.org_id AND l.table_name = 'approval_gate_actions'
      AND l.row_data ->> 'action_type' = a.action_type
    WHERE a.mode <> COALESCE(l.row_data ->> 'mode', t.default_mode)
  ),
  'an approval action changed mode');
SELECT pg_temp.check(
  NOT EXISTS (SELECT 1 FROM public.follow_up_settings WHERE NOT quiet_hours_enabled OR quiet_hours_start <> '20:00' OR quiet_hours_end <> '08:00'),
  'follow-up quiet hours were not set to the locked 8pm to 8am');

-- The live-like workspace: its own values became overrides; everything else inherited.
DO $$
DECLARE
  v jsonb := public.config_effective_at('2d2d2d2d-2222-4222-8222-222222222222');
  src jsonb := v -> 'sources';
  vals jsonb := v -> 'values';
BEGIN
  PERFORM pg_temp.check(vals -> 'qualification.factor_weights' = '{"timeline":25,"investment_capacity":25,"decision_authority":25,"pain_severity":25}'::jsonb
    AND src -> 'qualification.factor_weights' ->> 'source' = 'workspace', 'custom weights were not kept as an override');
  PERFORM pg_temp.check((vals ->> 'response.ghost_days_soft')::int = 4 AND (vals ->> 'response.ghost_days_hard')::int = 7
    AND src -> 'response.ghost_days_soft' ->> 'source' = 'workspace', 'custom ghost days were not kept');
  PERFORM pg_temp.check((vals ->> 'response.max_sequence_days')::int = 5, 'follow-up duration was not kept');
  PERFORM pg_temp.check(vals ->> 'tone.formality' = 'casual' AND src -> 'tone.formality' ->> 'source' = 'workspace',
    'casual voice was not kept over the template''s friendly');
  PERFORM pg_temp.check((vals ->> 'qualification.ready_threshold')::int = 60 AND src -> 'qualification.ready_threshold' ->> 'source' = 'platform',
    'a value equal to the default became an override');
  PERFORM pg_temp.check(src -> 'response.first_touch_minutes' ->> 'source' = 'template',
    'a value equal to the template became an override');
  PERFORM pg_temp.check(vals -> 'industry.offers' -> 0 ->> 'name' = 'Private Consulting For Sales Operations',
    'the business profile offer was not mapped');
  PERFORM pg_temp.check(jsonb_array_length(vals -> 'industry.objections') = 3, 'the business profile objections were not mapped');
  PERFORM pg_temp.check(vals -> 'qualification.ready_criteria' ? 'They can afford it.', 'qualification signals were not mapped to statements');
  PERFORM pg_temp.check(vals -> 'compliance.quiet_hours' = '{"start":"20:00","end":"08:00"}'::jsonb
    AND src -> 'compliance.quiet_hours' ->> 'locked_at' = 'platform', 'quiet hours are not the locked platform rule');
  PERFORM pg_temp.check(vals ->> 'response.after_hours' = 'pause' AND vals ->> 'compliance.cap_applies_to' = 'every_send'
    AND vals ->> 'compliance.quiet_hours_basis' = 'lead_local' AND vals -> 'compliance.opt_out_words' ? 'STOP',
    'the launch compliance rules are not in effect');
  PERFORM pg_temp.check(v ->> 'version' LIKE 'p2/2.t:coaches-consultants@1/1.w%', 'unexpected version stamp: ' || (v ->> 'version'));
END $$;

-- The launch change is recorded as a deliberate platform version, with its reason.
SELECT pg_temp.check(
  EXISTS (SELECT 1 FROM public.config_versions WHERE level = 'platform' AND version = 2 AND source = 'launch' AND note LIKE 'Launch compliance rules%'),
  'the launch compliance change is not recorded in history');

-- Every workspace's migration is recorded, with what it kept.
SELECT pg_temp.check(
  (SELECT count(DISTINCT org_id) FROM public.config_versions WHERE level = 'workspace' AND source = 'migration')
  = (SELECT count(*) FROM public.organizations),
  'a workspace has no migration history');

SELECT 'config migration parity: ok' AS result;
