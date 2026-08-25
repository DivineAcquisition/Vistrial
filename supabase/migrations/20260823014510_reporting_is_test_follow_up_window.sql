-- 20260823014510 already ran on the Vistrial project. This file is in the repo
-- so schema_migrations matches. CREATE OR REPLACE keeps existing functions.

-- Test leads must not inflate remaining reporting panels or live cohorts.
-- Follow-up counts use event/sent/halt timestamps, not the lead's opt-in date.

CREATE OR REPLACE FUNCTION public.reporting_compute_team(
  p_org_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.organizations%ROWTYPE;
  v_live_start timestamptz;
  v_rows jsonb;
BEGIN
  PERFORM public.reporting_require_access(p_org_id);
  SELECT * INTO o FROM public.organizations WHERE id = p_org_id;
  v_live_start := GREATEST(p_from, COALESCE(o.activated_at, p_from));

  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.display_name), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT
      m.id,
      m.display_name,
      m.role,
      (
        SELECT count(DISTINCT t.lead_id)
        FROM public.touches t
        JOIN public.leads l ON l.id = t.lead_id AND l.org_id = t.org_id
        WHERE t.org_id = p_org_id
          AND t.actor_member_id = m.id
          AND t.type = 'human'
          AND NOT l.is_test
          AND l.opted_in_at >= v_live_start AND l.opted_in_at < p_to
      )::bigint AS leads_worked,
      (
        SELECT count(*)
        FROM public.touches t
        JOIN public.leads l ON l.id = t.lead_id
        WHERE t.org_id = p_org_id
          AND t.actor_member_id = m.id
          AND NOT l.is_test
          AND l.opted_in_at >= v_live_start AND l.opted_in_at < p_to
      )::bigint AS touches_logged,
      (
        SELECT count(*)
        FROM public.calls c
        JOIN public.leads l ON l.id = c.lead_id
        WHERE c.org_id = p_org_id
          AND c.ran_by_member_id = m.id
          AND c.outcome = 'held'
          AND NOT l.is_test
          AND l.opted_in_at >= v_live_start AND l.opted_in_at < p_to
      )::bigint AS calls_held,
      (
        SELECT count(DISTINCT r.lead_id)
        FROM public.revenue_log r
        JOIN public.leads l ON l.id = r.lead_id
        WHERE r.org_id = p_org_id
          AND r.closed_by_member_id = m.id
          AND NOT l.is_test
          AND l.opted_in_at >= v_live_start AND l.opted_in_at < p_to
      )::bigint AS closes,
      (
        SELECT percentile_cont(0.5) WITHIN GROUP (
          ORDER BY EXTRACT(EPOCH FROM (l.first_human_touch_at - l.opted_in_at)) / 60.0
        )
        FROM public.leads l
        JOIN public.touches t ON t.lead_id = l.id AND t.org_id = l.org_id
          AND t.type = 'human' AND t.actor_member_id = m.id
          AND t.occurred_at = l.first_human_touch_at
        WHERE l.org_id = p_org_id
          AND NOT l.is_test
          AND l.opted_in_at >= v_live_start AND l.opted_in_at < p_to
          AND l.first_human_touch_at IS NOT NULL
      ) AS median_first_touch_minutes
    FROM public.org_members m
    WHERE m.org_id = p_org_id AND m.active = true
  ) t;

  RETURN jsonb_build_object(
    'lineage', 'touches.actor_member_id, calls.ran_by_member_id, revenue_log.closed_by_member_id',
    'presentation', 'workload and coverage, not a ranking',
    'operators', v_rows
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reporting_compute_follow_up(
  p_org_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.organizations%ROWTYPE;
  v_live_start timestamptz;
  v_generated bigint;
  v_approved bigint;
  v_rejected bigint;
  v_sent bigint;
  v_edit jsonb;
  v_reply jsonb;
  v_halt jsonb;
BEGIN
  PERFORM public.reporting_require_access(p_org_id);
  SELECT * INTO o FROM public.organizations WHERE id = p_org_id;
  v_live_start := GREATEST(p_from, COALESCE(o.activated_at, p_from));

  SELECT
    count(*) FILTER (WHERE e.kind IN ('generated', 'regenerated')),
    count(*) FILTER (WHERE e.kind = 'approved'),
    count(*) FILTER (WHERE e.kind = 'rejected'),
    count(*) FILTER (WHERE e.kind = 'sent')
  INTO v_generated, v_approved, v_rejected, v_sent
  FROM public.follow_up_events e
  LEFT JOIN public.follow_up_drafts d ON d.id = e.draft_id
  LEFT JOIN public.leads l ON l.id = d.lead_id AND l.org_id = e.org_id
  WHERE e.org_id = p_org_id
    AND e.created_at >= v_live_start AND e.created_at < p_to
    AND (l.id IS NULL OR NOT l.is_test);

  SELECT COALESCE(jsonb_agg(row_to_json(e) ORDER BY e.branch), '[]'::jsonb)
  INTO v_edit
  FROM (
    SELECT d.branch::text AS branch,
           count(*) FILTER (WHERE d.edit_distance IS NOT NULL)::bigint AS n,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY d.edit_distance)
             FILTER (WHERE d.edit_distance IS NOT NULL) AS median_edit_distance
    FROM public.follow_up_drafts d
    JOIN public.leads l ON l.id = d.lead_id
    WHERE d.org_id = p_org_id
      AND NOT l.is_test
      AND d.created_at >= v_live_start AND d.created_at < p_to
    GROUP BY d.branch
  ) e;

  SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.branch, x.sequence_position), '[]'::jsonb)
  INTO v_reply
  FROM (
    SELECT
      d.branch::text AS branch,
      d.sequence_position,
      count(*) FILTER (WHERE d.status = 'sent')::bigint AS sent,
      count(r.id)::bigint AS replies,
      public.reporting_rate(
        count(r.id)::bigint,
        count(*) FILTER (WHERE d.status = 'sent')::bigint,
        public.reporting_diag_min(),
        false
      ) AS reply_rate
    FROM public.follow_up_drafts d
    JOIN public.leads l ON l.id = d.lead_id
    LEFT JOIN public.follow_up_reply_signals r ON r.draft_id = d.id
    WHERE d.org_id = p_org_id
      AND NOT l.is_test
      AND d.status = 'sent'
      AND d.sent_at >= v_live_start AND d.sent_at < p_to
    GROUP BY d.branch, d.sequence_position
  ) x;

  SELECT COALESCE(jsonb_agg(row_to_json(h) ORDER BY h.n DESC, h.halt_reason), '[]'::jsonb)
  INTO v_halt
  FROM (
    SELECT s.halt_reason::text AS halt_reason, count(*)::bigint AS n
    FROM public.follow_up_sequence_runs s
    JOIN public.leads l ON l.id = s.lead_id
    WHERE s.org_id = p_org_id
      AND NOT l.is_test
      AND s.halt_reason IS NOT NULL
      AND s.halted_at >= v_live_start AND s.halted_at < p_to
    GROUP BY s.halt_reason
  ) h;

  RETURN jsonb_build_object(
    'lineage', 'follow_up_events.created_at, follow_up_drafts.sent_at/created_at, follow_up_sequence_runs.halted_at',
    'generated', v_generated,
    'approved', v_approved,
    'rejected', v_rejected,
    'sent', v_sent,
    'median_edit_distance_by_branch', v_edit,
    'reply_rate_by_branch_position', v_reply,
    'halt_reasons', v_halt
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reporting_compute_objections(
  p_org_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.organizations%ROWTYPE;
  v_live_start timestamptz;
  v_rows jsonb;
  v_n bigint;
BEGIN
  PERFORM public.reporting_require_access(p_org_id);
  SELECT * INTO o FROM public.organizations WHERE id = p_org_id;
  v_live_start := GREATEST(p_from, COALESCE(o.activated_at, p_from));

  SELECT count(DISTINCT o2.lead_id) INTO v_n
  FROM public.objections o2
  JOIN public.leads l ON l.id = o2.lead_id
  WHERE o2.org_id = p_org_id
    AND NOT l.is_test
    AND l.opted_in_at >= v_live_start AND l.opted_in_at < p_to;

  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.n DESC, t.type), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT
      ob.type::text AS type,
      count(*)::bigint AS n,
      count(*) FILTER (
        WHERE l.status = 'closed_lost'
          AND NOT EXISTS (
            SELECT 1 FROM public.revenue_log r WHERE r.lead_id = l.id AND r.org_id = l.org_id
          )
      )::bigint AS lost_n,
      public.reporting_rate(
        count(*) FILTER (
          WHERE l.status = 'closed_lost'
            AND NOT EXISTS (
              SELECT 1 FROM public.revenue_log r WHERE r.lead_id = l.id AND r.org_id = l.org_id
            )
        )::bigint,
        count(*)::bigint,
        public.reporting_diag_min(),
        false
      ) AS lost_rate,
      (
        SELECT COALESCE(jsonb_agg(q.verbatim), '[]'::jsonb)
        FROM (
          SELECT ob2.verbatim
          FROM public.objections ob2
          JOIN public.leads l2 ON l2.id = ob2.lead_id
          WHERE ob2.org_id = p_org_id
            AND ob2.type = ob.type
            AND NOT l2.is_test
            AND l2.opted_in_at >= v_live_start AND l2.opted_in_at < p_to
          ORDER BY ob2.created_at DESC
          LIMIT 3
        ) q
      ) AS quotes,
      (
        SELECT COALESCE(jsonb_agg(row_to_json(tm) ORDER BY tm.display_name), '[]'::jsonb)
        FROM (
          SELECT m.display_name, count(*)::bigint AS n
          FROM public.objections ob3
          JOIN public.leads l3 ON l3.id = ob3.lead_id
          LEFT JOIN public.calls c3 ON c3.id = ob3.call_id
          LEFT JOIN public.org_members m ON m.id = COALESCE(c3.ran_by_member_id, l3.assigned_closer_id)
          WHERE ob3.org_id = p_org_id
            AND ob3.type = ob.type
            AND NOT l3.is_test
            AND l3.opted_in_at >= v_live_start AND l3.opted_in_at < p_to
            AND m.id IS NOT NULL
          GROUP BY m.display_name
        ) tm
      ) AS by_member
    FROM public.objections ob
    JOIN public.leads l ON l.id = ob.lead_id
    WHERE ob.org_id = p_org_id
      AND NOT l.is_test
      AND l.opted_in_at >= v_live_start AND l.opted_in_at < p_to
    GROUP BY ob.type
  ) t;

  RETURN jsonb_build_object(
    'lineage', 'objections joined to leads (outcome) and calls.ran_by_member_id',
    'lead_n', COALESCE(v_n, 0),
    'too_small', COALESCE(v_n, 0) < public.reporting_diag_min(),
    'rows', CASE WHEN COALESCE(v_n, 0) < public.reporting_diag_min() THEN '[]'::jsonb ELSE v_rows END,
    'suppressed_plain', CASE
      WHEN COALESCE(v_n, 0) < public.reporting_diag_min()
      THEN 'Not enough objection rows in this range to treat the pattern as a finding.'
      ELSE NULL
    END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reporting_compute_sources(
  p_org_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.organizations%ROWTYPE;
  v_cfg public.score_configs%ROWTYPE;
  v_live_start timestamptz;
  v_cutoff timestamptz;
  v_org_rate numeric;
  v_rows jsonb;
  v_flag jsonb;
  v_other text;
BEGIN
  PERFORM public.reporting_require_access(p_org_id);
  SELECT * INTO o FROM public.organizations WHERE id = p_org_id;
  SELECT * INTO v_cfg FROM public.score_configs WHERE org_id = p_org_id;
  v_live_start := GREATEST(p_from, COALESCE(o.activated_at, p_from));
  v_cutoff := now() - make_interval(days => o.sales_cycle_days);
  SELECT CASE
    WHEN 'other' = ANY (p.lead_channels) THEN nullif(btrim(p.lead_channels_other), '')
    ELSE NULL
  END
  INTO v_other
  FROM public.business_profiles p
  WHERE p.org_id = p_org_id;

  SELECT (public.reporting_compute_outcome(p_org_id, p_from, p_to) #>> '{headline,per_hundred}')::numeric
  INTO v_org_rate;

  SELECT COALESCE(jsonb_agg(row_to_json(s) ORDER BY s.n DESC, s.source, s.campaign), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT
      COALESCE(nullif(l.source, ''), '(none)') AS source,
      COALESCE(nullif(l.campaign, ''), '(none)') AS campaign,
      count(*)::bigint AS n,
      count(*) FILTER (WHERE l.opted_in_at <= v_cutoff)::bigint AS mature_n,
      avg(ls.total) AS avg_readiness,
      count(*) FILTER (
        WHERE EXISTS (
          SELECT 1 FROM public.calls c
          WHERE c.lead_id = l.id AND c.outcome = 'held'
        )
      )::bigint AS held_n,
      count(*) FILTER (
        WHERE EXISTS (
          SELECT 1 FROM public.calls c
          WHERE c.lead_id = l.id AND c.outcome = 'no_show'
        )
      )::bigint AS noshow_n,
      count(*) FILTER (
        WHERE l.opted_in_at <= v_cutoff
          AND EXISTS (
            SELECT 1 FROM public.revenue_log r WHERE r.lead_id = l.id AND r.org_id = l.org_id
          )
      )::bigint AS closed_n
    FROM public.leads l
    LEFT JOIN LATERAL (
      SELECT rs.total
      FROM public.readiness_scores rs
      WHERE rs.lead_id = l.id
      ORDER BY rs.created_at DESC
      LIMIT 1
    ) ls ON true
    WHERE l.org_id = p_org_id
      AND NOT l.is_test
      AND l.opted_in_at >= v_live_start
      AND l.opted_in_at < p_to
    GROUP BY 1, 2
  ) raw,
  LATERAL (
    SELECT
      raw.*,
      CASE WHEN raw.avg_readiness IS NULL THEN NULL ELSE trunc(raw.avg_readiness * 10) / 10 END
        AS avg_readiness_trunc,
      public.reporting_rate(raw.held_n, raw.held_n + raw.noshow_n, public.reporting_diag_min(), false)
        AS show_rate,
      public.reporting_rate(raw.closed_n, raw.mature_n, public.reporting_rate_min(), true)
        AS clients_per_hundred,
      (
        raw.avg_readiness IS NOT NULL
        AND raw.avg_readiness >= COALESCE(v_cfg.ready_threshold, 60)
        AND (public.reporting_rate(raw.closed_n, raw.mature_n, public.reporting_rate_min(), true) ->> 'per_hundred') IS NOT NULL
        AND v_org_rate IS NOT NULL
        AND (public.reporting_rate(raw.closed_n, raw.mature_n, public.reporting_rate_min(), true) ->> 'per_hundred')::numeric
          < v_org_rate
      ) AS high_readiness_low_close
  ) s;

  SELECT elem INTO v_flag
  FROM jsonb_array_elements(COALESCE(v_rows, '[]'::jsonb)) elem
  WHERE COALESCE((elem ->> 'high_readiness_low_close')::boolean, false)
  ORDER BY (elem ->> 'n')::bigint DESC
  LIMIT 1;

  RETURN jsonb_build_object(
    'lineage', 'leads + readiness_scores + calls + revenue_log',
    'rows', v_rows,
    'high_readiness_low_close', v_flag,
    'other_channel_label', v_other
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reporting_compute_terminal(
  p_org_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.organizations%ROWTYPE;
  v_live_start timestamptz;
  v_n bigint;
  v_rows jsonb;
BEGIN
  PERFORM public.reporting_require_access(p_org_id);
  SELECT * INTO o FROM public.organizations WHERE id = p_org_id;
  v_live_start := GREATEST(p_from, COALESCE(o.activated_at, p_from));

  WITH classified AS (
    SELECT
      l.id,
      CASE
        WHEN l.first_human_touch_at IS NULL THEN 'never_touched'
        WHEN l.status = 'no_show'
          OR (
            EXISTS (
              SELECT 1 FROM public.calls c WHERE c.lead_id = l.id AND c.outcome = 'no_show'
            )
            AND NOT EXISTS (
              SELECT 1 FROM public.calls c WHERE c.lead_id = l.id AND c.outcome = 'held'
            )
          )
        THEN 'no_show'
        WHEN l.status = 'ghost'
          AND (
            SELECT count(*) FROM public.calls c WHERE c.lead_id = l.id AND c.outcome = 'held'
          ) = 1
        THEN 'ghosted_after_one_call'
        WHEN EXISTS (
          SELECT 1 FROM public.objections ob
          WHERE ob.lead_id = l.id AND ob.resolved = false
        ) AND l.status IN ('closed_lost', 'objection_hold', 'ghost')
        THEN 'objection_unresolved'
        WHEN l.status = 'closed_lost' THEN 'explicit_no'
        ELSE 'other_terminal'
      END AS cause
    FROM public.leads l
    WHERE l.org_id = p_org_id
      AND NOT l.is_test
      AND l.opted_in_at >= v_live_start
      AND l.opted_in_at < p_to
      AND l.status IN ('ghost', 'closed_lost', 'no_show')
      AND NOT EXISTS (
        SELECT 1 FROM public.revenue_log r WHERE r.lead_id = l.id AND r.org_id = l.org_id
      )
  )
  SELECT count(*),
         COALESCE(
           jsonb_agg(jsonb_build_object('cause', cause, 'n', n) ORDER BY n DESC, cause),
           '[]'::jsonb
         )
  INTO v_n, v_rows
  FROM (
    SELECT cause, count(*)::bigint AS n FROM classified GROUP BY cause
  ) s;

  RETURN jsonb_build_object(
    'lineage', 'leads.status, leads.first_human_touch_at, calls.outcome, objections.resolved, revenue_log',
    'n', COALESCE(v_n, 0),
    'too_small', COALESCE(v_n, 0) < public.reporting_diag_min(),
    'rows', CASE WHEN COALESCE(v_n, 0) < public.reporting_diag_min() THEN '[]'::jsonb ELSE v_rows END,
    'suppressed_plain', CASE
      WHEN COALESCE(v_n, 0) < public.reporting_diag_min()
      THEN 'Not enough terminal outcomes in this range to treat the split as a finding.'
      ELSE NULL
    END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reporting_compute_speed(
  p_org_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.organizations%ROWTYPE;
  v_window integer;
  v_live_start timestamptz;
  v_cutoff timestamptz;
  v_rows jsonb;
  v_n bigint;
BEGIN
  PERFORM public.reporting_require_access(p_org_id);
  SELECT * INTO o FROM public.organizations WHERE id = p_org_id;
  SELECT speed_to_lead_minutes INTO v_window FROM public.score_configs WHERE org_id = p_org_id;
  v_window := COALESCE(v_window, 15);
  v_live_start := GREATEST(p_from, COALESCE(o.activated_at, p_from));
  v_cutoff := now() - make_interval(days => o.sales_cycle_days);

  WITH bucketed AS (
    SELECT
      CASE
        WHEN first_human_touch_at IS NULL THEN 'never'
        WHEN first_human_touch_at <= opted_in_at + make_interval(mins => v_window) THEN 'within_window'
        WHEN first_human_touch_at <= opted_in_at + interval '1 hour' THEN 'one_hour'
        WHEN first_human_touch_at <= opted_in_at + interval '4 hours' THEN 'four_hours'
        WHEN first_human_touch_at <= opted_in_at + interval '24 hours' THEN 'one_day'
        ELSE 'over_one_day'
      END AS bucket,
      EXISTS (
        SELECT 1 FROM public.revenue_log r WHERE r.lead_id = l.id AND r.org_id = l.org_id
      ) AS closed
    FROM public.leads l
    WHERE l.org_id = p_org_id
      AND NOT l.is_test
      AND l.opted_in_at >= v_live_start
      AND l.opted_in_at < p_to
      AND l.opted_in_at <= v_cutoff
  )
  SELECT count(*),
         COALESCE(jsonb_agg(row_to_json(s) ORDER BY array_position(
           ARRAY['within_window','one_hour','four_hours','one_day','over_one_day','never'],
           s.bucket
         )), '[]'::jsonb)
  INTO v_n, v_rows
  FROM (
    SELECT
      bucket,
      count(*)::bigint AS n,
      count(*) FILTER (WHERE closed)::bigint AS closed,
      public.reporting_rate(
        count(*) FILTER (WHERE closed)::bigint,
        count(*)::bigint,
        public.reporting_diag_min(),
        true
      ) AS close_rate
    FROM bucketed
    GROUP BY bucket
  ) s;

  RETURN jsonb_build_object(
    'lineage', 'leads.first_human_touch_at - leads.opted_in_at, revenue_log, score_configs.speed_to_lead_minutes',
    'speed_to_lead_minutes', v_window,
    'n', COALESCE(v_n, 0),
    'too_small', COALESCE(v_n, 0) < public.reporting_diag_min(),
    'correlation_caveat', 'This is a segmentation of this workspace''s own data, not a claim that speed caused the close.',
    'rows', CASE WHEN COALESCE(v_n, 0) < public.reporting_diag_min() THEN '[]'::jsonb ELSE v_rows END,
    'suppressed_plain', CASE
      WHEN COALESCE(v_n, 0) < public.reporting_diag_min()
      THEN 'Not enough mature leads in this range to segment close rate by speed-to-lead.'
      ELSE NULL
    END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reporting_compute_contribution(
  p_org_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cov jsonb;
  v_out jsonb;
  v_fu jsonb;
  v_live_start timestamptz;
  o public.organizations%ROWTYPE;
  v_run public.baseline_runs%ROWTYPE;
  v_touched bigint;
  v_n bigint;
  v_base_cov numeric;
  v_items jsonb := '[]'::jsonb;
BEGIN
  PERFORM public.reporting_require_access(p_org_id);
  SELECT * INTO o FROM public.organizations WHERE id = p_org_id;
  v_live_start := GREATEST(p_from, COALESCE(o.activated_at, p_from));
  v_cov := public.reporting_compute_coverage(p_org_id, p_from, p_to);
  v_out := public.reporting_compute_outcome(p_org_id, p_from, p_to);
  v_fu := public.reporting_compute_follow_up(p_org_id, p_from, p_to);
  SELECT * INTO v_run FROM public.baseline_runs
  WHERE org_id = p_org_id ORDER BY created_at DESC, id DESC LIMIT 1;

  SELECT count(*), count(*) FILTER (WHERE first_human_touch_at IS NOT NULL)
  INTO v_n, v_touched
  FROM public.leads
  WHERE org_id = p_org_id
    AND NOT is_test
    AND opted_in_at >= v_live_start AND opted_in_at < p_to;

  v_items := v_items || jsonb_build_array(jsonb_build_object(
    'claim', 'Leads in this range that received a human touch',
    'n', v_touched,
    'of', v_n,
    'measurable', true
  ));
  v_items := v_items || jsonb_build_array(jsonb_build_object(
    'claim', 'Leads that went ghost with no human touch',
    'n', (v_cov ->> 'ghosted_no_touch')::bigint,
    'measurable', true
  ));
  v_items := v_items || jsonb_build_array(jsonb_build_object(
    'claim', 'Follow-up drafts the team sent after review',
    'n', (v_fu ->> 'sent')::bigint,
    'measurable', true
  ));

  IF v_run.grade IN ('usable', 'partial') THEN
    SELECT
      CASE WHEN count(*) = 0 THEN NULL
      ELSE trunc((count(*) FILTER (WHERE first_human_touch_at IS NOT NULL)::numeric * 100 / count(*)) * 10) / 10
      END
    INTO v_base_cov
    FROM public.baseline_leads
    WHERE org_id = p_org_id AND run_id = v_run.id AND created_at_crm IS NOT NULL;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'claim', 'Human-touch coverage after activation versus backfilled history',
      'after_pct', v_cov #>> '{ever_touched,pct}',
      'baseline_pct', v_base_cov,
      'measurable', v_cov #>> '{ever_touched,pct}' IS NOT NULL AND v_base_cov IS NOT NULL,
      'note', 'Coverage is something this product measures. It is not a close and not revenue.'
    ));
  END IF;

  RETURN jsonb_build_object(
    'lineage', 'leads.first_human_touch_at, baseline_leads, follow_up_drafts',
    'never_credits_revenue', true,
    'never_credits_closes', true,
    'attribution', 'Vistrial surfaced, scored, briefed, and drafted. The closer closed.',
    'items', v_items
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reporting_compute_readiness(
  p_org_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.organizations%ROWTYPE;
  v_live_start timestamptz;
  v_dist jsonb;
  v_moved bigint;
  v_n bigint;
BEGIN
  PERFORM public.reporting_require_access(p_org_id);
  SELECT * INTO o FROM public.organizations WHERE id = p_org_id;
  v_live_start := GREATEST(p_from, COALESCE(o.activated_at, p_from));

  SELECT count(*) INTO v_n
  FROM public.leads l
  WHERE l.org_id = p_org_id
    AND NOT l.is_test
    AND l.opted_in_at >= v_live_start AND l.opted_in_at < p_to
    AND l.current_score IS NOT NULL;

  SELECT COALESCE(jsonb_agg(row_to_json(d) ORDER BY d.bucket), '[]'::jsonb)
  INTO v_dist
  FROM (
    SELECT
      s.bucket,
      ((s.bucket - 1) * 10)::text
        || '–' ||
        CASE WHEN s.bucket = 10 THEN '100' ELSE (s.bucket * 10)::text END
        AS label,
      s.n
    FROM (
      SELECT
        CASE WHEN l.current_score >= 100 THEN 10 ELSE width_bucket(l.current_score, 0, 100, 10) END AS bucket,
        count(*)::bigint AS n
      FROM public.leads l
      WHERE l.org_id = p_org_id
        AND NOT l.is_test
        AND l.opted_in_at >= v_live_start AND l.opted_in_at < p_to
        AND l.current_score IS NOT NULL
      GROUP BY 1
    ) s
  ) d;

  SELECT count(DISTINCT rs.lead_id) INTO v_moved
  FROM public.readiness_scores rs
  JOIN public.leads l ON l.id = rs.lead_id
  WHERE rs.org_id = p_org_id
    AND NOT l.is_test
    AND l.opted_in_at >= v_live_start AND l.opted_in_at < p_to
    AND rs.lead_id IN (
      SELECT lead_id FROM public.readiness_scores
      WHERE org_id = p_org_id
      GROUP BY lead_id
      HAVING count(*) >= 2
    );

  RETURN jsonb_build_object(
    'lineage', 'readiness_scores, leads.current_score',
    'n', COALESCE(v_n, 0),
    'distribution', v_dist,
    'leads_with_score_movement', COALESCE(v_moved, 0)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reporting_mature_cohorts(p_org_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.organizations%ROWTYPE;
  v_cutoff date;
  v_count integer := 0;
  v_run uuid;
BEGIN
  PERFORM public.reporting_require_access(p_org_id);
  SELECT * INTO o FROM public.organizations WHERE id = p_org_id;
  v_cutoff := (now() - make_interval(days => o.sales_cycle_days))::date;

  IF o.activated_at IS NOT NULL THEN
    INSERT INTO public.reporting_cohorts (
      org_id, side, period_start, lead_count, closed_count, status, matured_at, computed_at
    )
    SELECT
      p_org_id,
      'live',
      s.period_start,
      s.lead_count,
      s.closed_count,
      CASE
        WHEN (s.period_start + interval '1 month' - interval '1 day')::date <= v_cutoff
        THEN 'mature'::public.reporting_cohort_status
        ELSE 'maturing'::public.reporting_cohort_status
      END,
      CASE
        WHEN (s.period_start + interval '1 month' - interval '1 day')::date <= v_cutoff
        THEN now()
        ELSE NULL
      END,
      now()
    FROM (
      SELECT
        date_trunc('month', l.opted_in_at AT TIME ZONE o.timezone)::date AS period_start,
        count(*)::integer AS lead_count,
        count(*) FILTER (
          WHERE EXISTS (
            SELECT 1 FROM public.revenue_log r WHERE r.lead_id = l.id AND r.org_id = l.org_id
          )
        )::integer AS closed_count
      FROM public.leads l
      WHERE l.org_id = p_org_id
        AND NOT l.is_test
        AND l.opted_in_at >= o.activated_at
      GROUP BY 1
    ) s
    ON CONFLICT (org_id, side, period_start) DO UPDATE
    SET lead_count = excluded.lead_count,
        closed_count = excluded.closed_count,
        status = excluded.status,
        matured_at = CASE
          WHEN reporting_cohorts.status = 'maturing'
           AND excluded.status = 'mature'
          THEN now()
          ELSE reporting_cohorts.matured_at
        END,
        computed_at = now();
    GET DIAGNOSTICS v_count = ROW_COUNT;
  END IF;

  SELECT id INTO v_run FROM public.baseline_runs
  WHERE org_id = p_org_id AND status = 'completed' AND grade IN ('usable', 'partial')
  ORDER BY created_at DESC, id DESC LIMIT 1;

  IF v_run IS NOT NULL THEN
    INSERT INTO public.reporting_cohorts (
      org_id, side, period_start, lead_count, closed_count, status, matured_at, computed_at
    )
    SELECT
      p_org_id,
      'baseline',
      s.period_start,
      s.lead_count,
      s.closed_count,
      CASE
        WHEN (s.period_start + interval '1 month' - interval '1 day')::date <= v_cutoff
        THEN 'mature'::public.reporting_cohort_status
        ELSE 'maturing'::public.reporting_cohort_status
      END,
      CASE
        WHEN (s.period_start + interval '1 month' - interval '1 day')::date <= v_cutoff
        THEN now() ELSE NULL
      END,
      now()
    FROM (
      SELECT
        date_trunc('month', b.created_at_crm AT TIME ZONE o.timezone)::date AS period_start,
        count(*)::integer AS lead_count,
        count(*) FILTER (
          WHERE EXISTS (
            SELECT 1 FROM public.baseline_revenue r
            WHERE r.baseline_lead_id = b.id AND r.org_id = b.org_id
          )
        )::integer AS closed_count
      FROM public.baseline_leads b
      WHERE b.org_id = p_org_id AND b.run_id = v_run AND b.created_at_crm IS NOT NULL
      GROUP BY 1
    ) s
    ON CONFLICT (org_id, side, period_start) DO UPDATE
    SET lead_count = excluded.lead_count,
        closed_count = excluded.closed_count,
        status = excluded.status,
        matured_at = CASE
          WHEN reporting_cohorts.status = 'maturing' AND excluded.status = 'mature'
          THEN now() ELSE reporting_cohorts.matured_at
        END,
        computed_at = now();
  END IF;

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.reporting_capacity_warnings(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.business_profiles%ROWTYPE;
  v_workers integer := 0;
  v_month_n bigint := 0;
  v_team text;
  v_capacity text;
BEGIN
  PERFORM public.reporting_require_access(p_org_id);
  SELECT * INTO p FROM public.business_profiles WHERE org_id = p_org_id;
  SELECT count(*) INTO v_workers
  FROM public.org_members
  WHERE org_id = p_org_id AND active AND role IN ('owner', 'admin', 'closer', 'setter');
  SELECT count(*) INTO v_month_n
  FROM public.leads
  WHERE org_id = p_org_id
    AND NOT is_test
    AND opted_in_at >= date_trunc('month', now());

  v_team := CASE
    WHEN p.team_structure = 'setter_closer' AND NOT EXISTS (
      SELECT 1 FROM public.org_members WHERE org_id = p_org_id AND active AND role = 'setter')
      THEN 'You said setters hand off to closers, and no active setter is on this workspace.'
    WHEN p.team_structure IN ('setter_closer', 'closers_only') AND NOT EXISTS (
      SELECT 1 FROM public.org_members WHERE org_id = p_org_id AND active AND role = 'closer')
      THEN 'You said closers run the sales calls, and no active closer is on this workspace.'
    WHEN v_workers = 1
      THEN 'One person can work leads. There is no coverage if they are away.'
    ELSE NULL
  END;

  v_capacity := CASE
    WHEN p.monthly_lead_target IS NOT NULL AND p.monthly_lead_target > 0 AND v_workers > 0
      AND (p.monthly_lead_target::numeric / v_workers) > 80
      THEN 'The stated monthly target is ' || p.monthly_lead_target
        || ' leads across ' || v_workers
        || ' people who can work them. That is more than 80 leads per person this month.'
    WHEN p.monthly_lead_target IS NOT NULL AND p.monthly_lead_target > 0
      AND v_month_n > (p.monthly_lead_target * 1.25)
      THEN 'This month already has ' || v_month_n
        || ' live leads against a stated target of ' || p.monthly_lead_target || '.'
    ELSE NULL
  END;

  RETURN jsonb_build_object(
    'team_coverage_warning', v_team,
    'capacity_warning', v_capacity,
    'monthly_lead_target', p.monthly_lead_target,
    'leads_this_month', v_month_n,
    'workers', v_workers,
    'team_structure', p.team_structure
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reporting_org_state(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.organizations%ROWTYPE;
  v_run public.baseline_runs%ROWTYPE;
  v_self public.self_reported_baselines%ROWTYPE;
  v_job public.reporting_job_runs%ROWTYPE;
  v_conn_status text;
BEGIN
  PERFORM public.reporting_require_access(p_org_id);
  SELECT * INTO o FROM public.organizations WHERE id = p_org_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'org_missing';
  END IF;

  SELECT * INTO v_run
  FROM public.baseline_runs
  WHERE org_id = p_org_id
  ORDER BY created_at DESC, id DESC
  LIMIT 1;

  SELECT * INTO v_self FROM public.self_reported_baselines WHERE org_id = p_org_id;

  SELECT * INTO v_job
  FROM public.reporting_job_runs
  WHERE job_kind = 'aggregate'
    AND (org_id = p_org_id OR org_id IS NULL)
  ORDER BY started_at DESC
  LIMIT 1;

  SELECT status::text INTO v_conn_status
  FROM public.ghl_connections
  WHERE org_id = p_org_id;

  RETURN jsonb_build_object(
    'org_id', o.id,
    'org_name', o.name,
    'org_slug', o.slug,
    'timezone', o.timezone,
    'activated_at', o.activated_at,
    'sales_cycle_days', o.sales_cycle_days,
    'baseline_lookback_days', o.baseline_lookback_days,
    'crm_connected', COALESCE(v_conn_status, 'missing'),
    'last_job_status', v_job.status,
    'last_job_started_at', v_job.started_at,
    'last_job_finished_at', v_job.finished_at,
    'last_job_error', v_job.error_text,
    'job_stale', CASE
      WHEN o.activated_at IS NULL THEN false
      WHEN v_job.id IS NULL THEN true
      WHEN v_job.status = 'failed' THEN true
      WHEN v_job.status = 'running' AND v_job.started_at < now() - interval '2 hours' THEN true
      WHEN v_job.status = 'completed' AND COALESCE(v_job.finished_at, v_job.started_at) < now() - interval '3 hours'
        THEN true
      ELSE false
    END,
    'backfill', CASE WHEN v_run.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', v_run.id,
      'status', v_run.status,
      'grade', v_run.grade,
      'grade_reasons', to_jsonb(v_run.grade_reasons),
      'window_start', v_run.window_start,
      'window_end', v_run.window_end,
      'lookback_days', v_run.lookback_days,
      'progress', v_run.progress,
      'triggered_at', v_run.triggered_at,
      'triggered_by_member_id', v_run.triggered_by_member_id,
      'started_at', v_run.started_at,
      'finished_at', v_run.finished_at,
      'error_text', v_run.error_text,
      'replaced_run_id', v_run.replaced_run_id,
      'quality', jsonb_build_object(
        'contacts_seen', v_run.contacts_seen,
        'contacts_with_created_date', v_run.contacts_with_created_date,
        'contacts_with_activity', v_run.contacts_with_activity,
        'opportunities_seen', v_run.opportunities_seen,
        'opportunities_with_value', v_run.opportunities_with_value,
        'payments_seen', v_run.payments_seen,
        'appointments_seen', v_run.appointments_seen,
        'messages_seen', v_run.messages_seen,
        'discontinuity_detected', v_run.discontinuity_detected,
        'discontinuity_month', v_run.discontinuity_month,
        'usable_month_count', v_run.usable_month_count
      )
    ) END,
    'self_reported', CASE WHEN v_self.org_id IS NULL THEN NULL ELSE jsonb_build_object(
      'leads_per_month', v_self.leads_per_month,
      'clients_closed_per_month', v_self.clients_closed_per_month,
      'stated_at', v_self.stated_at,
      'stated_by_member_id', v_self.stated_by_member_id,
      'note', v_self.note,
      'label', 'self-reported'
    ) END,
    'capacity', public.reporting_capacity_warnings(p_org_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reporting_capacity_warnings(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reporting_capacity_warnings(uuid) TO authenticated, service_role;
