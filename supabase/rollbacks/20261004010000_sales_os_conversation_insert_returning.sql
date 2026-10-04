ALTER POLICY sales_os_conversations_select
  ON public.sales_os_conversations
  USING (public.sales_os_conversation_visible(id));
