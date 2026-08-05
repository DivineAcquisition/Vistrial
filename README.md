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

The Supabase project already exists (`Vistrial`, ref `vsbzcbiyvaihhejjsypn`) and
both migrations are applied to it. You only need to paste the service role key
into `.env.local` by hand — see [`supabase/README.md`](./supabase/README.md).

Visit http://localhost:3000 — it redirects to `/appointments`.

| Script | Purpose |
|---|---|
| `npm run dev` | Dev server (Turbopack) |
| `npm run build` | Production build |
| `npm run typecheck` | Route typegen + `tsc --noEmit` |
| `npm run lint` | ESLint |

## Design system

The visual language is ported from the [Divine Acquisition
repo](https://github.com/DivineAcquisition/DA) so the ledger and DA's other
properties read as one product. The app is **permanently dark** — no light mode,
no toggle. Tokens live in `app/globals.css`:

| Scale | Values |
|---|---|
| Brand | `brand-50 … brand-950`, prime colour `brand-500 #9A88FC` |
| Ink (neutrals, violet-shifted) | `ink-950 #07070B` page, `ink-900 #0B0A11` panels, `ink-850`, `ink-800`, `ink-700` |
| Flags (status only) | `flag-good #52D6A4`, `flag-warning #F0B45C`, `flag-critical #F87171` |

shadcn's semantic tokens (`background`, `card`, `primary`, `border`, …) are mapped
onto those scales, so shadcn components inherit the DA look automatically.

Surfaces and helpers, also from DA: `.panel` (gradient top edge over `#0B0A11`),
`.panel-hover`, `.hairline-glow`, `.text-gradient`, `.tabular-nums`,
`.animate-rise` / `.animate-fade`. Typography is Inter throughout with DA's
`font-feature-settings` and heading letter-spacing.

Ported components:

| Where | What |
|---|---|
| `components/ui/tone.tsx` | `Tone` vocabulary (`brand`/`neutral`/`good`/`warning`/`critical`), `TonePill`, `Dot`, `Meter`, `RatePill`, `rateTone` |
| `components/ui/panel.tsx` | `Panel`, `PanelLink` |
| `components/ui/stat-tile.tsx` | `StatTile`, `StatGrid` (hairline-divided metric grid) |
| `components/ui/page-header.tsx`, `section-header.tsx` | page and section headers |
| `components/ui/empty-state.tsx`, `avatar.tsx`, `definition-list.tsx` | `EmptyState`, `Avatar`, `DefinitionList` / `KeyValue` |
| `components/brand/logo.tsx` | DA trident mark + wordmark |
| `lib/ui.ts` | button / input / label / eyebrow class recipes |
| `lib/format.ts` | `formatMoney`, `formatPercent`, `formatRelative`, `orGap`, `initials`, date formatters |

## Structure

```
app/
  (app)/                 shell layout + appointments, leads, clients, billing, settings
  api/health/            GET { ok: true }
  layout.tsx             fonts, dark theme, Toaster
  page.tsx               redirect → /appointments
components/
  brand/                 DA logo (mark + wordmark)
  shell/                 sidebar, topbar, nav-item
  ui/                    shadcn components + ported DA primitives, data-table, status-badge
lib/
  constants.ts           APP_NAME, NAV_ITEMS
  db/clients.ts          typed, validated data access (server-only)
  format.ts              money / percent / date / em-dash formatters
  ui.ts                  shared class recipes
  supabase/              browser + service-role clients
types/database.ts        hand-written row types for every ledger table
supabase/migrations/     001_ledger.sql, 002_harden_set_updated_at.sql
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

`public.set_updated_at()` (with a pinned `search_path`) keeps `updated_at` honest
on `clients` and `appointments`.

## History

This repository previously held a different, larger product. See
[`docs/WHAT_THE_APP_ONCE_WAS.md`](./docs/WHAT_THE_APP_ONCE_WAS.md).
