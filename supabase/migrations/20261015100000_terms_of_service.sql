-- Terms dates, the public operator, and acceptance at signup.
-- Approving privacy or terms bumps that document date so people who already
-- accepted an older version are asked again.

ALTER TABLE public.public_site_settings
  ADD COLUMN IF NOT EXISTS terms_effective_on date NOT NULL DEFAULT DATE '2026-11-01';

UPDATE public.public_site_settings
SET legal_entity_name = 'Vistrial LLC, operated by DivineAcquisition LLC',
    mailing_address = '7404 Executive Place, Lanham, MD 20706',
    terms_updated_on = DATE '2026-10-15',
    terms_effective_on = DATE '2026-11-01',
    privacy_updated_on = CASE
      WHEN privacy_updated_on <= DATE '2026-10-15' THEN DATE '2026-10-15'
      ELSE privacy_updated_on
    END
WHERE id = 1
  AND (
    legal_entity_name IS NULL
    OR btrim(legal_entity_name) = ''
    OR btrim(legal_entity_name) = 'Divine Agency LLC'
  );

UPDATE public.public_site_settings
SET mailing_address = '7404 Executive Place, Lanham, MD 20706'
WHERE id = 1 AND (mailing_address IS NULL OR btrim(mailing_address) = '');

CREATE OR REPLACE FUNCTION public.public_trust_snapshot()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'security_email', s.security_email,
    'vulnerability_email', s.vulnerability_email,
    'privacy_email', s.privacy_email,
    'legal_email', s.legal_email,
    'support_email', s.support_email,
    'security_updated_on', s.security_updated_on,
    'subprocessors_updated_on', s.subprocessors_updated_on,
    'privacy_updated_on', s.privacy_updated_on,
    'terms_updated_on', s.terms_updated_on,
    'terms_effective_on', s.terms_effective_on,
    'legal_entity_name', NULLIF(btrim(COALESCE(s.legal_entity_name, '')), ''),
    'mailing_address', NULLIF(btrim(COALESCE(s.mailing_address, '')), ''),
    'governing_place', s.governing_place,
    'switch_ai_no_training', s.switch_ai_no_training,
    'switch_encryption_at_rest', s.switch_encryption_at_rest,
    'switch_backups', s.switch_backups,
    'switch_no_sell', s.switch_no_sell,
    'switch_staff_mfa', s.switch_staff_mfa,
    'privacy_live', s.privacy_approved AND NULLIF(btrim(COALESCE(s.legal_entity_name, '')), '') IS NOT NULL AND NULLIF(btrim(COALESCE(s.mailing_address, '')), '') IS NOT NULL,
    'terms_live', s.terms_approved AND NULLIF(btrim(COALESCE(s.legal_entity_name, '')), '') IS NOT NULL AND NULLIF(btrim(COALESCE(s.mailing_address, '')), '') IS NOT NULL,
    'safe_harbor_live', s.vulnerability_safe_harbor_approved,
    'security_txt_expires_on', s.security_txt_expires_on
  )
  FROM public.public_site_settings s
  WHERE s.id = 1;
$$;

CREATE OR REPLACE FUNCTION public.update_public_site_setting(p_field text, p_value text, p_bump_date boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old text;
  v_value text := NULLIF(btrim(COALESCE(p_value, '')), '');
BEGIN
  PERFORM public.access_requests_require_admin();
  IF p_field NOT IN (
    'security_email','vulnerability_email','privacy_email','legal_email','support_email','internal_forward_email',
    'legal_entity_name','mailing_address','governing_place',
    'switch_ai_no_training','switch_encryption_at_rest','switch_backups','switch_no_sell','switch_staff_mfa',
    'privacy_approved','terms_approved','vulnerability_safe_harbor_approved'
  ) THEN
    RAISE EXCEPTION 'That setting is not editable.';
  END IF;
  EXECUTE format('SELECT %I::text FROM public.public_site_settings WHERE id = 1', p_field) INTO v_old;
  IF p_field LIKE 'switch_%' OR p_field IN ('privacy_approved','terms_approved','vulnerability_safe_harbor_approved') THEN
    EXECUTE format('UPDATE public.public_site_settings SET %I = $1, updated_at = now() WHERE id = 1', p_field) USING (v_value = 'true');
  ELSE
    EXECUTE format('UPDATE public.public_site_settings SET %I = $1, updated_at = now() WHERE id = 1', p_field) USING v_value;
  END IF;
  IF p_field = 'privacy_approved' AND v_value = 'true' AND COALESCE(v_old, '') IS DISTINCT FROM 'true' THEN
    UPDATE public.public_site_settings SET privacy_updated_on = CURRENT_DATE WHERE id = 1;
  ELSIF p_field = 'terms_approved' AND v_value = 'true' AND COALESCE(v_old, '') IS DISTINCT FROM 'true' THEN
    UPDATE public.public_site_settings SET terms_updated_on = CURRENT_DATE WHERE id = 1;
  END IF;
  IF p_bump_date AND p_field IN ('legal_entity_name','mailing_address') THEN
    UPDATE public.public_site_settings
    SET privacy_updated_on = CURRENT_DATE, terms_updated_on = CURRENT_DATE
    WHERE id = 1;
  END IF;
  INSERT INTO public.public_site_setting_events (actor_id, field, from_value, to_value)
  VALUES (auth.uid(), p_field, v_old, COALESCE(v_value, 'false'));
END;
$$;

CREATE OR REPLACE FUNCTION public.record_legal_acceptance(p_user uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_privacy date;
  v_terms date;
BEGIN
  IF p_user IS NULL THEN
    RETURN;
  END IF;
  IF auth.role() IS DISTINCT FROM 'service_role' AND auth.uid() IS DISTINCT FROM p_user THEN
    RAISE EXCEPTION 'Not allowed.';
  END IF;
  SELECT privacy_updated_on, terms_updated_on INTO v_privacy, v_terms
  FROM public.public_site_settings WHERE id = 1;
  INSERT INTO public.legal_acceptances (user_id, document, version_on)
  VALUES (p_user, 'privacy', v_privacy), (p_user, 'terms', v_terms)
  ON CONFLICT DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.record_legal_acceptance(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_legal_acceptance(uuid) TO authenticated, service_role;
