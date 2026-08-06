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

Lead ingestion, the appointment lifecycle, and billing are live. There is **no**
client portal yet, so the client-facing billing view is admin-only.

Working today: email/password sign in for administrators, client management with
versioned appointment definitions, the inbound webhook with duplicate resolution
and first-touch stamping, response-time measurement, the leads view, appointment
capture from bookings and by hand, the confirmation queue, review windows,
disputes, show outcomes, confirmation notifications, payment method capture
through Stripe's hosted flow, cycle-based charge assembly with the monthly
minimum, the pre-charge itemisation, automatic payment with retries and failure
handling, credits, the attention view, the cycle job and its run log, the
unattributed/unknown event queue, and a test tool that exercises the real
endpoint.

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
| `npm test` | Ingestion pipeline tests (node:test, no live database) |

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
  (app)/                 shell layout + queue, appointments, leads, clients
                         (list + detail), billing, settings
  (auth)/login/          full-viewport login, no app shell
  api/health/            GET { ok: true }
  api/webhooks/inbound/  the single inbound endpoint
  layout.tsx             fonts, dark theme, Toaster
  page.tsx               redirect → /appointments
proxy.ts                 session refresh + route protection
components/
  appointments/          queue, table, evidence panel, decision dialogs, filters
  auth/                  login form
  billing/               attention list, charges table, itemisation, job log,
                         payment method and credit controls
  brand/                 DA logo (mark + wordmark)
  clients/               client dialog, status badge, tabs, webhook config, definitions
  leads/                 leads table, filters, detail panel
  settings/              unresolved event queue, inbound test tool
  shell/                 sidebar, topbar, nav-item, sign-out
  ui/                    shadcn components + ported DA primitives, data-table, kpi-card
lib/
  actions/               server actions (auth, clients, definitions,
                         appointments, billing)
  appointments/          capture decisions, status vocabulary, review window, shows
  billing/               cycle arithmetic, the monthly minimum, assembly,
                         payment and retries, the Stripe port, the cycle job
  auth.ts                getCurrentUser / requireUser
  constants.ts           APP_NAME, NAV_ITEMS
  db/                    clients, appointment-definitions, appointments, leads,
                         inbound-events, billing
  format.ts              money / percent / date / em-dash formatters
  ingest/                payload normalisation, the ingestion pipeline, bookings
  notifications/         what a client is told about appointments and money,
                         and the one place an email leaves
  origin.ts              where this deployment answers
  response-time.ts       derived response times, tones, and formatting
  schemas/               zod schemas shared by forms and actions
  ui.ts                  shared class recipes
  supabase/              browser, session, service-role clients + env
types/database.ts        hand-written row types for every ledger table
tests/                   pipeline, lifecycle, and billing tests against a fake
                         database
supabase/migrations/     001_ledger, 002_harden_set_updated_at,
                         003_client_definition_rpcs, 004_ingestion,
                         005_client_duplicate_window, 006_appointment_lifecycle,
                         007_billing
```

## Lead ingestion

One endpoint, `POST /api/webhooks/inbound`, receives everything: GoHighLevel
workflows, Facebook lead forms, and the landing page. The order is deliberate.

1. **Authenticate.** The shared secret in `x-vistrial-secret` identifies the
   client. A missing or unmatched secret is rejected with 401 before the body is
   parsed, and nothing is written.
2. **Log before interpreting.** The raw payload lands in `inbound_events` first.
   A payload that cannot be parsed is still evidence, still replayable, and still
   the record of what arrived and when.
3. **Acknowledge.** Success is returned immediately and processing happens after,
   because providers that wait retry, and retries are how duplicates get made. A
   recognised event that fails still returns success with the failure recorded on
   the stored event; an unrecognised type does too, stored as `unknown`.
4. **Process.** Seven event types are recognised: `lead_received`,
   `system_touch`, `human_touch`, `contact_updated`, `appointment_booked`,
   `appointment_showed`, `appointment_no_show`. An appointment event that only
   says something changed is read from the provider's own appointment status; a
   status there is no rule for is stored as `unknown` rather than guessed at,
   because guessing puts a charge on the line.

**Idempotency.** Matched on the provider's own event id where one is supplied,
and on client plus contact identity plus timestamp where it is not. A unique index
on `inbound_events.idempotency_key` is the gate, so a retried delivery loses the
insert rather than producing a second lead.

**Duplicate resolution.** A second submission from the same phone or email inside
the client's window (default 30 days, configurable per client) links to the
original lead instead of creating a new one. The original keeps its arrival
timestamp and its touches — submitting twice does not reset the response clock or
create a second billable path — and every submission stays visible.

**Touch stamping.** A touch of a given type stamps once per lead, on the first
occurrence, and is never overwritten. Later contacts are still recorded as
activity but do not move the figure response times are read from; a partial unique
index on `touches (lead_id, touch_type) where is_first_of_type` enforces it in the
database. System versus human is taken from what the sender declares, never
inferred from the message. An event that declares neither stamps nothing and is
surfaced for classification.

**Nothing is discarded.** Events that cannot be attributed to a client, types the
system does not recognise, and touches that declared neither kind all wait in
settings, with the count shown on the Settings item in the sidebar.

## Response time

Three figures — system, human, and the gap between them — all computed from touch
records on read. **None is stored on any record.** A lead with no touch of a given
type renders "Awaiting" rather than zero, because zero and unanswered mean
opposite things. Time is raw clock time with no business-hours adjustment: a lead
arriving at nine at night and answered at nine the next morning took twelve hours,
and that is the fact the offer exists to fix.

## Appointment definitions

The definition governs which appointments are billable, so it is versioned rather
than edited. Creating a client creates version one in the same transaction, and
every later change inserts a new version with its own effective date. An
appointment is judged against the version in effect when it was created; a new
version never applies retroactively.

## Appointments

**Capture.** Bookings arrive on the same webhook as leads, or are recorded by
hand. Every appointment belongs to a lead: where a booking matches none, one is
created from whatever identity it carries and marked as originating from the
booking. A booking with no phone and no email is refused rather than becoming an
appointment nobody can explain.

**One appointment, not two.** The same booking delivered twice produces one
record. A booking for a lead that already holds a live appointment updates that
one as a reschedule, retaining the time it replaced, so a reschedule can never
become a second billable appointment. Matching only considers live appointments:
a rejected one is a judgement already made, and a billed one is immutable, so a
later booking on the same slot is genuinely new.

**Version stamping.** The definition version in effect at creation is written
onto the appointment inside the same statement that inserts it, and a trigger
refuses any later change to it. Tightening the criteria in March cannot make
February's confirmations questionable.

**Five statuses.** `pending → confirmed | rejected`, `confirmed → disputed |
billed`, `disputed → confirmed | rejected`. Nothing moves out of `rejected` or
`billed`, and a billed appointment cannot be edited at all. Every transition
records who made it, when, and why where a reason applies, written to
`appointment_events` by the same trigger that allows the change.

**The review window.** Confirming opens a window of the client's configured
length (default 72 hours), computed by the database from the moment of
confirmation. It is raw clock time with no weekend adjustment: a shorter
effective window over a weekend is acceptable, silently extending one is not,
because the billing date would drift. An appointment cannot become billable
until the window has genuinely elapsed **and** the client has been notified —
both enforced in the trigger, not only in the application.

**Disputes.** Raising one holds billing immediately; the appointment leaves the
pending charge rather than accruing toward it. Upholding rejects it, resolving
returns it to confirmed with a fresh window. Every dispute and its outcome are
kept permanently in `appointment_disputes`, with both parties' reasoning.
Clients have no login yet, so an admin records the dispute on their behalf and
the history says which admin recorded it.

**Showed and no-shows.** A client billing on booked confirms as normal and the
outcome is recorded when known. A client billing on showed cannot have an
appointment confirmed before a show is recorded — the trigger refuses it — and
the queue separates those so they are not mistaken for unreviewed work. A
no-show on an appointment still awaiting review is rejected outright.
Booked-but-not-shown is tracked per client regardless of billing basis.

**Notification.** Confirming inserts a notification record before anything is
sent, so a confirmed appointment can never exist without a record of what the
client was owed. Delivery goes through Resend when `RESEND_API_KEY` and
`NOTIFICATION_FROM` are set, and a failure stays visible and retryable rather
than being swallowed.

## Billing

**Payment method.** Capture happens inside Stripe's own hosted setup flow: an
admin issues a secure link, the client enters their card on Stripe's page, and
Vistrial stores the customer reference, the payment method reference, and the
brand, last four, and expiry Stripe reports back. No card number is stored,
transmitted, or displayed, because none ever arrives. A client cannot be made
active without a method on file — a database trigger refuses it — but their
appointments still accumulate and are charged once one exists.

**The cycle.** Seven, fourteen, or thirty days, anchored to the client's
activation date rather than the calendar. An exclusion constraint on
`(client_id, daterange(period_start, period_end))` means a client can never hold
two charges for overlapping periods, whatever a job run believes.

**Assembly.** At close, every appointment that is confirmed, out of its review
window, not already on a charge, and whose confirmation actually reached the
client. Anything still inside its window carries to the next cycle; a disputed
appointment cannot qualify because a dispute moves it out of `confirmed`. The
rate is written onto the appointment at assembly, so a later rate change never
alters what a past appointment was billed at. A cycle with nothing to bill and
no minimum due produces no charge at all.

**The monthly minimum** is assessed across the calendar month and applied on the
first cycle that closes after the month ends, as its own labelled line. It is
never folded into the per-appointment figure: a client comparing their invoice
to their appointment count and finding the arithmetic wrong is a trust problem
that outlives the explanation.

**The notice.** No client is charged for anything they have not seen itemised in
advance. Assembly sends the full detail and schedules payment no less than
twenty-four hours later. A charge whose notice did not deliver holds in
`draft`, appears in the attention view, and cannot be marked paid — the trigger
checks for a delivered `pre_charge` notification before it will allow it.

**Payment** claims the charge with a conditional update and carries an
idempotency key derived from the charge and the attempt number, so a duplicated
job run replays rather than charging twice. Success locks every appointment on
the charge to `billed` permanently and sends a receipt.

**Failure** records the processor's own reason and retries three times across
roughly a week (day zero, three, seven). The client hears on the first failure
and the last, in plain language, with a way to replace the card when that is the
problem. Delivery does not stop: the client appears in the attention view every
day the failure persists, growing more prominent, and the admin decides. After
the last attempt the appointments stay confirmed and locked, and the next
successful charge picks them up. Nothing is silently forgiven.

**Corrections.** A processed charge never changes. A correction is a credit with
a required reason, visible on both sides, applied against the next charge; a
credit larger than the charge is applied as far as it goes and the remainder is
carried forward.

**The job** runs at `POST /api/jobs/cycle` with the shared secret in
`x-cron-secret`, or by hand from the billing screen. It assembles, notifies,
processes, and retries, and records every run — including the runs that did
nothing and the clients it skipped, with the reason.

## Data model

Eighteen tables, all with row level security enabled and **no policies** —
service role only until auth lands:

- `clients` — commercial terms (rate, minimum, cycle, review window, bill on booked/showed) and integration ids
- `appointment_definitions` — versioned billability rules so changing the rules never reclassifies past appointments
- `campaigns`, `ad_spend` — attribution and spend
- `leads`, `touches`, `lead_submissions` — inbound leads, immutable first-touch stamps, and every repeat submission
- `appointments` — the billing unit and the proof record
- `appointment_events` — every material change, in order, with who and why
- `appointment_disputes` — permanent, outliving the status they produced
- `appointment_notifications` — what the client was told and whether it arrived
- `charges` — a billing cycle rolled up per client, immutable once paid
- `charge_lines` — the itemisation exactly as the client was shown it
- `charge_attempts` — every payment attempt with the processor's own reason
- `charge_notifications` — the itemisation, the receipt, and the failure notices
- `credits` — corrections, each with a required reason
- `job_runs`, `job_run_entries` — what the cycle job did, and what it skipped
- `inbound_events` — immutable audit of every webhook payload before processing

`public.set_updated_at()` (with a pinned `search_path`) keeps `updated_at`
honest. `guard_appointment()` decides whether a change to an appointment is
allowed and derives what the caller must not supply;
`record_appointment_history()` writes the audit as part of the same statement.
`guard_charge()` makes a paid charge immutable and refuses to let one be marked
paid without a delivered notice; `guard_charge_line()` makes the itemisation
write-once; `guard_client_activation()` holds the payment method gate.

## History

This repository previously held a different, larger product. See
[`docs/WHAT_THE_APP_ONCE_WAS.md`](./docs/WHAT_THE_APP_ONCE_WAS.md).
