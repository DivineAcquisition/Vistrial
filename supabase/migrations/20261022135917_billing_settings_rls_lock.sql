-- Production had row security switched off on billing_settings while anon held
-- SELECT and UPDATE. The billing_settings_admin policy covers every reader.

ALTER TABLE public.billing_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.billing_settings FROM anon;
