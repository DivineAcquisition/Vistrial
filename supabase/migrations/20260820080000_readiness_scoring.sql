-- Readiness scoring: factor mappings, append-only score identity, ghost detector.
-- Unknown factor values are stored as NULL, never as zero.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

CREATE TYPE public.score_factor AS ENUM (
  'timeline',
  'investment_capacity',
  'decision_authority',
  'pain_severity'
);

CREATE TYPE public.score_mapping_kind AS ENUM ('choice', 'range');

-- ---------------------------------------------------------------------------
-- Mapping tables (configuration, not code)
-- ---------------------------------------------------------------------------

CREATE TABLE public.score_field_maps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  field_name text NOT NULL,
  factor public.score_factor NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT score_field_maps_org_field_key UNIQUE (org_id, field_name),
  CONSTRAINT score_field_maps_field_name_present CHECK (char_length(trim(field_name)) > 0)
);

CREATE TABLE public.score_field_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  field_map_id uuid NOT NULL REFERENCES public.score_field_maps (id) ON DELETE CASCADE,
  kind public.score_mapping_kind NOT NULL,
  answer_value text,
  range_min numeric,
  range_max numeric,
  score integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT score_field_rules_score_range CHECK (score BETWEEN 0 AND 100),
  CONSTRAINT score_field_rules_choice_complete CHECK (
    kind <> 'choice' OR (answer_value IS NOT NULL AND char_length(trim(answer_value)) > 0)
  ),
  CONSTRAINT score_field_rules_range_complete CHECK (
    kind <> 'range'
    OR (range_min IS NOT NULL AND range_max IS NOT NULL AND range_min <= range_max)
  )
);

CREATE INDEX score_field_rules_map_idx ON public.score_field_rules (field_map_id);
CREATE INDEX score_field_maps_org_idx ON public.score_field_maps (org_id);

CREATE TRIGGER score_field_maps_set_updated_at
  BEFORE UPDATE ON public.score_field_maps
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Score rows: unknown factors, required reasoning, idempotency
-- ---------------------------------------------------------------------------

ALTER TABLE public.readiness_scores
  ALTER COLUMN timeline_raw DROP NOT NULL,
  ALTER COLUMN investment_capacity_raw DROP NOT NULL,
  ALTER COLUMN decision_authority_raw DROP NOT NULL,
  ALTER COLUMN pain_severity_raw DROP NOT NULL;

ALTER TABLE public.readiness_scores
  DROP CONSTRAINT readiness_scores_raw_range;

ALTER TABLE public.readiness_scores
  ADD CONSTRAINT readiness_scores_raw_range CHECK (
    (timeline_raw IS NULL OR timeline_raw BETWEEN 0 AND 100)
    AND (investment_capacity_raw IS NULL OR investment_capacity_raw BETWEEN 0 AND 100)
    AND (decision_authority_raw IS NULL OR decision_authority_raw BETWEEN 0 AND 100)
    AND (pain_severity_raw IS NULL OR pain_severity_raw BETWEEN 0 AND 100)
    AND total BETWEEN 0 AND 100
  );

UPDATE public.readiness_scores
SET reasoning = 'Score recorded before reasoning was required.'
WHERE reasoning IS NULL OR char_length(trim(reasoning)) = 0;

ALTER TABLE public.readiness_scores
  ALTER COLUMN reasoning SET NOT NULL;

ALTER TABLE public.readiness_scores
  ADD CONSTRAINT readiness_scores_reasoning_present CHECK (char_length(trim(reasoning)) > 0);

ALTER TABLE public.readiness_scores
  ADD COLUMN idempotency_key text;

CREATE UNIQUE INDEX readiness_scores_idempotency_idx
  ON public.readiness_scores (org_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Ghost detector
-- ---------------------------------------------------------------------------

ALTER TABLE public.leads
  ADD COLUMN ghost_approaching_at timestamptz;

COMMENT ON COLUMN public.leads.ghost_approaching_at IS
  'Set when the lead crosses the soft ghost threshold. Cleared by a later touch.';

ALTER TABLE public.next_actions
  ADD COLUMN kind text;

CREATE UNIQUE INDEX next_actions_open_ghost_reengagement_idx
  ON public.next_actions (org_id, lead_id)
  WHERE completed_at IS NULL AND kind = 'ghost_reengagement';

CREATE TABLE public.ghost_detector_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  evaluated_count integer NOT NULL,
  changed_count integer NOT NULL,
  ran_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ghost_detector_runs_counts_nonneg CHECK (
    evaluated_count >= 0 AND changed_count >= 0
  )
);

CREATE INDEX ghost_detector_runs_org_time_idx
  ON public.ghost_detector_runs (org_id, ran_at DESC);

-- ---------------------------------------------------------------------------
-- Default maps for a new org. Generic on purpose — tune in settings.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.seed_default_score_maps(p_org_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_map uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.score_field_maps WHERE org_id = p_org_id) THEN
    RETURN;
  END IF;

  INSERT INTO public.score_field_maps (org_id, field_name, factor)
  VALUES (p_org_id, 'timeline', 'timeline')
  RETURNING id INTO v_map;
  INSERT INTO public.score_field_rules (org_id, field_map_id, kind, answer_value, score)
  VALUES
    (p_org_id, v_map, 'choice', 'immediately', 100),
    (p_org_id, v_map, 'choice', 'this week', 95),
    (p_org_id, v_map, 'choice', '14 days', 90),
    (p_org_id, v_map, 'choice', '30 days', 80),
    (p_org_id, v_map, 'choice', '60 days', 55),
    (p_org_id, v_map, 'choice', '90 days', 40),
    (p_org_id, v_map, 'choice', '6 months', 20);

  INSERT INTO public.score_field_maps (org_id, field_name, factor)
  VALUES (p_org_id, 'budget', 'investment_capacity')
  RETURNING id INTO v_map;
  INSERT INTO public.score_field_rules (org_id, field_map_id, kind, answer_value, score)
  VALUES
    (p_org_id, v_map, 'choice', 'under 5k', 25),
    (p_org_id, v_map, 'choice', '5k', 45),
    (p_org_id, v_map, 'choice', '10k', 65),
    (p_org_id, v_map, 'choice', '15k', 80),
    (p_org_id, v_map, 'choice', '20k', 90),
    (p_org_id, v_map, 'choice', '25k+', 100);

  INSERT INTO public.score_field_maps (org_id, field_name, factor)
  VALUES (p_org_id, 'annual_revenue', 'investment_capacity')
  RETURNING id INTO v_map;
  INSERT INTO public.score_field_rules (org_id, field_map_id, kind, range_min, range_max, score)
  VALUES
    (p_org_id, v_map, 'range', 0, 49999.99, 25),
    (p_org_id, v_map, 'range', 50000, 149999.99, 55),
    (p_org_id, v_map, 'range', 150000, 499999.99, 80),
    (p_org_id, v_map, 'range', 500000, 999999999, 100);

  INSERT INTO public.score_field_maps (org_id, field_name, factor)
  VALUES (p_org_id, 'authority', 'decision_authority')
  RETURNING id INTO v_map;
  INSERT INTO public.score_field_rules (org_id, field_map_id, kind, answer_value, score)
  VALUES
    (p_org_id, v_map, 'choice', 'I decide', 100),
    (p_org_id, v_map, 'choice', 'I decide with partner', 65),
    (p_org_id, v_map, 'choice', 'I recommend', 40),
    (p_org_id, v_map, 'choice', 'researching', 20);

  INSERT INTO public.score_field_maps (org_id, field_name, factor)
  VALUES (p_org_id, 'pain', 'pain_severity')
  RETURNING id INTO v_map;
  INSERT INTO public.score_field_rules (org_id, field_map_id, kind, answer_value, score)
  VALUES
    (p_org_id, v_map, 'choice', 'critical', 100),
    (p_org_id, v_map, 'choice', 'significant', 75),
    (p_org_id, v_map, 'choice', 'moderate', 50),
    (p_org_id, v_map, 'choice', 'mild', 25);

  INSERT INTO public.score_field_maps (org_id, field_name, factor)
  VALUES (p_org_id, 'timeline_signal', 'timeline')
  RETURNING id INTO v_map;
  INSERT INTO public.score_field_rules (org_id, field_map_id, kind, answer_value, score)
  VALUES
    (p_org_id, v_map, 'choice', 'immediately', 100),
    (p_org_id, v_map, 'choice', 'this week', 95),
    (p_org_id, v_map, 'choice', '30 days', 80),
    (p_org_id, v_map, 'choice', 'next month', 70),
    (p_org_id, v_map, 'choice', '6 months', 20),
    (p_org_id, v_map, 'choice', 'later this year', 25);

  INSERT INTO public.score_field_maps (org_id, field_name, factor)
  VALUES (p_org_id, 'budget_signal', 'investment_capacity')
  RETURNING id INTO v_map;
  INSERT INTO public.score_field_rules (org_id, field_map_id, kind, answer_value, score)
  VALUES
    (p_org_id, v_map, 'choice', 'under 5k', 25),
    (p_org_id, v_map, 'choice', '15k', 80),
    (p_org_id, v_map, 'choice', '20k', 90),
    (p_org_id, v_map, 'choice', 'can afford it', 85);

  INSERT INTO public.score_field_maps (org_id, field_name, factor)
  VALUES (p_org_id, 'decision_process', 'decision_authority')
  RETURNING id INTO v_map;
  INSERT INTO public.score_field_rules (org_id, field_map_id, kind, answer_value, score)
  VALUES
    (p_org_id, v_map, 'choice', 'I decide', 100),
    (p_org_id, v_map, 'choice', 'solo', 100),
    (p_org_id, v_map, 'choice', 'needs partner', 60),
    (p_org_id, v_map, 'choice', 'I decide with partner', 65);
END;
$$;

CREATE OR REPLACE FUNCTION public.provision_org_scoring()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.score_configs (org_id) VALUES (NEW.id)
  ON CONFLICT (org_id) DO NOTHING;
  PERFORM public.seed_default_score_maps(NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER organizations_provision_scoring
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.provision_org_scoring();

INSERT INTO public.score_configs (org_id)
SELECT id FROM public.organizations
ON CONFLICT (org_id) DO NOTHING;

SELECT public.seed_default_score_maps(id) FROM public.organizations;

-- ---------------------------------------------------------------------------
-- Touches clear the approaching-ghost flag. An inbound reply brings a ghost
-- back to working. Scoring events still run in application code.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sync_lead_touch_times()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.leads
  SET
    last_touch_at = GREATEST(
      COALESCE(last_touch_at, NEW.occurred_at),
      NEW.occurred_at
    ),
    first_human_touch_at = CASE
      WHEN NEW.type = 'human' AND NEW.direction = 'outbound' THEN
        LEAST(
          COALESCE(first_human_touch_at, NEW.occurred_at),
          NEW.occurred_at
        )
      ELSE first_human_touch_at
    END,
    ghost_approaching_at = NULL,
    status = CASE
      WHEN status = 'ghost' AND NEW.direction = 'inbound' THEN 'working'::public.lead_status
      ELSE status
    END
  WHERE id = NEW.lead_id
    AND org_id = NEW.org_id;

  UPDATE public.next_actions
  SET completed_at = now()
  WHERE lead_id = NEW.lead_id
    AND org_id = NEW.org_id
    AND kind = 'ghost_reengagement'
    AND completed_at IS NULL;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.score_field_maps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.score_field_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ghost_detector_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS score_configs_all ON public.score_configs;

CREATE POLICY score_configs_select
  ON public.score_configs
  FOR SELECT
  TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));

CREATE POLICY score_configs_update
  ON public.score_configs
  FOR UPDATE
  TO authenticated
  USING (public.user_has_org_role(org_id, 'owner', 'admin'))
  WITH CHECK (public.user_has_org_role(org_id, 'owner', 'admin'));

CREATE POLICY score_field_maps_select
  ON public.score_field_maps
  FOR SELECT
  TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));

CREATE POLICY score_field_maps_write
  ON public.score_field_maps
  FOR ALL
  TO authenticated
  USING (public.user_has_org_role(org_id, 'owner', 'admin'))
  WITH CHECK (public.user_has_org_role(org_id, 'owner', 'admin'));

CREATE POLICY score_field_rules_select
  ON public.score_field_rules
  FOR SELECT
  TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));

CREATE POLICY score_field_rules_write
  ON public.score_field_rules
  FOR ALL
  TO authenticated
  USING (public.user_has_org_role(org_id, 'owner', 'admin'))
  WITH CHECK (public.user_has_org_role(org_id, 'owner', 'admin'));

CREATE POLICY ghost_detector_runs_select
  ON public.ghost_detector_runs
  FOR SELECT
  TO authenticated
  USING (public.user_has_org_role(org_id, 'owner', 'admin'));

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.score_field_maps,
  public.score_field_rules,
  public.ghost_detector_runs
  TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.score_field_maps,
  public.score_field_rules,
  public.ghost_detector_runs
  TO service_role;

GRANT EXECUTE ON FUNCTION public.seed_default_score_maps(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.replace_org_score_maps(p_org_id uuid, p_maps jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_map jsonb;
  v_rule jsonb;
  v_map_id uuid;
BEGIN
  IF NOT public.user_has_org_role(p_org_id, 'owner', 'admin') THEN
    RAISE EXCEPTION 'not authorized to replace score maps';
  END IF;

  IF jsonb_typeof(p_maps) <> 'array' THEN
    RAISE EXCEPTION 'score maps payload must be an array';
  END IF;

  DELETE FROM public.score_field_maps WHERE org_id = p_org_id;

  FOR v_map IN SELECT value FROM jsonb_array_elements(p_maps)
  LOOP
    INSERT INTO public.score_field_maps (org_id, field_name, factor)
    VALUES (
      p_org_id,
      trim(v_map->>'field_name'),
      (v_map->>'factor')::public.score_factor
    )
    RETURNING id INTO v_map_id;

    IF v_map ? 'rules' AND jsonb_typeof(v_map->'rules') = 'array' THEN
      FOR v_rule IN SELECT value FROM jsonb_array_elements(v_map->'rules')
      LOOP
        INSERT INTO public.score_field_rules (
          org_id, field_map_id, kind, answer_value, range_min, range_max, score
        )
        VALUES (
          p_org_id,
          v_map_id,
          (v_rule->>'kind')::public.score_mapping_kind,
          NULLIF(trim(COALESCE(v_rule->>'answer_value', '')), ''),
          CASE WHEN v_rule->>'range_min' IS NULL OR v_rule->>'range_min' = '' THEN NULL ELSE (v_rule->>'range_min')::numeric END,
          CASE WHEN v_rule->>'range_max' IS NULL OR v_rule->>'range_max' = '' THEN NULL ELSE (v_rule->>'range_max')::numeric END,
          (v_rule->>'score')::integer
        );
      END LOOP;
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_org_score_maps(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.replace_org_score_maps(uuid, jsonb) TO authenticated, service_role;

