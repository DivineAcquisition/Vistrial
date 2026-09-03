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

MCP `apply_migration` records the apply-time timestamp, which can differ from
the filename in this directory. Rewrite the hosted row to the filename version
instead of adding a `SELECT 1` stub for the wall-clock timestamp:

```sql
UPDATE supabase_migrations.schema_migrations
SET version = '20260835010000'
WHERE version = '20260901212323' AND name = 'forsight_foundation';
```

Do not leave both timestamps in `schema_migrations` unless a stub file for the
hosted timestamp already exists in this directory. A stub without the original
filename marked applied will make Preview try to create objects that already
exist.

Older MCP applies still have both a real file and a `SELECT 1` stub
(`20260825043959_notifications.sql` and the other `*_pad` / timestamped
duplicates). Leave those. The Forsight rows on this project were rewritten from
`20260901212323` / `212409` / `212439` / `212456` to
`20260835010000`–`20260838010000` so they match the files here.

`20260823013315_halt_queued_dispatches` is in the repo because it already ran
on this project. It replaces the halt functions so queued GHL dispatches fail
when a sequence stops, instead of still sending.

`20260822010000_onboarding` is in the repo because it already ran on this
project. `20260823090000_reconcile_hosted_onboarding` drops the five tables
that migration created (`org_onboarding`, `golive_runs`, `activation_events`,
`activation_timestamp_changes`, `staff_access_log`) and the unused setup/DA
functions. Activation is `activation_records` / `activate_org(uuid, uuid,
activation_warning[])` from `20260822120000_business_profile`. The guard on
`organizations.activated_at` stays; so does `leads.is_test`.

Auth dashboard settings (email + password, magic link, invite-only sign-up,
Site URL, `/auth/callback` redirects, 1-hour JWT) are documented in
[`AUTH.md`](./AUTH.md).

`seed.sql` is **dev only**. Replace the placeholder owner user id
`11111111-1111-4111-8111-111111111111` with the real Auth user after the
first owner signs in.
