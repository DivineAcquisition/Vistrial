-- Scope every composite ON DELETE SET NULL to the optional column.
--
-- The tenant-safe foreign keys pair an optional child reference with org_id so
-- a row can never point at a parent in another org. Paired with an unscoped
-- ON DELETE SET NULL, though, Postgres nulls *every* referencing column, org_id
-- included. org_id is NOT NULL on all of these tables, so the null-out raises
-- instead of nulling, and the parent delete fails outright.
--
-- The intent was always "drop the optional reference, keep the tenant". That is
-- what ON DELETE SET NULL (column) says, available since Postgres 15.
--
-- What this actually unblocks: deleting a lead that has revenue attached
-- (revenue is supposed to survive its lead, which is why the reference nulls
-- rather than cascades) and deleting a call that has an objection recorded
-- against it. Both failed with a NOT NULL violation on org_id before this.
--
-- Org deletion was never affected: delete_org_data removes children in
-- dependency order, so the null-out never fires there.

ALTER TABLE public.revenue_log
  DROP CONSTRAINT revenue_log_lead_org_fkey,
  ADD CONSTRAINT revenue_log_lead_org_fkey
    FOREIGN KEY (lead_id, org_id) REFERENCES public.leads (id, org_id)
    ON DELETE SET NULL (lead_id);

ALTER TABLE public.objections
  DROP CONSTRAINT objections_call_org_fkey,
  ADD CONSTRAINT objections_call_org_fkey
    FOREIGN KEY (call_id, org_id) REFERENCES public.calls (id, org_id)
    ON DELETE SET NULL (call_id);

-- readiness_scores is append-only, so the null-out is refused by that trigger
-- before the constraint matters. Scoped anyway: the two guards should not
-- disagree about what the constraint is trying to do.
ALTER TABLE public.readiness_scores
  DROP CONSTRAINT readiness_scores_call_org_fkey,
  ADD CONSTRAINT readiness_scores_call_org_fkey
    FOREIGN KEY (call_id, org_id) REFERENCES public.calls (id, org_id)
    ON DELETE SET NULL (call_id);

ALTER TABLE public.calendar_blocks
  DROP CONSTRAINT calendar_blocks_lead_org_fkey,
  ADD CONSTRAINT calendar_blocks_lead_org_fkey
    FOREIGN KEY (lead_id, org_id) REFERENCES public.leads (id, org_id)
    ON DELETE SET NULL (lead_id);

ALTER TABLE public.processor_events
  DROP CONSTRAINT processor_events_lead_org_fkey,
  ADD CONSTRAINT processor_events_lead_org_fkey
    FOREIGN KEY (lead_id, org_id) REFERENCES public.leads (id, org_id)
    ON DELETE SET NULL (lead_id);

ALTER TABLE public.unmatched_transcripts
  DROP CONSTRAINT unmatched_transcripts_assigned_call_org_fkey,
  ADD CONSTRAINT unmatched_transcripts_assigned_call_org_fkey
    FOREIGN KEY (assigned_call_id, org_id) REFERENCES public.calls (id, org_id)
    ON DELETE SET NULL (assigned_call_id);

-- Same defect, reversed columns: here the org's own id is the tenant column, so
-- an unscoped null-out tried to null organizations.id itself.
ALTER TABLE public.organizations
  DROP CONSTRAINT organizations_agent_run_as_member_fkey,
  ADD CONSTRAINT organizations_agent_run_as_member_fkey
    FOREIGN KEY (agent_run_as_member_id, id) REFERENCES public.org_members (id, org_id)
    ON DELETE SET NULL (agent_run_as_member_id);
