# Vistrial Ledger

Vistrial is Divine Acquisition's platform for running a **pay-per-appointment**
agency. DA runs Facebook ads for home improvement companies (roofing, remodeling,
windows, solar) and is paid per booked appointment. The client funds their own ad
spend; DA is paid only for appointments actually produced and confirmed.

This app is the ledger that makes that model work. It records every lead, measures
how fast it was answered, records every appointment, confirms which are billable,
and (later) charges the client automatically on a cycle. The appointment record is
simultaneously the proof, the invoice line, and the analytics row.

## Status

Foundation only (Prompt 1): design system, app shell, Supabase wiring, and the
full ledger schema. There is **no** authentication, no webhooks, no billing, and
no business logic yet. Every table renders an empty state because nothing writes
data yet.

## Stack

| Concern | Choice |
|---|---|
| Framework | Next.js 16 (App Router) + React 19 + TypeScript (strict) |
| Styling | Tailwind CSS v4, dark-only design tokens |
| Components | shadcn/ui (`radix-nova` style) + Radix primitives + lucide icons |
| Data | Supabase (Postgres, Auth later) |
| Validation / forms | Zod + react-hook-form |
| Toasts | sonner |
| Payments | Stripe (a later prompt) |

## Getting started

```bash
npm install
cp .env.local.example .env.local   # then fill in your Supabase keys
npm run dev
```

Then apply the database schema: see [`supabase/README.md`](./supabase/README.md)
for how to run `supabase/migrations/001_ledger.sql` in the Supabase SQL editor.

Visit http://localhost:3000 — it redirects to `/appointments`.

| Script | Purpose |
|---|---|
| `npm run dev` | Dev server (Turbopack) |
| `npm run build` | Production build |
| `npm run typecheck` | Route typegen + `tsc --noEmit` |
| `npm run lint` | ESLint |

## Design system

The app is **permanently dark**. There is no light mode and no theme toggle.
Tokens live in `app/globals.css`:

| Token | Value |
|---|---|
| background | `#0B0B0F` |
| card | `#1C1C26` |
| primary | `#B4A0FF` |
| border / input | `#2A2A3A` |
| radius | `0.75rem` |

Semantic tones are for metric values and status only, never UI chrome:
`pos #7AFF8A`, `neg #FF6A6A`, `warn #FFD06A`, `silver #B0AEC0`, `dim #6E6C80`.

Headings use Plus Jakarta Sans (`font-heading`), body copy uses Inter
(`font-body`, the default sans).

## Structure

```
app/
  (app)/                 shell layout + appointments, leads, clients, billing, settings
  api/health/            GET { ok: true }
  layout.tsx             fonts, dark theme, Toaster
  page.tsx               redirect → /appointments
components/
  shell/                 sidebar, topbar, nav-item
  ui/                    shadcn components + kpi-card, section-header, data-table, status-badge
lib/
  constants.ts           APP_NAME, NAV_ITEMS
  db/clients.ts          typed, validated data access (server-only)
  supabase/              browser + service-role clients
types/database.ts        hand-written row types for every ledger table
supabase/migrations/     001_ledger.sql
```

## Data model

Nine tables, all with row level security enabled and **no policies** — service
role only until auth lands:

- `clients` — commercial terms (rate, minimum, cycle, review window, bill on booked/showed) and integration ids
- `appointment_definitions` — versioned billability rules so changing the rules never reclassifies past appointments
- `campaigns`, `ad_spend` — attribution and spend
- `leads`, `touches` — inbound leads and immutable response-time stamps
- `appointments` — the billing unit and the proof record
- `charges` — a billing cycle rolled up per client
- `inbound_events` — immutable audit of every webhook payload before processing

## History

This repository previously held a different, larger product. See
[`docs/WHAT_THE_APP_ONCE_WAS.md`](./docs/WHAT_THE_APP_ONCE_WAS.md).
