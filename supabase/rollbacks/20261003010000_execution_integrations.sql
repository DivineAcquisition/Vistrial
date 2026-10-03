-- Inverse of 20261003010000_execution_integrations.sql.
-- Drops the execution tables and the three action types they added. Anything
-- already posted to Slack or Discord, or filed in Drive, is untouched.

DROP TABLE IF EXISTS public.execution_writes;
DROP TABLE IF EXISTS public.execution_connections;

DELETE FROM public.approval_gate_actions
WHERE action_type IN ('slack_post', 'discord_post', 'drive_store');
DELETE FROM public.approval_action_types
WHERE action_type IN ('slack_post', 'discord_post', 'drive_store');
