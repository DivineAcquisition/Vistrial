-- Prompt 17: call quality and rep development.
--
-- Stated choices the prompt left unnamed:
--   * Manager = owner and admin (there is no manager role).
--   * Rep-before-manager window: 48 hours default, org-configurable 0–168.
--     0 means the manager sees immediately; the cost is the rep does not get a
--     private window first.
--   * Pattern floor: reporting_diag_min() = 20. Below it, show nothing.
--   * Score bands: calibration_score_band(). Close rates are never compared raw.
--   * Talk ratio is unknown when speakers cannot be attributed from labels.
--   * Pain has no extraction field; it is taken from the transcript (rep turns)
--     or a call-triggered score on that call.
--   * Brief prefetch must not count as opening; only a real brief visit does.
--   * Cross-client rows never carry org_id or member_id. Language n-grams do
--     not leave the org. Opt-out is business_profiles.aggregate_opt_out.
--
-- This is a development and coaching tool. It is not a surveillance system,
-- a leaderboard, or an employment file.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS call_coaching_embargo_hours integer NOT NULL DEFAULT 48;

ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS organizations_coaching_embargo_hours_range;

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_coaching_embargo_hours_range
  CHECK (call_coaching_embargo_hours BETWEEN 0 AND 168);

COMMENT ON COLUMN public.organizations.call_coaching_embargo_hours IS
  'Hours a rep sees their own call analysis before owner/admin. 0 = no window.';

ALTER TABLE public.org_members
  ADD COLUMN IF NOT EXISTS call_coaching_acknowledged_at timestamptz;

COMMENT ON COLUMN public.org_members.call_coaching_acknowledged_at IS
  'The member was told, in plain language, that calls are transcribed and analyzed for coaching. Nothing is computed about them until this is set.';

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE public.brief_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  lead_id uuid NOT NULL,
  member_id uuid NOT NULL REFERENCES public.org_members (id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT brief_views_lead_org_fkey FOREIGN KEY (lead_id, org_id)
    REFERENCES public.leads (id, org_id) ON DELETE CASCADE
);

CREATE INDEX brief_views_member_lead_idx
  ON public.brief_views (member_id, lead_id, viewed_at DESC);

COMMENT ON TABLE public.brief_views IS
  'A person opened the pre-call brief. Prefetch of the route is not a row.';

CREATE TABLE public.call_quality_measures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  call_id uuid NOT NULL,
  lead_id uuid NOT NULL,
  member_id uuid NOT NULL REFERENCES public.org_members (id) ON DELETE RESTRICT,
  occurred_at timestamptz NOT NULL,
  call_type public.call_type NOT NULL,
  duration_seconds integer,
  transcript_sha256 text NOT NULL,
  speakers_attributed boolean NOT NULL,
  talk_ratio_rep numeric,
  talk_ratio_prospect numeric,
  word_count_rep integer NOT NULL DEFAULT 0,
  word_count_prospect integer NOT NULL DEFAULT 0,
  word_count_unknown integer NOT NULL DEFAULT 0,
  question_count integer NOT NULL DEFAULT 0,
  open_question_count integer NOT NULL DEFAULT 0,
  closed_question_count integer NOT NULL DEFAULT 0,
  longest_rep_monologue_words integer,
  typical_duration_seconds integer,
  duration_vs_typical_seconds integer,
  next_step_stated boolean NOT NULL,
  next_step_agreed boolean NOT NULL,
  commitment_clarity text NOT NULL,
  discovery_pain boolean NOT NULL,
  discovery_timeline boolean NOT NULL,
  discovery_budget boolean NOT NULL,
  discovery_authority boolean NOT NULL,
  open_objections_prior_n integer NOT NULL DEFAULT 0,
  open_objections_addressed_n integer NOT NULL DEFAULT 0,
  brief_opened_before_call boolean NOT NULL,
  analyzer_version text NOT NULL,
  analyzed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT call_quality_measures_call_org_fkey FOREIGN KEY (call_id, org_id)
    REFERENCES public.calls (id, org_id) ON DELETE CASCADE,
  CONSTRAINT call_quality_measures_lead_org_fkey FOREIGN KEY (lead_id, org_id)
    REFERENCES public.leads (id, org_id) ON DELETE CASCADE,
  CONSTRAINT call_quality_measures_call_id_key UNIQUE (call_id),
  CONSTRAINT call_quality_measures_commitment_clarity_check
    CHECK (commitment_clarity IN ('specific', 'vague', 'none')),
  CONSTRAINT call_quality_measures_talk_ratio_range CHECK (
    (talk_ratio_rep IS NULL OR (talk_ratio_rep >= 0 AND talk_ratio_rep <= 1))
    AND (talk_ratio_prospect IS NULL OR (talk_ratio_prospect >= 0 AND talk_ratio_prospect <= 1))
  )
);

CREATE INDEX call_quality_measures_org_member_idx
  ON public.call_quality_measures (org_id, member_id, occurred_at DESC);

COMMENT ON TABLE public.call_quality_measures IS
  'Descriptive facts about a call, computed from the transcript and the outcome. Not a grade of the person. Never personality, confidence, or enthusiasm.';

CREATE TABLE public.call_objection_handlings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  call_id uuid NOT NULL,
  measure_id uuid NOT NULL REFERENCES public.call_quality_measures (id) ON DELETE CASCADE,
  objection_id uuid,
  objection_type text NOT NULL,
  verbatim text NOT NULL,
  handling text NOT NULL,
  evidence_span text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT call_objection_handlings_call_org_fkey FOREIGN KEY (call_id, org_id)
    REFERENCES public.calls (id, org_id) ON DELETE CASCADE,
  CONSTRAINT call_objection_handlings_handling_check
    CHECK (handling IN ('addressed', 'deflected', 'ignored'))
);

CREATE INDEX call_objection_handlings_call_idx
  ON public.call_objection_handlings (call_id);

CREATE TABLE public.call_coaching_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  finding_key text NOT NULL,
  finding_kind text NOT NULL,
  sample_closed integer NOT NULL,
  sample_lost integer NOT NULL,
  bands_used text[] NOT NULL DEFAULT '{}',
  statement text NOT NULL,
  lead_quality_caveat text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT call_coaching_findings_org_key UNIQUE (org_id, finding_key),
  CONSTRAINT call_coaching_findings_kind_check
    CHECK (finding_kind IN ('structural', 'substantive', 'language')),
  CONSTRAINT call_coaching_findings_min_samples CHECK (
    sample_closed >= 20 AND sample_lost >= 20
  )
);

COMMENT ON TABLE public.call_coaching_findings IS
  'What differed on closed vs lost calls in this business, lead-quality controlled. Descriptive. Not a script.';

CREATE TABLE public.call_coaching_gaming_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.org_members (id) ON DELETE CASCADE,
  measure_key text NOT NULL,
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL,
  prior_value numeric,
  current_value numeric,
  relative_shift numeric,
  outcome_shift_pp numeric,
  statement text NOT NULL,
  detected_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT call_coaching_gaming_org_member_key UNIQUE (org_id, member_id, measure_key)
);

COMMENT ON TABLE public.call_coaching_gaming_signals IS
  'A structural measure moved without a corresponding outcome change. Visible to the rep it describes.';

CREATE TABLE public.call_coaching_benchmarks (
  finding_key text PRIMARY KEY,
  org_count integer NOT NULL,
  sample_n integer NOT NULL,
  statement text NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT call_coaching_benchmarks_min_orgs CHECK (org_count >= 5),
  CONSTRAINT call_coaching_benchmarks_min_n CHECK (sample_n >= 20)
);

COMMENT ON TABLE public.call_coaching_benchmarks IS
  'Aggregate coaching patterns across similar businesses. No org_id. No member_id. Language n-grams never written here.';

-- ---------------------------------------------------------------------------
-- Visibility
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.call_quality_cutoff(p_org_id uuid)
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT now() - make_interval(
    hours => COALESCE(
      (SELECT call_coaching_embargo_hours FROM public.organizations WHERE id = p_org_id),
      48
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.call_quality_row_visible(
  p_org_id uuid,
  p_member_id uuid,
  p_occurred_at timestamptz
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p_org_id IN (SELECT public.user_org_ids())
    AND EXISTS (
      SELECT 1
      FROM public.org_members s
      WHERE s.id = p_member_id
        AND s.org_id = p_org_id
        AND s.call_coaching_acknowledged_at IS NOT NULL
    )
    AND (
      public.user_member_id(p_org_id) IS NOT DISTINCT FROM p_member_id
      OR (
        public.user_has_org_role(p_org_id, 'owner', 'admin')
        AND p_occurred_at <= public.call_quality_cutoff(p_org_id)
      )
    );
$$;

COMMENT ON FUNCTION public.call_quality_row_visible(uuid, uuid, timestamptz) IS
  'Individual call analysis: the rep who ran it, their owner/admin after the embargo, nobody else.';

CREATE OR REPLACE FUNCTION public.call_quality_require_job()
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
  -- SECURITY DEFINER callers run as the owner, so current_user is not the
  -- session role. Deny any logged-in member; GRANT already withholds EXECUTE
  -- from authenticated.
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
END;
$$;

ALTER TABLE public.brief_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_quality_measures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_objection_handlings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_coaching_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_coaching_gaming_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_coaching_benchmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY brief_views_select
  ON public.brief_views FOR SELECT TO authenticated
  USING (public.call_quality_row_visible(org_id, member_id, viewed_at));

CREATE POLICY brief_views_insert_self
  ON public.brief_views FOR INSERT TO authenticated
  WITH CHECK (
    org_id IN (SELECT public.user_org_ids())
    AND member_id = public.user_member_id(org_id)
  );

CREATE POLICY call_quality_measures_select
  ON public.call_quality_measures FOR SELECT TO authenticated
  USING (public.call_quality_row_visible(org_id, member_id, occurred_at));

CREATE POLICY call_objection_handlings_select
  ON public.call_objection_handlings FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.call_quality_measures m
      WHERE m.call_id = call_objection_handlings.call_id
        AND public.call_quality_row_visible(m.org_id, m.member_id, m.occurred_at)
    )
  );

CREATE POLICY call_coaching_findings_select
  ON public.call_coaching_findings FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));

CREATE POLICY call_coaching_gaming_signals_select
  ON public.call_coaching_gaming_signals FOR SELECT TO authenticated
  USING (public.call_quality_row_visible(org_id, member_id, detected_at));

CREATE POLICY call_coaching_benchmarks_select
  ON public.call_coaching_benchmarks FOR SELECT TO authenticated
  USING (true);

REVOKE ALL ON TABLE public.brief_views FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.call_quality_measures FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.call_objection_handlings FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.call_coaching_findings FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.call_coaching_gaming_signals FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.call_coaching_benchmarks FROM PUBLIC, anon;

GRANT SELECT, INSERT ON public.brief_views TO authenticated;
GRANT SELECT ON public.call_quality_measures TO authenticated;
GRANT SELECT ON public.call_objection_handlings TO authenticated;
GRANT SELECT ON public.call_coaching_findings TO authenticated;
GRANT SELECT ON public.call_coaching_gaming_signals TO authenticated;
GRANT SELECT ON public.call_coaching_benchmarks TO authenticated;

GRANT ALL ON TABLE public.brief_views TO service_role;
GRANT ALL ON TABLE public.call_quality_measures TO service_role;
GRANT ALL ON TABLE public.call_objection_handlings TO service_role;
GRANT ALL ON TABLE public.call_coaching_findings TO service_role;
GRANT ALL ON TABLE public.call_coaching_gaming_signals TO service_role;
GRANT ALL ON TABLE public.call_coaching_benchmarks TO service_role;

-- ---------------------------------------------------------------------------
-- Consent and brief view
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.acknowledge_call_coaching(p_org_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member uuid;
  v_at timestamptz;
BEGIN
  IF p_org_id IS NULL OR p_org_id NOT IN (SELECT public.user_org_ids()) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_member
  FROM public.org_members
  WHERE org_id = p_org_id AND user_id = auth.uid() AND active
  LIMIT 1;

  IF v_member IS NULL THEN
    RAISE EXCEPTION 'not a member of this workspace' USING ERRCODE = '42501';
  END IF;

  UPDATE public.org_members
  SET call_coaching_acknowledged_at = COALESCE(call_coaching_acknowledged_at, now())
  WHERE id = v_member
  RETURNING call_coaching_acknowledged_at INTO v_at;

  RETURN v_at;
END;
$$;

COMMENT ON FUNCTION public.acknowledge_call_coaching(uuid) IS
  'The calling member confirms they were told calls are transcribed and analyzed for coaching. Cannot stamp anyone else.';

CREATE OR REPLACE FUNCTION public.record_brief_view(p_org_id uuid, p_lead_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member uuid;
  v_id uuid;
BEGIN
  IF p_org_id IS NULL OR p_org_id NOT IN (SELECT public.user_org_ids()) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_member
  FROM public.org_members
  WHERE org_id = p_org_id AND user_id = auth.uid() AND active
  LIMIT 1;

  IF v_member IS NULL THEN
    RAISE EXCEPTION 'not a member of this workspace' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.leads WHERE id = p_lead_id AND org_id = p_org_id
  ) THEN
    RAISE EXCEPTION 'lead not found';
  END IF;

  SELECT id INTO v_id
  FROM public.brief_views
  WHERE member_id = v_member
    AND lead_id = p_lead_id
    AND viewed_at >= now() - interval '5 minutes'
  ORDER BY viewed_at DESC
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO public.brief_views (org_id, lead_id, member_id)
  VALUES (p_org_id, p_lead_id, v_member)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Pattern builder (no grades, min-n enforced, lead-quality controlled)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.call_quality_measure_in_scope(
  p_member_id uuid,
  p_occurred_at timestamptz,
  p_subject uuid,
  p_viewer uuid,
  p_cutoff timestamptz
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    (p_subject IS NULL OR p_member_id = p_subject)
    AND (
      p_occurred_at <= p_cutoff
      OR (p_subject IS NOT NULL AND p_subject = p_viewer AND p_member_id = p_viewer)
    );
$$;

CREATE OR REPLACE FUNCTION public.call_quality_patterns(
  p_org_id uuid,
  p_member_id uuid,
  p_cutoff timestamptz,
  p_viewer uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_min integer := public.reporting_diag_min();
  v_n integer := 0;
  v_discovery jsonb;
  v_lost jsonb;
  v_bands jsonb;
  v_structure jsonb;
  v_movement jsonb;
  v_best jsonb;
  v_work jsonb;
  v_plain text;
  v_eligible integer;
BEGIN
  SELECT count(*)::integer INTO v_n
  FROM public.call_quality_measures m
  JOIN public.org_members s ON s.id = m.member_id AND s.org_id = m.org_id
  WHERE m.org_id = p_org_id
    AND s.call_coaching_acknowledged_at IS NOT NULL
    AND public.call_quality_measure_in_scope(
      m.member_id, m.occurred_at, p_member_id, p_viewer, p_cutoff
    );

  SELECT COALESCE(jsonb_agg(row_to_json(x)::jsonb), '[]'::jsonb)
  INTO v_best
  FROM (
    SELECT
      m.call_id AS "callId",
      m.occurred_at AS "occurredAt",
      m.call_type AS "callType",
      COALESCE(
        NULLIF(btrim(concat_ws(' ', l.first_name, l.last_name)), ''),
        NULLIF(btrim(l.email), ''),
        'Unnamed lead'
      ) AS "leadName"
    FROM public.call_quality_measures m
    JOIN public.leads l ON l.id = m.lead_id AND l.org_id = m.org_id
    JOIN public.org_members s ON s.id = m.member_id AND s.org_id = m.org_id
    WHERE m.org_id = p_org_id
      AND s.call_coaching_acknowledged_at IS NOT NULL
      AND public.call_quality_measure_in_scope(
        m.member_id, m.occurred_at, p_member_id, p_viewer, p_cutoff
      )
      AND EXISTS (
        SELECT 1 FROM public.revenue_log r
        WHERE r.lead_id = m.lead_id AND r.org_id = m.org_id
      )
    ORDER BY m.occurred_at DESC
    LIMIT 5
  ) x;

  IF v_n < v_min THEN
    RETURN jsonb_build_object(
      'shown', false,
      'reason', 'below_minimum',
      'sampleN', v_n,
      'minN', v_min,
      'plain', 'Patterns wait until '
        || v_min::text
        || ' transcribed calls. One call is noise: a bad prospect, a bad day, or a call that was correctly cut short.',
      'bestCalls', COALESCE(v_best, '[]'::jsonb),
      'workOn', '[]'::jsonb,
      'discovery', '[]'::jsonb,
      'objectionLost', jsonb_build_object('shown', false, 'reason', 'below_minimum'),
      'closeByBand', jsonb_build_object(
        'shown', false,
        'reason', 'below_minimum',
        'plain', 'Close rates are not shown until there are enough transcribed calls, and then only inside score bands.'
      ),
      'closedVsLost', jsonb_build_object('shown', false, 'reason', 'below_minimum'),
      'movement', '[]'::jsonb
    );
  END IF;

  SELECT jsonb_build_array(
    jsonb_build_object(
      'factor', 'decision_authority',
      'label', 'decision authority',
      'exploredN', count(*) FILTER (WHERE m.discovery_authority),
      'skippedN', count(*) FILTER (WHERE NOT m.discovery_authority),
      'callN', count(*),
      'plain', format(
        'Decision authority was not explored on %s of %s calls.',
        count(*) FILTER (WHERE NOT m.discovery_authority),
        count(*)
      )
    ),
    jsonb_build_object(
      'factor', 'pain_severity',
      'label', 'pain',
      'exploredN', count(*) FILTER (WHERE m.discovery_pain),
      'skippedN', count(*) FILTER (WHERE NOT m.discovery_pain),
      'callN', count(*),
      'plain', format(
        'Pain was not explored on %s of %s calls.',
        count(*) FILTER (WHERE NOT m.discovery_pain),
        count(*)
      )
    ),
    jsonb_build_object(
      'factor', 'timeline',
      'label', 'timeline',
      'exploredN', count(*) FILTER (WHERE m.discovery_timeline),
      'skippedN', count(*) FILTER (WHERE NOT m.discovery_timeline),
      'callN', count(*),
      'plain', format(
        'Timeline was not explored on %s of %s calls.',
        count(*) FILTER (WHERE NOT m.discovery_timeline),
        count(*)
      )
    ),
    jsonb_build_object(
      'factor', 'investment_capacity',
      'label', 'investment capacity',
      'exploredN', count(*) FILTER (WHERE m.discovery_budget),
      'skippedN', count(*) FILTER (WHERE NOT m.discovery_budget),
      'callN', count(*),
      'plain', format(
        'Investment capacity was not explored on %s of %s calls.',
        count(*) FILTER (WHERE NOT m.discovery_budget),
        count(*)
      )
    )
  )
  INTO v_discovery
  FROM public.call_quality_measures m
  JOIN public.org_members s ON s.id = m.member_id AND s.org_id = m.org_id
  WHERE m.org_id = p_org_id
    AND s.call_coaching_acknowledged_at IS NOT NULL
    AND public.call_quality_measure_in_scope(
      m.member_id, m.occurred_at, p_member_id, p_viewer, p_cutoff
    );

  SELECT jsonb_build_object(
    'shown', count(*) >= v_min,
    'reason', CASE WHEN count(*) >= v_min THEN NULL ELSE 'below_minimum' END,
    'type', (
      SELECT h.objection_type
      FROM public.call_objection_handlings h
      JOIN public.call_quality_measures m2 ON m2.call_id = h.call_id
      JOIN public.calibration_mature_resolved(p_org_id) r ON r.lead_id = m2.lead_id
      JOIN public.org_members s2 ON s2.id = m2.member_id
      WHERE m2.org_id = p_org_id
        AND NOT r.closed
        AND s2.call_coaching_acknowledged_at IS NOT NULL
        AND public.call_quality_measure_in_scope(
          m2.member_id, m2.occurred_at, p_member_id, p_viewer, p_cutoff
        )
      GROUP BY h.objection_type
      ORDER BY count(*) DESC
      LIMIT 1
    ),
    'lostN', count(*),
    'plain', CASE
      WHEN count(*) < v_min THEN
        'Not enough lost calls to say which objection this pattern loses to.'
      ELSE
        format(
          'On lost calls, the objection that showed up most often was %s (%s of %s). That is a description of the recordings, not a verdict.',
          (
            SELECT h.objection_type
            FROM public.call_objection_handlings h
            JOIN public.call_quality_measures m2 ON m2.call_id = h.call_id
            JOIN public.calibration_mature_resolved(p_org_id) r ON r.lead_id = m2.lead_id
            JOIN public.org_members s2 ON s2.id = m2.member_id
            WHERE m2.org_id = p_org_id
              AND NOT r.closed
              AND s2.call_coaching_acknowledged_at IS NOT NULL
              AND public.call_quality_measure_in_scope(
                m2.member_id, m2.occurred_at, p_member_id, p_viewer, p_cutoff
              )
            GROUP BY h.objection_type
            ORDER BY count(*) DESC
            LIMIT 1
          ),
          (
            SELECT count(*)
            FROM public.call_objection_handlings h
            JOIN public.call_quality_measures m2 ON m2.call_id = h.call_id
            JOIN public.calibration_mature_resolved(p_org_id) r ON r.lead_id = m2.lead_id
            JOIN public.org_members s2 ON s2.id = m2.member_id
            WHERE m2.org_id = p_org_id
              AND NOT r.closed
              AND s2.call_coaching_acknowledged_at IS NOT NULL
              AND public.call_quality_measure_in_scope(
                m2.member_id, m2.occurred_at, p_member_id, p_viewer, p_cutoff
              )
              AND h.objection_type = (
                SELECT h3.objection_type
                FROM public.call_objection_handlings h3
                JOIN public.call_quality_measures m3 ON m3.call_id = h3.call_id
                JOIN public.calibration_mature_resolved(p_org_id) r3 ON r3.lead_id = m3.lead_id
                JOIN public.org_members s3 ON s3.id = m3.member_id
                WHERE m3.org_id = p_org_id
                  AND NOT r3.closed
                  AND s3.call_coaching_acknowledged_at IS NOT NULL
                  AND public.call_quality_measure_in_scope(
                    m3.member_id, m3.occurred_at, p_member_id, p_viewer, p_cutoff
                  )
                GROUP BY h3.objection_type
                ORDER BY count(*) DESC
                LIMIT 1
              )
          ),
          count(*)
        )
    END
  )
  INTO v_lost
  FROM public.call_quality_measures m
  JOIN public.calibration_mature_resolved(p_org_id) r ON r.lead_id = m.lead_id
  JOIN public.org_members s ON s.id = m.member_id
  WHERE m.org_id = p_org_id
    AND NOT r.closed
    AND s.call_coaching_acknowledged_at IS NOT NULL
    AND public.call_quality_measure_in_scope(
      m.member_id, m.occurred_at, p_member_id, p_viewer, p_cutoff
    );

  SELECT COALESCE(jsonb_agg(row_to_json(b)::jsonb ORDER BY b.band), '[]'::jsonb), count(*)::integer
  INTO v_bands, v_eligible
  FROM (
    SELECT
      public.calibration_score_band(r.score) AS band,
      public.reporting_rate(
        count(*) FILTER (WHERE r.closed),
        count(*),
        v_min,
        false
      ) AS rate
    FROM public.call_quality_measures m
    JOIN public.calibration_mature_resolved(p_org_id) r ON r.lead_id = m.lead_id
    JOIN public.org_members s ON s.id = m.member_id
    WHERE m.org_id = p_org_id
      AND r.score IS NOT NULL
      AND s.call_coaching_acknowledged_at IS NOT NULL
      AND public.call_quality_measure_in_scope(
        m.member_id, m.occurred_at, p_member_id, p_viewer, p_cutoff
      )
    GROUP BY public.calibration_score_band(r.score)
    HAVING count(*) >= v_min
  ) b;

  v_bands := jsonb_build_object(
    'shown', COALESCE(v_eligible, 0) > 0,
    'reason', CASE WHEN COALESCE(v_eligible, 0) > 0 THEN NULL ELSE 'insufficient_within_band' END,
    'plain', CASE
      WHEN COALESCE(v_eligible, 0) > 0 THEN
        'Close rates inside score bands, so a queue of easier leads does not look like better closing.'
      ELSE
        'Not enough transcribed calls in any score band to compare close rates while controlling for lead quality. Nothing is shown.'
    END,
    'rows', COALESCE(v_bands, '[]'::jsonb)
  );

  SELECT jsonb_build_object(
    'shown', count(*) FILTER (WHERE r.closed) >= v_min
         AND count(*) FILTER (WHERE NOT r.closed) >= v_min,
    'reason', CASE
      WHEN count(*) FILTER (WHERE r.closed) >= v_min
       AND count(*) FILTER (WHERE NOT r.closed) >= v_min THEN NULL
      ELSE 'insufficient_closed_lost'
    END,
    'closedN', count(*) FILTER (WHERE r.closed),
    'lostN', count(*) FILTER (WHERE NOT r.closed),
    'meanScoreClosed', avg(r.score) FILTER (WHERE r.closed),
    'meanScoreLost', avg(r.score) FILTER (WHERE NOT r.closed),
    'leadQualityCaveat', CASE
      WHEN abs(
        COALESCE(avg(r.score) FILTER (WHERE r.closed), 0)
        - COALESCE(avg(r.score) FILTER (WHERE NOT r.closed), 0)
      ) > 5 THEN
        'This difference could still reflect lead quality within the band.'
      ELSE NULL
    END,
    'specificNextStepClosed', count(*) FILTER (WHERE r.closed AND m.commitment_clarity = 'specific'),
    'specificNextStepLost', count(*) FILTER (WHERE NOT r.closed AND m.commitment_clarity = 'specific'),
    'authorityExploredClosed', count(*) FILTER (WHERE r.closed AND m.discovery_authority),
    'authorityExploredLost', count(*) FILTER (WHERE NOT r.closed AND m.discovery_authority),
    'plain', CASE
      WHEN count(*) FILTER (WHERE r.closed) < v_min
        OR count(*) FILTER (WHERE NOT r.closed) < v_min THEN
        'Not enough closed and lost calls in comparable score bands to describe what differed.'
      ELSE
        format(
          'In comparable score bands, a dated next step showed up on %s of %s calls that closed and %s of %s that did not. This describes the recordings; it is not a script.',
          count(*) FILTER (WHERE r.closed AND m.commitment_clarity = 'specific'),
          count(*) FILTER (WHERE r.closed),
          count(*) FILTER (WHERE NOT r.closed AND m.commitment_clarity = 'specific'),
          count(*) FILTER (WHERE NOT r.closed)
        )
    END
  )
  INTO v_structure
  FROM public.call_quality_measures m
  JOIN public.calibration_mature_resolved(p_org_id) r ON r.lead_id = m.lead_id
  JOIN public.org_members s ON s.id = m.member_id
  WHERE m.org_id = p_org_id
    AND r.score IS NOT NULL
    AND s.call_coaching_acknowledged_at IS NOT NULL
    AND public.call_quality_measure_in_scope(
      m.member_id, m.occurred_at, p_member_id, p_viewer, p_cutoff
    )
    AND public.calibration_score_band(r.score) IN (
      SELECT public.calibration_score_band(r2.score)
      FROM public.call_quality_measures m2
      JOIN public.calibration_mature_resolved(p_org_id) r2 ON r2.lead_id = m2.lead_id
      JOIN public.org_members s2 ON s2.id = m2.member_id
      WHERE m2.org_id = p_org_id
        AND r2.score IS NOT NULL
        AND s2.call_coaching_acknowledged_at IS NOT NULL
        AND public.call_quality_measure_in_scope(
          m2.member_id, m2.occurred_at, p_member_id, p_viewer, p_cutoff
        )
      GROUP BY public.calibration_score_band(r2.score)
      HAVING count(*) FILTER (WHERE r2.closed) >= v_min
         AND count(*) FILTER (WHERE NOT r2.closed) >= v_min
    );

  SELECT COALESCE(jsonb_agg(row_to_json(w)::jsonb ORDER BY w.week), '[]'::jsonb)
  INTO v_movement
  FROM (
    SELECT
      date_trunc('week', m.occurred_at)::date AS week,
      count(*) AS "callN",
      count(*) FILTER (WHERE NOT m.discovery_authority) AS "authoritySkippedN",
      count(*) FILTER (WHERE m.commitment_clarity = 'specific') AS "specificNextStepN"
    FROM public.call_quality_measures m
    JOIN public.org_members s ON s.id = m.member_id
    WHERE m.org_id = p_org_id
      AND s.call_coaching_acknowledged_at IS NOT NULL
      AND public.call_quality_measure_in_scope(
        m.member_id, m.occurred_at, p_member_id, p_viewer, p_cutoff
      )
      AND m.occurred_at >= now() - interval '56 days'
    GROUP BY date_trunc('week', m.occurred_at)
  ) w;

  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb)
  INTO v_work
  FROM (
    SELECT
      'discovery'::text AS kind,
      format(
        '%s was not explored on %s of %s calls.',
        skipped.label,
        skipped.skipped_n,
        skipped.call_n
      ) AS plain,
      (
        SELECT COALESCE(jsonb_agg(z.call_id), '[]'::jsonb)
        FROM (
          SELECT m2.call_id
          FROM public.call_quality_measures m2
          JOIN public.org_members s2 ON s2.id = m2.member_id
          WHERE m2.org_id = p_org_id
            AND s2.call_coaching_acknowledged_at IS NOT NULL
            AND public.call_quality_measure_in_scope(
              m2.member_id, m2.occurred_at, p_member_id, p_viewer, p_cutoff
            )
            AND (
              (skipped.factor = 'decision_authority' AND NOT m2.discovery_authority)
              OR (skipped.factor = 'pain' AND NOT m2.discovery_pain)
              OR (skipped.factor = 'timeline' AND NOT m2.discovery_timeline)
              OR (skipped.factor = 'investment_capacity' AND NOT m2.discovery_budget)
            )
          ORDER BY m2.occurred_at DESC
          LIMIT 3
        ) z
      ) AS "exampleCallIds"
    FROM (
      SELECT factor, label, skipped_n, call_n
      FROM (
        SELECT
          'decision_authority'::text AS factor,
          'Decision authority'::text AS label,
          count(*) FILTER (WHERE NOT m.discovery_authority) AS skipped_n,
          count(*) AS call_n
        FROM public.call_quality_measures m
        JOIN public.org_members s ON s.id = m.member_id
        WHERE m.org_id = p_org_id
          AND s.call_coaching_acknowledged_at IS NOT NULL
          AND public.call_quality_measure_in_scope(
            m.member_id, m.occurred_at, p_member_id, p_viewer, p_cutoff
          )
        UNION ALL
        SELECT
          'pain',
          'Pain',
          count(*) FILTER (WHERE NOT m.discovery_pain),
          count(*)
        FROM public.call_quality_measures m
        JOIN public.org_members s ON s.id = m.member_id
        WHERE m.org_id = p_org_id
          AND s.call_coaching_acknowledged_at IS NOT NULL
          AND public.call_quality_measure_in_scope(
            m.member_id, m.occurred_at, p_member_id, p_viewer, p_cutoff
          )
        UNION ALL
        SELECT
          'timeline',
          'Timeline',
          count(*) FILTER (WHERE NOT m.discovery_timeline),
          count(*)
        FROM public.call_quality_measures m
        JOIN public.org_members s ON s.id = m.member_id
        WHERE m.org_id = p_org_id
          AND s.call_coaching_acknowledged_at IS NOT NULL
          AND public.call_quality_measure_in_scope(
            m.member_id, m.occurred_at, p_member_id, p_viewer, p_cutoff
          )
        UNION ALL
        SELECT
          'investment_capacity',
          'Investment capacity',
          count(*) FILTER (WHERE NOT m.discovery_budget),
          count(*)
        FROM public.call_quality_measures m
        JOIN public.org_members s ON s.id = m.member_id
        WHERE m.org_id = p_org_id
          AND s.call_coaching_acknowledged_at IS NOT NULL
          AND public.call_quality_measure_in_scope(
            m.member_id, m.occurred_at, p_member_id, p_viewer, p_cutoff
          )
      ) factors
      ORDER BY skipped_n DESC, factor
      LIMIT 1
    ) skipped
    WHERE skipped.skipped_n >= 1
    UNION ALL
    SELECT
      'objection'::text,
      COALESCE(v_lost ->> 'plain', ''),
      (
        SELECT COALESCE(jsonb_agg(z.call_id), '[]'::jsonb)
        FROM (
          SELECT m2.call_id
          FROM public.call_quality_measures m2
          JOIN public.call_objection_handlings h ON h.call_id = m2.call_id
          JOIN public.org_members s2 ON s2.id = m2.member_id
          WHERE m2.org_id = p_org_id
            AND h.handling IN ('deflected', 'ignored')
            AND s2.call_coaching_acknowledged_at IS NOT NULL
            AND public.call_quality_measure_in_scope(
              m2.member_id, m2.occurred_at, p_member_id, p_viewer, p_cutoff
            )
          ORDER BY m2.occurred_at DESC
          LIMIT 3
        ) z
      )
    FROM (SELECT 1) dummy
    WHERE COALESCE((v_lost ->> 'shown')::boolean, false)
  ) t;

  IF p_member_id IS NULL THEN
    v_best := '[]'::jsonb;
    SELECT COALESCE(jsonb_agg(
      (elem - 'exampleCallIds') || jsonb_build_object('exampleCallIds', '[]'::jsonb)
    ), '[]'::jsonb)
    INTO v_work
    FROM jsonb_array_elements(COALESCE(v_work, '[]'::jsonb)) elem;
  END IF;

  RETURN jsonb_build_object(
    'shown', true,
    'reason', NULL,
    'sampleN', v_n,
    'minN', v_min,
    'plain', 'These are patterns across a meaningful number of calls, not a judgment of any one of them.',
    'discovery', COALESCE(v_discovery, '[]'::jsonb),
    'objectionLost', COALESCE(v_lost, jsonb_build_object('shown', false)),
    'closeByBand', COALESCE(v_bands, jsonb_build_object('shown', false)),
    'closedVsLost', COALESCE(v_structure, jsonb_build_object('shown', false)),
    'movement', COALESCE(v_movement, '[]'::jsonb),
    'bestCalls', COALESCE(v_best, '[]'::jsonb),
    'workOn', COALESCE(v_work, '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.call_quality_catalog()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_array(
    jsonb_build_object('key', 'speakers_attributed', 'label', 'Whether speakers could be attributed', 'where', 'call'),
    jsonb_build_object('key', 'talk_ratio_rep', 'label', 'Talk ratio (rep share of attributed words)', 'where', 'call'),
    jsonb_build_object('key', 'talk_ratio_prospect', 'label', 'Talk ratio (prospect share of attributed words)', 'where', 'call'),
    jsonb_build_object('key', 'question_count', 'label', 'Question count', 'where', 'call'),
    jsonb_build_object('key', 'open_question_count', 'label', 'Open questions', 'where', 'call'),
    jsonb_build_object('key', 'closed_question_count', 'label', 'Closed questions', 'where', 'call'),
    jsonb_build_object('key', 'longest_rep_monologue_words', 'label', 'Longest uninterrupted rep monologue (words)', 'where', 'call'),
    jsonb_build_object('key', 'duration_seconds', 'label', 'Call duration', 'where', 'call'),
    jsonb_build_object('key', 'typical_duration_seconds', 'label', 'Org typical duration for this call type', 'where', 'call'),
    jsonb_build_object('key', 'next_step_stated', 'label', 'Whether a next step was stated', 'where', 'call'),
    jsonb_build_object('key', 'next_step_agreed', 'label', 'Whether a next step was agreed', 'where', 'call'),
    jsonb_build_object('key', 'commitment_clarity', 'label', 'Whether the next step was specific with a time, or vague', 'where', 'call'),
    jsonb_build_object('key', 'discovery_pain', 'label', 'Whether pain was explored', 'where', 'call'),
    jsonb_build_object('key', 'discovery_timeline', 'label', 'Whether timeline was explored', 'where', 'call'),
    jsonb_build_object('key', 'discovery_budget', 'label', 'Whether investment capacity was explored', 'where', 'call'),
    jsonb_build_object('key', 'discovery_authority', 'label', 'Whether decision authority was explored', 'where', 'call'),
    jsonb_build_object('key', 'objection_handling', 'label', 'For each objection: addressed, deflected, or ignored', 'where', 'call'),
    jsonb_build_object('key', 'open_objections_addressed', 'label', 'Whether open objections from the brief were addressed', 'where', 'call'),
    jsonb_build_object('key', 'brief_opened_before_call', 'label', 'Whether the brief was opened before the call', 'where', 'call'),
    jsonb_build_object('key', 'discovery_skip_counts', 'label', 'Which readiness factors were not explored, as counts', 'where', 'pattern'),
    jsonb_build_object('key', 'objection_lost_most', 'label', 'Which objection this rep loses to most often', 'where', 'pattern'),
    jsonb_build_object('key', 'close_rate_by_band', 'label', 'Close rate within score bands (never raw across unequal queues)', 'where', 'pattern'),
    jsonb_build_object('key', 'closed_vs_lost_structure', 'label', 'How closed calls differed structurally from lost ones', 'where', 'pattern'),
    jsonb_build_object('key', 'best_calls', 'label', 'Own calls that closed, so they can be listened to again', 'where', 'pattern'),
    jsonb_build_object('key', 'work_on', 'label', 'One or two things to work on, with examples from their own calls', 'where', 'pattern'),
    jsonb_build_object('key', 'what_works', 'label', 'What differed on closed vs lost calls in this business', 'where', 'org'),
    jsonb_build_object('key', 'gaming_signal', 'label', 'A structural shift without a corresponding outcome change', 'where', 'pattern'),
    jsonb_build_object('key', 'team_comparison', 'label', 'Team patterns (available, not forced, never a rank)', 'where', 'pattern')
  );
$$;

CREATE OR REPLACE FUNCTION public.load_call_quality_rep_snapshot(
  p_org_id uuid,
  p_member_id uuid DEFAULT NULL,
  p_query text DEFAULT NULL,
  p_include_team boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_viewer uuid;
  v_subject uuid;
  v_is_coach boolean;
  v_cutoff timestamptz;
  v_acked timestamptz;
  v_name text;
  v_calls jsonb;
  v_findings jsonb;
  v_gaming jsonb;
  v_q text := NULLIF(btrim(COALESCE(p_query, '')), '');
BEGIN
  IF p_org_id IS NULL OR p_org_id NOT IN (SELECT public.user_org_ids()) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  v_viewer := public.user_member_id(p_org_id);
  IF v_viewer IS NULL THEN
    RAISE EXCEPTION 'not a member of this workspace' USING ERRCODE = '42501';
  END IF;

  v_is_coach := public.user_has_org_role(p_org_id, 'owner', 'admin');
  v_subject := COALESCE(p_member_id, v_viewer);
  v_cutoff := public.call_quality_cutoff(p_org_id);

  IF v_subject IS DISTINCT FROM v_viewer AND NOT v_is_coach THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT call_coaching_acknowledged_at, display_name
  INTO v_acked, v_name
  FROM public.org_members
  WHERE id = v_subject AND org_id = p_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'member not found';
  END IF;

  IF v_acked IS NULL THEN
    RETURN jsonb_build_object(
      'acknowledged', false,
      'acknowledgedAt', NULL,
      'viewerIsSubject', v_subject = v_viewer,
      'viewerIsCoach', v_is_coach,
      'embargoHours', (SELECT call_coaching_embargo_hours FROM public.organizations WHERE id = p_org_id),
      'cutoff', v_cutoff,
      'minN', public.reporting_diag_min(),
      'measuresCatalog', public.call_quality_catalog(),
      'honesty', 'These numbers describe what was on the recording. They are not a grade, not a ranking, and not a reason to fire anyone.',
      'structuralNotATarget', 'Talk ratio, question count, and call length are diagnostics. They are not goals.',
      'displayName', v_name,
      'memberId', v_subject,
      'calls', '[]'::jsonb,
      'patterns', jsonb_build_object('shown', false, 'reason', 'not_told'),
      'team', NULL,
      'findings', '[]'::jsonb,
      'gaming', '[]'::jsonb
    );
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(c)::jsonb), '[]'::jsonb)
  INTO v_calls
  FROM (
    SELECT
      m.call_id AS "callId",
      m.lead_id AS "leadId",
      m.occurred_at AS "occurredAt",
      m.call_type AS "callType",
      COALESCE(
        NULLIF(btrim(concat_ws(' ', l.first_name, l.last_name)), ''),
        NULLIF(btrim(l.email), ''),
        'Unnamed lead'
      ) AS "leadName",
      m.speakers_attributed AS "speakersAttributed",
      m.talk_ratio_rep AS "talkRatioRep",
      m.talk_ratio_prospect AS "talkRatioProspect",
      m.question_count AS "questionCount",
      m.open_question_count AS "openQuestionCount",
      m.closed_question_count AS "closedQuestionCount",
      m.longest_rep_monologue_words AS "longestRepMonologueWords",
      m.duration_seconds AS "durationSeconds",
      m.typical_duration_seconds AS "typicalDurationSeconds",
      m.next_step_stated AS "nextStepStated",
      m.next_step_agreed AS "nextStepAgreed",
      m.commitment_clarity AS "commitmentClarity",
      m.discovery_pain AS "discoveryPain",
      m.discovery_timeline AS "discoveryTimeline",
      m.discovery_budget AS "discoveryBudget",
      m.discovery_authority AS "discoveryAuthority",
      m.open_objections_prior_n AS "openObjectionsPriorN",
      m.open_objections_addressed_n AS "openObjectionsAddressedN",
      m.brief_opened_before_call AS "briefOpenedBeforeCall",
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'type', h.objection_type,
          'handling', h.handling,
          'verbatim', h.verbatim
        ))
        FROM public.call_objection_handlings h
        WHERE h.call_id = m.call_id
      ), '[]'::jsonb) AS objections
    FROM public.call_quality_measures m
    JOIN public.leads l ON l.id = m.lead_id AND l.org_id = m.org_id
    WHERE m.org_id = p_org_id
      AND public.call_quality_measure_in_scope(
        m.member_id, m.occurred_at, v_subject, v_viewer, v_cutoff
      )
      AND (
        v_q IS NULL
        OR COALESCE(l.first_name, '') ILIKE '%' || v_q || '%'
        OR COALESCE(l.last_name, '') ILIKE '%' || v_q || '%'
        OR COALESCE(l.email, '') ILIKE '%' || v_q || '%'
      )
    ORDER BY m.occurred_at DESC
    LIMIT 50
  ) c;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'key', f.finding_key,
    'kind', f.finding_kind,
    'statement', f.statement,
    'sampleClosed', f.sample_closed,
    'sampleLost', f.sample_lost,
    'bands', to_jsonb(f.bands_used),
    'leadQualityCaveat', f.lead_quality_caveat
  ) ORDER BY f.created_at DESC), '[]'::jsonb)
  INTO v_findings
  FROM public.call_coaching_findings f
  WHERE f.org_id = p_org_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'measureKey', g.measure_key,
    'statement', g.statement,
    'detectedAt', g.detected_at,
    'relativeShift', g.relative_shift,
    'outcomeShiftPp', g.outcome_shift_pp
  ) ORDER BY g.detected_at DESC), '[]'::jsonb)
  INTO v_gaming
  FROM public.call_coaching_gaming_signals g
  WHERE g.org_id = p_org_id
    AND g.member_id = v_subject
    AND public.call_quality_row_visible(g.org_id, g.member_id, g.detected_at);

  RETURN jsonb_build_object(
    'acknowledged', true,
    'acknowledgedAt', v_acked,
    'viewerIsSubject', v_subject = v_viewer,
    'viewerIsCoach', v_is_coach,
    'embargoHours', (SELECT call_coaching_embargo_hours FROM public.organizations WHERE id = p_org_id),
    'cutoff', v_cutoff,
    'minN', public.reporting_diag_min(),
    'measuresCatalog', public.call_quality_catalog(),
    'honesty', 'These numbers describe what was on the recording. They are not a grade, not a ranking, and not a reason to fire anyone.',
    'structuralNotATarget', 'Talk ratio, question count, and call length are diagnostics. They are not goals. Moving the number without moving the outcome is the signature of a gamed measure.',
    'displayName', v_name,
    'memberId', v_subject,
    'calls', COALESCE(v_calls, '[]'::jsonb),
    'patterns', public.call_quality_patterns(p_org_id, v_subject, v_cutoff, v_viewer),
    'team', CASE
      WHEN p_include_team THEN public.call_quality_patterns(p_org_id, NULL, v_cutoff, v_viewer)
      ELSE NULL
    END,
    'findings', COALESCE(v_findings, '[]'::jsonb),
    'gaming', COALESCE(v_gaming, '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.load_call_quality_manager_snapshot(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_viewer uuid;
  v_cutoff timestamptz;
  v_team jsonb;
  v_reps jsonb;
  v_findings jsonb;
  v_gaming jsonb;
  v_brief jsonb;
BEGIN
  PERFORM public.reporting_require_access(p_org_id);
  v_viewer := public.user_member_id(p_org_id);
  v_cutoff := public.call_quality_cutoff(p_org_id);
  v_team := public.call_quality_patterns(p_org_id, NULL, v_cutoff, v_viewer);

  SELECT COALESCE(jsonb_agg(row_to_json(r)::jsonb ORDER BY r."displayName"), '[]'::jsonb)
  INTO v_reps
  FROM (
    SELECT
      q."memberId",
      q."displayName",
      q.patterns,
      CASE
        WHEN COALESCE((q.patterns ->> 'shown')::boolean, false) THEN
          COALESCE(
            (
              SELECT format(
                '%s''s calls rarely establish %s; here are examples to review together.',
                q."displayName",
                d ->> 'label'
              )
              FROM jsonb_array_elements(COALESCE(q.patterns -> 'discovery', '[]'::jsonb)) d
              WHERE COALESCE((d ->> 'skippedN')::integer, 0) > 0
              ORDER BY (d ->> 'skippedN')::integer DESC
              LIMIT 1
            ),
            format(
              '%s has a pattern worth reviewing together. The examples are from their own calls, not a verdict on any one of them.',
              q."displayName"
            )
          )
        ELSE
          format(
            'Not enough of %s''s transcribed calls to describe a pattern yet.',
            q."displayName"
          )
      END AS "coachingPrompt"
    FROM (
      SELECT
        s.id AS "memberId",
        s.display_name AS "displayName",
        public.call_quality_patterns(p_org_id, s.id, v_cutoff, v_viewer) AS patterns
      FROM public.org_members s
      WHERE s.org_id = p_org_id
        AND s.active
        AND s.call_coaching_acknowledged_at IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.call_quality_measures m
          WHERE m.member_id = s.id
            AND m.org_id = p_org_id
            AND m.occurred_at <= v_cutoff
        )
    ) q
  ) r;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'key', f.finding_key,
    'kind', f.finding_kind,
    'statement', f.statement,
    'sampleClosed', f.sample_closed,
    'sampleLost', f.sample_lost,
    'bands', to_jsonb(f.bands_used),
    'leadQualityCaveat', f.lead_quality_caveat
  ) ORDER BY f.created_at DESC), '[]'::jsonb)
  INTO v_findings
  FROM public.call_coaching_findings f
  WHERE f.org_id = p_org_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'memberId', g.member_id,
    'displayName', s.display_name,
    'measureKey', g.measure_key,
    'statement', g.statement,
    'detectedAt', g.detected_at
  ) ORDER BY s.display_name, g.detected_at DESC), '[]'::jsonb)
  INTO v_gaming
  FROM public.call_coaching_gaming_signals g
  JOIN public.org_members s ON s.id = g.member_id
  WHERE g.org_id = p_org_id
    AND g.detected_at <= v_cutoff;

  SELECT jsonb_build_object(
    'shown', count(*) >= public.reporting_diag_min(),
    'openedN', count(*) FILTER (WHERE m.brief_opened_before_call),
    'callN', count(*),
    'objectionsPriorN', COALESCE(sum(m.open_objections_prior_n), 0),
    'objectionsAddressedN', COALESCE(sum(m.open_objections_addressed_n), 0),
    'plain', CASE
      WHEN count(*) < public.reporting_diag_min() THEN
        'Not enough transcribed calls to describe whether briefs are being opened before calls.'
      ELSE
        format(
          'The brief was opened before %s of %s transcribed calls. Open objections from those briefs were addressed on %s of the %s that had them.',
          count(*) FILTER (WHERE m.brief_opened_before_call),
          count(*),
          COALESCE(sum(m.open_objections_addressed_n), 0),
          COALESCE(sum(m.open_objections_prior_n), 0)
        )
    END
  )
  INTO v_brief
  FROM public.call_quality_measures m
  JOIN public.org_members s ON s.id = m.member_id
  WHERE m.org_id = p_org_id
    AND s.call_coaching_acknowledged_at IS NOT NULL
    AND m.occurred_at <= v_cutoff;

  RETURN jsonb_build_object(
    'embargoHours', (SELECT call_coaching_embargo_hours FROM public.organizations WHERE id = p_org_id),
    'cutoff', v_cutoff,
    'minN', public.reporting_diag_min(),
    'honesty', 'Frame every per-rep output as a coaching prompt, never a performance verdict. The product describes patterns; a manager forms judgments.',
    'structuralNotATarget', 'Talk ratio, question count, and call length are diagnostics. They are not goals.',
    'measuresCatalog', public.call_quality_catalog(),
    'team', v_team,
    'reps', COALESCE(v_reps, '[]'::jsonb),
    'findings', COALESCE(v_findings, '[]'::jsonb),
    'gaming', COALESCE(v_gaming, '[]'::jsonb),
    'briefUsage', COALESCE(v_brief, jsonb_build_object('shown', false))
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.list_call_quality_pending(p_limit integer DEFAULT 40)
RETURNS TABLE (call_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.call_quality_require_job();

  RETURN QUERY
  SELECT c.id
  FROM public.calls c
  JOIN public.org_members m ON m.id = c.ran_by_member_id AND m.org_id = c.org_id
  LEFT JOIN public.call_quality_measures q ON q.call_id = c.id
  WHERE c.raw_transcript IS NOT NULL
    AND m.call_coaching_acknowledged_at IS NOT NULL
    AND (
      q.id IS NULL
      OR q.analyzed_at < COALESCE(c.transcript_arrived_at, q.analyzed_at)
      OR q.analyzed_at < COALESCE(
        (SELECT e.extracted_at FROM public.call_extractions e WHERE e.call_id = c.id),
        q.analyzed_at
      )
    )
  ORDER BY c.occurred_at DESC NULLS LAST
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 40), 100));
END;
$$;

CREATE OR REPLACE FUNCTION public.load_call_quality_language_corpus(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_min integer := public.reporting_diag_min();
  v_rows jsonb;
BEGIN
  PERFORM public.call_quality_require_job();

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'callId', x.call_id,
    'closed', x.closed,
    'band', x.band,
    'transcript', x.transcript,
    'score', x.score
  )), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT
      m.call_id,
      r.closed,
      public.calibration_score_band(r.score) AS band,
      c.raw_transcript AS transcript,
      r.score
    FROM public.call_quality_measures m
    JOIN public.calls c ON c.id = m.call_id
    JOIN public.calibration_mature_resolved(p_org_id) r ON r.lead_id = m.lead_id
    WHERE m.org_id = p_org_id
      AND c.raw_transcript IS NOT NULL
      AND r.score IS NOT NULL
      AND public.calibration_score_band(r.score) IN (
        SELECT public.calibration_score_band(r2.score)
        FROM public.call_quality_measures m2
        JOIN public.calibration_mature_resolved(p_org_id) r2 ON r2.lead_id = m2.lead_id
        WHERE m2.org_id = p_org_id AND r2.score IS NOT NULL
        GROUP BY public.calibration_score_band(r2.score)
        HAVING count(*) FILTER (WHERE r2.closed) >= v_min
           AND count(*) FILTER (WHERE NOT r2.closed) >= v_min
      )
  ) x;

  RETURN jsonb_build_object(
    'minN', v_min,
    'rows', COALESCE(v_rows, '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_call_quality_org(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_min integer := public.reporting_diag_min();
  v_now_start timestamptz := now() - interval '14 days';
  v_prev_start timestamptz := now() - interval '28 days';
  v_findings integer := 0;
  v_gaming integer := 0;
  v_bands text[];
  v_closed integer;
  v_lost integer;
  v_mean_c numeric;
  v_mean_l numeric;
  v_caveat text;
BEGIN
  PERFORM public.call_quality_require_job();

  DELETE FROM public.call_coaching_gaming_signals WHERE org_id = p_org_id;
  DELETE FROM public.call_coaching_findings
  WHERE org_id = p_org_id AND finding_kind IN ('structural', 'substantive');

  INSERT INTO public.call_coaching_gaming_signals (
    org_id, member_id, measure_key, window_start, window_end,
    prior_value, current_value, relative_shift, outcome_shift_pp, statement
  )
  SELECT
    p_org_id,
    cur.member_id,
    cur.measure_key,
    v_prev_start,
    now(),
    prev.val,
    cur.val,
    CASE WHEN prev.val = 0 THEN NULL ELSE abs(cur.val - prev.val) / abs(prev.val) END,
    outcome.shift_pp,
    format(
      '%s moved from %s to %s across two 14-day windows while close rate inside matched score bands moved %s points. That is the signature of a measure being managed rather than the work.',
      cur.measure_key,
      round(prev.val, 2),
      round(cur.val, 2),
      round(outcome.shift_pp, 1)
    )
  FROM (
    SELECT member_id, 'talk_ratio_rep'::text AS measure_key,
           avg(talk_ratio_rep) FILTER (WHERE speakers_attributed) AS val,
           count(*) AS n
    FROM public.call_quality_measures
    WHERE org_id = p_org_id AND occurred_at > v_now_start
    GROUP BY member_id
    HAVING count(*) >= v_min
    UNION ALL
    SELECT member_id, 'question_count', avg(question_count), count(*)
    FROM public.call_quality_measures
    WHERE org_id = p_org_id AND occurred_at > v_now_start
    GROUP BY member_id
    HAVING count(*) >= v_min
    UNION ALL
    SELECT member_id, 'duration_seconds', avg(duration_seconds) FILTER (WHERE duration_seconds IS NOT NULL), count(*)
    FROM public.call_quality_measures
    WHERE org_id = p_org_id AND occurred_at > v_now_start
    GROUP BY member_id
    HAVING count(*) >= v_min
  ) cur
  JOIN (
    SELECT member_id, 'talk_ratio_rep'::text AS measure_key,
           avg(talk_ratio_rep) FILTER (WHERE speakers_attributed) AS val,
           count(*) AS n
    FROM public.call_quality_measures
    WHERE org_id = p_org_id AND occurred_at > v_prev_start AND occurred_at <= v_now_start
    GROUP BY member_id
    HAVING count(*) >= v_min
    UNION ALL
    SELECT member_id, 'question_count', avg(question_count), count(*)
    FROM public.call_quality_measures
    WHERE org_id = p_org_id AND occurred_at > v_prev_start AND occurred_at <= v_now_start
    GROUP BY member_id
    HAVING count(*) >= v_min
    UNION ALL
    SELECT member_id, 'duration_seconds', avg(duration_seconds) FILTER (WHERE duration_seconds IS NOT NULL), count(*)
    FROM public.call_quality_measures
    WHERE org_id = p_org_id AND occurred_at > v_prev_start AND occurred_at <= v_now_start
    GROUP BY member_id
    HAVING count(*) >= v_min
  ) prev
    ON prev.member_id = cur.member_id AND prev.measure_key = cur.measure_key
  JOIN LATERAL (
    SELECT COALESCE(avg(abs(n_pct - p_pct)), 99) AS shift_pp
    FROM (
      SELECT
        public.calibration_score_band(r.score) AS band,
        100.0 * count(*) FILTER (WHERE r.closed) / count(*) AS n_pct
      FROM public.call_quality_measures m
      JOIN public.calibration_mature_resolved(p_org_id) r ON r.lead_id = m.lead_id
      WHERE m.org_id = p_org_id
        AND m.member_id = cur.member_id
        AND m.occurred_at > v_now_start
        AND r.score IS NOT NULL
      GROUP BY public.calibration_score_band(r.score)
      HAVING count(*) >= v_min
    ) n
    JOIN (
      SELECT
        public.calibration_score_band(r.score) AS band,
        100.0 * count(*) FILTER (WHERE r.closed) / count(*) AS p_pct
      FROM public.call_quality_measures m
      JOIN public.calibration_mature_resolved(p_org_id) r ON r.lead_id = m.lead_id
      WHERE m.org_id = p_org_id
        AND m.member_id = cur.member_id
        AND m.occurred_at > v_prev_start
        AND m.occurred_at <= v_now_start
        AND r.score IS NOT NULL
      GROUP BY public.calibration_score_band(r.score)
      HAVING count(*) >= v_min
    ) p ON p.band = n.band
  ) outcome ON true
  WHERE cur.val IS NOT NULL
    AND prev.val IS NOT NULL
    AND prev.val <> 0
    AND abs(cur.val - prev.val) / abs(prev.val) >= 0.2
    AND outcome.shift_pp < 5;

  GET DIAGNOSTICS v_gaming = ROW_COUNT;

  SELECT array_agg(band ORDER BY band),
         sum(closed_n)::integer,
         sum(lost_n)::integer,
         sum(closed_n * mean_c) / NULLIF(sum(closed_n), 0),
         sum(lost_n * mean_l) / NULLIF(sum(lost_n), 0)
  INTO v_bands, v_closed, v_lost, v_mean_c, v_mean_l
  FROM (
    SELECT
      public.calibration_score_band(r.score) AS band,
      count(*) FILTER (WHERE r.closed) AS closed_n,
      count(*) FILTER (WHERE NOT r.closed) AS lost_n,
      avg(r.score) FILTER (WHERE r.closed) AS mean_c,
      avg(r.score) FILTER (WHERE NOT r.closed) AS mean_l
    FROM public.call_quality_measures m
    JOIN public.calibration_mature_resolved(p_org_id) r ON r.lead_id = m.lead_id
    WHERE m.org_id = p_org_id AND r.score IS NOT NULL
    GROUP BY public.calibration_score_band(r.score)
    HAVING count(*) FILTER (WHERE r.closed) >= v_min
       AND count(*) FILTER (WHERE NOT r.closed) >= v_min
  ) b;

  IF v_closed IS NULL OR v_lost IS NULL OR v_closed < v_min OR v_lost < v_min THEN
    RETURN jsonb_build_object(
      'orgId', p_org_id,
      'findings', 0,
      'gaming', v_gaming,
      'plain', 'Not enough closed and lost transcribed calls in comparable score bands to describe what differed.'
    );
  END IF;

  v_caveat := CASE
    WHEN abs(COALESCE(v_mean_c, 0) - COALESCE(v_mean_l, 0)) > 5 THEN
      format(
        'This difference could still reflect lead quality within the band (mean intake score %s vs %s).',
        round(v_mean_c, 1),
        round(v_mean_l, 1)
      )
    ELSE NULL
  END;

  INSERT INTO public.call_coaching_findings (
    org_id, finding_key, finding_kind, sample_closed, sample_lost, bands_used, statement, lead_quality_caveat
  )
  SELECT
    p_org_id,
    f.key,
    f.kind,
    f.closed_n,
    f.lost_n,
    v_bands,
    f.statement,
    v_caveat
  FROM (
    SELECT
      'specific_next_step'::text AS key,
      'structural'::text AS kind,
      count(*) FILTER (WHERE r.closed)::integer AS closed_n,
      count(*) FILTER (WHERE NOT r.closed)::integer AS lost_n,
      count(*) FILTER (WHERE r.closed AND m.commitment_clarity = 'specific') AS k_closed,
      count(*) FILTER (WHERE NOT r.closed AND m.commitment_clarity = 'specific') AS k_lost,
      format(
        'In your business, among %s closed and %s lost calls in score bands %s, a dated next step showed up on %s of the closed calls and %s of the lost ones. This describes the recordings; it is not a script.',
        count(*) FILTER (WHERE r.closed),
        count(*) FILTER (WHERE NOT r.closed),
        array_to_string(v_bands, ', '),
        count(*) FILTER (WHERE r.closed AND m.commitment_clarity = 'specific'),
        count(*) FILTER (WHERE NOT r.closed AND m.commitment_clarity = 'specific')
      ) AS statement
    FROM public.call_quality_measures m
    JOIN public.calibration_mature_resolved(p_org_id) r ON r.lead_id = m.lead_id
    WHERE m.org_id = p_org_id
      AND r.score IS NOT NULL
      AND public.calibration_score_band(r.score) = ANY (v_bands)
    UNION ALL
    SELECT
      'authority_explored',
      'substantive',
      count(*) FILTER (WHERE r.closed),
      count(*) FILTER (WHERE NOT r.closed),
      count(*) FILTER (WHERE r.closed AND m.discovery_authority),
      count(*) FILTER (WHERE NOT r.closed AND m.discovery_authority),
      format(
        'In your business, among %s closed and %s lost calls in score bands %s, decision authority was explored on %s of the closed calls and %s of the lost ones. This describes the recordings; it is not a script.',
        count(*) FILTER (WHERE r.closed),
        count(*) FILTER (WHERE NOT r.closed),
        array_to_string(v_bands, ', '),
        count(*) FILTER (WHERE r.closed AND m.discovery_authority),
        count(*) FILTER (WHERE NOT r.closed AND m.discovery_authority)
      )
    FROM public.call_quality_measures m
    JOIN public.calibration_mature_resolved(p_org_id) r ON r.lead_id = m.lead_id
    WHERE m.org_id = p_org_id
      AND r.score IS NOT NULL
      AND public.calibration_score_band(r.score) = ANY (v_bands)
    UNION ALL
    SELECT
      'objection_addressed',
      'substantive',
      count(DISTINCT m.call_id) FILTER (WHERE r.closed),
      count(DISTINCT m.call_id) FILTER (WHERE NOT r.closed),
      count(*) FILTER (WHERE r.closed AND h.handling = 'addressed'),
      count(*) FILTER (WHERE NOT r.closed AND h.handling = 'addressed'),
      format(
        'In your business, among calls in score bands %s that had an objection, it was addressed on %s of the closed-side objections and %s of the lost-side ones. This describes the recordings; it is not a script.',
        array_to_string(v_bands, ', '),
        count(*) FILTER (WHERE r.closed AND h.handling = 'addressed'),
        count(*) FILTER (WHERE NOT r.closed AND h.handling = 'addressed')
      )
    FROM public.call_quality_measures m
    JOIN public.calibration_mature_resolved(p_org_id) r ON r.lead_id = m.lead_id
    JOIN public.call_objection_handlings h ON h.call_id = m.call_id
    WHERE m.org_id = p_org_id
      AND r.score IS NOT NULL
      AND public.calibration_score_band(r.score) = ANY (v_bands)
  ) f
  WHERE f.closed_n >= v_min
    AND f.lost_n >= v_min
    AND f.lost_n > 0
    AND abs((f.k_closed::numeric / f.closed_n) - (f.k_lost::numeric / f.lost_n)) >= 0.15;

  GET DIAGNOSTICS v_findings = ROW_COUNT;

  RETURN jsonb_build_object('orgId', p_org_id, 'findings', v_findings, 'gaming', v_gaming);
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_call_quality_benchmarks()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_n integer := 0;
BEGIN
  PERFORM public.call_quality_require_job();

  DELETE FROM public.call_coaching_benchmarks;

  INSERT INTO public.call_coaching_benchmarks (finding_key, org_count, sample_n, statement)
  SELECT
    f.finding_key,
    count(DISTINCT f.org_id)::integer,
    sum(f.sample_closed + f.sample_lost)::integer,
    CASE f.finding_key
      WHEN 'specific_next_step' THEN
        'In similar businesses, calls that closed more often stated a dated next step. That is a description of recordings, not a script.'
      WHEN 'authority_explored' THEN
        'In similar businesses, calls that closed more often explored decision authority. That is a description of recordings, not a script.'
      WHEN 'objection_addressed' THEN
        'In similar businesses, objections were addressed more often on calls that closed than on calls that did not. That is a description of recordings, not a script.'
      ELSE
        'In similar businesses, calls that closed showed this same structural pattern. That is a description of recordings, not a script.'
    END
  FROM public.call_coaching_findings f
  JOIN public.business_profiles p ON p.org_id = f.org_id
  WHERE p.aggregate_opt_out = false
    AND f.finding_kind IN ('structural', 'substantive')
  GROUP BY f.finding_key
  HAVING count(DISTINCT f.org_id) >= public.benchmark_min_cohort()
     AND sum(f.sample_closed + f.sample_lost) >= public.reporting_diag_min();

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

CREATE OR REPLACE FUNCTION public.load_org_precall_brief(
  p_org_id uuid,
  p_lead_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_lead public.leads%ROWTYPE;
  v_setter text;
  v_closer text;
  v_score jsonb;
  v_objections jsonb;
  v_last_call jsonb;
  v_triage jsonb;
  v_quotes jsonb;
  v_no_shows integer;
  v_reschedules integer;
  v_inbound jsonb;
  v_opening jsonb;
  v_what jsonb;
BEGIN
  IF p_org_id IS NULL OR p_org_id NOT IN (SELECT public.user_org_ids()) THEN
    RAISE EXCEPTION 'not authorized for this organization';
  END IF;

  SELECT * INTO v_lead
  FROM public.leads
  WHERE id = p_lead_id AND org_id = p_org_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT display_name INTO v_setter FROM public.org_members WHERE id = v_lead.assigned_setter_id;
  SELECT display_name INTO v_closer FROM public.org_members WHERE id = v_lead.assigned_closer_id;

  SELECT jsonb_build_object(
    'id', s.id,
    'total', s.total,
    'timeline', s.timeline_raw,
    'investmentCapacity', s.investment_capacity_raw,
    'decisionAuthority', s.decision_authority_raw,
    'painSeverity', s.pain_severity_raw,
    'triggeredBy', s.triggered_by,
    'createdAt', s.created_at
  )
  INTO v_score
  FROM public.readiness_scores s
  WHERE s.lead_id = p_lead_id AND s.org_id = p_org_id
  ORDER BY s.created_at DESC, s.id DESC
  LIMIT 1;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', o.id,
      'type', o.type,
      'verbatim', o.verbatim,
      'callId', o.call_id,
      'callType', c.type,
      'callOccurredAt', COALESCE(c.occurred_at, c.scheduled_at)
    ) ORDER BY o.created_at DESC
  ), '[]'::jsonb)
  INTO v_objections
  FROM public.objections o
  LEFT JOIN public.calls c ON c.id = o.call_id
  WHERE o.lead_id = p_lead_id AND o.org_id = p_org_id AND o.resolved = false;

  SELECT jsonb_build_object(
    'id', c.id,
    'type', c.type,
    'occurredAt', c.occurred_at,
    'scheduledAt', c.scheduled_at,
    'summary', e.summary,
    'nextStepAgreed', e.next_step_agreed,
    'nextStepState', e.next_step_state
  )
  INTO v_last_call
  FROM public.calls c
  LEFT JOIN public.call_extractions e ON e.call_id = c.id
  WHERE c.lead_id = p_lead_id AND c.org_id = p_org_id
  ORDER BY COALESCE(c.occurred_at, c.scheduled_at, c.created_at) DESC
  LIMIT 1;

  SELECT jsonb_build_object(
    'id', c.id,
    'summary', e.summary,
    'timelineSignal', e.timeline_signal,
    'timelineSignalState', e.timeline_signal_state,
    'budgetSignal', e.budget_signal,
    'budgetSignalState', e.budget_signal_state,
    'decisionProcess', e.decision_process,
    'decisionProcessState', e.decision_process_state,
    'nextStepAgreed', e.next_step_agreed
  )
  INTO v_triage
  FROM public.calls c
  JOIN public.call_extractions e ON e.call_id = c.id
  WHERE c.lead_id = p_lead_id AND c.org_id = p_org_id AND c.type = 'triage'
  ORDER BY COALESCE(c.occurred_at, c.scheduled_at, c.created_at) DESC
  LIMIT 1;

  SELECT COALESCE(jsonb_agg(q.elem), '[]'::jsonb)
  INTO v_quotes
  FROM (
    SELECT elem
    FROM public.calls c
    JOIN public.call_extractions e ON e.call_id = c.id
    CROSS JOIN LATERAL jsonb_array_elements(e.quotes) AS elem
    WHERE c.lead_id = p_lead_id AND c.org_id = p_org_id
    ORDER BY COALESCE(c.occurred_at, c.scheduled_at, c.created_at) DESC
    LIMIT 3
  ) q;

  SELECT count(*)::integer INTO v_no_shows
  FROM public.calls
  WHERE lead_id = p_lead_id AND org_id = p_org_id AND outcome = 'no_show';

  SELECT count(*)::integer INTO v_reschedules
  FROM public.calls
  WHERE lead_id = p_lead_id AND org_id = p_org_id AND outcome = 'rescheduled';

  SELECT jsonb_build_object('at', t.occurred_at, 'channel', t.channel)
  INTO v_inbound
  FROM public.touches t
  WHERE t.lead_id = p_lead_id AND t.org_id = p_org_id AND t.direction = 'inbound'
  ORDER BY t.occurred_at DESC
  LIMIT 1;

  SELECT jsonb_build_object(
    'text', b.opening_text,
    'cacheKey', b.cache_key,
    'modelVersion', b.model_version
  )
  INTO v_opening
  FROM public.brief_openings b
  WHERE b.lead_id = p_lead_id AND b.org_id = p_org_id
  ORDER BY b.created_at DESC
  LIMIT 1;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'statement', f.statement,
    'sampleClosed', f.sample_closed,
    'sampleLost', f.sample_lost,
    'bands', to_jsonb(f.bands_used),
    'leadQualityCaveat', f.lead_quality_caveat
  ) ORDER BY CASE WHEN f.finding_key LIKE 'objection%' THEN 0 ELSE 1 END, f.created_at DESC), '[]'::jsonb)
  INTO v_what
  FROM (
    SELECT *
    FROM public.call_coaching_findings f
    WHERE f.org_id = p_org_id
    ORDER BY CASE WHEN f.finding_key LIKE 'objection%' THEN 0 ELSE 1 END, f.created_at DESC
    LIMIT 3
  ) f;

  RETURN jsonb_build_object(
    'lead', jsonb_build_object(
      'id', v_lead.id,
      'name', COALESCE(
        NULLIF(btrim(concat_ws(' ', v_lead.first_name, v_lead.last_name)), ''),
        NULLIF(btrim(v_lead.email), ''),
        'Unnamed lead'
      ),
      'source', v_lead.source,
      'campaign', v_lead.campaign,
      'offerName', v_lead.offer_name,
      'leadType', v_lead.lead_type,
      'status', v_lead.status,
      'optedInAt', v_lead.opted_in_at,
      'assignedSetterName', v_setter,
      'assignedCloserName', v_closer,
      'applicationAnswers', v_lead.application_answers
    ),
    'score', v_score,
    'openObjections', COALESCE(v_objections, '[]'::jsonb),
    'lastCall', v_last_call,
    'triage', v_triage,
    'quotes', COALESCE(v_quotes, '[]'::jsonb),
    'noShowCount', COALESCE(v_no_shows, 0),
    'rescheduleCount', COALESCE(v_reschedules, 0),
    'lastInbound', v_inbound,
    'cachedOpening', v_opening,
    'whatWorks', COALESCE(v_what, '[]'::jsonb)
  );
END;
$$;

INSERT INTO public.ops_job_catalog (job_name, cron_expr, interval_seconds, grace_seconds, check_first)
VALUES (
  'call-quality',
  '20 * * * *',
  3600,
  1800,
  'Open /api/cron/call-quality. Confirm measures exist only for members who acknowledged coaching, and that owner/admin cannot read another rep''s row inside the embargo window.'
)
ON CONFLICT (job_name) DO UPDATE
  SET cron_expr = EXCLUDED.cron_expr,
      interval_seconds = EXCLUDED.interval_seconds,
      grace_seconds = EXCLUDED.grace_seconds,
      check_first = EXCLUDED.check_first;

INSERT INTO public.ops_job_runs (job_name, last_success_at, updated_at)
VALUES ('call-quality', now(), now())
ON CONFLICT (job_name) DO NOTHING;

REVOKE ALL ON FUNCTION public.call_quality_cutoff(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.call_quality_row_visible(uuid, uuid, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.call_quality_require_job() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.acknowledge_call_coaching(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_brief_view(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.call_quality_measure_in_scope(uuid, timestamptz, uuid, uuid, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.call_quality_patterns(uuid, uuid, timestamptz, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.call_quality_catalog() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.load_call_quality_rep_snapshot(uuid, uuid, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.load_call_quality_manager_snapshot(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_call_quality_pending(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.load_call_quality_language_corpus(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_call_quality_org(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_call_quality_benchmarks() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.load_org_precall_brief(uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.call_quality_cutoff(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.call_quality_row_visible(uuid, uuid, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.call_quality_require_job() TO service_role;
GRANT EXECUTE ON FUNCTION public.acknowledge_call_coaching(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_brief_view(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.call_quality_catalog() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.load_call_quality_rep_snapshot(uuid, uuid, text, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.load_call_quality_manager_snapshot(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.load_org_precall_brief(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_call_quality_pending(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.load_call_quality_language_corpus(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_call_quality_org(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_call_quality_benchmarks() TO service_role;
GRANT EXECUTE ON FUNCTION public.call_quality_patterns(uuid, uuid, timestamptz, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.call_quality_measure_in_scope(uuid, timestamptz, uuid, uuid, timestamptz) TO authenticated, service_role;
