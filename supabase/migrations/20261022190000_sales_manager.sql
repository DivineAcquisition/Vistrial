-- Sales Manager (Prompt 26, build step 9): end of day reports.
-- Drafted from each rep's real activity (counts only), confirmed by the rep
-- with their own note, summarized to managers the next morning. A rep sees
-- only their own reports. Managers (Owners, staff, members an Owner made a
-- Manager) see the whole team. Enforced here, not only in the app.

CREATE TABLE IF NOT EXISTS public.eod_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.org_members (id) ON DELETE CASCADE,
  day date NOT NULL,
  status text NOT NULL DEFAULT 'drafted' CHECK (status IN ('drafted', 'confirmed')),
  activity jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(activity) = 'object'),
  rep_note text CHECK (rep_note IS NULL OR char_length(rep_note) <= 2000),
  drafted_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  UNIQUE (org_id, member_id, day),
  CONSTRAINT eod_reports_confirmed_stamp CHECK (status <> 'confirmed' OR confirmed_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS eod_reports_org_day_idx ON public.eod_reports (org_id, day DESC);

ALTER TABLE public.eod_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.eod_reports FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.eod_reports TO authenticated;
GRANT ALL ON public.eod_reports TO service_role;

DROP POLICY IF EXISTS eod_reports_read ON public.eod_reports;
CREATE POLICY eod_reports_read ON public.eod_reports FOR SELECT TO authenticated
  USING (
    org_id IN (SELECT public.user_org_ids())
    AND (
      member_id IN (SELECT m.id FROM public.org_members m WHERE m.user_id = auth.uid() AND m.active = true)
      OR public.is_team_manager(org_id)
    )
  );

-- Drafts never overwrite a report the rep already confirmed.
CREATE OR REPLACE FUNCTION public.eod_save_drafts(p_org_id uuid, p_day date, p_reports jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  v_row jsonb;
BEGIN
  IF public.ws_end_user_request() AND NOT public.is_team_manager(p_org_id) THEN
    RAISE EXCEPTION 'Only a manager can draft team reports.' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_reports) <> 'array' THEN
    RAISE EXCEPTION 'Reports must be a list.' USING ERRCODE = '22023';
  END IF;
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_reports) LOOP
    INSERT INTO public.eod_reports AS r (org_id, member_id, day, activity)
    SELECT p_org_id, m.id, p_day, COALESCE(v_row -> 'activity', '{}'::jsonb)
    FROM public.org_members m
    WHERE m.id = (v_row ->> 'member_id')::uuid AND m.org_id = p_org_id
    ON CONFLICT (org_id, member_id, day) DO UPDATE
      SET activity = EXCLUDED.activity, drafted_at = now()
      WHERE r.status = 'drafted';
    IF FOUND THEN v_count := v_count + 1; END IF;
  END LOOP;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.eod_confirm(p_report_id uuid, p_note text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
BEGIN
  SELECT r.org_id INTO v_org
  FROM public.eod_reports r
  JOIN public.org_members m ON m.id = r.member_id
  WHERE r.id = p_report_id AND m.user_id = auth.uid() AND m.active = true;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Only the rep can confirm their own report.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.eod_reports
    SET status = 'confirmed', confirmed_at = now(), rep_note = NULLIF(btrim(left(COALESCE(p_note, ''), 2000)), '')
    WHERE id = p_report_id;
  PERFORM public.ws_log(v_org, 'eod.confirmed', 'eod_reports', p_report_id::text, '{}'::jsonb, auth.uid());
END;
$$;

REVOKE ALL ON FUNCTION public.eod_save_drafts(uuid, date, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.eod_confirm(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.eod_save_drafts(uuid, date, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.eod_confirm(uuid, text) TO authenticated, service_role;

INSERT INTO public.ops_job_catalog (job_name, cron_expr, interval_seconds, grace_seconds, check_first)
VALUES (
  'sales-manager',
  '5 * * * *',
  3600,
  3600,
  'Open /api/cron/sales-manager logs and eod_reports drafted today. Confirm CRON_SECRET and that Vercel Cron still lists this path.'
)
ON CONFLICT (job_name) DO NOTHING;
