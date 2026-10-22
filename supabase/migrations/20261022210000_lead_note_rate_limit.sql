-- The public privacy note form gets the same per-email and per-IP limits as the
-- trust form, and only the server can call it.

CREATE OR REPLACE FUNCTION public.submit_lead_data_note(p_name text, p_email text, p_business text, p_details text, p_ip text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ref text;
  v_id uuid;
  v_limit jsonb;
  v_email text := lower(public.access_request_clean(p_email, 200));
BEGIN
  IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR public.access_request_clean(p_details, 2000) = '' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid');
  END IF;
  v_limit := public.consume_rate_limit(md5('lead-note-email:' || v_email), 5, 3600);
  IF COALESCE((v_limit->>'allowed')::boolean, false) IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'code', 'rate');
  END IF;
  v_limit := public.consume_rate_limit(md5('lead-note-ip:' || left(COALESCE(p_ip, '0'), 80)), 20, 3600);
  IF COALESCE((v_limit->>'allowed')::boolean, false) IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'code', 'rate');
  END IF;
  v_ref := 'DR-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  INSERT INTO public.trust_data_requests (reference, kind, requester_name, requester_email, details)
  VALUES (v_ref, 'lead_passthrough', public.access_request_clean(p_name, 120), v_email, left(public.access_request_clean(p_details, 2000), 2000))
  RETURNING id INTO v_id;
  INSERT INTO public.trust_data_request_events (request_id, kind, detail) VALUES (v_id, 'received', 'lead');
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.submit_lead_data_note(text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_lead_data_note(text, text, text, text, text) TO service_role;

-- The old signature stays for code deployed before this one. With no IP, its
-- callers share one IP bucket until that code is replaced.
CREATE OR REPLACE FUNCTION public.submit_lead_data_note(p_name text, p_email text, p_business text, p_details text)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.submit_lead_data_note(p_name, p_email, p_business, p_details, NULL);
$$;

REVOKE ALL ON FUNCTION public.submit_lead_data_note(text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_lead_data_note(text, text, text, text) TO service_role;
