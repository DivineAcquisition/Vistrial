-- Domain and mail settings for hostname routing.
-- Configurable without a deploy. Links and the webhook URL providers copy
-- are built from these values — never from the incoming request host.

insert into public.app_settings (key, value)
values
  ('staff_base_url', 'https://admin.vistrial.io'),
  ('client_base_url', 'https://app.vistrial.io'),
  (
    'webhook_base_url',
    'https://vsbzcbiyvaihhejjsypn.supabase.co/functions/v1/inbound'
  ),
  ('email_from', 'Vistrial <noreply@mail.vistrial.io>'),
  ('email_reply_to', 'ops@divineacquisition.io')
on conflict (key) do nothing;
