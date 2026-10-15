-- Prompt 15 decisions: optional quiet hours, text opt-in, and retention.
-- Notice text is cleared after 90 days. Delivery rows are kept for one year.
-- Quiet hours default to unset. Text opt-in defaults to unset.

ALTER TABLE public.org_members
  ADD COLUMN IF NOT EXISTS notification_quiet_start time,
  ADD COLUMN IF NOT EXISTS notification_quiet_end time,
  ADD COLUMN IF NOT EXISTS text_opt_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS text_opt_in_wording text,
  ADD COLUMN IF NOT EXISTS text_opted_out_at timestamptz;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS notice_cleared_at timestamptz;

ALTER TABLE public.org_members
  DROP CONSTRAINT IF EXISTS org_members_quiet_hours_pair;

ALTER TABLE public.org_members
  ADD CONSTRAINT org_members_quiet_hours_pair
  CHECK (
    (notification_quiet_start IS NULL AND notification_quiet_end IS NULL)
    OR (
      notification_quiet_start IS NOT NULL
      AND notification_quiet_end IS NOT NULL
      AND notification_quiet_start <> notification_quiet_end
    )
  );

CREATE OR REPLACE FUNCTION public.purge_notification_retention(p_dry_run boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cleared integer := 0;
  v_deleted integer := 0;
  v_email integer := 0;
BEGIN
  SELECT count(*)::integer INTO v_cleared
  FROM public.notifications
  WHERE notice_cleared_at IS NULL
    AND queued_at < now() - interval '90 days';

  SELECT count(*)::integer INTO v_deleted
  FROM public.notifications
  WHERE queued_at < now() - interval '365 days';

  IF to_regclass('public.email_send_log') IS NOT NULL THEN
    SELECT count(*)::integer INTO v_email
    FROM public.email_send_log
    WHERE created_at < now() - interval '365 days';
  END IF;

  IF NOT COALESCE(p_dry_run, false) THEN
    UPDATE public.notifications
    SET title = 'Notice text removed',
        body = 'The wording of this notice was removed after 90 days.',
        notice_cleared_at = now(),
        updated_at = now()
    WHERE notice_cleared_at IS NULL
      AND queued_at < now() - interval '90 days';

    DELETE FROM public.notifications
    WHERE queued_at < now() - interval '365 days';

    IF to_regclass('public.email_send_log') IS NOT NULL THEN
      DELETE FROM public.email_send_log
      WHERE created_at < now() - interval '365 days';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'notice_text_cleared', v_cleared,
    'delivery_records_deleted', v_deleted,
    'email_send_log_deleted', v_email,
    'dry_run', COALESCE(p_dry_run, false)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.purge_notification_retention(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_notification_retention(boolean) TO service_role;
