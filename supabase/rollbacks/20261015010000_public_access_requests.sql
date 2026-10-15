-- Inverse of 20261015010000_public_access_requests.sql.
-- Tables go first: their policies depend on the helper functions.

DROP TABLE IF EXISTS public.public_site_daily;
DROP TABLE IF EXISTS public.access_request_deletions;
DROP TABLE IF EXISTS public.access_request_views;
DROP TABLE IF EXISTS public.access_request_templates;
DROP TABLE IF EXISTS public.access_request_settings;
DROP TABLE IF EXISTS public.access_request_events;
DROP TABLE IF EXISTS public.access_requests;

DROP FUNCTION IF EXISTS public.log_access_request_reply(uuid, text);
DROP FUNCTION IF EXISTS public.record_public_site_event(text, text);
DROP FUNCTION IF EXISTS public.claim_access_request_stale_notice();
DROP FUNCTION IF EXISTS public.access_request_stale_count();
DROP FUNCTION IF EXISTS public.claim_access_request_abuse_notice();
DROP FUNCTION IF EXISTS public.claim_access_request_staff_notice();
DROP FUNCTION IF EXISTS public.mark_access_request_confirmation(uuid, text);
DROP FUNCTION IF EXISTS public.access_request_confirmation_batch(integer);
DROP FUNCTION IF EXISTS public.purge_expired_access_requests();
DROP FUNCTION IF EXISTS public.set_access_request_viewer(uuid, boolean);
DROP FUNCTION IF EXISTS public.upsert_access_request_template(text, text, text);
DROP FUNCTION IF EXISTS public.update_access_request_settings(jsonb);
DROP FUNCTION IF EXISTS public.log_access_request_view(uuid);
DROP FUNCTION IF EXISTS public.log_access_request_export(integer);
DROP FUNCTION IF EXISTS public.delete_access_request(uuid, text);
DROP FUNCTION IF EXISTS public.convert_access_request(uuid, uuid, integer);
DROP FUNCTION IF EXISTS public.bulk_set_access_request_status(uuid[], text);
DROP FUNCTION IF EXISTS public.add_access_request_note(uuid, text);
DROP FUNCTION IF EXISTS public.assign_access_request(uuid, uuid, integer);
DROP FUNCTION IF EXISTS public.set_access_request_status(uuid, text, integer);
DROP FUNCTION IF EXISTS public.access_requests_require_admin();
DROP FUNCTION IF EXISTS public.submit_access_request(jsonb, text);
DROP FUNCTION IF EXISTS public.can_view_access_requests();
DROP FUNCTION IF EXISTS public.access_request_clean(text, integer);

ALTER TABLE public.platform_staff DROP COLUMN IF EXISTS can_view_access_requests;
