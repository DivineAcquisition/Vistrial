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
   The first owner of a new org is created in the dashboard or by seed.
3. **Authentication → URL configuration**
   - Site URL = `NEXT_PUBLIC_APP_URL` from `.env.local` (e.g. `http://localhost:3000`)
   - Redirect URLs:
     - `http://localhost:3000/auth/callback`
     - `https://<production-domain>/auth/callback`
4. **JWT**
   - Expiry: 1 hour (3600 seconds)
   - Refresh tokens: enabled

Invite email delivery is not wired yet. Members settings returns a link to share by hand.
