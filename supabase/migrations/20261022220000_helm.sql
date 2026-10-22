-- The team agent is called Helm. The registry id stays sales_manager so existing
-- rows keep their foreign keys. A rep's Manager permission is unchanged.

UPDATE public.agent_registry
SET
  name = 'Helm',
  long_description = 'Helm drafts each rep''s end of day report from their real activity, keeps scorecards against your foundation targets, and points to the calls behind each coaching moment. Reps see only their own report and scorecard.',
  promise = 'Helm never changes a rep''s pay, role or access, and never shows one rep another rep''s numbers.',
  version = version + 1,
  updated_at = now()
WHERE id = 'sales_manager'
  AND name <> 'Helm';

INSERT INTO public.agent_registry_versions (kind, entry_id, version, entry, note)
SELECT 'agent', r.id, r.version, to_jsonb(r) - 'beta_org_ids', 'Renamed to Helm.'
FROM public.agent_registry r
WHERE r.id = 'sales_manager'
ON CONFLICT (kind, entry_id, version) DO NOTHING;
