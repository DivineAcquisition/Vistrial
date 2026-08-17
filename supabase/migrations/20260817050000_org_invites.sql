-- Prompt 3: org invites. The only schema addition on top of the Case File spine.
-- Invite lookup for unauthenticated visitors uses the service-role client (or
-- redeem_org_invite); RLS hides this table from anyone who is not an owner/admin.

CREATE TABLE public.org_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  email text NOT NULL,
  role public.org_role NOT NULL,
  token text NOT NULL,
  invited_by uuid NOT NULL REFERENCES public.org_members (id) ON DELETE RESTRICT,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT org_invites_token_key UNIQUE (token),
  CONSTRAINT org_invites_email_format CHECK (email = lower(email) AND email ~ '^[^@]+@[^@]+$'),
  CONSTRAINT org_invites_role_invitable CHECK (
    role = ANY (ARRAY['admin', 'closer', 'setter']::public.org_role[])
  )
);

COMMENT ON TABLE public.org_invites IS
  'Pending org invitations. Email delivery lands in a later prompt; tokens are shared as links.';

CREATE INDEX org_invites_token_idx ON public.org_invites (token);
CREATE INDEX org_invites_org_pending_idx
  ON public.org_invites (org_id)
  WHERE accepted_at IS NULL;

ALTER TABLE public.org_invites ENABLE ROW LEVEL SECURITY;

-- Owners and admins of the org can select and insert. Nobody else can read it.
-- Delete is the revoke path. accepted_at is stamped only by redeem_org_invite.
CREATE POLICY org_invites_select
  ON public.org_invites
  FOR SELECT
  TO authenticated
  USING (public.user_has_org_role(org_id, 'owner', 'admin'));

CREATE POLICY org_invites_insert
  ON public.org_invites
  FOR INSERT
  TO authenticated
  WITH CHECK (public.user_has_org_role(org_id, 'owner', 'admin'));

CREATE POLICY org_invites_delete
  ON public.org_invites
  FOR DELETE
  TO authenticated
  USING (public.user_has_org_role(org_id, 'owner', 'admin'));

GRANT SELECT, INSERT, DELETE ON public.org_invites TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_invites TO service_role;

-- Atomic redeem: stamp accepted_at and insert (or reactivate) the member in one
-- transaction so a token cannot be used twice.
CREATE OR REPLACE FUNCTION public.redeem_org_invite(p_token text, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite public.org_invites%ROWTYPE;
  v_user_email text;
  v_display_name text;
  v_member_id uuid;
BEGIN
  SELECT email INTO v_user_email
  FROM auth.users
  WHERE id = p_user_id;

  IF v_user_email IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_not_found');
  END IF;

  SELECT * INTO v_invite
  FROM public.org_invites
  WHERE token = p_token
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_invite.accepted_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_accepted');
  END IF;

  IF v_invite.expires_at <= now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'expired');
  END IF;

  IF lower(v_invite.email) <> lower(v_user_email) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'email_mismatch');
  END IF;

  v_display_name := split_part(v_user_email, '@', 1);

  INSERT INTO public.org_members (
    org_id, user_id, role, display_name, email, active
  )
  VALUES (
    v_invite.org_id,
    p_user_id,
    v_invite.role,
    v_display_name,
    v_user_email,
    true
  )
  ON CONFLICT (org_id, user_id) DO UPDATE
    SET active = true,
        role = EXCLUDED.role,
        email = EXCLUDED.email,
        display_name = CASE
          WHEN public.org_members.display_name = '' THEN EXCLUDED.display_name
          ELSE public.org_members.display_name
        END
  RETURNING id INTO v_member_id;

  UPDATE public.org_invites
  SET accepted_at = now()
  WHERE id = v_invite.id
    AND accepted_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_accepted');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'member_id', v_member_id,
    'org_id', v_invite.org_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_org_invite(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_org_invite(text, uuid) TO service_role;
