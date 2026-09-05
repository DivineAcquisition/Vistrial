-- Rollback for 20260840010000_scoped_set_null_fks.sql.
--
-- Restores the unscoped ON DELETE SET NULL on each tenant-safe foreign key.
-- That reinstates the defect the forward migration fixed: deleting a lead with
-- revenue attached, or a call with an objection against it, fails on a NOT NULL
-- violation against org_id. Only worth doing to get back to a known prior state.

ALTER TABLE public.organizations
  DROP CONSTRAINT organizations_agent_run_as_member_fkey,
  ADD CONSTRAINT organizations_agent_run_as_member_fkey
    FOREIGN KEY (agent_run_as_member_id, id) REFERENCES public.org_members (id, org_id)
    ON DELETE SET NULL;

ALTER TABLE public.unmatched_transcripts
  DROP CONSTRAINT unmatched_transcripts_assigned_call_org_fkey,
  ADD CONSTRAINT unmatched_transcripts_assigned_call_org_fkey
    FOREIGN KEY (assigned_call_id, org_id) REFERENCES public.calls (id, org_id)
    ON DELETE SET NULL;

ALTER TABLE public.processor_events
  DROP CONSTRAINT processor_events_lead_org_fkey,
  ADD CONSTRAINT processor_events_lead_org_fkey
    FOREIGN KEY (lead_id, org_id) REFERENCES public.leads (id, org_id)
    ON DELETE SET NULL;

ALTER TABLE public.calendar_blocks
  DROP CONSTRAINT calendar_blocks_lead_org_fkey,
  ADD CONSTRAINT calendar_blocks_lead_org_fkey
    FOREIGN KEY (lead_id, org_id) REFERENCES public.leads (id, org_id)
    ON DELETE SET NULL;

ALTER TABLE public.readiness_scores
  DROP CONSTRAINT readiness_scores_call_org_fkey,
  ADD CONSTRAINT readiness_scores_call_org_fkey
    FOREIGN KEY (call_id, org_id) REFERENCES public.calls (id, org_id)
    ON DELETE SET NULL;

ALTER TABLE public.objections
  DROP CONSTRAINT objections_call_org_fkey,
  ADD CONSTRAINT objections_call_org_fkey
    FOREIGN KEY (call_id, org_id) REFERENCES public.calls (id, org_id)
    ON DELETE SET NULL;

ALTER TABLE public.revenue_log
  DROP CONSTRAINT revenue_log_lead_org_fkey,
  ADD CONSTRAINT revenue_log_lead_org_fkey
    FOREIGN KEY (lead_id, org_id) REFERENCES public.leads (id, org_id)
    ON DELETE SET NULL;
