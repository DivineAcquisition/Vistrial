# Vistrial - Supabase Auth Setup Instructions

## What to tell Supabase AI to get auth working and into the dashboard

Copy-paste the instructions below into **Supabase AI** (or follow them manually in the Supabase Dashboard).

---

## STEP 1: Run the Database Schema

Go to **SQL Editor** in your Supabase Dashboard and run the contents of `supabase/APPLY_TO_SUPABASE.sql`.

This creates all tables, indexes, RLS policies, triggers, and seed data your app needs.

> **Tell Supabase AI:** "Run the SQL file I'm pasting below to set up my database schema"

Then paste the entire contents of `supabase/APPLY_TO_SUPABASE.sql`.

---

## STEP 2: Configure Authentication Settings

Go to **Authentication > Settings** in the Supabase Dashboard and configure:

> **Tell Supabase AI:**
>
> "Configure my authentication settings:
> 1. Under **Email Auth**, enable email/password sign-in
> 2. **DISABLE 'Confirm email'** (turn OFF email confirmation) so users can sign up and immediately access the dashboard without checking their email. I can enable this later once I have email delivery set up.
> 3. Set the **Site URL** to my app's URL (e.g., `http://localhost:3000` for local dev or `https://myapp.vercel.app` for production)
> 4. Add these **Redirect URLs**:
>    - `http://localhost:3000/auth/callback`
>    - `http://localhost:3000/auth/reset-password`
>    - `https://myapp.vercel.app/auth/callback` (replace with your actual domain)
>    - `https://myapp.vercel.app/auth/reset-password` (replace with your actual domain)
> 5. Under **Email Templates**, the default templates are fine for now"

---

## STEP 3: Get Your API Keys

Go to **Settings > API** in the Supabase Dashboard.

You need three values for your `.env.local` file:

```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...your_anon_key
SUPABASE_SERVICE_ROLE_KEY=eyJ...your_service_role_key
```

> **Tell Supabase AI:** "What are my project URL, anon key, and service role key?"

---

## STEP 4: Set Up Environment Variables

Create a `.env.local` file in your project root with at minimum:

```env
# Required for auth to work
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# App URL
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## STEP 5: Verify the Auth Flow Works

1. Start your app: `npm run dev`
2. Go to `http://localhost:3000/signup`
3. Create an account (email + password + business details)
4. You should be redirected to `/dashboard` after signup
5. If you get redirected to `/onboarding`, complete the onboarding wizard
6. You should now see the dashboard

---

## STEP 6 (Optional): Enable Google OAuth

If you want Google sign-in:

> **Tell Supabase AI:**
>
> "Enable Google OAuth provider:
> 1. Go to Authentication > Providers > Google
> 2. Enable it
> 3. I need to create a Google OAuth app at https://console.cloud.google.com/apis/credentials
> 4. Set the authorized redirect URI to: `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`
> 5. Enter my Google Client ID and Client Secret"

---

## How the Auth Flow Works (Reference)

### Sign Up Flow:
1. User fills in email/password on `/signup` (Step 1)
2. User fills in name, business name, business type (Step 2)
3. Frontend calls `supabase.auth.signUp()` with user metadata
4. Frontend calls `POST /api/auth/setup-organization` to create:
   - An `organizations` record
   - An `organization_members` record (role: owner)
   - A `user_profiles` record
   - A Stripe customer (if Stripe is configured)
5. User is redirected to `/dashboard`

### Sign In Flow:
1. User enters email/password on `/login`
2. Frontend calls `supabase.auth.signInWithPassword()`
3. Middleware refreshes the session cookie
4. Dashboard layout checks `getAuthenticatedContext()` for user + org
5. If no org found, redirects to `/onboarding`

### Auth Callback (OAuth / Email Confirmation):
1. Supabase redirects to `/auth/callback?code=xxx`
2. Server exchanges code for session
3. If OAuth user has no org, one is auto-created
4. Redirects to `/dashboard`

### Protected Routes:
The middleware (`middleware.ts`) protects these routes:
- `/dashboard`, `/contacts`, `/workflows`, `/usage`, `/settings`, `/bookings`, `/customers`, `/quotes`, `/sequences`, `/memberships`

Unauthenticated users are redirected to `/login?redirect=<original_path>`.

### Database Tables for Auth:
- `auth.users` - Supabase managed (email, password, metadata)
- `public.user_profiles` - Extended profile (first_name, last_name, avatar, etc.)
- `public.organizations` - Business/company records (multi-tenant)
- `public.organization_members` - Links users to organizations with roles/permissions
- `public.credit_balances` - Auto-created when an organization is created

### Key Files:
- `src/lib/supabase/client.ts` - Browser Supabase client
- `src/lib/supabase/server.ts` - Server Supabase client
- `src/lib/supabase/middleware.ts` - Session refresh + route protection
- `src/components/auth/auth-provider.tsx` - React auth context
- `src/app/(auth)/layout.tsx` - Auth pages layout (wraps in AuthProvider)
- `src/app/(dashboard)/layout.tsx` - Dashboard layout (checks auth + org)
- `src/app/api/auth/setup-organization/route.ts` - Org creation API
- `src/app/auth/callback/route.ts` - OAuth/email callback handler

---

## Troubleshooting

### "useAuth must be used within an AuthProvider"
The auth layout already wraps pages in `<AuthProvider>`. Make sure you're accessing `/login`, `/signup`, or `/forgot-password` through the normal routes.

### Infinite redirect to `/onboarding`
The user has no `organization_members` record. The dashboard layout requires a user to have an organization. Complete the onboarding flow or create an org manually via SQL:

```sql
-- Replace USER_ID with the actual user ID from auth.users
INSERT INTO organizations (name, slug, business_type)
VALUES ('My Business', 'my-business', 'other');

INSERT INTO organization_members (organization_id, user_id, role, permissions, accepted_at)
VALUES (
  (SELECT id FROM organizations WHERE slug = 'my-business'),
  'USER_ID_HERE',
  'owner',
  '{"contacts": true, "workflows": true, "billing": true, "settings": true}',
  NOW()
);
```

### "Supabase not configured" error
Your environment variables are not set. Make sure `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are in `.env.local`.

### Email confirmation required but no email provider
Disable email confirmation in Supabase Dashboard > Authentication > Settings > Email Auth > turn OFF "Confirm email". Or set up an email provider (Resend, SendGrid, etc.) in Authentication > Settings > SMTP.
