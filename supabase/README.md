# Vistrial database

Schema-only. Auth pages and API routes come later.

Use a **dedicated Vistrial** Supabase project. Do not apply these migrations
to the DivineACQ control-plane database.

```bash
npx supabase login
npx supabase link --project-ref <vistrial-project-ref>
npx supabase db push
npx supabase db query --linked -f supabase/seed.sql   # local/dev only
npx supabase gen types typescript --linked --schema public > src/types/database.ts
```

Local verification (no hosted project required):

```bash
bash supabase/tests/verify.sh
```

`seed.sql` is **dev only**. The placeholder owner user id
`11111111-1111-4111-8111-111111111111` is replaced when sign-in lands.
