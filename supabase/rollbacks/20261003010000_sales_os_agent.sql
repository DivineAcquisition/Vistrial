-- Inverse of 20261003010000_sales_os_agent.sql.

DROP TRIGGER IF EXISTS sales_os_gates_audit ON public.sales_os_gates;
DROP TRIGGER IF EXISTS sales_os_routes_audit ON public.sales_os_routes;
DROP TRIGGER IF EXISTS sales_os_destinations_audit ON public.sales_os_destinations;

DROP FUNCTION IF EXISTS public.sales_os_save_asset_version(
  uuid, uuid, text, text, text, text, integer, timestamptz, timestamptz, jsonb, text, uuid
);

DROP TABLE IF EXISTS public.sales_os_executions;
DROP TABLE IF EXISTS public.sales_os_gates;
DROP TABLE IF EXISTS public.sales_os_routes;
DROP TABLE IF EXISTS public.sales_os_destinations;
DROP TABLE IF EXISTS public.sales_os_assets;
DROP TABLE IF EXISTS public.sales_os_tool_calls;
DROP TABLE IF EXISTS public.sales_os_messages;
ALTER TABLE IF EXISTS public.sales_os_conversations
  DROP CONSTRAINT IF EXISTS sales_os_conversations_context_fkey;
DROP TABLE IF EXISTS public.sales_os_context_packages;
DROP TABLE IF EXISTS public.sales_os_conversations;

DROP FUNCTION IF EXISTS public.sales_os_settings_audit();
DROP FUNCTION IF EXISTS public.sales_os_executions_gate();
DROP FUNCTION IF EXISTS public.sales_os_assets_guard();
DROP FUNCTION IF EXISTS public.sales_os_forbid_delete();
DROP FUNCTION IF EXISTS public.sales_os_destination_credential(uuid);
DROP FUNCTION IF EXISTS public.sales_os_conversation_is_mine(uuid);
DROP FUNCTION IF EXISTS public.sales_os_conversation_visible(uuid);
