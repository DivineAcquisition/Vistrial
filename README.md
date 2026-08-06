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

Admin authentication and client management are in. There are **no** webhooks, no
lead ingestion, no billing, and no Stripe yet, so the appointments, leads, and
billing tables render empty states.

Working today: email/password sign in for administrators, the client list, the
create/edit client dialog, the client detail page with its webhook configuration,
and versioned appointment definitions.

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

| Colour | Token | Used for |
|---|---|---|
| DA Purple `#6A00FF` | `brand-700`, `--primary` | Filled primary buttons and the single most important emphasis on a screen. Nothing else. |
| DA Light Purple `#937DFF` | `brand-500`, `--ring` | The default accent: section headers, active navigation, focus rings, links, icon accents, card top borders. |
| Deep Purple `#241442` | `brand-950`, `--secondary` | Table header fills and dark panels. |

DA Purple is heavily saturated and vibrates against dark backgrounds at scale, so
it is confined to filled buttons; DA Light Purple carries everything else.

Surfaces: page `#0B0B0F`, cards `#1C1C26`, popovers and muted surfaces `#151520`,
borders and inputs `#2A2A3A`. Text: body `#B0AEC0` (`silver`), card and heading
`#FFFFFF`, dimmed `#6E6C80` (`dim`).

Semantic tones are for metric values and status indicators only, never interface
chrome: `flag-good #7AFF8A` (confirmed, revenue, gains), `flag-critical #FF6A6A`
(rejected, failed payments, losses), `flag-warning #FFD06A` (pending, disputed,
needs attention).

shadcn's semantic tokens (`background`, `card`, `primary`, `border`, …) are mapped
onto those values, so shadcn components inherit the palette automatically.

Surfaces and helpers, also from DA: `.panel` (gradient top edge over `#0B0A11`),
`.panel-hover`, `.hairline-glow`, `.text-gradient`, `.tabular-nums`,
`.animate-rise` / `.animate-fade`. Typography is Inter throughout with DA's
`font-feature-settings` and heading letter-spacing.

Ported components:

| Where | What |
|---|---|
| `components/ui/tone.tsx` | `Tone` vocabulary (`brand`/`neutral`/`good`/`warning`/`critical`), `TonePill`, `Dot`, `Meter`, `RatePill`, `rateTone` |
| `components/ui/panel.tsx` | `Panel`, `PanelLink` |
| `components/ui/kpi-card.tsx` | `KpiCard` (light purple top border, tone-coloured value), `KpiGrid` |
| `components/ui/page-header.tsx`, `section-header.tsx` | page and section headers |
| `components/ui/empty-state.tsx`, `avatar.tsx`, `definition-list.tsx` | `EmptyState`, `Avatar`, `DefinitionList` / `KeyValue` |
| `components/brand/logo.tsx` | DA trident mark + wordmark |
| `lib/ui.ts` | button / input / label / eyebrow class recipes |
| `lib/format.ts` | `formatMoney`, `formatPercent`, `formatRelative`, `orGap`, `initials`, date formatters |

## Authentication

Email and password, administrators only. **There is no public signup anywhere.**
Accounts are created by hand in the Supabase dashboard — see
[`supabase/README.md`](./supabase/README.md).

`proxy.ts` refreshes the session on every request and gates the app: everything
requires a session except `/login` and `/api/*` (webhooks authenticate with their
own secret header). An unauthenticated request keeps its destination in `?next=`
and lands there after signing in; a signed-in request to `/login` bounces into the
app. A failed sign in always reads "Invalid email or password" and never reveals
whether an account exists.

Two server clients, deliberately separate: `lib/supabase/session.ts` carries the
caller's session, and `lib/supabase/server.ts` is the service-role client that
bypasses RLS and is never given a session.

## Structure

```
app/
  (app)/                 shell layout + appointments, leads, clients (list + detail),
                         billing, settings
  (auth)/login/          full-viewport login, no app shell
  api/health/            GET { ok: true }
  layout.tsx             fonts, dark theme, Toaster
  page.tsx               redirect → /appointments
proxy.ts                 session refresh + route protection
components/
  auth/                  login form
  brand/                 DA logo (mark + wordmark)
  clients/               client dialog, status badge, tabs, webhook config, definitions
  shell/                 sidebar, topbar, nav-item, sign-out
  ui/                    shadcn components + ported DA primitives, data-table, kpi-card
lib/
  actions/               server actions (auth, clients, definitions)
  auth.ts                getCurrentUser / requireUser
  constants.ts           APP_NAME, NAV_ITEMS
  db/                    clients, appointment-definitions (server-only)
  format.ts              money / percent / date / em-dash formatters
  schemas/client.ts      zod schemas shared by forms and actions
  ui.ts                  shared class recipes
  supabase/              browser, session, service-role clients + env
types/database.ts        hand-written row types for every ledger table
supabase/migrations/     001_ledger, 002_harden_set_updated_at, 003_client_definition_rpcs
```

## Appointment definitions

The definition governs which appointments are billable, so it is versioned rather
than edited. Creating a client creates version one in the same transaction, and
every later change inserts a new version with its own effective date. An
appointment is judged against the version in effect when it was created; a new
version never applies retroactively.

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
