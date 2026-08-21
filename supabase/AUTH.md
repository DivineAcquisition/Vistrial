# Auth configuration (Prompt 3)

These settings live in the **Supabase dashboard**, not in application code.
Local `config.toml` mirrors them for `supabase start`.

## Hosted project

Dashboard: https://supabase.com/dashboard/project/jizzmlvpnykazrsiotqq/auth/providers

1. **Authentication → Providers → Email**
   - Enable the Email provider
   - Allow password sign-in
   - Enable magic links (email OTP)
2. **Disable public sign-ups.** This is a B2B tool: users arrive by invite.
   Platform super-admins (`platform_admins`) are enrolled as owner in every
   workspace and cannot be demoted. The first operator is created in Auth,
   then inserted into `platform_admins`.
3. **Authentication → URL configuration**
   - Site URL = `https://app.vistrial.io` in production (`NEXT_PUBLIC_APP_URL`)
   - Redirect URLs:
     - `http://localhost:3000/auth/callback`
     - `https://app.vistrial.io/auth/callback`
4. **JWT**
   - Expiry: 1 hour (3600 seconds)
   - Refresh tokens: enabled

Invite email delivery is not wired yet. Members settings returns a link to share by hand.

Production sign-in reads `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from the Vercel **Vistrial** project (`jizzmlvpnykazrsiotqq`). Those names must be static in application code so Next.js inlines them into the browser bundle. Do not point the app at the DivineACQ project.
