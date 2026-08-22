# Vistrial database

Use the dedicated **Vistrial** Supabase project. Do not apply these migrations
to the DivineACQ control-plane database.

| | |
|---|---|
| Project | [Vistrial](https://supabase.com/dashboard/project/jizzmlvpnykazrsiotqq) |
| Ref | `jizzmlvpnykazrsiotqq` |
| Region | `us-east-1` |
| Org | DA Enterprise Clients |

```bash
npx supabase login
npx supabase link --project-ref jizzmlvpnykazrsiotqq
npx supabase db push
npx supabase db query --linked -f supabase/seed.sql   # local/dev only
npx supabase gen types typescript --linked --schema public > src/types/database.ts
```

Local verification (no hosted project required):

```bash
bash supabase/tests/verify.sh
```

The GitHub Preview check compares `supabase/migrations/` to
`supabase_migrations.schema_migrations` on this project. Those version names
must stay in lockstep; do not apply ad-hoc dashboard migrations that are missing
from the repo.

> **The hosted project has drifted.** It carries a migration `20260822010000_onboarding`
> that exists nowhere in this repo, and with it the tables `org_onboarding`,
> `golive_runs`, `activation_events`, `activation_timestamp_changes` and
> `staff_access_log`. Nothing in the application reads any of them. They are a
> different, uncommitted implementation of this prompt and they have to be
> reconciled by hand before the next `db push`: either commit the migration that
> created them or drop them. They do not collide with the tables in
> `20260822120000_business_profile.sql`, so the two can coexist, but leaving both
> in place means two parallel activation records with only one of them wired up.

Auth dashboard settings (email + password, magic link, invite-only sign-up,
Site URL, `/auth/callback` redirects, 1-hour JWT) are documented in
[`AUTH.md`](./AUTH.md).

`seed.sql` is **dev only**. Replace the placeholder owner user id
`11111111-1111-4111-8111-111111111111` with the real Auth user after the
first owner signs in.
