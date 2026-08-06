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

Design system, app shell, ledger schema, and **lead ingestion**: the inbound
webhook, duplicate resolution, touch stamping, and response time. Appointments,
billing, and Stripe are still empty shells, and there is still **no
authentication** — every route, including the settings test tool, is open until
auth lands.

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
| `npm test` | Ingestion tests (Node's test runner, no database needed) |

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
  (app)/settings/actions.ts  server actions: test tool, event resolution
  api/health/            GET { ok: true }
  api/webhooks/inbound/  the one endpoint every provider posts to
  layout.tsx             fonts, dark theme, Toaster
  page.tsx               redirect → /appointments
components/
  brand/                 DA logo (mark + wordmark)
  leads/                 leads table, detail panel, filters, response value
  settings/              unresolved event queue, inbound test tool
  shell/                 sidebar, topbar, nav-item
  ui/                    shadcn components + ported DA primitives, data-table, status-badge
lib/
  constants.ts           APP_NAME, NAV_ITEMS
  db/                    typed, validated data access (server-only)
  format.ts              money / percent / date / em-dash formatters
  ingest/normalise.ts    payload normalisation, event classification, idempotency key
  ingest/pipeline.ts     authenticate → log → acknowledge → process
  response-time.ts       response times, derived on read and stored nowhere
  ui.ts                  shared class recipes
  supabase/              browser + service-role clients
tests/                   ingestion tests over an in-memory stand-in for Supabase
types/database.ts        hand-written row types for every ledger table
supabase/migrations/     001_ledger.sql, 002_harden_set_updated_at.sql, 003_ingestion.sql
```

## Lead ingestion

One endpoint receives everything: GoHighLevel workflows, Facebook lead forms, and
the landing page.

```
POST /api/webhooks/inbound
x-vistrial-secret: <the client's webhook_secret>
```

The order is the point:

1. **Authenticate.** The secret identifies the client. A missing or unmatched
   secret is rejected with a 401 before the body is read, and nothing is written.
2. **Log.** The raw payload is written to `inbound_events` before anything is
   interpreted, including payloads that are not valid JSON. A payload that cannot
   be parsed is still evidence and still replayable.
3. **Acknowledge.** Recognised events, unrecognised ones, and events that fail to
   process all return `200`. Returning an error to a provider triggers retry
   storms, and every retry is a chance to duplicate a lead, an appointment, and a
   charge. Failures are recorded on the stored event instead.
4. **Process**, after the response, via `after()`.

Four event types are recognised, declared by the sender under any of several
common field names (`event_type`, `type`, `event`, …):

| Type | Effect |
|---|---|
| `lead.received` | Creates a lead, or links to the original if it is a repeat |
| `touch.system` | Stamps the first automated contact |
| `touch.human` | Stamps the first human contact |
| `contact.updated` | Revises an existing lead's contact fields |

Anything else is stored as `unknown` and surfaced in settings. A contact attempt
that does not declare whether it was system or human is stored as `unclassified`
and stamps nothing: **the distinction is declared by the sender, never inferred
from the message**, because a wrong stamp corrupts the figure the business is
paid on.

**Idempotency.** The insert into `inbound_events` is the gate. The key is the
provider's own event id where one is supplied, and client + contact identity +
timestamp where one is not; a unique index means a retried delivery is
acknowledged and processed no further.

**Duplicates.** A second submission from the same phone or email inside the
client's window (`clients.duplicate_window_days`, default 30) is recorded against
the original lead in `lead_submissions`. No second lead is created, and the
original keeps its arrival timestamp and its touches — submitting twice does not
reset the response clock or create a second billable path.

**Touches.** Every contact attempt is stored. Only the first of each type carries
`is_first_of_type`, and a partial unique index makes that a database guarantee
rather than an application convention. Later contacts are history; they never
move the first-touch values.

**Response time** is computed from those touches on read and stored nowhere. A
lead with no touch of a given type renders as "awaiting", never as zero. Time is
raw clock time with no business-hours adjustment: a lead that arrives at nine at
night and is answered at nine the next morning took twelve hours.

### Testing without live traffic

Settings carries a test tool that posts a chosen event type for a chosen client
through the real endpoint using the real secret. It has no privileged path: same
authentication, same logging, same idempotency, same processing. Reuse an event
id to replay a delivery and watch the second one create nothing.

`npm test` runs the same pipeline against an in-memory stand-in for Supabase that
enforces the same unique indexes, so the rules can be checked without a database.

## Data model

Ten tables, all with row level security enabled and **no policies** — service
role only until auth lands:

- `clients` — commercial terms (rate, minimum, cycle, review window, bill on booked/showed) and integration ids
- `appointment_definitions` — versioned billability rules so changing the rules never reclassifies past appointments
- `campaigns`, `ad_spend` — attribution and spend; an unknown campaign id is
  created rather than dropped, because an attribution gap must never cost a lead
- `leads`, `lead_submissions`, `touches` — inbound leads, every submission
  including repeats, and the first-touch stamps response time is derived from
- `appointments` — the billing unit and the proof record
- `charges` — a billing cycle rolled up per client
- `inbound_events` — immutable audit of every webhook payload before processing

`public.set_updated_at()` (with a pinned `search_path`) keeps `updated_at` honest
on `clients` and `appointments`.

## History

This repository previously held a different, larger product. See
[`docs/WHAT_THE_APP_ONCE_WAS.md`](./docs/WHAT_THE_APP_ONCE_WAS.md).
