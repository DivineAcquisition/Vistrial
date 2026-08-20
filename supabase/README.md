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

Auth dashboard settings (email + password, magic link, invite-only sign-up,
Site URL, `/auth/callback` redirects, 1-hour JWT) are documented in
[`AUTH.md`](./AUTH.md).

`seed.sql` is **dev only**. Replace the placeholder owner user id
`11111111-1111-4111-8111-111111111111` with the real Auth user after the
first owner signs in.
