-- Hosted Supabase grants EXECUTE on new functions to PUBLIC, which includes
-- anon. Service-role ingest functions and trigger helpers must not be RPC'd
-- without a session.

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM authenticated;

GRANT EXECUTE ON FUNCTION public.user_org_ids() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_has_org_role(uuid, public.org_role[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_member_id(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.replace_org_score_maps(uuid, jsonb) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.redeem_org_invite(text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.seed_default_score_maps(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.link_ghl_location(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.unlink_ghl_location(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_ghl_contact_key() TO service_role;
GRANT EXECUTE ON FUNCTION public.release_ghl_contact_key(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.try_consume_ghl_rate(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.ghl_event_counts_24h(uuid) TO service_role;

ALTER FUNCTION public.set_updated_at() SET search_path = public;
ALTER FUNCTION public.forbid_readiness_score_mutation() SET search_path = public;
ALTER FUNCTION public.seed_default_score_maps(uuid) SET search_path = public;
ALTER FUNCTION public.provision_org_scoring() SET search_path = public;
