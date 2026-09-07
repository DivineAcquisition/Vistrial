-- Native people: any member of the workspace may insert a lead.
-- CRM ingest still uses the service role. This is for Add person when
-- GoHighLevel or Airtable is not feeding the workspace.

DROP POLICY IF EXISTS leads_insert_managers ON public.leads;
DROP POLICY IF EXISTS leads_insert_org ON public.leads;

CREATE POLICY leads_insert_org
  ON public.leads
  FOR INSERT
  TO authenticated
  WITH CHECK (org_id IN (SELECT public.user_org_ids()));
