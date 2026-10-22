-- live_record_control was created without row security, so the default grants
-- let any caller flip the rollback switch. The write guard trigger runs as the
-- caller and reads this row, so signed-in roles keep read access only.

ALTER TABLE public.live_record_control ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.live_record_control FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.live_record_control TO authenticated;
GRANT ALL ON public.live_record_control TO service_role;

DROP POLICY IF EXISTS live_record_control_read ON public.live_record_control;
CREATE POLICY live_record_control_read ON public.live_record_control
  FOR SELECT TO authenticated
  USING (true);
