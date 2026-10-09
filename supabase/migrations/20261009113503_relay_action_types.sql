-- Relay's drafts wait on the text and email actions, so the workspace's
-- approver choice for those applies to them. A workspace with no row for
-- these asks first and lets owners and managers approve.

INSERT INTO public.approval_action_types (action_type, area, reaches_people, default_mode)
VALUES
  ('send_text', 'sales', true, 'ask_first'),
  ('send_email', 'sales', true, 'ask_first'),
  ('create_asset', 'sales', false, 'ask_first')
ON CONFLICT (action_type) DO NOTHING;
