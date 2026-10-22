# Vistrial

Case files for high-ticket sales teams. Every inbound lead gets a persistent
record that setters and closers open before working it: readiness score, full
touch history, call transcripts, extracted objections, and follow-up drafted
from what was actually said. LeadConnector stays the CRM. Vistrial is the
intelligence layer on top.

## Setup
1. `npm install`
2. `cp .env.local.example .env.local` and fill in the Supabase keys.
   Anthropic and LeadConnector credentials can stay blank until their prompts.
3. `npm run dev` → http://localhost:3000

## Stack
Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 + shadcn/ui · Supabase
(Postgres, RLS, multi-tenant) · Anthropic API · LeadConnector. Deploy on Vercel.

Domains: [`www.vistrial.io`](https://www.vistrial.io) currently serves the
public site (apex `vistrial.io` is not on Vercel DNS yet — do not 308 www to
it). [`app.vistrial.io`](https://app.vistrial.io) is the operator app.
`admin.vistrial.io` (DA staff console) comes later. API routes live inside
this Next app.

## Visual language

The workspace is **white by default** with a dark theme a person can switch to
from the header (kept per device, applied before the first paint). The public
site and the auth desk stay dark. Tokens and surfaces come from the Divine
Acquisition hiring site: brand `#9A88FC`, ink `#07070B`, Inter Display for UI type
and headings, Geist Mono for code. Filled actions invert to near-black type, never
white on the brand fill. Write colour through tokens (`text-strong`,
`bg-overlay/5`, `bg-card`), never hard-coded white; `src/lib/theme.test.ts` checks.

| Where | What |
|---|---|
| `src/app/globals.css` | Light `:root` and dark `.dark` palettes, semantic tokens, `.panel`, motion |
| `src/lib/theme.ts`, `src/components/app/theme-toggle.tsx` | Theme choice, head script, toggle |
| `src/lib/ui.ts` | Button / input / eyebrow class recipes |
| `src/components/ui` | Panels, KPI cards, tones, backdrop, shadcn |
| `src/components/ai-elements` | AI Elements workflow canvas pieces on React Flow |
| `src/components/agent-elements` | Agent Elements cards, plus Vistrial's own composer |
| `src/components/brand/logo.tsx` | Official lockup: ink on white, silver on dark |

## Build order
1. Foundation
2. Schema + multi-tenancy + RLS
3. Auth + org membership
4. App shell
5. Readiness scoring engine
6. GHL sync and webhook ingestion
7. Case File surfaces
8. Transcript ingestion and extraction
9. Pre-Call Brief
10. Follow-up drafting
11. Reporting

## Database

Use the dedicated [Vistrial](https://supabase.com/dashboard/project/jizzmlvpnykazrsiotqq)
Supabase project (`jizzmlvpnykazrsiotqq`). Do not apply these migrations to the
DivineACQ control-plane database.

The Case File spine lives in `supabase/migrations/`. Every table is org-scoped
with RLS. Scores are append-only history; money is bigint cents. Auth is
invite-only; see [`supabase/AUTH.md`](./supabase/AUTH.md) for dashboard
settings. `org_invites` is the membership invite table. DA operators live in
`platform_admins` and are enrolled as owner in every workspace. Score cache
columns on `leads` are trigger-owned — clients cannot PATCH them.

```bash
npm run db:verify
```
