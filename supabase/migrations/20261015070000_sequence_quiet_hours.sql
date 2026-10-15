-- Follow-up sequences use the locked quiet-hours floor: 8pm to 8am.
-- A wider window already stored for a workspace is kept. A later start,
-- an earlier end, or turning the window off is tightened back to the floor.
-- Scheduling uses the effective compliance rule (lead time zone, phone area
-- code, then the workspace zone). This trigger only protects the stored floor.

ALTER TABLE public.follow_up_settings
  ALTER COLUMN quiet_hours_start SET DEFAULT time '20:00';

ALTER TABLE public.follow_up_settings
  ALTER COLUMN quiet_hours_enabled SET DEFAULT true;

CREATE OR REPLACE FUNCTION public.follow_up_quiet_hours_floor()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.quiet_hours_enabled := true;
  IF NEW.quiet_hours_start > NEW.quiet_hours_end THEN
    IF NEW.quiet_hours_start > time '20:00' THEN
      NEW.quiet_hours_start := time '20:00';
    END IF;
    IF NEW.quiet_hours_end < time '08:00' THEN
      NEW.quiet_hours_end := time '08:00';
    END IF;
  ELSE
    NEW.quiet_hours_start := time '20:00';
    NEW.quiet_hours_end := time '08:00';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS follow_up_settings_quiet_floor ON public.follow_up_settings;
CREATE TRIGGER follow_up_settings_quiet_floor
  BEFORE INSERT OR UPDATE OF quiet_hours_enabled, quiet_hours_start, quiet_hours_end
  ON public.follow_up_settings
  FOR EACH ROW EXECUTE FUNCTION public.follow_up_quiet_hours_floor();

UPDATE public.follow_up_settings
SET quiet_hours_enabled = true,
    quiet_hours_start = CASE
      WHEN quiet_hours_start > quiet_hours_end AND quiet_hours_start <= time '20:00' THEN quiet_hours_start
      ELSE time '20:00'
    END,
    quiet_hours_end = CASE
      WHEN quiet_hours_start > quiet_hours_end AND quiet_hours_end >= time '08:00' THEN quiet_hours_end
      ELSE time '08:00'
    END
WHERE NOT quiet_hours_enabled
   OR quiet_hours_start <= quiet_hours_end
   OR quiet_hours_start > time '20:00'
   OR quiet_hours_end < time '08:00';

REVOKE ALL ON FUNCTION public.follow_up_quiet_hours_floor() FROM PUBLIC, anon, authenticated;
