-- Workflows foundation: stage history, one stored graph, frozen versions,
-- limits, one live enrollment, and who can read what.

DO $$
DECLARE
  v_org uuid := '22222222-2222-4222-8222-222222222222';
  v_lead uuid := '44444444-4444-4444-8444-444444444441';
  v_lead2 uuid := '44444444-4444-4444-8444-444444444442';
  v_pb uuid;
  v_pb2 uuid;
  v_pb3 uuid;
  v_ver uuid;
  v_ver2 uuid;
  v_ver3 uuid;
  v_n integer;
  v_failed boolean;
  v_graph jsonb := '{"boxes":[],"edges":[]}';
BEGIN
  -- Stage history records a change and never backfills.
  UPDATE public.leads SET pipeline_stage = 'Quoted' WHERE id = v_lead;
  UPDATE public.leads SET pipeline_stage = 'Booked' WHERE id = v_lead;
  SELECT count(*) INTO v_n FROM public.lead_stage_history WHERE lead_id = v_lead AND to_stage IN ('Quoted', 'Booked');
  IF v_n <> 2 THEN RAISE EXCEPTION 'stage history expected 2 rows, got %', v_n; END IF;
  UPDATE public.leads SET first_name = first_name WHERE id = v_lead;
  SELECT count(*) INTO v_n FROM public.lead_stage_history WHERE lead_id = v_lead AND to_stage IN ('Quoted', 'Booked');
  IF v_n <> 2 THEN RAISE EXCEPTION 'an unrelated update wrote stage history'; END IF;

  INSERT INTO public.playbooks (org_id, name) VALUES (v_org, 'New lead response') RETURNING id INTO v_pb;
  INSERT INTO public.playbooks (org_id, name) VALUES (v_org, 'No-show recovery') RETURNING id INTO v_pb2;
  INSERT INTO public.playbooks (org_id, name) VALUES (v_org, 'Reactivation') RETURNING id INTO v_pb3;

  -- A graph over 40 boxes is refused.
  v_failed := false;
  BEGIN
    INSERT INTO public.playbook_versions (org_id, playbook_id, version, graph)
    VALUES (v_org, v_pb, 99, jsonb_build_object(
      'boxes', (SELECT jsonb_agg(jsonb_build_object('id', g)) FROM generate_series(1, 41) g),
      'edges', '[]'::jsonb));
  EXCEPTION WHEN check_violation THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'a 41 box graph was accepted'; END IF;

  -- Publishing needs a note.
  v_failed := false;
  BEGIN
    INSERT INTO public.playbook_versions (org_id, playbook_id, version, graph, status, note)
    VALUES (v_org, v_pb, 98, v_graph, 'published', '  ');
  EXCEPTION WHEN check_violation THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'a version published without a note'; END IF;

  INSERT INTO public.playbook_versions (org_id, playbook_id, version, graph, status, note)
  VALUES (v_org, v_pb, 1, v_graph, 'published', 'First version') RETURNING id INTO v_ver;
  INSERT INTO public.playbook_versions (org_id, playbook_id, version, graph, status, note)
  VALUES (v_org, v_pb2, 1, v_graph, 'published', 'First version') RETURNING id INTO v_ver2;
  INSERT INTO public.playbook_versions (org_id, playbook_id, version, graph, status, note)
  VALUES (v_org, v_pb3, 1, v_graph, 'published', 'First version') RETURNING id INTO v_ver3;

  -- A published version is frozen.
  v_failed := false;
  BEGIN
    UPDATE public.playbook_versions SET graph = '{"boxes":[{"id":"x"}],"edges":[]}' WHERE id = v_ver;
  EXCEPTION WHEN OTHERS THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'a published graph was edited'; END IF;

  -- One live enrollment per workflow and lead; at most two across workflows.
  INSERT INTO public.workflow_enrollments (org_id, playbook_id, version_id, lead_id, current_box_id)
  VALUES (v_org, v_pb, v_ver, v_lead2, 's');
  v_failed := false;
  BEGIN
    INSERT INTO public.workflow_enrollments (org_id, playbook_id, version_id, lead_id, current_box_id)
    VALUES (v_org, v_pb, v_ver, v_lead2, 's');
  EXCEPTION WHEN unique_violation THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'a lead was enrolled twice in one workflow'; END IF;

  INSERT INTO public.workflow_enrollments (org_id, playbook_id, version_id, lead_id, current_box_id)
  VALUES (v_org, v_pb2, v_ver2, v_lead2, 's');
  v_failed := false;
  BEGIN
    INSERT INTO public.workflow_enrollments (org_id, playbook_id, version_id, lead_id, current_box_id)
    VALUES (v_org, v_pb3, v_ver3, v_lead2, 's');
  EXCEPTION WHEN OTHERS THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'a lead was in three workflows'; END IF;

  -- An ended enrollment needs a reason.
  v_failed := false;
  BEGIN
    UPDATE public.workflow_enrollments SET status = 'ended' WHERE playbook_id = v_pb2 AND lead_id = v_lead2;
  EXCEPTION WHEN check_violation THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'an enrollment ended without a reason'; END IF;

  -- The 12 published workflow limit.
  FOR i IN 1..10 LOOP
    INSERT INTO public.playbooks (org_id, name, status) VALUES (v_org, 'Extra ' || i, 'draft');
  END LOOP;
  UPDATE public.playbooks SET status = 'published' WHERE org_id = v_org AND id IN (v_pb, v_pb2, v_pb3);
  UPDATE public.playbooks SET status = 'published'
  WHERE id IN (SELECT id FROM public.playbooks WHERE org_id = v_org AND status = 'draft' ORDER BY name LIMIT 9);
  v_failed := false;
  BEGIN
    UPDATE public.playbooks SET status = 'published'
    WHERE id = (SELECT id FROM public.playbooks WHERE org_id = v_org AND status = 'draft' LIMIT 1);
  EXCEPTION WHEN OTHERS THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'a 13th published workflow was allowed'; END IF;
END
$$;

-- Who can read: an owner can, a setter (operator style role) cannot, and no
-- one can publish straight from the browser.
DO $$
DECLARE
  v_n integer;
  v_failed boolean;
BEGIN
  -- Free the published limit so the policy, not the limit, is what refuses.
  UPDATE public.playbooks SET status = 'draft' WHERE name LIKE 'Extra %';
  PERFORM set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
  SET ROLE authenticated;
  SELECT count(*) INTO v_n FROM public.playbooks WHERE org_id = '22222222-2222-4222-8222-222222222222';
  IF v_n = 0 THEN RAISE EXCEPTION 'the owner could not read playbooks'; END IF;
  SELECT count(*) INTO v_n FROM public.playbooks WHERE org_id = '66666666-6666-4666-8666-666666666666';
  IF v_n <> 0 THEN RAISE EXCEPTION 'cross-workspace playbooks were visible'; END IF;

  v_failed := false;
  BEGIN
    INSERT INTO public.playbooks (org_id, name, status)
    VALUES ('22222222-2222-4222-8222-222222222222', 'Sneaky', 'published');
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'a browser session inserted a published workflow'; END IF;

  v_failed := false;
  BEGIN
    INSERT INTO public.workflow_enrollments (org_id, playbook_id, version_id, lead_id, current_box_id)
    SELECT org_id, playbook_id, version_id, lead_id, 's' FROM public.workflow_enrollments LIMIT 1;
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'a browser session wrote an enrollment'; END IF;
  RESET ROLE;

  PERFORM set_config('request.jwt.claim.sub', '12121212-1212-4121-8121-121212121212', false);
  SET ROLE authenticated;
  SELECT count(*) INTO v_n FROM public.playbooks;
  IF v_n <> 0 THEN RAISE EXCEPTION 'a setter could read % playbooks', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.workflow_enrollments;
  IF v_n <> 0 THEN RAISE EXCEPTION 'a setter could read enrollments'; END IF;
  SELECT count(*) INTO v_n FROM public.lead_stage_history;
  IF v_n <> 0 THEN RAISE EXCEPTION 'a setter could read stage history'; END IF;
  RESET ROLE;
END
$$;
