-- Assay, the lead scoring agent: scores, score history, the scoring queue,
-- call signals, leads.closed_at, and the retirement of the readiness score.
--
-- Product choices (approved in Phase 0, stated here, not guessed):
--   * Assay scores live in lead_scores (one row per lead) and
--     lead_score_history (a row each time the number or tier changes).
--     leads.current_score, leads.lead_type, and case_files.band stay as
--     caches, now maintained from lead_scores, so every reader of them reads
--     Assay. lead_type is ready_track for Warm or higher (50+).
--   * readiness_scores is read-only history. Nothing writes to it again.
--     score_field_maps and score_field_rules are frozen; Assay reads only its
--     approved input list (assay.field_map in configuration).
--   * The holdout flag stays for accuracy reporting and no longer moves a
--     lead between tracks or in any queue.
--   * The legacy "ready from" line is set to 50 everywhere, so any remaining
--     legacy report that compares a score with it uses the Warm line.
--   * closed_at is set when a lead closes and cleared when it reopens.
--     Existing closed leads take it from lead_status_changes; where that
--     history does not exist it stays empty and the lead is left out of
--     learning windows.
--   * Call-based reasons are hidden from people who cannot see transcripts.
--     The tables expose only the number, tier, and flags to signed-in
--     people; reasons come through assay_lead_score(), which applies that
--     rule. Scores never reach anything sent to a lead.

-- ---------------------------------------------------------------------------
-- Replace the earlier Assay build (20261018010000 to 20261018010002). Its
-- scores were derived and are rebuilt by the first scoring below. The queue
-- view read its scores; the view and its row function are recreated in
-- section 8 at their earlier definitions plus Assay.
-- ---------------------------------------------------------------------------

DROP VIEW IF EXISTS public.queue_rows CASCADE;
DROP FUNCTION IF EXISTS public.assay_claim_jobs(integer);
DROP TABLE IF EXISTS
  public.assay_writeback_log,
  public.assay_writeback,
  public.assay_workspace_state,
  public.assay_score_history,
  public.assay_rule_versions,
  public.assay_queue_prefs,
  public.assay_proposals,
  public.assay_lead_scores,
  public.assay_jobs,
  public.assay_daily,
  public.assay_change_requests,
  public.assay_call_signals,
  public.assay_actions
CASCADE;

-- ---------------------------------------------------------------------------
-- 0. The switch report. Before counts are taken first, from the legacy bands.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.assay_migration_runs (
  org_id uuid PRIMARY KEY REFERENCES public.organizations (id) ON DELETE CASCADE,
  before_bands jsonb NOT NULL,
  before_counts jsonb NOT NULL,
  after_counts jsonb,
  ignored_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  leads_scored integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

COMMENT ON TABLE public.assay_migration_runs IS
  'One row per workspace: open leads by legacy band before Assay, by Assay tier after the silent first scoring, and the legacy scoring fields Assay ignores.';

ALTER TABLE public.assay_migration_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.assay_migration_runs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.assay_migration_runs TO service_role;

DROP POLICY IF EXISTS assay_migration_runs_staff ON public.assay_migration_runs;
CREATE POLICY assay_migration_runs_staff ON public.assay_migration_runs
  FOR SELECT TO authenticated
  USING (public.ws_is_staff(org_id));
GRANT SELECT ON public.assay_migration_runs TO authenticated;

DO $$
DECLARE
  r record;
  v_bands jsonb;
BEGIN
  FOR r IN SELECT id FROM public.organizations LOOP
    BEGIN
      v_bands := public.config_effective_at(r.id) -> 'values' -> 'qualification.scoring_bands';
    EXCEPTION WHEN OTHERS THEN
      v_bands := NULL;
    END;
    IF v_bands IS NULL OR jsonb_typeof(v_bands) <> 'array' OR jsonb_array_length(v_bands) = 0 THEN
      v_bands := '[{"name":"Cold","min_score":0},{"name":"Warm","min_score":40},{"name":"Hot","min_score":60}]'::jsonb;
    END IF;

    WITH banded AS (
      SELECT
        l.id,
        (
          SELECT b ->> 'name'
          FROM jsonb_array_elements(v_bands) b
          WHERE l.current_score IS NOT NULL AND (b ->> 'min_score')::numeric <= l.current_score
          ORDER BY (b ->> 'min_score')::numeric DESC
          LIMIT 1
        ) AS band
      FROM public.leads l
      WHERE l.org_id = r.id
        AND NOT l.is_test
        AND l.merged_into IS NULL
        AND l.status NOT IN ('closed_won', 'closed_lost')
    )
    INSERT INTO public.assay_migration_runs (org_id, before_bands, before_counts, ignored_fields)
    SELECT
      r.id,
      v_bands,
      jsonb_build_object(
        'open', (SELECT count(*) FROM banded),
        'unscored', (SELECT count(*) FROM banded WHERE band IS NULL),
        'bands', COALESCE((
          SELECT jsonb_object_agg(x.band, x.n)
          FROM (SELECT band, count(*) AS n FROM banded WHERE band IS NOT NULL GROUP BY band) x
        ), '{}'::jsonb)
      ),
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object('source', m.field_name, 'was', m.factor::text, 'reason', 'not_approved') ORDER BY m.field_name)
        FROM public.score_field_maps m WHERE m.org_id = r.id
      ), '[]'::jsonb)
    ON CONFLICT (org_id) DO NOTHING;
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 1. closed_at
-- ---------------------------------------------------------------------------

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS closed_at timestamptz;

COMMENT ON COLUMN public.leads.closed_at IS
  'When the lead was won or lost. Set by trigger. Empty for leads closed before this was recorded, which are left out of learning windows.';

ALTER TABLE public.leads DISABLE TRIGGER leads_set_updated_at;
UPDATE public.leads l
SET closed_at = c.created_at
FROM (
  SELECT DISTINCT ON (s.lead_id) s.lead_id, s.to_status, s.created_at
  FROM public.lead_status_changes s
  WHERE s.to_status IN ('closed_won', 'closed_lost')
  ORDER BY s.lead_id, s.created_at DESC
) c
WHERE c.lead_id = l.id
  AND l.status = c.to_status
  AND l.closed_at IS NULL;
ALTER TABLE public.leads ENABLE TRIGGER leads_set_updated_at;

CREATE OR REPLACE FUNCTION public.leads_stamp_closed_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('closed_won', 'closed_lost') THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      NEW.closed_at := now();
    END IF;
  ELSE
    NEW.closed_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS leads_stamp_closed_at ON public.leads;
CREATE TRIGGER leads_stamp_closed_at
  BEFORE UPDATE OF status ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.leads_stamp_closed_at();

CREATE INDEX IF NOT EXISTS leads_org_closed_at_idx ON public.leads (org_id, closed_at) WHERE closed_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Call signals. Scribe fills these inside its existing extraction; the AI
--    never sets a score. Pointers to the transcript only, never its words.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.call_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  lead_id uuid NOT NULL,
  call_id uuid NOT NULL,
  signal text NOT NULL CHECK (signal IN ('timeline', 'budget_fit', 'decision_maker', 'objection', 'buying_intent', 'next_step', 'red_flag')),
  value text NOT NULL CHECK (value ~ '^[a-z0-9_]{1,60}$'),
  confidence text NOT NULL CHECK (confidence IN ('high', 'medium', 'low')),
  passage_ids uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (call_id, signal, value),
  CONSTRAINT call_signals_lead_org_fkey FOREIGN KEY (lead_id, org_id)
    REFERENCES public.leads (id, org_id) ON DELETE CASCADE,
  CONSTRAINT call_signals_call_org_fkey FOREIGN KEY (call_id, org_id)
    REFERENCES public.calls (id, org_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS call_signals_lead_idx ON public.call_signals (org_id, lead_id, created_at DESC);

ALTER TABLE public.call_signals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.call_signals FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.call_signals TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Scores and their history.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.lead_scores (
  lead_id uuid PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  score smallint NOT NULL CHECK (score BETWEEN 0 AND 100),
  tier text NOT NULL CHECK (tier IN ('hot', 'warm', 'cool', 'cold')),
  early boolean NOT NULL DEFAULT false,
  contactable boolean NOT NULL DEFAULT true,
  no_call boolean NOT NULL DEFAULT true,
  call_pending boolean NOT NULL DEFAULT false,
  parts jsonb NOT NULL DEFAULT '{}'::jsonb,
  raising jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(raising) = 'array'),
  lowering jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(lowering) = 'array'),
  unclear text[] NOT NULL DEFAULT '{}',
  notes text[] NOT NULL DEFAULT '{}',
  rules_version text NOT NULL,
  config_version text,
  inputs_hash text NOT NULL,
  cause text NOT NULL CHECK (cause IN ('event', 'nightly', 'rules_change', 'rollback', 'history_import', 'migration', 'reopened', 'manual')),
  historic boolean NOT NULL DEFAULT false,
  as_of timestamptz NOT NULL,
  scored_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lead_scores_lead_org_fkey FOREIGN KEY (lead_id, org_id)
    REFERENCES public.leads (id, org_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS lead_scores_org_tier_idx ON public.lead_scores (org_id, tier, score DESC);

COMMENT ON TABLE public.lead_scores IS
  'Assay''s current score for each lead: number, tier, parts, and reasons. Written only by the service role. Reasons carry rule ids and evidence pointers, never message text or call content.';
COMMENT ON COLUMN public.lead_scores.historic IS
  'Scored silently (history import, migration, rules change). A silent score never starts a task, alert, draft, or writeback.';

CREATE TABLE IF NOT EXISTS public.lead_score_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  lead_id uuid NOT NULL,
  score smallint NOT NULL,
  tier text NOT NULL,
  previous_score smallint,
  previous_tier text,
  cause text NOT NULL,
  historic boolean NOT NULL DEFAULT false,
  rules_version text NOT NULL,
  reason_text text,
  reason_call_based boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lead_score_history_lead_org_fkey FOREIGN KEY (lead_id, org_id)
    REFERENCES public.leads (id, org_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS lead_score_history_lead_idx ON public.lead_score_history (org_id, lead_id, created_at DESC);

COMMENT ON TABLE public.lead_score_history IS
  'Each change to a lead''s Assay number or tier and what caused it. Kept for the life of the lead; removed with it.';

CREATE OR REPLACE FUNCTION public.lead_score_history_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'lead_score_history is append-only';
END;
$$;

DROP TRIGGER IF EXISTS lead_score_history_append_only ON public.lead_score_history;
CREATE TRIGGER lead_score_history_append_only
  BEFORE UPDATE ON public.lead_score_history
  FOR EACH ROW EXECUTE FUNCTION public.lead_score_history_append_only();

ALTER TABLE public.lead_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_score_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lead_scores FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.lead_score_history FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_scores TO service_role;
GRANT SELECT, INSERT, DELETE ON public.lead_score_history TO service_role;

-- The number, tier, and flags are the same for everyone who can see the lead.
GRANT SELECT (lead_id, org_id, score, tier, early, contactable, no_call, call_pending, rules_version, historic, as_of, scored_at)
  ON public.lead_scores TO authenticated;
GRANT SELECT (id, org_id, lead_id, score, tier, previous_score, previous_tier, cause, historic, created_at)
  ON public.lead_score_history TO authenticated;

DROP POLICY IF EXISTS lead_scores_select ON public.lead_scores;
CREATE POLICY lead_scores_select ON public.lead_scores
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()) AND public.ws_lead_visible(org_id, lead_id));

DROP POLICY IF EXISTS lead_score_history_select ON public.lead_score_history;
CREATE POLICY lead_score_history_select ON public.lead_score_history
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()) AND public.ws_lead_visible(org_id, lead_id));

DROP TRIGGER IF EXISTS lead_scores_set_updated_at ON public.lead_scores;
CREATE TRIGGER lead_scores_set_updated_at
  BEFORE UPDATE ON public.lead_scores
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.assay_tier_label(p_tier text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_tier WHEN 'hot' THEN 'Hot' WHEN 'warm' THEN 'Warm' WHEN 'cool' THEN 'Cool' WHEN 'cold' THEN 'Cold' ELSE NULL END;
$$;

-- The caches every older screen and report reads, and the history row.
CREATE OR REPLACE FUNCTION public.assay_sync_lead_score()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type public.lead_type := CASE WHEN NEW.tier IN ('hot', 'warm') THEN 'ready_track'::public.lead_type ELSE 'nurture_track'::public.lead_type END;
  v_top jsonb;
BEGIN
  PERFORM set_config('vistrial.allow_score_cache', '1', true);
  UPDATE public.leads
  SET current_score = NEW.score, lead_type = v_type
  WHERE id = NEW.lead_id AND org_id = NEW.org_id
    AND (current_score IS DISTINCT FROM NEW.score OR lead_type IS DISTINCT FROM v_type);
  PERFORM set_config('vistrial.allow_score_cache', '', true);

  UPDATE public.case_files
  SET band = public.assay_tier_label(NEW.tier)
  WHERE org_id = NEW.org_id AND lead_id = NEW.lead_id
    AND (band IS DISTINCT FROM public.assay_tier_label(NEW.tier) OR score IS DISTINCT FROM NEW.score::integer);

  IF TG_OP = 'INSERT' OR NEW.score IS DISTINCT FROM OLD.score OR NEW.tier IS DISTINCT FROM OLD.tier THEN
    v_top := CASE
      WHEN TG_OP = 'UPDATE' AND NEW.score < OLD.score THEN COALESCE(NEW.lowering -> 0, NEW.raising -> 0)
      ELSE COALESCE(NEW.raising -> 0, NEW.lowering -> 0)
    END;
    INSERT INTO public.lead_score_history (
      org_id, lead_id, score, tier, previous_score, previous_tier, cause, historic, rules_version, reason_text, reason_call_based
    ) VALUES (
      NEW.org_id, NEW.lead_id, NEW.score, NEW.tier,
      CASE WHEN TG_OP = 'UPDATE' THEN OLD.score END,
      CASE WHEN TG_OP = 'UPDATE' THEN OLD.tier END,
      NEW.cause, NEW.historic, NEW.rules_version,
      left(v_top ->> 'text', 200),
      COALESCE((v_top ->> 'callBased')::boolean, false)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lead_scores_sync ON public.lead_scores;
CREATE TRIGGER lead_scores_sync
  AFTER INSERT OR UPDATE ON public.lead_scores
  FOR EACH ROW EXECUTE FUNCTION public.assay_sync_lead_score();

CREATE OR REPLACE FUNCTION public.assay_tier_meaning(p_tier text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_tier
    WHEN 'hot' THEN 'Most likely to buy right now. Work this lead first.'
    WHEN 'warm' THEN 'Interested and engaged. Keep it moving.'
    WHEN 'cool' THEN 'Some interest, not much going on yet.'
    WHEN 'cold' THEN 'Little sign of buying right now.'
    ELSE NULL
  END;
$$;

-- A case file always carries the lead's Assay score and tier. Whatever else
-- writes the row, these three columns come from lead_scores.
CREATE OR REPLACE FUNCTION public.case_files_assay_band()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tier text;
  v_score integer;
BEGIN
  SELECT s.tier, s.score INTO v_tier, v_score FROM public.lead_scores s WHERE s.lead_id = NEW.lead_id AND s.org_id = NEW.org_id;
  NEW.band := public.assay_tier_label(v_tier);
  NEW.band_meaning := public.assay_tier_meaning(v_tier);
  NEW.score := v_score;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS case_files_assay_band ON public.case_files;
CREATE TRIGGER case_files_assay_band
  BEFORE INSERT OR UPDATE OF band, band_meaning, score ON public.case_files
  FOR EACH ROW EXECUTE FUNCTION public.case_files_assay_band();

-- Clear the legacy readiness values from case files until Assay scores them.
UPDATE public.case_files SET band = NULL WHERE band IS NOT NULL OR score IS NOT NULL OR band_meaning IS NOT NULL;

-- One reason line for older list views, as the caller may see it.
CREATE OR REPLACE FUNCTION public.assay_reason_line(p_org_id uuid, p_lead_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r ->> 'text'
  FROM public.lead_scores s,
    LATERAL jsonb_array_elements(s.raising || s.lowering) WITH ORDINALITY AS x(r, n)
  WHERE s.org_id = p_org_id AND s.lead_id = p_lead_id
    AND p_org_id IN (SELECT public.user_org_ids())
    AND (NOT COALESCE((r ->> 'callBased')::boolean, false)
      OR COALESCE(public.ws_can_see_transcripts(p_org_id), false)
      OR public.ws_is_staff(p_org_id))
  ORDER BY n
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.assay_reason_line(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assay_reason_line(uuid, uuid) TO authenticated, service_role;

-- The tiers as bands, for screens that list bands.
CREATE OR REPLACE FUNCTION public.assay_tier_bands(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v jsonb;
BEGIN
  BEGIN
    v := public.config_effective_at(p_org_id) -> 'values' -> 'assay.tiers';
  EXCEPTION WHEN OTHERS THEN
    v := NULL;
  END;
  RETURN jsonb_build_array(
    jsonb_build_object('name', 'Cold', 'min_score', 0, 'meaning', public.assay_tier_meaning('cold')),
    jsonb_build_object('name', 'Cool', 'min_score', COALESCE((v ->> 'cool')::numeric, 25), 'meaning', public.assay_tier_meaning('cool')),
    jsonb_build_object('name', 'Warm', 'min_score', COALESCE((v ->> 'warm')::numeric, 50), 'meaning', public.assay_tier_meaning('warm')),
    jsonb_build_object('name', 'Hot', 'min_score', COALESCE((v ->> 'hot')::numeric, 75), 'meaning', public.assay_tier_meaning('hot'))
  );
END;
$$;

REVOKE ALL ON FUNCTION public.assay_tier_bands(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assay_tier_bands(uuid) TO authenticated, service_role;

-- Reasons for one lead, as the caller may see them. Call-based reasons are
-- left out for people who cannot see this workspace's transcripts.
CREATE OR REPLACE FUNCTION public.assay_lead_score(p_org_id uuid, p_lead_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.lead_scores%ROWTYPE;
  v_calls boolean;
  v_hidden integer;
BEGIN
  IF p_org_id IS NULL OR p_org_id NOT IN (SELECT public.user_org_ids()) OR NOT public.ws_lead_visible(p_org_id, p_lead_id) THEN
    RAISE EXCEPTION 'Not found.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v FROM public.lead_scores WHERE org_id = p_org_id AND lead_id = p_lead_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  v_calls := COALESCE(public.ws_can_see_transcripts(p_org_id), false) OR public.ws_is_staff(p_org_id);
  SELECT count(*) INTO v_hidden
  FROM jsonb_array_elements(v.raising || v.lowering) r
  WHERE NOT v_calls AND COALESCE((r ->> 'callBased')::boolean, false);

  RETURN jsonb_build_object(
    'score', v.score,
    'tier', v.tier,
    'early', v.early,
    'contactable', v.contactable,
    'noCall', v.no_call,
    'callPending', v.call_pending,
    'parts', CASE WHEN v_calls THEN v.parts ELSE v.parts - 'call' || jsonb_build_object('call', (v.parts -> 'call') - 'hits') END,
    'raising', COALESCE((SELECT jsonb_agg(r) FROM jsonb_array_elements(v.raising) r WHERE v_calls OR NOT COALESCE((r ->> 'callBased')::boolean, false)), '[]'::jsonb),
    'lowering', COALESCE((SELECT jsonb_agg(r) FROM jsonb_array_elements(v.lowering) r WHERE v_calls OR NOT COALESCE((r ->> 'callBased')::boolean, false)), '[]'::jsonb),
    'hiddenCallReasons', v_hidden,
    'unclear', CASE WHEN v_calls THEN to_jsonb(v.unclear) ELSE '[]'::jsonb END,
    'notes', to_jsonb(v.notes),
    'rulesVersion', v.rules_version,
    'scoredAt', v.scored_at,
    'history', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'score', h.score, 'tier', h.tier, 'previousScore', h.previous_score, 'previousTier', h.previous_tier,
        'cause', h.cause, 'historic', h.historic, 'at', h.created_at,
        'reason', CASE WHEN h.reason_call_based AND NOT v_calls THEN NULL ELSE h.reason_text END
      ) ORDER BY h.created_at DESC)
      FROM (
        SELECT * FROM public.lead_score_history
        WHERE org_id = p_org_id AND lead_id = p_lead_id
        ORDER BY created_at DESC LIMIT 30
      ) h
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.assay_lead_score(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assay_lead_score(uuid, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. The scoring queue. Webhook receivers only add a row; scoring runs from
--    the queue. One pending row per lead and cause key.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.assay_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads (id) ON DELETE CASCADE,
  cause text NOT NULL CHECK (cause IN ('event', 'nightly', 'rules_change', 'rollback', 'history_import', 'migration', 'reopened', 'manual')),
  dedupe_key text NOT NULL CHECK (char_length(dedupe_key) <= 200),
  silent boolean NOT NULL DEFAULT false,
  event_at timestamptz,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'done', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  last_error text CHECK (last_error IS NULL OR char_length(last_error) <= 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, dedupe_key)
);

CREATE INDEX IF NOT EXISTS assay_jobs_pending_idx ON public.assay_jobs (next_attempt_at) WHERE status = 'pending';

COMMENT ON TABLE public.assay_jobs IS
  'Leads waiting to be rescored, and whole-workspace rescores. A replayed or duplicate event lands on the same dedupe key and is ignored.';
COMMENT ON COLUMN public.assay_jobs.last_error IS 'A short code. Never lead names, message text, or call content.';

ALTER TABLE public.assay_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.assay_jobs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assay_jobs TO service_role;

DROP TRIGGER IF EXISTS assay_jobs_set_updated_at ON public.assay_jobs;
CREATE TRIGGER assay_jobs_set_updated_at
  BEFORE UPDATE ON public.assay_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.assay_request_score(
  p_org_id uuid,
  p_lead_id uuid,
  p_cause text,
  p_dedupe_key text,
  p_silent boolean DEFAULT false,
  p_event_at timestamptz DEFAULT now()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.assay_jobs (org_id, lead_id, cause, dedupe_key, silent, event_at)
  VALUES (p_org_id, p_lead_id, p_cause, left(p_dedupe_key, 200), COALESCE(p_silent, false), p_event_at)
  ON CONFLICT (org_id, dedupe_key) DO NOTHING
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.assay_request_score(uuid, uuid, text, text, boolean, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assay_request_score(uuid, uuid, text, text, boolean, timestamptz) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. What Assay reads, and how it writes. Service role only. The reader
--    returns activity metadata: that something happened and when. It never
--    returns message text, call content, or a lead's name.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.assay_org_context(p_org_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'timezone', (SELECT o.timezone FROM public.organizations o WHERE o.id = p_org_id),
    'status', (SELECT o.status::text FROM public.organizations o WHERE o.id = p_org_id),
    'sources', COALESCE((
      SELECT jsonb_object_agg(s.source_key, jsonb_build_object('closed', s.closed, 'won', s.won))
      FROM (
        SELECT lower(btrim(l.source)) AS source_key,
          count(*) AS closed,
          count(*) FILTER (WHERE l.status = 'closed_won') AS won
        FROM public.leads l
        WHERE l.org_id = p_org_id AND NOT l.is_test AND l.merged_into IS NULL
          AND l.status IN ('closed_won', 'closed_lost')
          AND NULLIF(btrim(l.source), '') IS NOT NULL
        GROUP BY 1
      ) s
    ), '{}'::jsonb),
    -- Application answers the business mapped onto an approved input during onboarding.
    'profileFields', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('source', f ->> 'answer_key', 'input', f ->> 'factor'))
      FROM public.business_profiles bp, jsonb_array_elements(COALESCE(bp.application_fields, '[]'::jsonb)) f
      WHERE bp.org_id = p_org_id
        AND NULLIF(f ->> 'answer_key', '') IS NOT NULL
        AND NULLIF(f ->> 'factor', '') IS NOT NULL
    ), '[]'::jsonb),
    'closed', (SELECT count(*) FROM public.leads l WHERE l.org_id = p_org_id AND NOT l.is_test AND l.merged_into IS NULL AND l.status IN ('closed_won', 'closed_lost')),
    'won', (SELECT count(*) FROM public.leads l WHERE l.org_id = p_org_id AND NOT l.is_test AND l.merged_into IS NULL AND l.status = 'closed_won')
  );
$$;

CREATE OR REPLACE FUNCTION public.assay_lead_inputs(
  p_org_id uuid,
  p_lead_ids uuid[] DEFAULT NULL,
  p_after uuid DEFAULT NULL,
  p_limit integer DEFAULT 200
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(row_data ORDER BY lead_id), '[]'::jsonb)
  FROM (
    SELECT l.id AS lead_id, jsonb_build_object(
      'id', l.id,
      'status', l.status::text,
      'createdAt', l.created_at,
      'closedAt', l.closed_at,
      'updatedAt', l.updated_at,
      'source', NULLIF(btrim(l.source), ''),
      'offerName', NULLIF(btrim(l.offer_name), ''),
      'hasPhone', NULLIF(btrim(COALESCE(l.phone, '')), '') IS NOT NULL,
      'hasEmail', COALESCE(l.email, '') ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$',
      'emailSuppressed', EXISTS (SELECT 1 FROM public.lead_email_suppressions e WHERE e.org_id = l.org_id AND e.lead_id = l.id),
      'answers', l.application_answers,
      'doNotContact', l.do_not_contact,
      'optedOut', EXISTS (SELECT 1 FROM public.lead_opt_outs o WHERE o.org_id = l.org_id AND o.lead_id = l.id),
      'isTest', l.is_test,
      'historic', public.lead_is_historic(l.id),
      'previous', (
        SELECT jsonb_build_object('score', s.score, 'tier', s.tier, 'scoredAt', s.scored_at, 'inputsHash', s.inputs_hash)
        FROM public.lead_scores s WHERE s.lead_id = l.id AND s.org_id = l.org_id
      ),
      'touches', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', t.id, 'at', t.occurred_at, 'direction', t.direction::text, 'channel', t.channel::text, 'type', t.type::text) ORDER BY t.occurred_at)
        FROM (
          SELECT * FROM public.touches t0
          WHERE t0.org_id = l.org_id AND t0.lead_id = l.id
          ORDER BY t0.occurred_at DESC LIMIT 300
        ) t
      ), '[]'::jsonb),
      'calls', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', c.id, 'createdAt', c.created_at, 'scheduledAt', c.scheduled_at, 'occurredAt', c.occurred_at,
          'updatedAt', c.updated_at, 'outcome', c.outcome::text,
          'hasTranscript', c.raw_transcript IS NOT NULL OR c.transcript_arrived_at IS NOT NULL,
          'extractionPending', EXISTS (SELECT 1 FROM public.extraction_jobs j WHERE j.call_id = c.id AND j.status = 'pending')
        ) ORDER BY c.created_at)
        FROM public.calls c
        WHERE c.org_id = l.org_id AND c.lead_id = l.id
      ), '[]'::jsonb),
      'statusChanges', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', s.id, 'at', s.created_at, 'from', s.from_status::text, 'to', s.to_status::text) ORDER BY s.created_at)
        FROM public.lead_status_changes s
        WHERE s.org_id = l.org_id AND s.lead_id = l.id
      ), '[]'::jsonb),
      'facts', COALESCE((
        SELECT jsonb_object_agg(f.field_key, f.value)
        FROM public.case_file_fields f
        WHERE f.org_id = l.org_id AND f.lead_id = l.id AND f.state = 'present'
      ), '{}'::jsonb),
      'signals', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'callId', g.call_id, 'at', COALESCE(c.occurred_at, c.scheduled_at, g.created_at),
          'signal', g.signal, 'value', g.value, 'confidence', g.confidence, 'passageIds', to_jsonb(g.passage_ids)
        ) ORDER BY g.created_at)
        FROM public.call_signals g
        JOIN public.calls c ON c.id = g.call_id
        WHERE g.org_id = l.org_id AND g.lead_id = l.id
      ), '[]'::jsonb)
    ) AS row_data
    FROM public.leads l
    WHERE l.org_id = p_org_id
      AND l.merged_into IS NULL
      AND (p_lead_ids IS NULL OR l.id = ANY (p_lead_ids))
      AND (p_after IS NULL OR l.id > p_after)
    ORDER BY l.id
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 200), 1), 1000)
  ) rows;
$$;

CREATE OR REPLACE FUNCTION public.assay_write_scores(p_org_id uuid, p_rows jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  INSERT INTO public.lead_scores (
    lead_id, org_id, score, tier, early, contactable, no_call, call_pending, parts, raising, lowering,
    unclear, notes, rules_version, config_version, inputs_hash, cause, historic, as_of, scored_at
  )
  SELECT
    (r ->> 'leadId')::uuid, p_org_id, (r ->> 'score')::smallint, r ->> 'tier',
    COALESCE((r ->> 'early')::boolean, false), COALESCE((r ->> 'contactable')::boolean, true),
    COALESCE((r ->> 'noCall')::boolean, true), COALESCE((r ->> 'callPending')::boolean, false),
    COALESCE(r -> 'parts', '{}'::jsonb), COALESCE(r -> 'raising', '[]'::jsonb), COALESCE(r -> 'lowering', '[]'::jsonb),
    ARRAY(SELECT jsonb_array_elements_text(COALESCE(r -> 'unclear', '[]'::jsonb))),
    ARRAY(SELECT jsonb_array_elements_text(COALESCE(r -> 'notes', '[]'::jsonb))),
    r ->> 'rulesVersion', r ->> 'configVersion', r ->> 'inputsHash', r ->> 'cause',
    COALESCE((r ->> 'historic')::boolean, false), (r ->> 'asOf')::timestamptz, now()
  FROM jsonb_array_elements(p_rows) r
  JOIN public.leads l ON l.id = (r ->> 'leadId')::uuid AND l.org_id = p_org_id
  ON CONFLICT (lead_id) DO UPDATE SET
    score = EXCLUDED.score, tier = EXCLUDED.tier, early = EXCLUDED.early, contactable = EXCLUDED.contactable,
    no_call = EXCLUDED.no_call, call_pending = EXCLUDED.call_pending, parts = EXCLUDED.parts,
    raising = EXCLUDED.raising, lowering = EXCLUDED.lowering, unclear = EXCLUDED.unclear, notes = EXCLUDED.notes,
    rules_version = EXCLUDED.rules_version, config_version = EXCLUDED.config_version,
    inputs_hash = EXCLUDED.inputs_hash, cause = EXCLUDED.cause, historic = EXCLUDED.historic,
    as_of = EXCLUDED.as_of, scored_at = EXCLUDED.scored_at
  WHERE public.lead_scores.org_id = p_org_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.assay_finish_migration(p_org_id uuid, p_scored integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_after jsonb;
BEGIN
  SELECT jsonb_build_object(
    'open', count(*),
    'unscored', count(*) FILTER (WHERE s.lead_id IS NULL),
    'do_not_contact', count(*) FILTER (WHERE s.lead_id IS NOT NULL AND NOT s.contactable),
    'early', count(*) FILTER (WHERE s.early),
    'tiers', jsonb_build_object(
      'hot', count(*) FILTER (WHERE s.tier = 'hot'),
      'warm', count(*) FILTER (WHERE s.tier = 'warm'),
      'cool', count(*) FILTER (WHERE s.tier = 'cool'),
      'cold', count(*) FILTER (WHERE s.tier = 'cold')
    )
  )
  INTO v_after
  FROM public.leads l
  LEFT JOIN public.lead_scores s ON s.lead_id = l.id AND s.org_id = l.org_id
  WHERE l.org_id = p_org_id AND NOT l.is_test AND l.merged_into IS NULL
    AND l.status NOT IN ('closed_won', 'closed_lost');

  INSERT INTO public.assay_migration_runs (org_id, before_bands, before_counts)
  VALUES (p_org_id, '[]'::jsonb, '{}'::jsonb)
  ON CONFLICT (org_id) DO NOTHING;

  UPDATE public.assay_migration_runs
  SET after_counts = v_after, leads_scored = p_scored, finished_at = now()
  WHERE org_id = p_org_id;
  RETURN v_after;
END;
$$;

REVOKE ALL ON FUNCTION public.assay_org_context(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assay_lead_inputs(uuid, uuid[], uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assay_write_scores(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assay_finish_migration(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assay_org_context(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.assay_lead_inputs(uuid, uuid[], uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.assay_write_scores(uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.assay_finish_migration(uuid, integer) TO service_role;

-- Every workspace gets one silent first scoring, picked up by the queue.
INSERT INTO public.assay_jobs (org_id, lead_id, cause, dedupe_key, silent)
SELECT o.id, NULL, 'migration', 'migration:assay-v1', true
FROM public.organizations o
ON CONFLICT (org_id, dedupe_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 6. Retire the readiness score.
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS readiness_scores_sync_lead ON public.readiness_scores;

CREATE OR REPLACE FUNCTION public.readiness_scores_read_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'readiness_scores is read-only history. Assay scores live in lead_scores.';
END;
$$;

DROP TRIGGER IF EXISTS readiness_scores_read_only ON public.readiness_scores;
CREATE TRIGGER readiness_scores_read_only
  BEFORE INSERT ON public.readiness_scores
  FOR EACH ROW EXECUTE FUNCTION public.readiness_scores_read_only();

COMMENT ON TABLE public.readiness_scores IS
  'Read-only history of the retired readiness score. Assay scores live in lead_scores.';

-- The old field maps are frozen. New rows are dropped without error so older
-- provisioning paths keep working; Assay never reads these tables.
CREATE OR REPLACE FUNCTION public.score_field_maps_frozen()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS score_field_maps_frozen ON public.score_field_maps;
CREATE TRIGGER score_field_maps_frozen
  BEFORE INSERT OR UPDATE ON public.score_field_maps
  FOR EACH ROW EXECUTE FUNCTION public.score_field_maps_frozen();

DROP TRIGGER IF EXISTS score_field_rules_frozen ON public.score_field_rules;
CREATE TRIGGER score_field_rules_frozen
  BEFORE INSERT OR UPDATE ON public.score_field_rules
  FOR EACH ROW EXECUTE FUNCTION public.score_field_maps_frozen();

COMMENT ON TABLE public.score_field_maps IS
  'Retired. Frozen history of the readiness score''s field maps. Assay reads only its approved inputs (assay.field_map).';

-- Legacy reports that still compare a score with the ready line use Warm.
ALTER TABLE public.score_configs ALTER COLUMN ready_threshold SET DEFAULT 50;
UPDATE public.score_configs SET ready_threshold = 50 WHERE ready_threshold IS DISTINCT FROM 50;

-- The settings screen and calibration report that edited the old score are
-- retired. Their functions stay for the record but nobody can call them.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'save_org_score_config', 'apply_calibration_suggestion', 'preview_score_config_change',
        'load_calibration_report', 'replace_org_score_maps', 'refresh_calibration_suggestions'
      )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. Assay tasks join the task sources.
-- ---------------------------------------------------------------------------

ALTER TABLE public.next_actions DROP CONSTRAINT IF EXISTS next_actions_source_kind_check;
ALTER TABLE public.next_actions
  ADD CONSTRAINT next_actions_source_kind_check
  CHECK (source_kind IN ('person', 'sentry', 'scribe', 'playbook', 'booking', 'service_team', 'assay'));

-- ---------------------------------------------------------------------------
-- 7b. The scoring job is watched like every other job. The calibration job
--     retires with the readiness score.
-- ---------------------------------------------------------------------------

INSERT INTO public.ops_job_catalog (job_name, cron_expr, interval_seconds, grace_seconds, check_first)
VALUES (
  'assay',
  '* * * * *',
  60,
  300,
  'Open /api/cron/assay logs and assay_jobs in pending or failed. Confirm CRON_SECRET and that Vercel Cron still lists this path.'
)
ON CONFLICT (job_name) DO UPDATE SET cron_expr = EXCLUDED.cron_expr, interval_seconds = EXCLUDED.interval_seconds,
  grace_seconds = EXCLUDED.grace_seconds, check_first = EXCLUDED.check_first;

DELETE FROM public.ops_job_catalog WHERE job_name = 'calibration';

-- ---------------------------------------------------------------------------
-- 7c. Rescore on events. Every path that records something about a lead adds
--     at most one pending job for it; the queue scores it within a minute.
--     A lead from a history import is scored silently.
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS assay_jobs_one_pending_per_lead
  ON public.assay_jobs (org_id, lead_id)
  WHERE status = 'pending' AND lead_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.assay_enqueue(p_org_id uuid, p_lead_id uuid, p_key text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_silent boolean;
BEGIN
  IF p_org_id IS NULL OR p_lead_id IS NULL THEN
    RETURN;
  END IF;
  v_silent := public.lead_is_historic(p_lead_id);
  BEGIN
    INSERT INTO public.assay_jobs (org_id, lead_id, cause, dedupe_key, silent, event_at)
    VALUES (p_org_id, p_lead_id, CASE WHEN v_silent THEN 'history_import' ELSE 'event' END, left(p_key, 200), v_silent, now())
    ON CONFLICT (org_id, lead_id) WHERE status = 'pending' AND lead_id IS NOT NULL
    DO UPDATE SET
      silent = public.assay_jobs.silent AND EXCLUDED.silent,
      cause = CASE WHEN public.assay_jobs.silent AND EXCLUDED.silent THEN public.assay_jobs.cause ELSE 'event' END,
      next_attempt_at = LEAST(public.assay_jobs.next_attempt_at, now());
  EXCEPTION WHEN unique_violation THEN
    -- The same event again (a replay). It was already queued once.
    NULL;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.assay_enqueue(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assay_enqueue(uuid, uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.assay_on_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row record;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_row := OLD;
  ELSE
    v_row := NEW;
  END IF;
  CASE TG_TABLE_NAME
    WHEN 'leads' THEN
      PERFORM public.assay_enqueue(v_row.org_id, v_row.id, 'lead:' || v_row.id || ':' || TG_OP || ':' || txid_current());
    WHEN 'touches' THEN
      PERFORM public.assay_enqueue(v_row.org_id, v_row.lead_id, 'touch:' || v_row.id);
    WHEN 'calls' THEN
      PERFORM public.assay_enqueue(v_row.org_id, v_row.lead_id, 'call:' || v_row.id || ':' || txid_current());
    WHEN 'call_signals' THEN
      PERFORM public.assay_enqueue(v_row.org_id, v_row.lead_id, 'signals:' || v_row.call_id || ':' || txid_current());
    ELSE
      PERFORM public.assay_enqueue(v_row.org_id, v_row.lead_id, TG_TABLE_NAME || ':' || v_row.lead_id || ':' || txid_current());
  END CASE;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS assay_lead_created ON public.leads;
CREATE TRIGGER assay_lead_created
  AFTER INSERT ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.assay_on_event();

DROP TRIGGER IF EXISTS assay_lead_changed ON public.leads;
CREATE TRIGGER assay_lead_changed
  AFTER UPDATE OF status, do_not_contact, source, offer_name, application_answers, phone, email, merged_into ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.assay_on_event();

DROP TRIGGER IF EXISTS assay_touch ON public.touches;
CREATE TRIGGER assay_touch
  AFTER INSERT ON public.touches
  FOR EACH ROW EXECUTE FUNCTION public.assay_on_event();

DROP TRIGGER IF EXISTS assay_call ON public.calls;
CREATE TRIGGER assay_call
  AFTER INSERT OR UPDATE OF outcome, scheduled_at, occurred_at ON public.calls
  FOR EACH ROW EXECUTE FUNCTION public.assay_on_event();

DROP TRIGGER IF EXISTS assay_opt_out ON public.lead_opt_outs;
CREATE TRIGGER assay_opt_out
  AFTER INSERT OR DELETE ON public.lead_opt_outs
  FOR EACH ROW EXECUTE FUNCTION public.assay_on_event();

DROP TRIGGER IF EXISTS assay_case_fact ON public.case_file_fields;
CREATE TRIGGER assay_case_fact
  AFTER INSERT OR UPDATE OF value, state ON public.case_file_fields
  FOR EACH ROW EXECUTE FUNCTION public.assay_on_event();

DROP TRIGGER IF EXISTS assay_call_signal ON public.call_signals;
CREATE TRIGGER assay_call_signal
  AFTER INSERT OR UPDATE ON public.call_signals
  FOR EACH ROW EXECUTE FUNCTION public.assay_on_event();

-- A silent rescore of a whole workspace after its settings change (onboarding
-- answers, offers, rules). It never starts a task, alert, or draft.
CREATE OR REPLACE FUNCTION public.assay_request_workspace_rescore(p_org_id uuid, p_reason text DEFAULT 'manual')
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cause text := CASE WHEN p_reason IN ('rules_change', 'rollback') THEN p_reason ELSE 'manual' END;
BEGIN
  IF auth.uid() IS NOT NULL
    AND NOT public.user_has_org_role(p_org_id, 'owner', 'admin')
    AND NOT public.ws_is_staff(p_org_id) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.assay_jobs (org_id, lead_id, cause, dedupe_key, silent)
  VALUES (p_org_id, NULL, v_cause, 'workspace:' || v_cause || ':' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSUS'), true)
  ON CONFLICT (org_id, dedupe_key) DO NOTHING;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.assay_request_workspace_rescore(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assay_request_workspace_rescore(uuid, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8. Older readers that bypassed the caches now read Assay.
-- ---------------------------------------------------------------------------

-- The older queue view reads Assay's score, tier flags, and visible reasons. It was
-- dropped above with the earlier Assay build's tables, so its grant comes back too.
CREATE VIEW public.queue_rows
WITH (security_invoker = true) AS
SELECT
  l.id,
  l.org_id,
  COALESCE(
    NULLIF(btrim(concat_ws(' ', l.first_name, l.last_name)), ''),
    NULLIF(btrim(l.email), ''),
    'Unnamed lead'
  ) AS name,
  l.email,
  l.source,
  l.status,
  l.lead_type,
  ls.score::integer AS score,
  CASE WHEN ls.lead_id IS NULL THEN NULL WHEN ls.early THEN 'low' ELSE 'high' END AS score_confidence,
  CASE WHEN ls.lead_id IS NULL THEN 0 WHEN ls.early THEN 1 ELSE 2 END AS known_factor_count,
  public.assay_reason_line(l.org_id, l.id) AS score_reasoning,
  l.opted_in_at,
  l.last_touch_at,
  l.first_human_touch_at,
  l.assigned_setter_id,
  l.assigned_closer_id,
  setter.display_name AS assigned_setter_name,
  closer.display_name AS assigned_closer_name,
  l.ghl_contact_id,
  CASE
    WHEN o.ghl_location_id IS NOT NULL AND l.ghl_contact_id IS NOT NULL THEN
      'https://app.gohighlevel.com/v2/location/'
      || o.ghl_location_id
      || '/conversations/all?contactId='
      || l.ghl_contact_id
    ELSE NULL
  END AS crm_url,
  na.id AS next_action_id,
  na.action_text AS next_action_text,
  na.due_at AS next_action_due_at,
  (na.due_at IS NOT NULL AND na.due_at < now()) AS next_action_overdue,
  (
    l.first_human_touch_at IS NULL
    AND l.opted_in_at <= now() - make_interval(
      mins => COALESCE(sc.speed_to_lead_minutes, 15)
    )
  ) AS in_alarm,
  CASE
    WHEN l.first_human_touch_at IS NULL
      AND l.opted_in_at <= now() - make_interval(
        mins => COALESCE(sc.speed_to_lead_minutes, 15)
      )
    THEN EXTRACT(
      EPOCH FROM (
        now()
        - (
          l.opted_in_at
          + make_interval(mins => COALESCE(sc.speed_to_lead_minutes, 15))
        )
      )
    )::bigint
    ELSE NULL
  END AS breach_seconds,
  CASE
    WHEN l.first_human_touch_at IS NULL
      AND (l.lead_type = 'ready_track' OR l.lead_type IS NULL)
      THEN 1
    WHEN na.due_at IS NOT NULL AND na.due_at < now()
      THEN 2
    WHEN l.lead_type = 'ready_track'
      THEN 3
    WHEN l.lead_type = 'nurture_track'
      THEN 4
    WHEN l.ghost_approaching_at IS NOT NULL
      THEN 5
    ELSE NULL
  END AS urgency_rank,
  CASE
    WHEN l.lead_type IN ('ready_track', 'nurture_track')
      AND NOT (
        l.first_human_touch_at IS NULL
        AND (l.lead_type = 'ready_track' OR l.lead_type IS NULL)
      )
      AND NOT (na.due_at IS NOT NULL AND na.due_at < now())
      THEN COALESCE(ls.score::integer, -1)
    ELSE 0
  END AS sort_score,
  COALESCE(NULLIF(btrim(l.offer_name), ''), bp.offer_name) AS offer_name
FROM public.leads l
JOIN public.organizations o ON o.id = l.org_id
LEFT JOIN public.business_profiles bp ON bp.org_id = l.org_id
LEFT JOIN public.score_configs sc ON sc.org_id = l.org_id
LEFT JOIN public.org_members setter ON setter.id = l.assigned_setter_id
LEFT JOIN public.org_members closer ON closer.id = l.assigned_closer_id
LEFT JOIN public.lead_scores ls ON ls.lead_id = l.id AND ls.org_id = l.org_id
LEFT JOIN LATERAL (
  SELECT n.id, n.action_text, n.due_at
  FROM public.next_actions n
  WHERE n.lead_id = l.id
    AND n.org_id = l.org_id
    AND n.completed_at IS NULL
  ORDER BY n.due_at ASC NULLS LAST, n.created_at ASC
  LIMIT 1
) na ON true
WHERE NOT l.is_test;

GRANT SELECT ON public.queue_rows TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.queue_row_to_json(r public.queue_rows)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', r.id,
    'orgId', r.org_id,
    'name', r.name,
    'email', r.email,
    'source', r.source,
    'offerName', r.offer_name,
    'status', r.status,
    'leadType', r.lead_type,
    'score', r.score,
    'scoreConfidence', r.score_confidence,
    'knownFactorCount', r.known_factor_count,
    'scoreReasoning', r.score_reasoning,
    'optedInAt', r.opted_in_at,
    'lastTouchAt', r.last_touch_at,
    'firstHumanTouchAt', r.first_human_touch_at,
    'assignedSetterId', r.assigned_setter_id,
    'assignedCloserId', r.assigned_closer_id,
    'assignedSetterName', r.assigned_setter_name,
    'assignedCloserName', r.assigned_closer_name,
    'ghlContactId', r.ghl_contact_id,
    'crmUrl', r.crm_url,
    'nextAction', CASE
      WHEN r.next_action_id IS NULL THEN NULL
      ELSE jsonb_build_object(
        'id', r.next_action_id,
        'actionText', r.next_action_text,
        'dueAt', r.next_action_due_at,
        'overdue', r.next_action_overdue
      )
    END,
    'inAlarm', r.in_alarm,
    'breachSeconds', r.breach_seconds,
    'urgencyRank', r.urgency_rank,
    'sortScore', r.sort_score
  );
$$;

REVOKE ALL ON FUNCTION public.queue_row_to_json(public.queue_rows) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.queue_row_to_json(public.queue_rows) TO authenticated, service_role;

-- Lead search as it was before the earlier Assay build.
CREATE OR REPLACE FUNCTION public.search_visible_leads(p_org_id uuid, p_query text, p_limit integer DEFAULT 8)
RETURNS TABLE (id uuid, title text, detail text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT l.id,
    btrim(concat_ws(' ', l.first_name, l.last_name)),
    concat_ws(' · ', l.status, NULLIF(btrim(concat_ws(' ', setter.display_name, closer.display_name)), ''))
  FROM public.leads l
  LEFT JOIN public.org_members setter ON setter.id = l.assigned_setter_id
  LEFT JOIN public.org_members closer ON closer.id = l.assigned_closer_id
  WHERE l.org_id = p_org_id
    AND p_org_id IN (SELECT public.user_org_ids())
    AND public.ws_lead_visible(p_org_id, l.id)
    AND l.merged_into IS NULL
    AND (
      btrim(concat_ws(' ', l.first_name, l.last_name, l.email, l.source)) ILIKE '%' || btrim(p_query) || '%'
      OR (
        length(regexp_replace(p_query, '\D', '', 'g')) >= 3
        AND regexp_replace(COALESCE(l.phone, ''), '\D', '', 'g') LIKE '%' || regexp_replace(p_query, '\D', '', 'g') || '%'
      )
    )
  ORDER BY l.last_touch_at DESC NULLS LAST
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 8), 1), 20);
$$;

CREATE OR REPLACE FUNCTION public.load_case_experience(p_org_id uuid, p_filter jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
  v_window integer := LEAST(GREATEST(COALESCE((p_filter ->> 'windowMinutes')::integer, 15), 1), 10080);
  v_sort text := COALESCE(p_filter ->> 'sort', 'urgency');
  v_dir text := CASE WHEN p_filter ->> 'dir' = 'asc' THEN 'asc' ELSE 'desc' END;
  v_q text := NULLIF(btrim(COALESCE(p_filter ->> 'q', '')), '');
  v_offset integer := LEAST(GREATEST(COALESCE((p_filter ->> 'offset')::integer, 0), 0), 100000);
  v_rows jsonb;
BEGIN
  IF p_org_id IS NULL OR p_org_id NOT IN (SELECT public.user_org_ids()) THEN
    RAISE EXCEPTION 'not authorized for this organization' USING ERRCODE = '42501';
  END IF;
  IF v_sort NOT IN ('urgency', 'last_touch', 'readiness', 'created', 'name') THEN
    v_sort := 'urgency';
  END IF;

  WITH base AS (
    SELECT
      l.id,
      l.org_id,
      COALESCE(NULLIF(btrim(concat_ws(' ', l.first_name, l.last_name)), ''), NULLIF(btrim(l.email), ''), 'Unnamed lead') AS name,
      l.email,
      l.phone,
      l.source,
      l.status::text AS status,
      l.current_score AS score,
      l.opted_in_at,
      l.created_at,
      l.last_touch_at,
      l.first_human_touch_at,
      l.pipeline_stage,
      l.assigned_setter_id,
      l.assigned_closer_id,
      l.do_not_contact,
      setter.display_name AS setter_name,
      closer.display_name AS closer_name,
      cf.summary AS headline,
      public.assay_tier_label(ls.tier) AS band,
      cf.status AS file_status,
      cf.next_step,
      cf.built_at,
      EXISTS (SELECT 1 FROM public.lead_opt_outs o WHERE o.lead_id = l.id AND o.org_id = l.org_id) AS opted_out,
      CASE
        WHEN l.do_not_contact
          OR EXISTS (SELECT 1 FROM public.lead_opt_outs o WHERE o.lead_id = l.id AND o.org_id = l.org_id)
          OR l.status IN ('closed_won', 'closed_lost') THEN 'not_applicable'
        WHEN l.first_human_touch_at IS NOT NULL
          AND l.first_human_touch_at <= l.opted_in_at + make_interval(mins => v_window) THEN 'on_time'
        WHEN l.first_human_touch_at IS NOT NULL THEN 'missed'
        WHEN now() >= l.opted_in_at + make_interval(mins => v_window) THEN 'missed'
        WHEN now() >= l.opted_in_at + make_interval(mins => GREATEST(v_window * 7 / 10, 1)) THEN 'at_risk'
        ELSE 'on_time'
      END AS response_state,
      EXISTS (
        SELECT 1 FROM public.agent_activity_runs r
        WHERE r.org_id = l.org_id AND r.lead_id = l.id
          AND r.status IN ('queued', 'working', 'waiting_person', 'waiting_provider')
      ) AS agent_open,
      EXISTS (
        SELECT 1 FROM public.objections ob
        WHERE ob.org_id = l.org_id AND ob.lead_id = l.id AND NOT ob.resolved
      ) AS has_objection,
      (
        SELECT t.type::text FROM public.touches t
        WHERE t.org_id = l.org_id AND t.lead_id = l.id
        ORDER BY t.occurred_at DESC LIMIT 1
      ) AS last_touch_kind,
      (
        SELECT a.body FROM public.lead_plan_actions a
        WHERE a.org_id = l.org_id AND a.lead_id = l.id AND a.status = 'open'
        LIMIT 1
      ) AS person_action
    FROM public.leads l
    LEFT JOIN public.case_files cf ON cf.org_id = l.org_id AND cf.lead_id = l.id
    LEFT JOIN public.lead_scores ls ON ls.lead_id = l.id AND ls.org_id = l.org_id
    LEFT JOIN public.org_members setter ON setter.id = l.assigned_setter_id
    LEFT JOIN public.org_members closer ON closer.id = l.assigned_closer_id
    WHERE l.org_id = p_org_id
      AND NOT l.is_test
      AND l.merged_into IS NULL
  ), filtered AS (
    SELECT b.*,
      CASE b.response_state
        WHEN 'missed' THEN 0
        WHEN 'at_risk' THEN 1
        WHEN 'on_time' THEN 2
        ELSE 3
      END AS urgency_rank
    FROM base b
    WHERE (v_q IS NULL
        OR b.name ILIKE '%' || v_q || '%'
        OR COALESCE(b.email, '') ILIKE '%' || v_q || '%'
        OR COALESCE(b.phone, '') ILIKE '%' || v_q || '%'
        OR COALESCE(b.headline, '') ILIKE '%' || v_q || '%'
        OR EXISTS (
          SELECT 1 FROM public.lead_notes n
          WHERE n.org_id = b.org_id AND n.lead_id = b.id AND n.body ILIKE '%' || v_q || '%'
        ))
      AND (NULLIF(p_filter ->> 'status', '') IS NULL OR b.status = p_filter ->> 'status')
      AND (NULLIF(p_filter ->> 'source', '') IS NULL OR b.source = p_filter ->> 'source')
      AND (NULLIF(p_filter ->> 'assignee', '') IS NULL
        OR (p_filter ->> 'assignee' = 'unassigned' AND b.assigned_setter_id IS NULL AND b.assigned_closer_id IS NULL)
        OR (p_filter ->> 'assignee' = 'me' AND (b.assigned_setter_id::text = p_filter ->> 'memberId' OR b.assigned_closer_id::text = p_filter ->> 'memberId'))
        OR b.assigned_setter_id::text = p_filter ->> 'assignee'
        OR b.assigned_closer_id::text = p_filter ->> 'assignee')
      AND (NULLIF(p_filter ->> 'response', '') IS NULL OR b.response_state = p_filter ->> 'response')
      AND (COALESCE((p_filter ->> 'flagged')::boolean, false) = false OR b.agent_open OR b.file_status = 'needs_review' OR b.file_status = 'held')
      AND (COALESCE((p_filter ->> 'needsReview')::boolean, false) = false OR b.file_status IN ('needs_review', 'held'))
      AND (COALESCE((p_filter ->> 'unresolvedObjection')::boolean, false) = false OR b.has_objection)
      AND (COALESCE((p_filter ->> 'optOut')::boolean, false) = false OR b.opted_out OR b.do_not_contact)
      AND (NULLIF(p_filter ->> 'band', '') IS NULL OR lower(COALESCE(b.band, '')) = lower(p_filter ->> 'band')
        OR (p_filter ->> 'band' = 'unscored' AND b.score IS NULL AND b.band IS NULL))
      AND (NULLIF(p_filter ->> 'createdFrom', '') IS NULL OR b.created_at >= (p_filter ->> 'createdFrom')::timestamptz)
      AND (NULLIF(p_filter ->> 'createdTo', '') IS NULL OR b.created_at < ((p_filter ->> 'createdTo')::date + 1)::timestamptz)
      AND (NULLIF(p_filter ->> 'touchFrom', '') IS NULL OR b.last_touch_at >= (p_filter ->> 'touchFrom')::timestamptz)
      AND (NULLIF(p_filter ->> 'touchTo', '') IS NULL OR b.last_touch_at < ((p_filter ->> 'touchTo')::date + 1)::timestamptz)
      AND (NULLIF(p_filter ->> 'factKey', '') IS NULL OR EXISTS (
        SELECT 1 FROM public.case_file_fields f
        WHERE f.org_id = b.org_id AND f.lead_id = b.id AND f.field_key = p_filter ->> 'factKey'
          AND COALESCE(f.value #>> '{}', f.value::text) ILIKE '%' || COALESCE(p_filter ->> 'factValue', '') || '%'
      ))
      AND (NULLIF(p_filter ->> 'view', '') IS NULL
        OR (p_filter ->> 'view' = 'needs_attention' AND (b.response_state IN ('missed', 'at_risk') OR b.file_status IN ('needs_review', 'held')))
        OR (p_filter ->> 'view' = 'hot' AND lower(COALESCE(b.band, '')) = 'hot')
        OR (p_filter ->> 'view' = 'waiting' AND b.status = 'follow_up')
        OR (p_filter ->> 'view' = 'unassigned' AND b.assigned_setter_id IS NULL AND b.assigned_closer_id IS NULL)
        OR (p_filter ->> 'view' = 'agent_updated' AND b.built_at > now() - interval '2 days')
        OR (p_filter ->> 'view' = 'do_not_contact' AND (b.opted_out OR b.do_not_contact)))
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(page) - 'ord' ORDER BY page.ord), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT numbered.*
    FROM (
      SELECT filtered.*, row_number() OVER (
        ORDER BY
          CASE WHEN v_sort = 'urgency' AND v_dir = 'desc' THEN urgency_rank END ASC,
          CASE WHEN v_sort = 'urgency' AND v_dir = 'asc' THEN urgency_rank END DESC,
          CASE WHEN v_sort = 'readiness' AND v_dir = 'desc' THEN COALESCE(score, -1) END DESC,
          CASE WHEN v_sort = 'readiness' AND v_dir = 'asc' THEN COALESCE(score, -1) END ASC,
          CASE WHEN v_sort = 'created' AND v_dir = 'desc' THEN created_at END DESC,
          CASE WHEN v_sort = 'created' AND v_dir = 'asc' THEN created_at END ASC,
          CASE WHEN v_sort = 'name' AND v_dir = 'asc' THEN lower(name) END ASC,
          CASE WHEN v_sort = 'name' AND v_dir = 'desc' THEN lower(name) END DESC,
          CASE WHEN v_sort IN ('urgency', 'last_touch') AND v_dir = 'desc' THEN COALESCE(last_touch_at, '-infinity'::timestamptz) END DESC,
          CASE WHEN v_sort IN ('urgency', 'last_touch') AND v_dir = 'asc' THEN COALESCE(last_touch_at, 'infinity'::timestamptz) END ASC,
          id DESC
      ) AS ord
      FROM filtered
    ) numbered
    WHERE numbered.ord > v_offset AND numbered.ord <= v_offset + v_limit + 1
  ) page;

  v_rows := COALESCE(v_rows, '[]'::jsonb);
  RETURN jsonb_build_object(
    'rows', CASE WHEN jsonb_array_length(v_rows) > v_limit
      THEN (SELECT COALESCE(jsonb_agg(elem ORDER BY n), '[]'::jsonb) FROM jsonb_array_elements(v_rows) WITH ORDINALITY t(elem, n) WHERE n <= v_limit)
      ELSE v_rows END,
    'hasMore', jsonb_array_length(v_rows) > v_limit
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.case_view_counts(p_org_id uuid, p_window integer DEFAULT 15)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'needs_attention', count(*) FILTER (WHERE
      (l.do_not_contact IS FALSE AND NOT EXISTS (SELECT 1 FROM public.lead_opt_outs o WHERE o.lead_id = l.id)
        AND l.status NOT IN ('closed_won', 'closed_lost')
        AND l.first_human_touch_at IS NULL
        AND l.opted_in_at <= now() - make_interval(mins => GREATEST(p_window * 7 / 10, 1)))
      OR cf.status IN ('needs_review', 'held')),
    'hot', count(*) FILTER (WHERE ls.tier = 'hot'),
    'waiting', count(*) FILTER (WHERE l.status = 'follow_up'),
    'unassigned', count(*) FILTER (WHERE l.assigned_setter_id IS NULL AND l.assigned_closer_id IS NULL),
    'agent_updated', count(*) FILTER (WHERE cf.built_at > now() - interval '2 days'),
    'do_not_contact', count(*) FILTER (WHERE l.do_not_contact OR EXISTS (SELECT 1 FROM public.lead_opt_outs o WHERE o.lead_id = l.id))
  )
  FROM public.leads l
  LEFT JOIN public.case_files cf ON cf.org_id = l.org_id AND cf.lead_id = l.id
  LEFT JOIN public.lead_scores ls ON ls.lead_id = l.id AND ls.org_id = l.org_id
  WHERE l.org_id = p_org_id AND NOT l.is_test AND l.merged_into IS NULL
    AND p_org_id IN (SELECT public.user_org_ids());
$$;

CREATE OR REPLACE FUNCTION public.case_list_settings(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_values jsonb;
BEGIN
  IF p_org_id IS NULL OR p_org_id NOT IN (SELECT public.user_org_ids()) THEN
    RAISE EXCEPTION 'not authorized for this organization' USING ERRCODE = '42501';
  END IF;
  v_values := public.config_effective_at(p_org_id) -> 'values';
  RETURN jsonb_build_object(
    'windowMinutes', COALESCE((v_values ->> 'response.first_touch_minutes')::integer, 15),
    'timezone', COALESCE(v_values ->> 'identity.timezone', 'America/New_York'),
    'bands', public.assay_tier_bands(p_org_id),
    'facts', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('key', f ->> 'key', 'label', f ->> 'label'))
      FROM jsonb_array_elements(COALESCE(v_values -> 'industry.case_facts', '[]'::jsonb)) f
      WHERE COALESCE(f ->> 'key', '') <> ''
    ), '[]'::jsonb),
    'countedTouches', COALESCE(v_values -> 'response.counted_touch_types', '["call","text","email"]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_top_band(p_org_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT COALESCE(public.portal_can_see_results(p_org_id), false) THEN
    RAISE EXCEPTION 'Not found.' USING ERRCODE = '42501';
  END IF;
  RETURN 'Hot';
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_workspace_facts(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_people boolean;
  v_money boolean;
  v_out jsonb;
BEGIN
  PERFORM public.portal_assert_results(p_org_id);
  v_people := public.portal_can_see_people(p_org_id);
  v_money := public.portal_can_see_money(p_org_id);

  SELECT jsonb_build_object(
    'earliest_lead_at', (SELECT min(l.opted_in_at) FROM public.leads l WHERE l.org_id = p_org_id AND NOT l.is_test AND l.merged_into IS NULL),
    'has_leads', EXISTS (SELECT 1 FROM public.leads l WHERE l.org_id = p_org_id AND NOT l.is_test AND l.merged_into IS NULL),
    'has_response', EXISTS (SELECT 1 FROM public.sentry_clocks c WHERE c.org_id = p_org_id)
      OR EXISTS (SELECT 1 FROM public.sentry_measurements m WHERE m.org_id = p_org_id),
    'has_case_files', EXISTS (SELECT 1 FROM public.case_files cf WHERE cf.org_id = p_org_id),
    'has_bands', EXISTS (SELECT 1 FROM public.case_files cf WHERE cf.org_id = p_org_id AND cf.band IS NOT NULL),
    'has_stage_changes', EXISTS (SELECT 1 FROM public.lead_status_changes c WHERE c.org_id = p_org_id),
    'has_bookings', EXISTS (SELECT 1 FROM public.calls c WHERE c.org_id = p_org_id AND c.scheduled_at IS NOT NULL),
    'has_relay', EXISTS (SELECT 1 FROM public.relay_drafts d WHERE d.org_id = p_org_id AND NOT d.simulated),
    'has_alerts', EXISTS (SELECT 1 FROM public.sentry_alerts a WHERE a.org_id = p_org_id),
    'has_objections', EXISTS (SELECT 1 FROM public.objections o WHERE o.org_id = p_org_id),
    'has_revenue', v_money AND EXISTS (SELECT 1 FROM public.revenue_log r WHERE r.org_id = p_org_id AND r.kind <> 'failed'),
    'has_typed_revenue', v_money AND EXISTS (SELECT 1 FROM public.revenue_log r WHERE r.org_id = p_org_id AND r.lifecycle IS NOT NULL),
    'can_see_money', v_money,
    'can_see_people', v_people,
    'can_export', public.portal_can_export(p_org_id),
    'can_approve', public.ws_can_approve(p_org_id),
    'top_band', public.portal_top_band(p_org_id),
    'bands', public.assay_tier_bands(p_org_id),
    'first_touch_minutes', (public.config_effective_at(p_org_id)->'values'->>'response.first_touch_minutes')::numeric,
    'sources', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('key', s.key, 'label', s.label, 'count', s.n) ORDER BY s.n DESC)
      FROM (
        SELECT public.portal_source_key(l.source) AS key, COALESCE(max(NULLIF(btrim(l.source), '')), 'No source') AS label, count(*) AS n
        FROM public.leads l WHERE l.org_id = p_org_id AND NOT l.is_test AND l.merged_into IS NULL
        GROUP BY 1 ORDER BY 3 DESC LIMIT 100
      ) s
    ), '[]'::jsonb),
    'people', CASE WHEN v_people THEN COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', m.id, 'name', m.display_name, 'role', m.role, 'active', m.active) ORDER BY m.display_name)
      FROM public.org_members m
      WHERE m.org_id = p_org_id AND m.seat = 'customer'
        AND (m.active OR EXISTS (SELECT 1 FROM public.leads l WHERE l.org_id = p_org_id AND (l.assigned_setter_id = m.id OR l.assigned_closer_id = m.id)))
    ), '[]'::jsonb) ELSE NULL END,
    'fields', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('key', f.field_key, 'label', f.label, 'values', f.vals) ORDER BY f.label)
      FROM (
        SELECT x.field_key, max(x.label) AS label, jsonb_agg(DISTINCT lower(btrim(x.value #>> '{}'))) AS vals, count(DISTINCT lower(btrim(x.value #>> '{}'))) AS n
        FROM public.case_file_fields x
        WHERE x.org_id = p_org_id AND x.state = 'present' AND jsonb_typeof(x.value) = 'string'
          AND char_length(x.value #>> '{}') <= 60
        GROUP BY x.field_key
      ) f
      WHERE f.n BETWEEN 2 AND 25
    ), '[]'::jsonb)
  ) INTO v_out;
  RETURN v_out;
END;
$$;

CREATE OR REPLACE FUNCTION public.compass_find_leads(p_org_id uuid, p_filters jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 10)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  f jsonb := COALESCE(p_filters, '{}'::jsonb);
  v_access text := public.ws_access(p_org_id);
  v_me uuid := public.user_member_id(p_org_id);
  v_person text := NULLIF(f->>'person', '');
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 10), 1), 25);
  v_rows jsonb;
  v_total integer;
BEGIN
  IF v_access IS NULL THEN
    RAISE EXCEPTION 'Not found.' USING ERRCODE = '42501';
  END IF;
  -- Operators always see their own; nobody else picks a person unless they may see people.
  IF v_access = 'operator' THEN
    v_person := v_me::text;
  ELSIF v_person = 'me' THEN
    v_person := v_me::text;
  ELSIF v_person IS NOT NULL AND NOT public.portal_can_see_people(p_org_id) THEN
    v_person := NULL;
  END IF;

  WITH scope AS (
    SELECT l.id, l.first_name, l.last_name, l.status::text AS status, l.source, l.opted_in_at, l.first_human_touch_at,
      l.last_touch_at, l.do_not_contact, l.assigned_setter_id, l.assigned_closer_id, l.current_score,
      public.assay_tier_label(ls.tier) AS band, ls.score::integer AS score, cf.next_step, cf.status AS case_status,
      (SELECT c.state FROM public.sentry_clocks c
        WHERE c.org_id = l.org_id AND c.lead_id = l.id AND c.resolved_at IS NULL AND c.state IN ('on_time', 'at_risk', 'missed')
        ORDER BY CASE c.state WHEN 'missed' THEN 0 WHEN 'at_risk' THEN 1 ELSE 2 END LIMIT 1) AS response_state,
      EXISTS (SELECT 1 FROM public.lead_import_marks m WHERE m.lead_id = l.id AND m.reactivated_at IS NULL) AS historic
    FROM public.leads l
    LEFT JOIN public.case_files cf ON cf.org_id = l.org_id AND cf.lead_id = l.id
    LEFT JOIN public.lead_scores ls ON ls.lead_id = l.id AND ls.org_id = l.org_id
    WHERE l.org_id = p_org_id
      AND NOT l.is_test
      AND l.merged_into IS NULL
      AND (v_person IS NULL
        OR (v_person = 'unassigned' AND v_access <> 'operator' AND l.assigned_setter_id IS NULL AND l.assigned_closer_id IS NULL)
        OR l.assigned_setter_id::text = v_person OR l.assigned_closer_id::text = v_person)
      AND (NULLIF(f->>'name', '') IS NULL
        OR (COALESCE(l.first_name, '') || ' ' || COALESCE(l.last_name, '')) ILIKE '%' || replace(replace(f->>'name', '%', ''), '_', '') || '%')
      AND (NULLIF(f->>'stage', '') IS NULL OR l.status::text = f->>'stage')
      AND (NULLIF(f->>'source', '') IS NULL OR public.portal_source_key(l.source) = lower(btrim(f->>'source')))
      AND (NULLIF(f->>'band', '') IS NULL OR lower(COALESCE(public.assay_tier_label(ls.tier), '')) = lower(f->>'band'))
      AND (COALESCE((f->>'open_only')::boolean, true) = false OR l.status::text = ANY (public.portal_open_statuses()))
      AND (NULLIF(f->>'arrived_from', '') IS NULL OR l.opted_in_at >= (f->>'arrived_from')::timestamptz)
      AND (NULLIF(f->>'arrived_to', '') IS NULL OR l.opted_in_at < (f->>'arrived_to')::timestamptz)
      AND (NULLIF(f->>'quiet_days', '') IS NULL
        OR COALESCE(l.last_touch_at, l.opted_in_at) < now() - make_interval(days => (f->>'quiet_days')::integer))
      AND (NULLIF(f->>'field', '') IS NULL OR EXISTS (
        SELECT 1 FROM public.case_file_fields cff
        WHERE cff.org_id = l.org_id AND cff.lead_id = l.id AND cff.field_key = f->>'field' AND cff.state = 'present'
          AND (NULLIF(f->>'field_value', '') IS NULL OR lower(btrim(cff.value #>> '{}')) = lower(btrim(f->>'field_value')))
      ))
  ),
  filtered AS (
    SELECT * FROM scope s
    WHERE NULLIF(f->>'response', '') IS NULL OR s.response_state = f->>'response'
  )
  SELECT
    (SELECT count(*) FROM filtered),
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', x.id,
        'name', NULLIF(btrim(COALESCE(x.first_name, '') || ' ' || COALESCE(x.last_name, '')), ''),
        'stage', x.status,
        'band', x.band,
        'score', COALESCE(x.score, x.current_score),
        'source', x.source,
        'arrived_at', x.opted_in_at,
        'first_human_touch_at', x.first_human_touch_at,
        'last_touch_at', x.last_touch_at,
        'response', x.response_state,
        'do_not_contact', x.do_not_contact,
        'historic', x.historic,
        'next_step', left(x.next_step, 200),
        'assigned_to_me', v_me IN (x.assigned_setter_id, x.assigned_closer_id)
      ) ORDER BY
        CASE x.response_state WHEN 'missed' THEN 0 WHEN 'at_risk' THEN 1 ELSE 2 END,
        COALESCE(x.score, x.current_score, 0) DESC,
        x.last_touch_at ASC NULLS FIRST)
      FROM (SELECT * FROM filtered ORDER BY
        CASE response_state WHEN 'missed' THEN 0 WHEN 'at_risk' THEN 1 ELSE 2 END,
        COALESCE(score, current_score, 0) DESC, last_touch_at ASC NULLS FIRST LIMIT v_limit) x
    ), '[]'::jsonb)
  INTO v_total, v_rows;

  RETURN jsonb_build_object('total', v_total, 'rows', v_rows, 'operator_scope', v_access = 'operator');
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_business_profile_configuration(
  p_org_id uuid,
  p_member_id uuid,
  p_stage public.profile_stage
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.business_profiles%ROWTYPE;
  v_applied jsonb := '[]'::jsonb;
  v_soft integer;
  v_hard integer;
  v_factors public.score_factor[];
  v_w jsonb;
  v_share integer;
  v_sum integer;
  v_map_id uuid;
  r record;
  v_delay integer;
  v_len integer;
  v_dur integer;
BEGIN
  PERFORM public.profile_require_access(p_org_id);
  SELECT * INTO p FROM public.business_profiles WHERE org_id = p_org_id;
  IF p.org_id IS NULL THEN
    RETURN v_applied;
  END IF;

  IF p_stage = 'business' THEN
    IF p.sales_cycle_days IS NOT NULL THEN
      UPDATE public.organizations
      SET sales_cycle_days = LEAST(365, GREATEST(14, p.sales_cycle_days))
      WHERE id = p_org_id;
      v_applied := v_applied || jsonb_build_array('Cohort maturation now waits ' || p.sales_cycle_days || ' days.');

      v_soft := LEAST(90, GREATEST(3, ceil(p.sales_cycle_days / 4.0)::integer));
      v_hard := LEAST(180, GREATEST(v_soft + 1, ceil(p.sales_cycle_days / 2.0)::integer));
      UPDATE public.score_configs
      SET ghost_days_soft = v_soft, ghost_days_hard = v_hard
      WHERE org_id = p_org_id;
      v_applied := v_applied || jsonb_build_array(
        'Ghost thresholds set to ' || v_soft || ' and ' || v_hard || ' days.');
    END IF;

    IF p.touches_to_close IS NOT NULL OR p.sales_cycle_days IS NOT NULL THEN
      UPDATE public.follow_up_settings
      SET
        max_sequence_length = LEAST(8, GREATEST(1, ceil(COALESCE(p.touches_to_close, 6) / 2.0)::integer)),
        max_sequence_duration_days = LEAST(90, GREATEST(1, ceil(COALESCE(p.sales_cycle_days, 60) / 3.0)::integer))
      WHERE org_id = p_org_id;
      v_applied := v_applied || jsonb_build_array('Sequence length and duration paced to your cycle.');
    END IF;

    IF p.close_motion IS NOT NULL THEN
      v_delay := CASE p.close_motion WHEN 'one_call' THEN 24 WHEN 'two_call' THEN 48 ELSE 72 END;
      UPDATE public.follow_up_routing_rules
      SET sequence_steps = jsonb_build_array(jsonb_build_object('delayHours', v_delay))
      WHERE org_id = p_org_id AND branch = 'follow_up_scheduled';
      v_applied := v_applied || jsonb_build_array(
        'Post-call follow-up waits ' || v_delay || ' hours, matching a ' || p.close_motion || ' close.');
    END IF;

    IF p.payment_structure IS NOT NULL THEN
      SELECT max_sequence_length, max_sequence_duration_days
      INTO v_len, v_dur
      FROM public.follow_up_settings WHERE org_id = p_org_id;
      v_len := COALESCE(v_len, 3);
      v_dur := COALESCE(v_dur, 21);
      IF p.payment_structure = 'pif' THEN
        v_len := GREATEST(1, v_len - 1);
        v_dur := GREATEST(1, ceil(v_dur * 0.75)::integer);
      ELSIF p.payment_structure IN ('plan', 'bnpl') THEN
        v_len := LEAST(8, v_len + 1);
        v_dur := LEAST(90, ceil(v_dur * 1.25)::integer);
      END IF;
      UPDATE public.follow_up_settings
      SET max_sequence_length = v_len, max_sequence_duration_days = v_dur
      WHERE org_id = p_org_id;
      v_applied := v_applied || jsonb_build_array(
        'Sequence pacing adjusted for a ' || replace(p.payment_structure::text, '_', ' ')
        || ' payment structure.');
    END IF;
  END IF;

  IF p_stage = 'funnel' THEN
    -- Assay reads application answers only where they map onto an approved
    -- input (assay_org_context passes these mappings to the scorer).
    v_applied := v_applied || jsonb_build_array(
      'Application answers Assay reads: '
      || COALESCE((SELECT string_agg(f ->> 'answer_key', ', ')
                   FROM jsonb_array_elements(p.application_fields) f
                   WHERE nullif(f ->> 'factor', '') IS NOT NULL), 'none yet') || '.');
  END IF;

  IF p_stage = 'qualification' THEN
    SELECT array_agg(DISTINCT public.profile_signal_factor(s))
    INTO v_factors
    FROM unnest(p.qualification_signals) AS s
    WHERE public.profile_signal_factor(s) IS NOT NULL;

    IF v_factors IS NOT NULL AND array_length(v_factors, 1) > 0 THEN
      v_share := (60 / array_length(v_factors, 1))::integer;
      v_w := jsonb_build_object(
        'timeline', 10 + CASE WHEN 'timeline' = ANY (v_factors) THEN v_share ELSE 0 END,
        'investment_capacity', 10 + CASE WHEN 'investment_capacity' = ANY (v_factors) THEN v_share ELSE 0 END,
        'decision_authority', 10 + CASE WHEN 'decision_authority' = ANY (v_factors) THEN v_share ELSE 0 END,
        'pain_severity', 10 + CASE WHEN 'pain_severity' = ANY (v_factors) THEN v_share ELSE 0 END
      );
      v_sum := (v_w ->> 'timeline')::integer + (v_w ->> 'investment_capacity')::integer
        + (v_w ->> 'decision_authority')::integer + (v_w ->> 'pain_severity')::integer;
      -- Integer division leaves a remainder. It lands on timeline so the four
      -- weights total exactly 100, which the table constraint requires.
      v_w := jsonb_set(v_w, '{timeline}', to_jsonb((v_w ->> 'timeline')::integer + (100 - v_sum)));

      UPDATE public.score_configs SET
        timeline_weight = (v_w ->> 'timeline')::integer,
        investment_capacity_weight = (v_w ->> 'investment_capacity')::integer,
        decision_authority_weight = (v_w ->> 'decision_authority')::integer,
        pain_severity_weight = (v_w ->> 'pain_severity')::integer
      WHERE org_id = p_org_id;

      v_applied := v_applied || jsonb_build_array(
        'Scoring weights set to timeline ' || (v_w ->> 'timeline')
        || ', investment ' || (v_w ->> 'investment_capacity')
        || ', authority ' || (v_w ->> 'decision_authority')
        || ', pain ' || (v_w ->> 'pain_severity') || '.');
    END IF;

    -- Investment and timeline bands become answer rules on the fields the
    -- application already sends.
    FOR r IN
      SELECT 'investment_capacity'::public.score_factor AS factor, 'budget' AS field, p.price_bands AS bands
      UNION ALL
      SELECT 'timeline'::public.score_factor, 'timeline', p.timeline_bands
    LOOP
      CONTINUE WHEN jsonb_array_length(r.bands) = 0;

      INSERT INTO public.score_field_maps (org_id, field_name, factor)
      VALUES (p_org_id, r.field, r.factor)
      ON CONFLICT (org_id, field_name) DO UPDATE SET factor = EXCLUDED.factor
      RETURNING id INTO v_map_id;

      IF v_map_id IS NULL THEN
        SELECT id INTO v_map_id FROM public.score_field_maps
        WHERE org_id = p_org_id AND field_name = r.field;
      END IF;

      DELETE FROM public.score_field_rules WHERE field_map_id = v_map_id;
      INSERT INTO public.score_field_rules (org_id, field_map_id, kind, answer_value, score)
      SELECT p_org_id, v_map_id, 'choice', b ->> 'answer',
        LEAST(100, GREATEST(0, (b ->> 'score')::integer))
      FROM jsonb_array_elements(r.bands) b
      WHERE nullif(b ->> 'answer', '') IS NOT NULL AND nullif(b ->> 'score', '') IS NOT NULL;

      v_applied := v_applied || jsonb_build_array(
        jsonb_array_length(r.bands) || ' bands written onto the ' || r.field || ' field.');
    END LOOP;
  END IF;

  IF p_stage = 'process' THEN
    IF p.speed_to_lead_intent_minutes IS NOT NULL THEN
      UPDATE public.score_configs
      SET speed_to_lead_minutes = LEAST(1440, GREATEST(1, p.speed_to_lead_intent_minutes))
      WHERE org_id = p_org_id;
      v_applied := v_applied || jsonb_build_array(
        'The alarm band now fires at ' || p.speed_to_lead_intent_minutes || ' minutes.');
    END IF;

    -- Deduplication. A branch the CRM already runs is switched off here so the
    -- prospect does not get the same nudge twice.
    FOR r IN
      SELECT 'no_show'::public.follow_up_branch AS branch, p.after_no_show AS current, 'a no-show' AS label
      UNION ALL SELECT 'follow_up_scheduled', p.after_call, 'a call'
      UNION ALL SELECT 'ghost_risk', p.after_silence, 'silence'
    LOOP
      CONTINUE WHEN r.current IS NULL;
      UPDATE public.follow_up_routing_rules
      SET enabled = (r.current <> 'crm_sequence')
      WHERE org_id = p_org_id AND branch = r.branch;
      v_applied := v_applied || jsonb_build_array(
        CASE WHEN r.current = 'crm_sequence'
          THEN 'Your CRM already follows up after ' || r.label || ', so Vistrial will not.'
          ELSE 'Vistrial will draft follow-up after ' || r.label || '.' END);
    END LOOP;
  END IF;

  IF p_stage = 'objections' THEN
    DELETE FROM public.objection_vocabulary WHERE org_id = p_org_id;
    INSERT INTO public.objection_vocabulary (org_id, type, phrasing, response, rank)
    SELECT DISTINCT ON ((o ->> 'type')::public.objection_type)
      p_org_id,
      (o ->> 'type')::public.objection_type,
      o ->> 'phrasing',
      nullif(o ->> 'response', ''),
      ord
    FROM jsonb_array_elements(p.top_objections) WITH ORDINALITY AS t(o, ord)
    WHERE nullif(o ->> 'type', '') IS NOT NULL AND nullif(trim(o ->> 'phrasing'), '') IS NOT NULL
    ORDER BY (o ->> 'type')::public.objection_type, ord;
    v_applied := v_applied || jsonb_build_array(
      (SELECT count(*) FROM public.objection_vocabulary WHERE org_id = p_org_id)
      || ' objections seeded before a single transcript has arrived.');
  END IF;

  IF p_stage = 'voice' THEN
    UPDATE public.org_voice_profiles SET
      formality = COALESCE(p.voice_formality, formality),
      banned_words = CASE
        WHEN array_length(p.never_say, 1) IS NULL THEN banned_words
        ELSE ARRAY(SELECT DISTINCT unnest(p.never_say)) END
    WHERE org_id = p_org_id;

    IF p.channel_preference IS NOT NULL THEN
      UPDATE public.follow_up_settings
      SET default_channel = p.channel_preference::public.touch_channel
      WHERE org_id = p_org_id;
      UPDATE public.follow_up_routing_rules
      SET channel = p.channel_preference::public.touch_channel
      WHERE org_id = p_org_id;
    END IF;

    v_applied := v_applied || jsonb_build_array(
      'Voice profile set to ' || COALESCE(p.voice_formality::text, 'unchanged')
      || ' on ' || COALESCE(p.channel_preference, 'the existing channel') || '.');
  END IF;

  PERFORM public.business_profile_refresh_completeness(p_org_id);
  PERFORM public.benchmark_refresh_org_metrics(p_org_id);

  RETURN v_applied;
END;
$$;

-- Registry copy with Assay's settings, without the retired readiness keys.
-- config-registry:begin (generated from src/lib/config; do not edit by hand)
INSERT INTO public.config_fields (key, section, field_type, label, required, workspace_only, default_lock, tighten, owner_editable, rules, sort_order) VALUES
  ('identity.business_name', 'identity', 'text', 'Business name', true, true, false, NULL, NULL, $cfg${"minLength":2,"maxLength":120}$cfg$::jsonb, 1),
  ('identity.display_name', 'identity', 'text', 'Name used in messages', true, true, false, NULL, NULL, $cfg${"minLength":2,"maxLength":80}$cfg$::jsonb, 2),
  ('identity.timezone', 'identity', 'choice', 'Time zone', true, false, false, NULL, NULL, $cfg${"timezone":true}$cfg$::jsonb, 3),
  ('identity.business_hours', 'identity', 'schedule', 'Business hours', true, false, false, NULL, 'when_allowed', $cfg${}$cfg$::jsonb, 4),
  ('identity.owners_can_edit_hours', 'identity', 'boolean', 'Owners can change business hours', false, false, false, NULL, NULL, $cfg${}$cfg$::jsonb, 5),
  ('identity.primary_contact', 'identity', 'key_value', 'Primary contact', true, true, false, NULL, 'always', $cfg${"valueType":"text","keys":["name","email","phone"]}$cfg$::jsonb, 6),
  ('identity.escalation_contact', 'identity', 'key_value', 'Escalation contact', false, true, false, NULL, NULL, $cfg${"valueType":"text","keys":["name","email","phone"]}$cfg$::jsonb, 7),
  ('qualification.ready_criteria', 'qualification', 'list', 'Ready to buy when', true, false, false, NULL, NULL, $cfg${"minItems":1,"maxItems":30,"itemMaxLength":200}$cfg$::jsonb, 8),
  ('qualification.not_ready_criteria', 'qualification', 'list', 'Needs nurturing when', false, false, false, NULL, NULL, $cfg${"maxItems":30,"itemMaxLength":200}$cfg$::jsonb, 9),
  ('qualification.disqualifiers', 'qualification', 'list', 'Stop pursuing when', false, false, false, NULL, NULL, $cfg${"maxItems":30,"itemFields":[{"key":"reason","type":"text","required":true,"maxLength":200},{"key":"closing_message","type":"long_text","maxLength":600}]}$cfg$::jsonb, 10),
  ('qualification.minimum_info', 'qualification', 'list', 'Must know before qualifying', false, false, false, NULL, NULL, $cfg${"maxItems":20,"itemMaxLength":60}$cfg$::jsonb, 11),
  ('response.first_touch_minutes', 'response', 'duration', 'First touch within', true, false, false, NULL, NULL, $cfg${"min":1,"max":10080,"integer":true}$cfg$::jsonb, 12),
  ('response.follow_up_cadence', 'response', 'list', 'Longest gap between touches, by stage', false, false, false, NULL, NULL, $cfg${"maxItems":12,"uniqueBy":"stage","itemFields":[{"key":"stage","type":"choice","required":true,"options":["new","working","call_booked","follow_up","objection_hold","no_show","ghost"]},{"key":"max_gap_hours","type":"number","required":true,"min":1,"max":2160}]}$cfg$::jsonb, 13),
  ('response.after_hours', 'response', 'choice', 'Outside business hours', true, false, false, NULL, NULL, $cfg${"options":["pause","keep_running","separate_window"]}$cfg$::jsonb, 14),
  ('response.after_hours_window_minutes', 'response', 'duration', 'After-hours window', false, false, false, NULL, NULL, $cfg${"min":15,"max":10080,"integer":true}$cfg$::jsonb, 15),
  ('response.counted_touch_types', 'response', 'multi_choice', 'Counts as a human touch', true, false, false, NULL, NULL, $cfg${"minItems":1,"options":["call","text","email"]}$cfg$::jsonb, 16),
  ('response.relay_counts_as_human_touch', 'response', 'boolean', 'An approved Relay message counts as a human touch', false, false, false, NULL, NULL, $cfg${}$cfg$::jsonb, 17),
  ('response.warning_threshold_percent', 'response', 'number', 'Nudge at', false, false, false, NULL, NULL, $cfg${"min":50,"max":95,"integer":true}$cfg$::jsonb, 18),
  ('response.ghost_days_soft', 'response', 'number', 'Going quiet after', true, false, false, NULL, NULL, $cfg${"min":1,"max":365,"integer":true}$cfg$::jsonb, 19),
  ('response.ghost_days_hard', 'response', 'number', 'Gone quiet after', true, false, false, NULL, NULL, $cfg${"min":2,"max":365,"integer":true}$cfg$::jsonb, 20),
  ('response.max_sequence_length', 'response', 'number', 'Most follow-ups in a row', false, false, false, NULL, NULL, $cfg${"min":1,"max":8,"integer":true}$cfg$::jsonb, 21),
  ('response.max_sequence_days', 'response', 'number', 'Follow-up runs for at most', false, false, false, NULL, NULL, $cfg${"min":1,"max":90,"integer":true}$cfg$::jsonb, 22),
  ('response.draft_stale_days', 'response', 'number', 'Unapproved drafts expire after', false, false, false, NULL, NULL, $cfg${"min":1,"max":14,"integer":true}$cfg$::jsonb, 23),
  ('response.quiet_lead_hours', 'response', 'number', 'A lead is quiet after', false, false, false, NULL, NULL, $cfg${"min":1,"max":720,"integer":true}$cfg$::jsonb, 24),
  ('response.untouched_window_days', 'response', 'number', 'Look back for untouched leads', false, false, false, NULL, NULL, $cfg${"min":1,"max":30,"integer":true}$cfg$::jsonb, 25),
  ('response.no_show_window_days', 'response', 'number', 'Rebook no-shows within', false, false, false, NULL, NULL, $cfg${"min":1,"max":60,"integer":true}$cfg$::jsonb, 26),
  ('tone.formality', 'tone', 'choice', 'Formality', true, false, false, NULL, NULL, $cfg${"options":["formal","friendly","casual"]}$cfg$::jsonb, 27),
  ('tone.use_contractions', 'tone', 'boolean', 'Use contractions', false, false, false, NULL, NULL, $cfg${}$cfg$::jsonb, 28),
  ('tone.sender_identity', 'tone', 'text', 'Messages come from', false, false, false, NULL, NULL, $cfg${"maxLength":80}$cfg$::jsonb, 29),
  ('tone.greeting', 'tone', 'text', 'Greeting', false, false, false, NULL, NULL, $cfg${"maxLength":60}$cfg$::jsonb, 30),
  ('tone.sign_off', 'tone', 'text', 'Sign-off', false, false, false, NULL, NULL, $cfg${"maxLength":80}$cfg$::jsonb, 31),
  ('tone.sms_max_chars', 'tone', 'number', 'Longest text message', true, false, false, NULL, NULL, $cfg${"min":40,"max":480,"integer":true}$cfg$::jsonb, 32),
  ('tone.email_max_chars', 'tone', 'number', 'Longest email', true, false, false, NULL, NULL, $cfg${"min":120,"max":4000,"integer":true}$cfg$::jsonb, 33),
  ('tone.emoji', 'tone', 'choice', 'Emoji', false, false, false, NULL, NULL, $cfg${"options":["never","sparing","natural"]}$cfg$::jsonb, 34),
  ('tone.punctuation_rules', 'tone', 'long_text', 'Punctuation rules', false, false, false, NULL, NULL, $cfg${"maxLength":500}$cfg$::jsonb, 35),
  ('tone.language', 'tone', 'choice', 'Language and spelling', false, false, false, NULL, NULL, $cfg${"options":["en-US","en-GB","en-CA","en-AU","es-US"]}$cfg$::jsonb, 36),
  ('tone.preferred_terms', 'tone', 'list', 'Words to use', false, false, false, NULL, NULL, $cfg${"maxItems":50,"itemMaxLength":80}$cfg$::jsonb, 37),
  ('tone.banned_terms', 'tone', 'list', 'Words and phrases to avoid', false, false, false, NULL, NULL, $cfg${"maxItems":200,"itemMaxLength":120}$cfg$::jsonb, 38),
  ('tone.examples', 'tone', 'list', 'Example messages', false, false, false, NULL, NULL, $cfg${"maxItems":10,"itemFields":[{"key":"channel","type":"choice","required":true,"options":["sms","email"]},{"key":"body","type":"long_text","required":true,"maxLength":2000}]}$cfg$::jsonb, 39),
  ('industry.business_description', 'industry', 'text', 'What kind of business this is', true, false, false, NULL, NULL, $cfg${"minLength":5,"maxLength":200}$cfg$::jsonb, 40),
  ('industry.offers', 'industry', 'list', 'What the business sells', true, false, false, NULL, NULL, $cfg${"minItems":1,"maxItems":50,"uniqueBy":"name","itemFields":[{"key":"name","type":"text","required":true,"maxLength":100},{"key":"ticket_min","type":"number","min":0,"max":10000000},{"key":"ticket_max","type":"number","min":0,"max":10000000},{"key":"recurring","type":"boolean"}]}$cfg$::jsonb, 41),
  ('industry.case_facts', 'industry', 'list', 'Case-file facts', true, false, false, NULL, NULL, $cfg${"minItems":1,"maxItems":40,"uniqueBy":"key","itemFields":[{"key":"key","type":"text","required":true,"maxLength":60},{"key":"label","type":"text","required":true,"maxLength":80},{"key":"type","type":"choice","required":true,"options":["text","number","choice","yes_no","date"]},{"key":"required","type":"boolean"}]}$cfg$::jsonb, 42),
  ('industry.urgency_signals', 'industry', 'list', 'Act-now signals', false, false, false, NULL, NULL, $cfg${"maxItems":50,"itemMaxLength":120}$cfg$::jsonb, 43),
  ('industry.compass_questions', 'industry', 'list', 'Compass starter questions', false, false, false, NULL, NULL, $cfg${"maxItems":20,"uniqueBy":"question","itemFields":[{"key":"question","type":"text","required":true,"maxLength":160},{"key":"audience","type":"choice","required":true,"options":["everyone","managers","operators"]}]}$cfg$::jsonb, 44),
  ('industry.objections', 'industry', 'list', 'Objection library', false, false, false, NULL, NULL, $cfg${"maxItems":200,"uniqueBy":"label","itemFields":[{"key":"label","type":"text","required":true,"maxLength":80},{"key":"category","type":"choice","required":true,"options":["price","timing","spouse_partner","trust","fit","competitor","other"]},{"key":"recognize","type":"long_text","maxLength":500},{"key":"guidance","type":"long_text","maxLength":1000}]}$cfg$::jsonb, 45),
  ('industry.lead_sources', 'industry', 'list', 'Lead sources', false, false, false, NULL, NULL, $cfg${"maxItems":30,"uniqueBy":"source","itemFields":[{"key":"source","type":"text","required":true,"maxLength":80},{"key":"priority","type":"choice","required":true,"options":["high","normal","low"]},{"key":"treatment","type":"text","maxLength":300}]}$cfg$::jsonb, 46),
  ('escalation.levels', 'escalation', 'list', 'Who hears about what', true, false, false, NULL, NULL, $cfg${"minItems":1,"maxItems":8,"itemFields":[{"key":"severity","type":"choice","required":true,"options":["info","warning","urgent","critical"]},{"key":"trigger","type":"text","required":true,"maxLength":200},{"key":"after_windows","type":"number","min":1,"max":20},{"key":"notify","type":"multi_choice","required":true,"options":["assignee","setters","closers","managers","service_team"]},{"key":"channels","type":"multi_choice","required":true,"options":["push","email","sms","team_channel","discord"]}]}$cfg$::jsonb, 47),
  ('escalation.quiet_hours', 'escalation', 'choice', 'Quiet hours for the team', false, false, false, NULL, NULL, $cfg${"options":["outside_business_hours","none"]}$cfg$::jsonb, 48),
  ('escalation.urgent_exception', 'escalation', 'choice', 'Break quiet hours for', false, false, false, NULL, NULL, $cfg${"options":["critical","urgent_and_critical","none"]}$cfg$::jsonb, 49),
  ('escalation.unacknowledged_minutes', 'escalation', 'duration', 'If no one acknowledges within', false, false, false, NULL, NULL, $cfg${"min":5,"max":1440,"integer":true}$cfg$::jsonb, 50),
  ('escalation.unacknowledged_next', 'escalation', 'choice', 'Then tell', false, false, false, NULL, NULL, $cfg${"options":["assignee","setters","closers","managers","service_team"]}$cfg$::jsonb, 51),
  ('approval.actions', 'approval', 'list', 'What needs approval', true, false, false, NULL, NULL, $cfg${"minItems":1,"maxItems":30,"uniqueBy":"action","itemFields":[{"key":"action","type":"choice","required":true,"options":["first_reply","quiet_lead_follow_up","no_show_rebook","client_report","crm_stage_change","setter_nudge","owner_escalation","slack_post","discord_post","drive_store","send_text","send_email","create_asset"]},{"key":"mode","type":"choice","required":true,"options":["ask_first","auto_run","off"]},{"key":"approver","type":"choice","required":true,"options":["owners_and_managers","owner_only","assigned"]},{"key":"max_wait_minutes","type":"number","min":15,"max":10080},{"key":"auto_run_confirmed","type":"boolean"}]}$cfg$::jsonb, 52),
  ('approval.never_auto', 'approval', 'multi_choice', 'Always needs approval', false, false, true, 'superset_list', NULL, $cfg${"options":["first_reply","quiet_lead_follow_up","no_show_rebook","client_report","crm_stage_change","setter_nudge","owner_escalation","slack_post","discord_post","drive_store","send_text","send_email","create_asset"]}$cfg$::jsonb, 53),
  ('approval.timeout_minutes', 'approval', 'duration', 'Waiting too long after', false, false, false, NULL, NULL, $cfg${"min":15,"max":10080,"integer":true}$cfg$::jsonb, 54),
  ('approval.timeout_behavior', 'approval', 'choice', 'When no one approves in time', false, false, false, NULL, NULL, $cfg${"options":["nothing","escalate","proceed"]}$cfg$::jsonb, 55),
  ('approval.timeout_proceed_confirmed', 'approval', 'boolean', 'I understand waiting items will proceed without approval', false, false, false, NULL, NULL, $cfg${}$cfg$::jsonb, 56),
  ('integrations.crm', 'integrations', 'reference', 'CRM', false, false, false, NULL, NULL, $cfg${"referenceKinds":["integration"]}$cfg$::jsonb, 57),
  ('integrations.messaging_numbers', 'integrations', 'list', 'Messaging numbers', false, false, false, NULL, NULL, $cfg${"maxItems":20,"uniqueBy":"number","itemFields":[{"key":"label","type":"text","required":true,"maxLength":60},{"key":"number","type":"text","required":true,"maxLength":20},{"key":"provider","type":"choice","required":true,"options":["crm","telnyx"]},{"key":"sender_name","type":"text","maxLength":60}]}$cfg$::jsonb, 58),
  ('integrations.calendar', 'integrations', 'reference', 'Calendar', false, false, false, NULL, NULL, $cfg${"referenceKinds":["integration"]}$cfg$::jsonb, 59),
  ('integrations.email_domain', 'integrations', 'text', 'Email sending domain', false, false, false, NULL, NULL, $cfg${"maxLength":120,"pattern":"^$|^([a-z0-9-]+\\.)+[a-z]{2,}$"}$cfg$::jsonb, 60),
  ('integrations.chat_channels', 'integrations', 'list', 'Chat channels', false, false, false, NULL, NULL, $cfg${"maxItems":10,"itemFields":[{"key":"label","type":"text","required":true,"maxLength":60},{"key":"kind","type":"choice","required":true,"options":["slack","discord","teams"]},{"key":"connection_id","type":"text","required":true,"maxLength":64}]}$cfg$::jsonb, 61),
  ('integrations.file_folder', 'integrations', 'text', 'File storage folder', false, false, false, NULL, NULL, $cfg${"minLength":1,"maxLength":120}$cfg$::jsonb, 62),
  ('sources.allowed', 'sources', 'multi_choice', 'Agents may read', true, false, false, NULL, NULL, $cfg${"options":["call_transcripts","email","text_messages","forms","crm_notes"]}$cfg$::jsonb, 63),
  ('sources.retention_days', 'sources', 'key_value', 'Keep for (days)', false, false, false, NULL, NULL, $cfg${"min":30,"max":3650,"valueType":"number","keys":["call_transcripts","email","text_messages","forms","crm_notes"]}$cfg$::jsonb, 64),
  ('sources.agent_run_history_days', 'sources', 'number', 'Keep agent run history for (days)', false, false, false, NULL, NULL, $cfg${"min":7,"max":730,"integer":true}$cfg$::jsonb, 65),
  ('sources.scribe_calls_per_hour', 'sources', 'number', 'Calls Scribe reads per hour', false, false, false, NULL, NULL, $cfg${"min":1,"max":1000,"integer":true}$cfg$::jsonb, 66),
  ('sources.excluded', 'sources', 'list', 'Never read', false, false, false, NULL, NULL, $cfg${"maxItems":10,"uniqueBy":"source","itemFields":[{"key":"source","type":"choice","required":true,"options":["call_transcripts","email","text_messages","forms","crm_notes"]},{"key":"reason","type":"text","required":true,"maxLength":200}]}$cfg$::jsonb, 67),
  ('sources.forsight_history_weeks', 'sources', 'number', 'Forsight shows (weeks)', false, false, false, NULL, NULL, $cfg${"min":4,"max":52,"integer":true}$cfg$::jsonb, 68),
  ('sources.forsight_quiet_days', 'sources', 'number', 'Forsight: going quiet after (days)', false, false, false, NULL, NULL, $cfg${"min":1,"max":60,"integer":true}$cfg$::jsonb, 69),
  ('sources.forsight_silent_days', 'sources', 'number', 'Forsight: silent after (days)', false, false, false, NULL, NULL, $cfg${"min":2,"max":120,"integer":true}$cfg$::jsonb, 70),
  ('sources.forsight_long_silent_days', 'sources', 'number', 'Forsight: long silent after (days)', false, false, false, NULL, NULL, $cfg${"min":3,"max":365,"integer":true}$cfg$::jsonb, 71),
  ('sources.stellar_stage_labels', 'sources', 'key_value', 'Stellar build stage names', false, false, false, NULL, NULL, $cfg${"valueType":"text","keys":["getting_set_up","building_system","testing","live","running_smoothly"]}$cfg$::jsonb, 72),
  ('operators.assignment_mode', 'operators', 'choice', 'How leads are assigned', true, false, false, NULL, 'always', $cfg${"options":["manual","round_robin","weighted_round_robin","least_loaded","rules","by_source","by_service"]}$cfg$::jsonb, 73),
  ('operators.routing_fallback', 'operators', 'choice', 'When no rule matches', false, false, false, NULL, 'always', $cfg${"options":["manual","round_robin","weighted_round_robin","least_loaded"]}$cfg$::jsonb, 74),
  ('operators.sticky_days', 'operators', 'number', 'Send a returning lead to the same person', false, false, false, NULL, 'always', $cfg${"min":0,"max":365,"integer":true}$cfg$::jsonb, 75),
  ('operators.respect_hours', 'operators', 'boolean', 'Only assign during working hours', false, false, false, NULL, 'always', $cfg${}$cfg$::jsonb, 76),
  ('operators.agent_tasks', 'operators', 'choice', 'Tasks from Sentry and plays', false, false, false, NULL, 'always', $cfg${"options":["suggested","direct"]}$cfg$::jsonb, 77),
  ('operators.claim_minutes', 'operators', 'number', 'Minutes before an unclaimed lead is flagged', false, false, false, NULL, 'always', $cfg${"min":0,"max":1440,"integer":true}$cfg$::jsonb, 78),
  ('operators.claim_auto', 'operators', 'boolean', 'Assign automatically when the claim time runs out', false, false, false, NULL, 'always', $cfg${}$cfg$::jsonb, 79),
  ('operators.stale_reassign', 'operators', 'choice', 'When a lead sits unworked', false, false, false, NULL, 'always', $cfg${"options":["notify","automatic"]}$cfg$::jsonb, 80),
  ('operators.extra_permissions', 'operators', 'multi_choice', 'Operators may also', false, false, false, NULL, NULL, $cfg${"options":["view_unassigned_details","reassign_own_leads"]}$cfg$::jsonb, 81),
  ('operators.summary_time', 'operators', 'choice', 'Daily summary', false, false, false, NULL, NULL, $cfg${"options":["start_of_day","end_of_day"]}$cfg$::jsonb, 82),
  ('operators.summary_confirmer', 'operators', 'choice', 'Summaries are confirmed by', false, false, false, NULL, NULL, $cfg${"options":["operator","owner","service_team"]}$cfg$::jsonb, 83),
  ('compliance.opt_out_words', 'compliance', 'list', 'Opt-out words', false, false, true, 'superset_list', NULL, $cfg${"maxItems":30,"itemMaxLength":30}$cfg$::jsonb, 84),
  ('compliance.quiet_hours', 'compliance', 'time_window', 'No messages between', true, false, true, 'wider_window', NULL, $cfg${}$cfg$::jsonb, 85),
  ('compliance.quiet_hours_basis', 'compliance', 'choice', 'Quiet hours follow', false, false, true, NULL, NULL, $cfg${"options":["lead_local","workspace"]}$cfg$::jsonb, 86),
  ('compliance.daily_cap_per_lead', 'compliance', 'number', 'Most messages per lead per day', true, false, true, 'lower_number', NULL, $cfg${"min":1,"max":20,"integer":true}$cfg$::jsonb, 87),
  ('compliance.cap_applies_to', 'compliance', 'choice', 'The daily limit covers', false, false, true, NULL, NULL, $cfg${"options":["every_send","auto_run_only"]}$cfg$::jsonb, 88),
  ('compliance.weekly_cap_per_lead', 'compliance', 'number', 'Most messages per lead per week', false, false, true, 'lower_number_zero_is_unlimited', NULL, $cfg${"min":0,"max":100,"integer":true}$cfg$::jsonb, 89),
  ('compliance.required_disclosures', 'compliance', 'list', 'Required disclosures', false, false, true, 'superset_list', NULL, $cfg${"maxItems":10,"itemMaxLength":300}$cfg$::jsonb, 90),
  ('assay.weights', 'assay', 'key_value', 'How much each part counts', false, false, false, NULL, NULL, $cfg${"min":10,"max":60,"valueType":"number","keys":["fit","engagement","call"]}$cfg$::jsonb, 91),
  ('assay.tiers', 'assay', 'key_value', 'Tier lines', false, false, false, NULL, NULL, $cfg${"min":1,"max":100,"valueType":"number","keys":["hot","warm","cool"]}$cfg$::jsonb, 92),
  ('assay.tier_stickiness', 'assay', 'number', 'Points below a line before a lead drops a tier', false, false, false, NULL, NULL, $cfg${"min":0,"max":20,"integer":true}$cfg$::jsonb, 93),
  ('assay.decay_half_life_days', 'assay', 'number', 'Engagement halves after this many quiet days', false, false, false, NULL, NULL, $cfg${"min":1,"max":60,"integer":true}$cfg$::jsonb, 94),
  ('assay.negative_expiry_days', 'assay', 'number', 'Negative engagement clears after', false, false, false, NULL, NULL, $cfg${"min":7,"max":180,"integer":true}$cfg$::jsonb, 95),
  ('assay.engagement_lookback_days', 'assay', 'number', 'Engagement looks back', false, false, false, NULL, NULL, $cfg${"min":14,"max":365,"integer":true}$cfg$::jsonb, 96),
  ('assay.signal_confidence', 'assay', 'choice', 'Call signals count from', false, false, false, NULL, NULL, $cfg${"options":["medium","high"]}$cfg$::jsonb, 97),
  ('assay.signal_half_after_days', 'assay', 'number', 'Call signals count at half after', false, false, false, NULL, NULL, $cfg${"min":7,"max":365,"integer":true}$cfg$::jsonb, 98),
  ('assay.signal_drop_after_days', 'assay', 'number', 'Call signals stop counting after', false, false, false, NULL, NULL, $cfg${"min":14,"max":730,"integer":true}$cfg$::jsonb, 99),
  ('assay.fit_rules', 'assay', 'list', 'Fit rules', false, false, false, NULL, NULL, $cfg${"maxItems":40,"uniqueBy":"id","itemFields":[{"key":"id","type":"text","required":true,"maxLength":60},{"key":"input","type":"choice","required":true,"options":["service_offered","service_value","estimated_value","in_service_area","travel_distance","lead_source","contact_complete","decision_maker","property_owner","application_submitted","target_client","high_value_interest"]},{"key":"op","type":"choice","required":true,"options":["is_true","is_false","gte","lte","equals","source_quality"]},{"key":"value","type":"text","maxLength":60},{"key":"points","type":"number","required":true,"min":-100,"max":100},{"key":"reason","type":"text","required":true,"maxLength":160},{"key":"missing","type":"choice","options":["neutral","negative"]},{"key":"enabled","type":"boolean"}]}$cfg$::jsonb, 100),
  ('assay.engagement_rules', 'assay', 'list', 'Engagement rules', false, false, false, NULL, NULL, $cfg${"maxItems":40,"uniqueBy":"id","itemFields":[{"key":"id","type":"text","required":true,"maxLength":60},{"key":"kind","type":"choice","required":true,"options":["replied","called_back","form_submitted","quote_requested","pricing_asked","application_submitted","deposit_paid","quote_viewed","materials_opened","booked","rescheduled_by_lead","canceled","no_show","meeting_completed","stage_forward","stage_back","reopened","replied_fast","two_way","no_reply"]},{"key":"points","type":"number","required":true,"min":-100,"max":100},{"key":"reason","type":"text","required":true,"maxLength":160},{"key":"max_count","type":"number","min":1,"max":10},{"key":"minutes","type":"number","min":0,"max":1440},{"key":"days","type":"number","min":0,"max":365},{"key":"min_count","type":"number","min":0,"max":20},{"key":"enabled","type":"boolean"}]}$cfg$::jsonb, 101),
  ('assay.call_rules', 'assay', 'list', 'Call signal rules', false, false, false, NULL, NULL, $cfg${"maxItems":40,"uniqueBy":"id","itemFields":[{"key":"id","type":"text","required":true,"maxLength":60},{"key":"signal","type":"choice","required":true,"options":["timeline","budget_fit","decision_maker","objection","buying_intent","next_step","red_flag"]},{"key":"value","type":"text","required":true,"maxLength":60},{"key":"points","type":"number","required":true,"min":-100,"max":100},{"key":"reason","type":"text","required":true,"maxLength":160},{"key":"enabled","type":"boolean"}]}$cfg$::jsonb, 102),
  ('assay.field_map', 'assay', 'list', 'Fields Assay reads', false, false, false, NULL, NULL, $cfg${"maxItems":40,"itemFields":[{"key":"source","type":"text","required":true,"maxLength":80},{"key":"input","type":"choice","required":true,"options":["service_offered","service_value","estimated_value","in_service_area","travel_distance","lead_source","contact_complete","decision_maker","property_owner","application_submitted","target_client","high_value_interest"]}]}$cfg$::jsonb, 103),
  ('assay.trigger_became_hot', 'assay', 'boolean', 'Act when a lead becomes Hot', false, false, false, NULL, NULL, $cfg${}$cfg$::jsonb, 104),
  ('assay.trigger_big_jump', 'assay', 'boolean', 'Act on a big jump', false, false, false, NULL, NULL, $cfg${}$cfg$::jsonb, 105),
  ('assay.big_jump_points', 'assay', 'number', 'A big jump is at least', false, false, false, NULL, NULL, $cfg${"min":5,"max":60,"integer":true}$cfg$::jsonb, 106),
  ('assay.trigger_going_quiet', 'assay', 'boolean', 'Act when a Hot lead goes quiet', false, false, false, NULL, NULL, $cfg${}$cfg$::jsonb, 107),
  ('assay.going_quiet_days', 'assay', 'number', 'A Hot lead is quiet after', false, false, false, NULL, NULL, $cfg${"min":1,"max":30,"integer":true}$cfg$::jsonb, 108),
  ('assay.trigger_hot_no_show', 'assay', 'boolean', 'Act on a Hot or Warm no-show', false, false, false, NULL, NULL, $cfg${}$cfg$::jsonb, 109),
  ('assay.cooldown_hours', 'assay', 'number', 'The same trigger waits at least', false, false, false, NULL, NULL, $cfg${"min":1,"max":720,"integer":true}$cfg$::jsonb, 110),
  ('assay.tasks_per_person_day', 'assay', 'number', 'Most Assay tasks per person per day', false, false, false, NULL, NULL, $cfg${"min":1,"max":100,"integer":true}$cfg$::jsonb, 111),
  ('assay.tasks_per_workspace_day', 'assay', 'number', 'Most Assay tasks per workspace per day', false, false, false, NULL, NULL, $cfg${"min":1,"max":1000,"integer":true}$cfg$::jsonb, 112),
  ('assay.drafts_per_workspace_day', 'assay', 'number', 'Most Assay draft requests per workspace per day', false, false, false, NULL, NULL, $cfg${"min":0,"max":1000,"integer":true}$cfg$::jsonb, 113)
ON CONFLICT (key) DO UPDATE SET section = EXCLUDED.section, field_type = EXCLUDED.field_type, label = EXCLUDED.label, required = EXCLUDED.required, workspace_only = EXCLUDED.workspace_only, default_lock = EXCLUDED.default_lock, tighten = EXCLUDED.tighten, owner_editable = EXCLUDED.owner_editable, rules = EXCLUDED.rules, sort_order = EXCLUDED.sort_order;
CREATE OR REPLACE FUNCTION public.config_profile_labels() RETURNS jsonb LANGUAGE sql IMMUTABLE AS $fn$ SELECT $cfg${"signals":{"has_budget":"They can afford it","existing_revenue":"They already have revenue","urgent_timeline":"They want to start soon","sole_decision_maker":"They can decide alone","has_team":"They have a team behind them","clear_pain":"The problem is costing them now","tried_alternatives":"They have tried other things","right_industry":"They are in a market you serve","other":"Something else"},"disqualifiers":{"no_budget":"No budget at all","pre_revenue":"Pre-revenue","wrong_industry":"An industry you do not serve","needs_partner_approval":"Cannot decide without a partner","seeking_employment":"Looking for a job, not a service","out_of_geography":"Outside the places you work","competitor":"A competitor","other":"Something else"},"channels":{"meta_ads":"Facebook or Instagram ads","google_ads":"Google ads","youtube_ads":"YouTube ads","tiktok_ads":"TikTok ads","organic_social":"Organic social","email_list":"Your email list","referral":"Referrals","affiliate":"Affiliates or partners","webinar":"Webinars or masterclasses","cold_outbound":"Cold outbound","podcast":"Podcast","seo":"Search and content","events":"Live events","other":"Something else"},"offer_types":{"coaching":"Coaching","consulting":"Consulting","agency_service":"Agency service","course":"Course or programme","software":"Software","done_for_you":"Done-for-you delivery","other":"Something else"},"objection_types":{"price":"Price","timing":"Timing","spouse_partner":"Needs a partner's agreement","trust":"Trust","fit":"Fit","competitor":"Looking at someone else","other":"Something else"}}$cfg$::jsonb $fn$;
CREATE OR REPLACE FUNCTION public.config_legacy_banned_terms() RETURNS text[] LANGUAGE sql IMMUTABLE AS $fn$ SELECT ARRAY['I hope this message finds you well', 'I hope you''re doing well', 'I wanted to reach out', 'just circling back', 'circling back', 'touching base', 'following up on our conversation', 'as we discussed', 'leverage', 'utilize', 'synergy', 'streamline', 'robust', 'seamless', 'journey', 'solution']::text[] $fn$;
SELECT public.config_seed_platform($cfg${"identity.timezone":"America/New_York","identity.business_hours":{"days":{"mon":[{"start":"08:00","end":"18:00"}],"tue":[{"start":"08:00","end":"18:00"}],"wed":[{"start":"08:00","end":"18:00"}],"thu":[{"start":"08:00","end":"18:00"}],"fri":[{"start":"08:00","end":"18:00"}],"sat":[],"sun":[]},"closures":[]},"identity.owners_can_edit_hours":false,"qualification.not_ready_criteria":[],"qualification.disqualifiers":[],"qualification.minimum_info":[],"response.first_touch_minutes":15,"response.follow_up_cadence":[{"stage":"working","max_gap_hours":48},{"stage":"follow_up","max_gap_hours":72},{"stage":"objection_hold","max_gap_hours":72},{"stage":"no_show","max_gap_hours":24}],"response.after_hours":"keep_running","response.after_hours_window_minutes":120,"response.counted_touch_types":["call","text","email"],"response.relay_counts_as_human_touch":true,"response.warning_threshold_percent":75,"response.ghost_days_soft":14,"response.ghost_days_hard":30,"response.max_sequence_length":3,"response.max_sequence_days":21,"response.draft_stale_days":5,"response.quiet_lead_hours":48,"response.untouched_window_days":3,"response.no_show_window_days":7,"tone.formality":"casual","tone.use_contractions":true,"tone.sender_identity":"","tone.greeting":"","tone.sign_off":"","tone.sms_max_chars":240,"tone.email_max_chars":900,"tone.emoji":"never","tone.punctuation_rules":"","tone.language":"en-US","tone.preferred_terms":[],"tone.banned_terms":["I hope this message finds you well","I hope you're doing well","I wanted to reach out","just circling back","circling back","touching base","following up on our conversation","as we discussed","leverage","utilize","synergy","streamline","robust","seamless","journey","solution"],"tone.examples":[],"industry.business_description":"a business that sells through conversations with its leads","industry.urgency_signals":[],"industry.compass_questions":[{"question":"Which hot leads have not been contacted in the last two days?","audience":"managers"},{"question":"How did our response time look this week?","audience":"managers"},{"question":"What are the most common objections this month?","audience":"managers"},{"question":"Which drafts are waiting for approval?","audience":"managers"},{"question":"What should I follow up on first today?","audience":"operators"},{"question":"Which of my leads are at risk of missing their response window?","audience":"operators"}],"industry.objections":[],"industry.lead_sources":[],"escalation.levels":[{"severity":"warning","trigger":"A new lead has not had a first touch within the window.","after_windows":1,"notify":["assignee"],"channels":["push"]},{"severity":"urgent","trigger":"Still untouched at twice the window.","after_windows":2,"notify":["setters"],"channels":["push","team_channel"]},{"severity":"critical","trigger":"Still untouched at four times the window.","after_windows":4,"notify":["managers"],"channels":["push"]}],"escalation.quiet_hours":"outside_business_hours","escalation.urgent_exception":"critical","escalation.unacknowledged_minutes":60,"escalation.unacknowledged_next":"managers","approval.actions":[{"action":"first_reply","mode":"ask_first","approver":"owners_and_managers"},{"action":"quiet_lead_follow_up","mode":"ask_first","approver":"owners_and_managers"},{"action":"no_show_rebook","mode":"ask_first","approver":"owners_and_managers"},{"action":"client_report","mode":"ask_first","approver":"owners_and_managers"},{"action":"crm_stage_change","mode":"ask_first","approver":"owners_and_managers"},{"action":"setter_nudge","mode":"auto_run","approver":"owners_and_managers","auto_run_confirmed":true},{"action":"owner_escalation","mode":"auto_run","approver":"owners_and_managers","auto_run_confirmed":true},{"action":"slack_post","mode":"ask_first","approver":"owners_and_managers"},{"action":"discord_post","mode":"ask_first","approver":"owners_and_managers"},{"action":"drive_store","mode":"ask_first","approver":"owners_and_managers"},{"action":"send_text","mode":"ask_first","approver":"owners_and_managers"},{"action":"send_email","mode":"ask_first","approver":"owners_and_managers"},{"action":"create_asset","mode":"ask_first","approver":"owners_and_managers"}],"approval.never_auto":["first_reply","quiet_lead_follow_up","no_show_rebook","client_report","send_text","send_email"],"approval.timeout_minutes":240,"approval.timeout_behavior":"escalate","approval.timeout_proceed_confirmed":false,"integrations.crm":null,"integrations.messaging_numbers":[],"integrations.calendar":null,"integrations.email_domain":"","integrations.chat_channels":[],"integrations.file_folder":"Vistrial","sources.allowed":["call_transcripts","email","text_messages","forms","crm_notes"],"sources.retention_days":{"call_transcripts":365,"email":365,"text_messages":365,"forms":365,"crm_notes":365},"sources.agent_run_history_days":90,"sources.scribe_calls_per_hour":120,"sources.excluded":[],"sources.forsight_history_weeks":12,"sources.forsight_quiet_days":7,"sources.forsight_silent_days":14,"sources.forsight_long_silent_days":30,"sources.stellar_stage_labels":{"getting_set_up":"Getting set up","building_system":"Building your system","testing":"Testing","live":"Live","running_smoothly":"Running smoothly"},"operators.assignment_mode":"manual","operators.routing_fallback":"manual","operators.sticky_days":30,"operators.respect_hours":false,"operators.agent_tasks":"suggested","operators.claim_minutes":0,"operators.claim_auto":false,"operators.stale_reassign":"notify","operators.extra_permissions":[],"operators.summary_time":"start_of_day","operators.summary_confirmer":"operator","compliance.opt_out_words":[],"compliance.quiet_hours":{"start":"20:00","end":"08:00"},"compliance.quiet_hours_basis":"workspace","compliance.daily_cap_per_lead":2,"compliance.cap_applies_to":"auto_run_only","compliance.weekly_cap_per_lead":0,"compliance.required_disclosures":[],"assay.weights":{"fit":35,"engagement":45,"call":20},"assay.tiers":{"hot":75,"warm":50,"cool":25},"assay.tier_stickiness":5,"assay.decay_half_life_days":7,"assay.negative_expiry_days":30,"assay.engagement_lookback_days":90,"assay.signal_confidence":"medium","assay.signal_half_after_days":60,"assay.signal_drop_after_days":120,"assay.fit_rules":[{"id":"service_offered","input":"service_offered","op":"is_true","value":"","points":15,"reason":"Asked for a service you offer.","missing":"neutral","enabled":true},{"id":"service_not_offered","input":"service_offered","op":"is_false","value":"","points":-30,"reason":"Asked for a service you do not offer.","missing":"neutral","enabled":true},{"id":"in_service_area","input":"in_service_area","op":"is_true","value":"","points":10,"reason":"Inside your service area.","missing":"neutral","enabled":true},{"id":"outside_service_area","input":"in_service_area","op":"is_false","value":"","points":-40,"reason":"Outside your service area.","missing":"neutral","enabled":true},{"id":"contact_complete","input":"contact_complete","op":"is_true","value":"","points":5,"reason":"Has a working phone or email.","missing":"neutral","enabled":true},{"id":"source_quality","input":"lead_source","op":"source_quality","value":"","points":10,"reason":"Leads from {source} usually close well here.","missing":"neutral","enabled":true}],"assay.engagement_rules":[{"id":"quote_requested","kind":"quote_requested","points":15,"reason":"Asked for a quote.","max_count":1,"minutes":0,"days":0,"min_count":0,"enabled":true},{"id":"booked","kind":"booked","points":20,"reason":"Booked a meeting.","max_count":1,"minutes":0,"days":0,"min_count":0,"enabled":true},{"id":"meeting_completed","kind":"meeting_completed","points":15,"reason":"Completed a meeting.","max_count":1,"minutes":0,"days":0,"min_count":0,"enabled":true},{"id":"replied_fast","kind":"replied_fast","points":10,"reason":"Replied within {minutes} minutes {count_text}.","max_count":2,"minutes":15,"days":0,"min_count":0,"enabled":true},{"id":"two_way","kind":"two_way","points":10,"reason":"Replied {count} times in the last {days} days.","max_count":1,"minutes":0,"days":14,"min_count":2,"enabled":true},{"id":"rescheduled","kind":"rescheduled_by_lead","points":-5,"reason":"Rescheduled a booking.","max_count":1,"minutes":0,"days":0,"min_count":0,"enabled":true},{"id":"canceled","kind":"canceled","points":-15,"reason":"Canceled a booking.","max_count":1,"minutes":0,"days":0,"min_count":0,"enabled":true},{"id":"no_show","kind":"no_show","points":-25,"reason":"Missed a booking.","max_count":1,"minutes":0,"days":0,"min_count":0,"enabled":true},{"id":"no_reply","kind":"no_reply","points":-20,"reason":"No reply in {days} days.","max_count":1,"minutes":0,"days":14,"min_count":0,"enabled":true}],"assay.call_rules":[{"id":"timeline_now","signal":"timeline","value":"ready_now","points":20,"reason":"Said they are ready now.","enabled":true},{"id":"timeline_30","signal":"timeline","value":"within_30_days","points":15,"reason":"Wants it done within 30 days.","enabled":true},{"id":"timeline_later","signal":"timeline","value":"later","points":-10,"reason":"Said it is for later.","enabled":true},{"id":"budget_fits","signal":"budget_fit","value":"fits","points":15,"reason":"Stated budget fits the offer.","enabled":true},{"id":"budget_short","signal":"budget_fit","value":"does_not_fit","points":-20,"reason":"Stated budget does not fit the offer.","enabled":true},{"id":"decision_maker","signal":"decision_maker","value":"on_call","points":10,"reason":"The decision maker was on the call.","enabled":true},{"id":"next_step_meeting","signal":"next_step","value":"meeting_booked","points":15,"reason":"Agreed a next meeting.","enabled":true}],"assay.field_map":[],"assay.trigger_became_hot":true,"assay.trigger_big_jump":false,"assay.big_jump_points":20,"assay.trigger_going_quiet":true,"assay.going_quiet_days":3,"assay.trigger_hot_no_show":true,"assay.cooldown_hours":72,"assay.tasks_per_person_day":15,"assay.tasks_per_workspace_day":60,"assay.drafts_per_workspace_day":40}$cfg$::jsonb, ARRAY['approval.never_auto', 'compliance.opt_out_words', 'compliance.quiet_hours', 'compliance.quiet_hours_basis', 'compliance.daily_cap_per_lead', 'compliance.cap_applies_to', 'compliance.weekly_cap_per_lead', 'compliance.required_disclosures']::text[], $cfg${"compliance.opt_out_words":["STOP","STOPALL","UNSUBSCRIBE","CANCEL","END","QUIT"],"compliance.cap_applies_to":"every_send","compliance.quiet_hours_basis":"lead_local","response.after_hours":"pause"}$cfg$::jsonb, 'Launch compliance rules, switched on deliberately: opt-out words stop all messages; the daily per-lead limit covers every send; quiet hours (8pm to 8am) follow the lead''s local time; and the first-touch clock pauses outside business hours.');
SELECT public.config_seed_template('med-spa', 'Med Spa', 'Injectables, facials, laser and skin treatments, body contouring, and memberships.', $cfg${"industry.business_description":"a med spa offering injectables, facials, laser and skin treatments, and body contouring","industry.offers":[{"name":"Injectables (wrinkle relaxers and fillers)","ticket_min":300,"ticket_max":1500,"recurring":false},{"name":"Facials and peels","ticket_min":150,"ticket_max":400,"recurring":false},{"name":"Laser and skin treatments","ticket_min":300,"ticket_max":2500,"recurring":false},{"name":"Body contouring","ticket_min":600,"ticket_max":4000,"recurring":false},{"name":"Membership","ticket_min":99,"ticket_max":299,"recurring":true}],"industry.case_facts":[{"key":"treatment_interest","label":"Treatment of interest","type":"text","required":true},{"key":"concern","label":"What they want to change","type":"text","required":false},{"key":"prior_treatments","label":"Treatments they have had before","type":"text","required":false},{"key":"timeline","label":"When they want it done","type":"text","required":true},{"key":"budget_comfort","label":"Budget they are comfortable with","type":"text","required":false},{"key":"consultation_preference","label":"In-person or virtual consultation","type":"text","required":false}],"industry.compass_questions":[{"question":"Which consultation leads have gone quiet for three days?","audience":"managers"},{"question":"Which hot leads have not been contacted in the last two days?","audience":"managers"},{"question":"How did our response time look this week?","audience":"managers"},{"question":"What are the most common objections from consultation leads this month?","audience":"managers"},{"question":"Which of my consultation leads should I follow up on first?","audience":"operators"},{"question":"Which of my leads are waiting on a reply?","audience":"operators"}],"industry.urgency_signals":["An upcoming event, like a wedding, holiday, or trip","As soon as possible","This week","Asks about a promotion before it ends","Asks for the next available appointment"],"industry.objections":[{"label":"Cost","category":"price","recognize":"\"How much is it?\", \"That's more than I thought\", \"Do you have payment plans?\"","guidance":"Give the price range plainly, explain what is included, and mention memberships or payment options if you offer them. Never discount under pressure."},{"label":"Nervous about the treatment","category":"trust","recognize":"\"Does it hurt?\", \"I'm worried it will look fake\", \"What if something goes wrong?\"","guidance":"Acknowledge the worry, explain what the treatment involves in simple terms, and offer a consultation to talk it through with the provider. Make no medical claims or promises about results."},{"label":"Timing","category":"timing","recognize":"\"Not right now\", \"Maybe after the holidays\", \"I'm too busy this month\"","guidance":"Ask whether there is an event or date they have in mind, and offer to hold a time that suits them."},{"label":"Trust in the provider","category":"trust","recognize":"\"Who does the treatment?\", \"Are they certified?\", \"Can I see before-and-after photos?\"","guidance":"Share the provider's credentials and experience, and point to reviews or a gallery. Offer a consultation to meet them first."},{"label":"Needs to think about it","category":"fit","recognize":"\"Let me think about it\", \"I'll get back to you\"","guidance":"Respect it. Offer one clear, easy next step, like a free consultation, and check in once without pressure."}],"industry.lead_sources":[{"source":"Website booking form","priority":"high","treatment":"Reply quickly; they already chose a time slot or treatment."},{"source":"Google search","priority":"high","treatment":"Usually ready to book. Lead with availability."},{"source":"Instagram or Facebook ads","priority":"normal","treatment":"Often browsing. Start with the treatment they clicked on."},{"source":"Referral from a client","priority":"high","treatment":"Mention who referred them and thank them."}],"qualification.ready_criteria":["Asks about a specific treatment or its price.","Asks about availability or the next open appointment.","Has had a consultation or treatment with us before.","Mentions an event or a date they want to look their best for."],"qualification.not_ready_criteria":["General browsing with no treatment in mind.","Asks only about price, with no interest in a specific treatment.","Says they are \"just looking\"."],"qualification.disqualifiers":[{"reason":"Lives outside the area we serve.","closing_message":"Thanks so much for reaching out. We only see clients in our local area, so we're not the right fit, but we hope you find someone wonderful nearby."},{"reason":"Below the minimum age for treatment.","closing_message":"Thank you for your interest. We can only treat clients who are 18 or older, so we're not able to book you in."},{"reason":"Wants a treatment we do not offer.","closing_message":"Thanks for asking. That's not a treatment we offer, so we'd rather point you to a specialist who does."}],"qualification.minimum_info":["treatment_interest","timeline"],"response.first_touch_minutes":5,"response.follow_up_cadence":[{"stage":"working","max_gap_hours":4},{"stage":"follow_up","max_gap_hours":24},{"stage":"objection_hold","max_gap_hours":24},{"stage":"no_show","max_gap_hours":4}],"response.ghost_days_soft":3,"response.ghost_days_hard":7,"response.max_sequence_days":7,"tone.formality":"friendly","tone.emoji":"sparing","tone.sms_max_chars":300,"tone.punctuation_rules":"At most one exclamation mark per message. No capitals for emphasis.","tone.preferred_terms":["consultation","treatment plan","provider","results vary"],"tone.banned_terms":["I hope this message finds you well","I hope you're doing well","I wanted to reach out","just circling back","circling back","touching base","following up on our conversation","as we discussed","leverage","utilize","synergy","streamline","robust","seamless","journey","solution","guaranteed results","cure","permanent","risk-free","pain-free","act now","last chance","limited time only"],"tone.examples":[{"channel":"sms","body":"Hi Jess, it's Maya from Glow Studio. We have a lip filler consultation open Thursday at 4. Would that work for you?"},{"channel":"email","body":"Thanks for asking about laser skin resurfacing. A short consultation lets our provider look at your skin and talk through what to expect, including downtime and cost. We have openings this week on Tuesday and Thursday afternoon. Would either suit you?"}],"assay.weights":{"fit":35,"engagement":45,"call":20},"assay.tiers":{"hot":75,"warm":50,"cool":25},"assay.tier_stickiness":5,"assay.decay_half_life_days":10,"assay.negative_expiry_days":30,"assay.engagement_lookback_days":90,"assay.signal_confidence":"medium","assay.signal_half_after_days":60,"assay.signal_drop_after_days":120,"assay.trigger_became_hot":true,"assay.trigger_big_jump":false,"assay.big_jump_points":20,"assay.trigger_going_quiet":true,"assay.going_quiet_days":4,"assay.trigger_hot_no_show":true,"assay.cooldown_hours":72,"assay.tasks_per_person_day":15,"assay.tasks_per_workspace_day":60,"assay.drafts_per_workspace_day":40,"assay.fit_rules":[{"id":"high_value_service","input":"service_value","op":"gte","value":"1000","points":15,"reason":"Interested in a higher value treatment or package.","missing":"neutral","enabled":true},{"id":"in_travel_range","input":"in_service_area","op":"is_true","value":"","points":10,"reason":"Inside your travel range.","missing":"neutral","enabled":true},{"id":"outside_travel_range","input":"in_service_area","op":"is_false","value":"","points":-40,"reason":"Outside your travel range.","missing":"neutral","enabled":true},{"id":"contact_complete","input":"contact_complete","op":"is_true","value":"","points":5,"reason":"Has a working phone or email.","missing":"neutral","enabled":true},{"id":"source_quality","input":"lead_source","op":"source_quality","value":"","points":10,"reason":"Leads from {source} usually close well here.","missing":"neutral","enabled":true}],"assay.engagement_rules":[{"id":"booked","kind":"booked","points":25,"reason":"Booked a consultation.","max_count":1,"minutes":0,"days":0,"min_count":0,"enabled":true},{"id":"deposit_paid","kind":"deposit_paid","points":20,"reason":"Paid a deposit.","max_count":1,"minutes":0,"days":0,"min_count":0,"enabled":true},{"id":"meeting_completed","kind":"meeting_completed","points":20,"reason":"Completed a consultation.","max_count":1,"minutes":0,"days":0,"min_count":0,"enabled":true},{"id":"replied_fast","kind":"replied_fast","points":10,"reason":"Replied within {minutes} minutes {count_text}.","max_count":2,"minutes":15,"days":0,"min_count":0,"enabled":true},{"id":"rescheduled","kind":"rescheduled_by_lead","points":-5,"reason":"Rescheduled a booking.","max_count":1,"minutes":0,"days":0,"min_count":0,"enabled":true},{"id":"canceled","kind":"canceled","points":-15,"reason":"Canceled a consultation.","max_count":1,"minutes":0,"days":0,"min_count":0,"enabled":true},{"id":"no_show","kind":"no_show","points":-25,"reason":"Missed a consultation.","max_count":1,"minutes":0,"days":0,"min_count":0,"enabled":true},{"id":"no_reply","kind":"no_reply","points":-20,"reason":"No reply in {days} days.","max_count":1,"minutes":0,"days":21,"min_count":0,"enabled":true}],"assay.call_rules":[{"id":"timeline_now","signal":"timeline","value":"ready_now","points":20,"reason":"Ready to start now.","enabled":true},{"id":"timeline_30","signal":"timeline","value":"within_30_days","points":20,"reason":"Ready to start within 30 days.","enabled":true},{"id":"budget_fits","signal":"budget_fit","value":"fits","points":15,"reason":"Stated budget fits the treatment.","enabled":true},{"id":"concern_resolved","signal":"objection","value":"resolved","points":10,"reason":"Their main concern was answered on the call.","enabled":true},{"id":"next_appointment","signal":"next_step","value":"meeting_booked","points":15,"reason":"Set the next appointment.","enabled":true},{"id":"lowest_price_only","signal":"red_flag","value":"lowest_price_only","points":-15,"reason":"Only asked about the lowest price.","enabled":true}],"assay.field_map":[]}$cfg$::jsonb);
SELECT public.config_seed_template('home-services', 'Home Services', 'Recurring and one-time jobs: cleaning, HVAC, roofing, lawn care, plumbing, pest control, remodeling.', $cfg${"industry.business_description":"a local home services company doing recurring and one-time jobs at people's homes","identity.business_hours":{"days":{"mon":[{"start":"07:00","end":"18:00"}],"tue":[{"start":"07:00","end":"18:00"}],"wed":[{"start":"07:00","end":"18:00"}],"thu":[{"start":"07:00","end":"18:00"}],"fri":[{"start":"07:00","end":"18:00"}],"sat":[{"start":"08:00","end":"14:00"}],"sun":[]},"closures":[]},"industry.offers":[{"name":"Recurring service (cleaning, lawn care, pest control)","ticket_min":100,"ticket_max":400,"recurring":true},{"name":"One-time job","ticket_min":150,"ticket_max":1500,"recurring":false},{"name":"Repair or emergency call-out","ticket_min":150,"ticket_max":800,"recurring":false},{"name":"Large project (roofing, HVAC replacement, remodeling)","ticket_min":3000,"ticket_max":40000,"recurring":false}],"industry.case_facts":[{"key":"service_type","label":"Service needed","type":"text","required":true},{"key":"property_type","label":"Property type (house, apartment, business)","type":"text","required":false},{"key":"property_size","label":"Property size","type":"text","required":false},{"key":"service_area","label":"Address or area","type":"text","required":true},{"key":"timing","label":"When they need it","type":"text","required":true},{"key":"frequency","label":"One-time or recurring","type":"text","required":false},{"key":"access_notes","label":"Access notes (gate code, pets, parking)","type":"text","required":false}],"industry.compass_questions":[{"question":"Which estimate requests have not been called back yet?","audience":"managers"},{"question":"How quickly did we reach new leads this week?","audience":"managers"},{"question":"Which leads went quiet after an estimate?","audience":"managers"},{"question":"What are the most common objections this month?","audience":"managers"},{"question":"Which of my leads need a call back today?","audience":"operators"},{"question":"Which of my leads are at risk of missing their response window?","audience":"operators"}],"industry.urgency_signals":["today","leak","flooding","broken","no heat","no AC","emergency","A move-in or move-out date"],"industry.objections":[{"label":"Price","category":"price","recognize":"\"That's expensive\", \"Can you do it cheaper?\"","guidance":"Explain what the price includes and why. Offer a smaller first job or a recurring rate if you have one. Do not undercut yourself to win the job."},{"label":"Availability","category":"timing","recognize":"\"When can you come?\", \"I need it sooner than that\"","guidance":"Give the earliest real date. If an emergency, say what you can do today."},{"label":"Trust and reviews","category":"trust","recognize":"\"Are you insured?\", \"Do you have reviews?\"","guidance":"Confirm licensing and insurance, and share where to read reviews."},{"label":"Getting other quotes","category":"competitor","recognize":"\"I'm getting a few quotes\", \"Someone else quoted less\"","guidance":"That's sensible. Make your quote easy to compare: what is included, warranty, and timing. Follow up once after a couple of days."},{"label":"Timing","category":"timing","recognize":"\"Not until next month\", \"After the holidays\"","guidance":"Offer to book a date now so they keep the slot, and set a reminder."}],"industry.lead_sources":[{"source":"Google local listing","priority":"high","treatment":"Usually needs help soon. Reply with the earliest date."},{"source":"Website quote form","priority":"high","treatment":"Confirm the job and the address, then give a time."},{"source":"Referral","priority":"high","treatment":"Mention who referred them."},{"source":"Lead marketplace (Angi, Thumbtack)","priority":"normal","treatment":"Reply fast; they contacted several companies."},{"source":"Flyers and door hangers","priority":"low","treatment":"Often price shopping. Lead with a clear starting price."}],"qualification.ready_criteria":["Described a specific job.","Gave an address or the area they are in.","Asked for a quote or a date.","Mentioned something urgent, like a leak or a broken system."],"qualification.not_ready_criteria":["Curious about prices in general.","Comparing many providers with no date in mind."],"qualification.disqualifiers":[{"reason":"Outside our service area.","closing_message":"Thanks for getting in touch. That address is outside the area we cover, so we can't help with this one. Sorry we couldn't be more useful."},{"reason":"A job type we do not offer.","closing_message":"Thanks for asking. That's not a job we do, but a specialist will be able to help."},{"reason":"Below our minimum job size.","closing_message":"Thanks for reaching out. That job is smaller than we usually take on, so we're not the best fit this time."}],"qualification.minimum_info":["service_type","service_area","timing"],"response.first_touch_minutes":10,"response.follow_up_cadence":[{"stage":"working","max_gap_hours":24},{"stage":"follow_up","max_gap_hours":48},{"stage":"objection_hold","max_gap_hours":48},{"stage":"no_show","max_gap_hours":24}],"response.ghost_days_soft":7,"response.ghost_days_hard":21,"response.max_sequence_days":14,"escalation.levels":[{"severity":"warning","trigger":"A new lead has not had a first touch within the window.","after_windows":1,"notify":["assignee"],"channels":["push"]},{"severity":"urgent","trigger":"Still untouched at twice the window.","after_windows":2,"notify":["setters"],"channels":["push","team_channel"]},{"severity":"critical","trigger":"Still untouched at four times the window.","after_windows":4,"notify":["managers"],"channels":["push"]},{"severity":"urgent","trigger":"A lead mentions an emergency, like a leak, flooding, or no heat.","notify":["assignee","managers"],"channels":["push","sms"]}],"tone.formality":"friendly","tone.sms_max_chars":200,"tone.email_max_chars":600,"tone.punctuation_rules":"Plain words and short sentences. No exclamation marks in quotes or prices.","tone.banned_terms":["I hope this message finds you well","I hope you're doing well","I wanted to reach out","just circling back","circling back","touching base","following up on our conversation","as we discussed","leverage","utilize","synergy","streamline","robust","seamless","journey","solution","kindly","do not hesitate","per our conversation"],"tone.examples":[{"channel":"sms","body":"Hi Dan, it's Luis from Northside Plumbing. We can be there tomorrow between 8 and 10 to look at the leak. Does that work?"},{"channel":"sms","body":"Thanks for the photos. A full gutter clean for a two-story house is usually $180 to $240. Want me to book you in for Saturday morning?"}],"assay.weights":{"fit":35,"engagement":45,"call":20},"assay.tiers":{"hot":75,"warm":50,"cool":25},"assay.tier_stickiness":5,"assay.decay_half_life_days":7,"assay.negative_expiry_days":30,"assay.engagement_lookback_days":90,"assay.signal_confidence":"medium","assay.signal_half_after_days":60,"assay.signal_drop_after_days":120,"assay.trigger_became_hot":true,"assay.trigger_big_jump":false,"assay.big_jump_points":20,"assay.trigger_going_quiet":true,"assay.going_quiet_days":3,"assay.trigger_hot_no_show":true,"assay.cooldown_hours":72,"assay.tasks_per_person_day":15,"assay.tasks_per_workspace_day":60,"assay.drafts_per_workspace_day":40,"assay.fit_rules":[{"id":"service_offered","input":"service_offered","op":"is_true","value":"","points":15,"reason":"Asked for a service you offer.","missing":"neutral","enabled":true},{"id":"service_not_offered","input":"service_offered","op":"is_false","value":"","points":-30,"reason":"Asked for a service you do not offer.","missing":"neutral","enabled":true},{"id":"value_above_minimum","input":"estimated_value","op":"gte","value":"150","points":10,"reason":"Job value is above your minimum.","missing":"neutral","enabled":true},{"id":"value_above_target","input":"estimated_value","op":"gte","value":"1500","points":5,"reason":"Job value is in or above your target range.","missing":"neutral","enabled":true},{"id":"in_service_area","input":"in_service_area","op":"is_true","value":"","points":10,"reason":"Inside your service area.","missing":"neutral","enabled":true},{"id":"outside_service_area","input":"in_service_area","op":"is_false","value":"","points":-40,"reason":"Outside your service area.","missing":"neutral","enabled":true},{"id":"property_owner","input":"property_owner","op":"is_true","value":"","points":10,"reason":"Owns the property.","missing":"neutral","enabled":true},{"id":"contact_complete","input":"contact_complete","op":"is_true","value":"","points":5,"reason":"Has a working phone or email.","missing":"neutral","enabled":true},{"id":"source_quality","input":"lead_source","op":"source_quality","value":"","points":10,"reason":"Leads from {source} usually close well here.","missing":"neutral","enabled":true}],"assay.engagement_rules":[{"id":"quote_requested","kind":"quote_requested","points":15,"reason":"Asked for a quote.","max_count":1,"minutes":0,"days":0,"min_count":0,"enabled":true},{"id":"booked","kind":"booked","points":25,"reason":"Booked an estimate.","max_count":1,"minutes":0,"days":0,"min_count":0,"enabled":true},{"id":"meeting_completed","kind":"meeting_completed","points":15,"reason":"Completed an estimate.","max_count":1,"minutes":0,"days":0,"min_count":0,"enabled":true},{"id":"quote_viewed","kind":"quote_viewed","points":10,"reason":"Opened the quote.","max_count":1,"minutes":0,"days":0,"min_count":0,"enabled":true},{"id":"replied_fast","kind":"replied_fast","points":10,"reason":"Replied within {minutes} minutes {count_text}.","max_count":2,"minutes":15,"days":0,"min_count":0,"enabled":true},{"id":"two_way","kind":"two_way","points":10,"reason":"Replied {count} times in the last {days} days.","max_count":1,"minutes":0,"days":14,"min_count":2,"enabled":true},{"id":"reopened","kind":"reopened","points":15,"reason":"Came back after going quiet.","max_count":1,"minutes":0,"days":0,"min_count":0,"enabled":true},{"id":"stage_forward","kind":"stage_forward","points":10,"reason":"Moved forward in the pipeline.","max_count":1,"minutes":0,"days":0,"min_count":0,"enabled":true},{"id":"stage_back","kind":"stage_back","points":-10,"reason":"Moved back in the pipeline.","max_count":1,"minutes":0,"days":0,"min_count":0,"enabled":true},{"id":"rescheduled","kind":"rescheduled_by_lead","points":-5,"reason":"Rescheduled a booking.","max_count":1,"minutes":0,"days":0,"min_count":0,"enabled":true},{"id":"canceled","kind":"canceled","points":-15,"reason":"Canceled a booking.","max_count":1,"minutes":0,"days":0,"min_count":0,"enabled":true},{"id":"no_show","kind":"no_show","points":-25,"reason":"Missed a booking.","max_count":1,"minutes":0,"days":0,"min_count":0,"enabled":true},{"id":"no_reply","kind":"no_reply","points":-20,"reason":"No reply in {days} days.","max_count":1,"minutes":0,"days":14,"min_count":0,"enabled":true}],"assay.call_rules":[{"id":"timeline_now","signal":"timeline","value":"ready_now","points":25,"reason":"Said they want it done now.","enabled":true},{"id":"timeline_30","signal":"timeline","value":"within_30_days","points":20,"reason":"Wants the work done within 30 days.","enabled":true},{"id":"timeline_90","signal":"timeline","value":"within_90_days","points":5,"reason":"Wants the work done within 90 days.","enabled":true},{"id":"timeline_later","signal":"timeline","value":"later","points":-10,"reason":"Said the work is for later.","enabled":true},{"id":"decision_maker","signal":"decision_maker","value":"on_call","points":10,"reason":"The decision maker was on the call.","enabled":true},{"id":"needs_someone_else","signal":"decision_maker","value":"needs_someone_else","points":-5,"reason":"Needs someone else to decide.","enabled":true},{"id":"budget_fits","signal":"budget_fit","value":"fits","points":15,"reason":"Stated budget fits the job.","enabled":true},{"id":"budget_short","signal":"budget_fit","value":"does_not_fit","points":-20,"reason":"Stated budget does not fit the job.","enabled":true},{"id":"next_step_meeting","signal":"next_step","value":"meeting_booked","points":15,"reason":"Agreed a next step on the call.","enabled":true},{"id":"next_step_quote","signal":"next_step","value":"quote_to_send","points":15,"reason":"Agreed a next step on the call.","enabled":true},{"id":"next_step_date","signal":"next_step","value":"decision_date","points":15,"reason":"Agreed a next step on the call.","enabled":true},{"id":"price_shopping","signal":"red_flag","value":"price_shopping","points":-20,"reason":"Sounded like they are only price shopping.","enabled":true},{"id":"outside_scope","signal":"red_flag","value":"outside_scope","points":-30,"reason":"Asked for work outside your scope.","enabled":true}],"assay.field_map":[]}$cfg$::jsonb);
SELECT public.config_seed_template('coaches-consultants', 'Coaches and Consultants', 'High-ticket programs, group programs, one-to-one coaching, and consulting engagements.', $cfg${"industry.business_description":"a high-ticket coaching or consulting business that sells through sales calls","industry.offers":[{"name":"High-ticket program","ticket_min":3000,"ticket_max":25000,"recurring":false},{"name":"Group program","ticket_min":500,"ticket_max":5000,"recurring":false},{"name":"One-to-one coaching","ticket_min":1000,"ticket_max":10000,"recurring":true},{"name":"Consulting engagement","ticket_min":5000,"ticket_max":50000,"recurring":false}],"industry.case_facts":[{"key":"stated_goal","label":"What they want to achieve","type":"text","required":true},{"key":"current_situation","label":"Where they are now","type":"text","required":false},{"key":"budget_range","label":"Budget range","type":"text","required":true},{"key":"decision_maker","label":"Who makes the decision","type":"text","required":true},{"key":"timeline","label":"When they want to start","type":"text","required":true},{"key":"previous_coaching","label":"Coaching or consulting they have had before","type":"text","required":false},{"key":"objections_raised","label":"Objections raised on the call","type":"text","required":false}],"industry.compass_questions":[{"question":"Which strategy-call leads went quiet after a good first call?","audience":"managers"},{"question":"Which hot leads have not had a follow-up in two days?","audience":"managers"},{"question":"How did our response time look this week?","audience":"managers"},{"question":"What objections came up most on sales calls this month?","audience":"managers"},{"question":"Which of my leads should I follow up on first today?","audience":"operators"},{"question":"Which of my booked calls need a reminder?","audience":"operators"}],"industry.urgency_signals":["A stated deadline","A launch date coming up","\"Ready to start\"","A recent trigger event, like losing a client or new funding"],"industry.objections":[{"label":"Price","category":"price","recognize":"\"It's a lot of money right now\", \"I can't justify that\"","guidance":"Tie the investment back to the goal they stated and what it is costing them to stay where they are. Offer a payment plan only if one exists."},{"label":"Timing","category":"timing","recognize":"\"Now's not the right time\", \"Maybe next quarter\"","guidance":"Ask what would need to be true for the timing to be right, and what waiting costs them."},{"label":"Needs to talk to a partner or team","category":"spouse_partner","recognize":"\"I need to talk to my partner\", \"I have to run it by my team\"","guidance":"Offer a short call with the other decision-maker, and send a one-page summary they can share."},{"label":"Skeptical about results","category":"trust","recognize":"\"How do I know this will work for me?\"","guidance":"Share a relevant client story with specifics, and be honest about what the program needs from them."},{"label":"Past bad experience","category":"trust","recognize":"\"I've done a program before and it didn't work\"","guidance":"Ask what went wrong, listen, and explain clearly how this differs. Never criticize the other provider."}],"industry.lead_sources":[{"source":"Referral","priority":"high","treatment":"Mention who referred them; trust is already there."},{"source":"Paid social ads","priority":"normal","treatment":"Confirm the problem they want solved before talking about the offer."},{"source":"Webinar or podcast","priority":"normal","treatment":"Reference what they watched or heard."},{"source":"Email list","priority":"normal","treatment":"They know you; ask what prompted them to reply now."}],"qualification.ready_criteria":["Has stated a clear problem and the goal they want.","Has acknowledged the budget.","The decision-maker is on the call.","Has stated a timeline for starting.","Has engaged with earlier touches."],"qualification.not_ready_criteria":["Curious, but with no clear goal.","No budget for this yet.","Needs approval from someone who is not on the call."],"qualification.disqualifiers":[{"reason":"Not at the right stage for the offer.","closing_message":"Thanks for the time today. Based on where you are right now, this isn't the right program yet. Here's what I'd focus on first, and I'm happy to talk again when you get there."},{"reason":"No decision-making authority, with no path to the person who has it.","closing_message":null},{"reason":"Unwilling to commit to the program format.","closing_message":"Thanks for being straight with me. The program only works with the full commitment, so it wouldn't be fair to take you on. I wish you the best with it."}],"qualification.minimum_info":["stated_goal","budget_range","decision_maker","timeline"],"response.first_touch_minutes":15,"response.follow_up_cadence":[{"stage":"working","max_gap_hours":48},{"stage":"follow_up","max_gap_hours":96},{"stage":"objection_hold","max_gap_hours":72},{"stage":"no_show","max_gap_hours":24}],"tone.formality":"friendly","tone.punctuation_rules":"Confident and plain. No hype, no exclamation marks in follow-ups after a call.","tone.banned_terms":["I hope this message finds you well","I hope you're doing well","I wanted to reach out","just circling back","circling back","touching base","following up on our conversation","as we discussed","leverage","utilize","synergy","streamline","robust","seamless","journey","solution","guaranteed","life-changing","secret","hack","only a few spots left"],"tone.examples":[{"channel":"sms","body":"Good talking today, Sam. You said the goal is 10 clients a month by March. I'll send the plan we walked through tonight; worth looking at before Thursday's call."},{"channel":"email","body":"Thanks for walking me through where the business is. You mentioned two things are holding growth back: no consistent lead flow and closing calls yourself. The program covers both, and the next step is a 20-minute call with your business partner so you can decide together. Does Thursday at 2 work?"}],"assay.weights":{"fit":30,"engagement":40,"call":30},"assay.tiers":{"hot":75,"warm":50,"cool":25},"assay.tier_stickiness":5,"assay.decay_half_life_days":14,"assay.negative_expiry_days":30,"assay.engagement_lookback_days":90,"assay.signal_confidence":"medium","assay.signal_half_after_days":60,"assay.signal_drop_after_days":120,"assay.trigger_became_hot":true,"assay.trigger_big_jump":false,"assay.big_jump_points":20,"assay.trigger_going_quiet":true,"assay.going_quiet_days":5,"assay.trigger_hot_no_show":true,"assay.cooldown_hours":72,"assay.tasks_per_person_day":15,"assay.tasks_per_workspace_day":60,"assay.drafts_per_workspace_day":40,"assay.fit_rules":[{"id":"application_submitted","input":"application_submitted","op":"is_true","value":"","points":20,"reason":"Submitted an application.","missing":"neutral","enabled":true},{"id":"target_client","input":"target_client","op":"is_true","value":"","points":15,"reason":"Matches your target client.","missing":"neutral","enabled":true},{"id":"contact_complete","input":"contact_complete","op":"is_true","value":"","points":5,"reason":"Has a working phone or email.","missing":"neutral","enabled":true},{"id":"source_quality","input":"lead_source","op":"source_quality","value":"","points":10,"reason":"Leads from {source} usually close well here.","missing":"neutral","enabled":true}],"assay.engagement_rules":[{"id":"booked","kind":"booked","points":20,"reason":"Booked a call.","max_count":1,"minutes":0,"days":0,"min_count":0,"enabled":true},{"id":"meeting_completed","kind":"meeting_completed","points":20,"reason":"Showed up for the call.","max_count":1,"minutes":0,"days":0,"min_count":0,"enabled":true},{"id":"replied_fast","kind":"replied_fast","points":10,"reason":"Replied within {minutes} minutes {count_text}.","max_count":2,"minutes":15,"days":0,"min_count":0,"enabled":true},{"id":"materials_opened","kind":"materials_opened","points":5,"reason":"Opened the materials you sent.","max_count":1,"minutes":0,"days":0,"min_count":0,"enabled":true},{"id":"no_show","kind":"no_show","points":-25,"reason":"Missed a call.","max_count":1,"minutes":0,"days":0,"min_count":0,"enabled":true},{"id":"no_reply","kind":"no_reply","points":-20,"reason":"No reply in {days} days.","max_count":1,"minutes":0,"days":21,"min_count":0,"enabled":true}],"assay.call_rules":[{"id":"decision_maker","signal":"decision_maker","value":"on_call","points":15,"reason":"The decision maker was on the call.","enabled":true},{"id":"budget_fits","signal":"budget_fit","value":"fits","points":20,"reason":"Stated budget fits the program price.","enabled":true},{"id":"budget_short","signal":"budget_fit","value":"does_not_fit","points":-25,"reason":"Stated budget does not fit the program price.","enabled":true},{"id":"timeline_now","signal":"timeline","value":"ready_now","points":15,"reason":"Wants to start now.","enabled":true},{"id":"timeline_30","signal":"timeline","value":"within_30_days","points":15,"reason":"Wants to start within 30 days.","enabled":true},{"id":"objection_resolved","signal":"objection","value":"resolved","points":10,"reason":"Their objection was answered on the call.","enabled":true},{"id":"needs_approval","signal":"red_flag","value":"needs_approval_no_follow_up","points":-15,"reason":"Needs someone else's approval and no follow-up is booked.","enabled":true}],"assay.field_map":[{"source":"@answers_present","input":"application_submitted"}]}$cfg$::jsonb);
-- config-registry:end

-- ---------------------------------------------------------------------------
-- 9. Configuration: retire the readiness keys, and give the platform default
--    and the seeded templates Assay's starting rules as a new version each.
--    Workspaces pinned to an older version keep scoring with the same
--    starting rules until staff accept the new version.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  r record;
  v_retired text[] := ARRAY['qualification.scoring_bands', 'qualification.ready_threshold', 'qualification.factor_weights'];
  v_platform jsonb := $cfg${"assay.weights":{"fit":35,"engagement":45,"call":20},"assay.tiers":{"hot":75,"warm":50,"cool":25},"assay.tier_stickiness":5,"assay.decay_half_life_days":7,"assay.negative_expiry_days":30,"assay.engagement_lookback_days":90,"assay.signal_confidence":"medium","assay.signal_half_after_days":60,"assay.signal_drop_after_days":120,"assay.trigger_became_hot":true,"assay.trigger_big_jump":false,"assay.big_jump_points":20,"assay.trigger_going_quiet":true,"assay.going_quiet_days":3,"assay.trigger_hot_no_show":true,"assay.cooldown_hours":72,"assay.tasks_per_person_day":15,"assay.tasks_per_workspace_day":60,"assay.drafts_per_workspace_day":40,"assay.fit_rules":[{"id":"service_offered","input":"service_offered","op":"is_true","value":"","points":15,"reason":"Asked for a service you offer.","missing":"neutral","enabled":true},{"id":"service_not_offered","input":"service_offered","op":"is_false","value":"","points":-30,"reason":"Asked for a service you do not offer.","missing":"neutral","enabled":true},{"id":"in_service_area","input":"in_service_area","op":"is_true","value":"","points":10,"reason":"Inside your service area.","missing":"neutral","enabled":true},{"id":"outside_service_area","input":"in_service_area","op":"is_false","value":"","points":-40,"reason":"Outside your service area.","missing":"neutral","enabled":true},{"id":"contact_complete","input":"contact_complete","op":"is_true","value":"","points":5,"reason":"Has a working phone or email.","missing":"neutral","enabled":true},{"id":"source_quality","input":"lead_source","op":"source_quality","value":"","points":10,"reason":"Leads from {source} usually close well here.","missing":"neutral","enabled":true}],"assay.engagement_rules":[{"id":"quote_requested","kind":"quote_requested","points":15,"reason":"Asked for a quote.","max_count":1,"minutes":0,"days":0,"min_count":0,"enabled":true},{"id":"booked","kind":"booked","points":20,"reason":"Booked a meeting.","max_count":1,"minutes":0,"days":0,"min_count":0,"enabled":true},{"id":"meeting_completed","kind":"meeting_completed","points":15,"reason":"Completed a meeting.","max_count":1,"minutes":0,"days":0,"min_count":0,"enabled":true},{"id":"replied_fast","kind":"replied_fast","points":10,"reason":"Replied within {minutes} minutes {count_text}.","max_count":2,"minutes":15,"days":0,"min_count":0,"enabled":true},{"id":"two_way","kind":"two_way","points":10,"reason":"Replied {count} times in the last {days} days.","max_count":1,"minutes":0,"days":14,"min_count":2,"enabled":true},{"id":"rescheduled","kind":"rescheduled_by_lead","points":-5,"reason":"Rescheduled a booking.","max_count":1,"minutes":0,"days":0,"min_count":0,"enabled":true},{"id":"canceled","kind":"canceled","points":-15,"reason":"Canceled a booking.","max_count":1,"minutes":0,"days":0,"min_count":0,"enabled":true},{"id":"no_show","kind":"no_show","points":-25,"reason":"Missed a booking.","max_count":1,"minutes":0,"days":0,"min_count":0,"enabled":true},{"id":"no_reply","kind":"no_reply","points":-20,"reason":"No reply in {days} days.","max_count":1,"minutes":0,"days":14,"min_count":0,"enabled":true}],"assay.call_rules":[{"id":"timeline_now","signal":"timeline","value":"ready_now","points":20,"reason":"Said they are ready now.","enabled":true},{"id":"timeline_30","signal":"timeline","value":"within_30_days","points":15,"reason":"Wants it done within 30 days.","enabled":true},{"id":"timeline_later","signal":"timeline","value":"later","points":-10,"reason":"Said it is for later.","enabled":true},{"id":"budget_fits","signal":"budget_fit","value":"fits","points":15,"reason":"Stated budget fits the offer.","enabled":true},{"id":"budget_short","signal":"budget_fit","value":"does_not_fit","points":-20,"reason":"Stated budget does not fit the offer.","enabled":true},{"id":"decision_maker","signal":"decision_maker","value":"on_call","points":10,"reason":"The decision maker was on the call.","enabled":true},{"id":"next_step_meeting","signal":"next_step","value":"meeting_booked","points":15,"reason":"Agreed a next meeting.","enabled":true}],"assay.field_map":[]}$cfg$::jsonb;
  v_templates jsonb := $cfg${"home-services":{"assay.weights":{"fit":35,"engagement":45,"call":20},"assay.tiers":{"hot":75,"warm":50,"cool":25},"assay.tier_stickiness":5,"assay.decay_half_life_days":7,"assay.negative_expiry_days":30,"assay.engagement_lookback_days":90,"assay.signal_confidence":"medium","assay.signal_half_after_days":60,"assay.signal_drop_after_days":120,"assay.trigger_became_hot":true,"assay.trigger_big_jump":false,"assay.big_jump_points":20,"assay.trigger_going_quiet":true,"assay.going_quiet_days":3,"assay.trigger_hot_no_show":true,"assay.cooldown_hours":72,"assay.tasks_per_person_day":15,"assay.tasks_per_workspace_day":60,"assay.drafts_per_workspace_day":40,"assay.fit_rules":[{"id":"service_offered","input":"service_offered","op":"is_true","value":"","points":15,"reason":"Asked for a service you offer.","missing":"neutral","enabled":true},{"id":"service_not_offered","input":"service_offered","op":"is_false","value":"","points":-30,"reason":"Asked for a service you do not offer.","missing":"neutral","enabled":true},{"id":"value_above_minimum","input":"estimated_value","op":"gte","value":"150","points":10,"reason":"Job value is above your minimum.","missing":"neutral","enabled":true},{"id":"value_above_target","input":"estimated_value","op":"gte","value":"1500","points":5,"reason":"Job value is in or above your target range.","missing":"neutral","enabled":true},{"id":"in_service_area","input":"in_service_area","op":"is_true","value":"","points":10,"reason":"Inside your service area.","missing":"neutral","enabled":true},{"id":"outside_service_area","input":"in_service_area","op":"is_false","value":"","points":-40,"reason":"Outside your service area.","missing":"neutral","enabled":true},{"id":"property_owner","input":"property_owner","op":"is_true","value":"","points":10,"reason":"Owns the property.","missing":"neutral","enabled":true},{"id":"contact_complete","input":"contact_complete","op":"is_true","value":"","points":5,"reason":"Has a working phone or email.","missing":"neutral","enabled":true},{"id":"source_quality","input":"lead_source","op":"source_quality","value":"","points":10,"reason":"Leads from {source} usually close well here.","missing":"neutral","enabled":true}],"assay.engagement_rules":[{"id":"quote_requested","kind":"quote_requested","points":15,"reason":"Asked for a quote.","max_count":1,"minutes":0,"days":0,"min_count":0,"enabled":true},{"id":"booked","kind":"booked","points":25,"reason":"Booked an estimate.","max_count":1,"minutes":0,"days":0,"min_count":0,"enabled":true},{"id":"meeting_completed","kind":"meeting_completed","points":15,"reason":"Completed an estimate.","max_count":1,"minutes":0,"days":0,"min_count":0,"enabled":true},{"id":"quote_viewed","kind":"quote_viewed","points":10,"reason":"Opened the quote.","max_count":1,"minutes":0,"days":0,"min_count":0,"enabled":true},{"id":"replied_fast","kind":"replied_fast","points":10,"reason":"Replied within {minutes} minutes {count_text}.","max_count":2,"minutes":15,"days":0,"min_count":0,"enabled":true},{"id":"two_way","kind":"two_way","points":10,"reason":"Replied {count} times in the last {days} days.","max_count":1,"minutes":0,"days":14,"min_count":2,"enabled":true},{"id":"reopened","kind":"reopened","points":15,"reason":"Came back after going quiet.","max_count":1,"minutes":0,"days":0,"min_count":0,"enabled":true},{"id":"stage_forward","kind":"stage_forward","points":10,"reason":"Moved forward in the pipeline.","max_count":1,"minutes":0,"days":0,"min_count":0,"enabled":true},{"id":"stage_back","kind":"stage_back","points":-10,"reason":"Moved back in the pipeline.","max_count":1,"minutes":0,"days":0,"min_count":0,"enabled":true},{"id":"rescheduled","kind":"rescheduled_by_lead","points":-5,"reason":"Rescheduled a booking.","max_count":1,"minutes":0,"days":0,"min_count":0,"enabled":true},{"id":"canceled","kind":"canceled","points":-15,"reason":"Canceled a booking.","max_count":1,"minutes":0,"days":0,"min_count":0,"enabled":true},{"id":"no_show","kind":"no_show","points":-25,"reason":"Missed a booking.","max_count":1,"minutes":0,"days":0,"min_count":0,"enabled":true},{"id":"no_reply","kind":"no_reply","points":-20,"reason":"No reply in {days} days.","max_count":1,"minutes":0,"days":14,"min_count":0,"enabled":true}],"assay.call_rules":[{"id":"timeline_now","signal":"timeline","value":"ready_now","points":25,"reason":"Said they want it done now.","enabled":true},{"id":"timeline_30","signal":"timeline","value":"within_30_days","points":20,"reason":"Wants the work done within 30 days.","enabled":true},{"id":"timeline_90","signal":"timeline","value":"within_90_days","points":5,"reason":"Wants the work done within 90 days.","enabled":true},{"id":"timeline_later","signal":"timeline","value":"later","points":-10,"reason":"Said the work is for later.","enabled":true},{"id":"decision_maker","signal":"decision_maker","value":"on_call","points":10,"reason":"The decision maker was on the call.","enabled":true},{"id":"needs_someone_else","signal":"decision_maker","value":"needs_someone_else","points":-5,"reason":"Needs someone else to decide.","enabled":true},{"id":"budget_fits","signal":"budget_fit","value":"fits","points":15,"reason":"Stated budget fits the job.","enabled":true},{"id":"budget_short","signal":"budget_fit","value":"does_not_fit","points":-20,"reason":"Stated budget does not fit the job.","enabled":true},{"id":"next_step_meeting","signal":"next_step","value":"meeting_booked","points":15,"reason":"Agreed a next step on the call.","enabled":true},{"id":"next_step_quote","signal":"next_step","value":"quote_to_send","points":15,"reason":"Agreed a next step on the call.","enabled":true},{"id":"next_step_date","signal":"next_step","value":"decision_date","points":15,"reason":"Agreed a next step on the call.","enabled":true},{"id":"price_shopping","signal":"red_flag","value":"price_shopping","points":-20,"reason":"Sounded like they are only price shopping.","enabled":true},{"id":"outside_scope","signal":"red_flag","value":"outside_scope","points":-30,"reason":"Asked for work outside your scope.","enabled":true}],"assay.field_map":[]},"med-spa":{"assay.weights":{"fit":35,"engagement":45,"call":20},"assay.tiers":{"hot":75,"warm":50,"cool":25},"assay.tier_stickiness":5,"assay.decay_half_life_days":10,"assay.negative_expiry_days":30,"assay.engagement_lookback_days":90,"assay.signal_confidence":"medium","assay.signal_half_after_days":60,"assay.signal_drop_after_days":120,"assay.trigger_became_hot":true,"assay.trigger_big_jump":false,"assay.big_jump_points":20,"assay.trigger_going_quiet":true,"assay.going_quiet_days":4,"assay.trigger_hot_no_show":true,"assay.cooldown_hours":72,"assay.tasks_per_person_day":15,"assay.tasks_per_workspace_day":60,"assay.drafts_per_workspace_day":40,"assay.fit_rules":[{"id":"high_value_service","input":"service_value","op":"gte","value":"1000","points":15,"reason":"Interested in a higher value treatment or package.","missing":"neutral","enabled":true},{"id":"in_travel_range","input":"in_service_area","op":"is_true","value":"","points":10,"reason":"Inside your travel range.","missing":"neutral","enabled":true},{"id":"outside_travel_range","input":"in_service_area","op":"is_false","value":"","points":-40,"reason":"Outside your travel range.","missing":"neutral","enabled":true},{"id":"contact_complete","input":"contact_complete","op":"is_true","value":"","points":5,"reason":"Has a working phone or email.","missing":"neutral","enabled":true},{"id":"source_quality","input":"lead_source","op":"source_quality","value":"","points":10,"reason":"Leads from {source} usually close well here.","missing":"neutral","enabled":true}],"assay.engagement_rules":[{"id":"booked","kind":"booked","points":25,"reason":"Booked a consultation.","max_count":1,"minutes":0,"days":0,"min_count":0,"enabled":true},{"id":"deposit_paid","kind":"deposit_paid","points":20,"reason":"Paid a deposit.","max_count":1,"minutes":0,"days":0,"min_count":0,"enabled":true},{"id":"meeting_completed","kind":"meeting_completed","points":20,"reason":"Completed a consultation.","max_count":1,"minutes":0,"days":0,"min_count":0,"enabled":true},{"id":"replied_fast","kind":"replied_fast","points":10,"reason":"Replied within {minutes} minutes {count_text}.","max_count":2,"minutes":15,"days":0,"min_count":0,"enabled":true},{"id":"rescheduled","kind":"rescheduled_by_lead","points":-5,"reason":"Rescheduled a booking.","max_count":1,"minutes":0,"days":0,"min_count":0,"enabled":true},{"id":"canceled","kind":"canceled","points":-15,"reason":"Canceled a consultation.","max_count":1,"minutes":0,"days":0,"min_count":0,"enabled":true},{"id":"no_show","kind":"no_show","points":-25,"reason":"Missed a consultation.","max_count":1,"minutes":0,"days":0,"min_count":0,"enabled":true},{"id":"no_reply","kind":"no_reply","points":-20,"reason":"No reply in {days} days.","max_count":1,"minutes":0,"days":21,"min_count":0,"enabled":true}],"assay.call_rules":[{"id":"timeline_now","signal":"timeline","value":"ready_now","points":20,"reason":"Ready to start now.","enabled":true},{"id":"timeline_30","signal":"timeline","value":"within_30_days","points":20,"reason":"Ready to start within 30 days.","enabled":true},{"id":"budget_fits","signal":"budget_fit","value":"fits","points":15,"reason":"Stated budget fits the treatment.","enabled":true},{"id":"concern_resolved","signal":"objection","value":"resolved","points":10,"reason":"Their main concern was answered on the call.","enabled":true},{"id":"next_appointment","signal":"next_step","value":"meeting_booked","points":15,"reason":"Set the next appointment.","enabled":true},{"id":"lowest_price_only","signal":"red_flag","value":"lowest_price_only","points":-15,"reason":"Only asked about the lowest price.","enabled":true}],"assay.field_map":[]},"coaches-consultants":{"assay.weights":{"fit":30,"engagement":40,"call":30},"assay.tiers":{"hot":75,"warm":50,"cool":25},"assay.tier_stickiness":5,"assay.decay_half_life_days":14,"assay.negative_expiry_days":30,"assay.engagement_lookback_days":90,"assay.signal_confidence":"medium","assay.signal_half_after_days":60,"assay.signal_drop_after_days":120,"assay.trigger_became_hot":true,"assay.trigger_big_jump":false,"assay.big_jump_points":20,"assay.trigger_going_quiet":true,"assay.going_quiet_days":5,"assay.trigger_hot_no_show":true,"assay.cooldown_hours":72,"assay.tasks_per_person_day":15,"assay.tasks_per_workspace_day":60,"assay.drafts_per_workspace_day":40,"assay.fit_rules":[{"id":"application_submitted","input":"application_submitted","op":"is_true","value":"","points":20,"reason":"Submitted an application.","missing":"neutral","enabled":true},{"id":"target_client","input":"target_client","op":"is_true","value":"","points":15,"reason":"Matches your target client.","missing":"neutral","enabled":true},{"id":"contact_complete","input":"contact_complete","op":"is_true","value":"","points":5,"reason":"Has a working phone or email.","missing":"neutral","enabled":true},{"id":"source_quality","input":"lead_source","op":"source_quality","value":"","points":10,"reason":"Leads from {source} usually close well here.","missing":"neutral","enabled":true}],"assay.engagement_rules":[{"id":"booked","kind":"booked","points":20,"reason":"Booked a call.","max_count":1,"minutes":0,"days":0,"min_count":0,"enabled":true},{"id":"meeting_completed","kind":"meeting_completed","points":20,"reason":"Showed up for the call.","max_count":1,"minutes":0,"days":0,"min_count":0,"enabled":true},{"id":"replied_fast","kind":"replied_fast","points":10,"reason":"Replied within {minutes} minutes {count_text}.","max_count":2,"minutes":15,"days":0,"min_count":0,"enabled":true},{"id":"materials_opened","kind":"materials_opened","points":5,"reason":"Opened the materials you sent.","max_count":1,"minutes":0,"days":0,"min_count":0,"enabled":true},{"id":"no_show","kind":"no_show","points":-25,"reason":"Missed a call.","max_count":1,"minutes":0,"days":0,"min_count":0,"enabled":true},{"id":"no_reply","kind":"no_reply","points":-20,"reason":"No reply in {days} days.","max_count":1,"minutes":0,"days":21,"min_count":0,"enabled":true}],"assay.call_rules":[{"id":"decision_maker","signal":"decision_maker","value":"on_call","points":15,"reason":"The decision maker was on the call.","enabled":true},{"id":"budget_fits","signal":"budget_fit","value":"fits","points":20,"reason":"Stated budget fits the program price.","enabled":true},{"id":"budget_short","signal":"budget_fit","value":"does_not_fit","points":-25,"reason":"Stated budget does not fit the program price.","enabled":true},{"id":"timeline_now","signal":"timeline","value":"ready_now","points":15,"reason":"Wants to start now.","enabled":true},{"id":"timeline_30","signal":"timeline","value":"within_30_days","points":15,"reason":"Wants to start within 30 days.","enabled":true},{"id":"objection_resolved","signal":"objection","value":"resolved","points":10,"reason":"Their objection was answered on the call.","enabled":true},{"id":"needs_approval","signal":"red_flag","value":"needs_approval_no_follow_up","points":-15,"reason":"Needs someone else's approval and no follow-up is booked.","enabled":true}],"assay.field_map":[{"source":"@answers_present","input":"application_submitted"}]}}$cfg$::jsonb;
  v_add jsonb;
  v_next jsonb;
BEGIN
  FOR r IN
    SELECT l.*, t.slug
    FROM public.config_layers l
    LEFT JOIN public.config_templates t ON t.id = l.template_id
    ORDER BY CASE l.level WHEN 'platform' THEN 0 WHEN 'template' THEN 1 ELSE 2 END, l.id
  LOOP
    v_add := CASE
      WHEN r.level = 'platform' THEN v_platform
      WHEN r.level = 'template' AND v_templates ? r.slug THEN v_templates -> r.slug
      ELSE '{}'::jsonb
    END;
    -- Only keys the layer does not already hold; staff values are never replaced.
    v_add := COALESCE((SELECT jsonb_object_agg(k, v) FROM jsonb_each(v_add) e(k, v) WHERE NOT r.field_values ? k), '{}'::jsonb);
    v_next := (r.field_values - v_retired) || v_add;
    IF v_next IS DISTINCT FROM r.field_values OR r.locked_keys && v_retired THEN
      PERFORM public.config_write_layer(
        r.id,
        v_next,
        ARRAY(SELECT k FROM unnest(r.locked_keys) k WHERE NOT k = ANY (v_retired)),
        'migration',
        'Assay replaces the readiness score: score bands, the ready line, and factor weights are retired, and Assay''s rules are added.'
      );
    END IF;
  END LOOP;
  DELETE FROM public.config_fields WHERE key = ANY (v_retired);
END;
$$;
