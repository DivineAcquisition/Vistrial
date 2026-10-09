-- The guard is shared by two tables with different column names, so it reads
-- the row as json instead of naming a column the other table lacks.
CREATE OR REPLACE FUNCTION public.approval_people_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_auto boolean;
  v_row jsonb := to_jsonb(NEW);
BEGIN
  IF TG_TABLE_NAME = 'approval_gate_actions' THEN
    v_auto := v_row->>'mode' = 'auto_run';
  ELSE
    v_auto := v_row->>'run_mode' = 'auto_run';
  END IF;
  IF v_auto AND COALESCE(
    (SELECT t.reaches_people FROM public.approval_action_types t WHERE t.action_type = NEW.action_type),
    true
  ) THEN
    RAISE EXCEPTION 'Messages to leads and clients always need a person to approve them.' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;
