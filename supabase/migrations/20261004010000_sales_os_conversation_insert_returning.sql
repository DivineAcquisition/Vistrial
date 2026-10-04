-- Ask Vistrial could not start a conversation. The app inserts with
-- `returning id`, and Postgres checks the new row against the SELECT policy.
-- That policy called a STABLE function that re-reads the table, and a STABLE
-- function cannot see the row its own statement is inserting, so every insert
-- was refused.
--
-- The policy now also accepts the caller's own conversations directly. That
-- is a subset of what sales_os_conversation_visible() already allowed (own
-- rows in an org they belong to), so nobody can see anything new.
ALTER POLICY sales_os_conversations_select
  ON public.sales_os_conversations
  USING (
    (user_id = auth.uid() AND org_id IN (SELECT public.user_org_ids()))
    OR public.sales_os_conversation_visible(id)
  );
