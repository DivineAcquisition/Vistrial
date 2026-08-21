-- Align hosted grants with the repo: claim/expire RPCs are service-role only.

REVOKE ALL ON FUNCTION public.claim_follow_up_job() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_follow_up_job() TO service_role;

REVOKE ALL ON FUNCTION public.expire_stale_follow_up_drafts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_stale_follow_up_drafts() TO service_role;
