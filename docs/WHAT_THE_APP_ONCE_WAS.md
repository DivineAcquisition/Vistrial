# What Vistrial Once Was

This repository has been wiped on purpose more than once so the product can be
rebuilt from a clean slate. This document preserves a factual record of what
existed before each reset.

Git history still contains previous implementations if anything needs to be
recovered.

The reset on October 22, 2026 keeps the public landing site and the visual
system: brand `#9A88FC`, ink `#07070B`, Inter Display, Geist Mono, the light
workspace with an optional dark theme, and the tokens and components in
`src/app/globals.css`, `src/lib/ui.ts`, `src/lib/theme.ts`, `src/components/ui`,
and `src/components/brand`. The signed-in product starts over on Convex.
Nothing below is a commitment to rebuild every former feature.

---

## Era 2 — Pay-per-appointment ledger

After the first reset, Vistrial was rebuilt as Divine Acquisition's
**pay-per-appointment** ledger. DA ran Facebook ads for home improvement
companies and was paid per booked, confirmed appointment. The app recorded
leads, measured response time, captured appointments, confirmed which were
billable, and charged clients on a cycle.

### Capabilities

- Email/password team auth with invitation-only accounts and TOTP for owners/admins
- Separate client portal accounts (`team_users` vs `client_users`)
- Client management with versioned appointment definitions
- Inbound webhook ingestion (duplicate resolution, first-touch stamping)
- Leads view and response-time measurement
- Appointment capture, confirmation queue, review windows, disputes, show outcomes
- Stripe hosted payment-method capture and cycle-based charge assembly
- Monthly minimum, credits, retries, failure handling
- Attention view, cycle job, unattributed event queue
- Territory exclusivity mapping
- Team accounts, roles, and activity

### Stack

| Area | Technology |
|------|------------|
| App framework | Next.js 16 (App Router), React 19, TypeScript |
| Styling / UI | Tailwind CSS v4, shadcn/ui (`radix-nova`), DA hiring-site tokens |
| Database / Auth | Supabase (PostgreSQL, Auth) |
| Payments | Stripe |
| Email | Resend |
| Deploy | Vercel |

Approximate scale: App Router surfaces for attention, queue, appointments,
leads, clients, territories, billing, team, settings, plus a client portal,
share links, and cron/webhook API routes. Schema lived in
`supabase/migrations/` (`001_ledger.sql` through `013_auth_identity_split.sql`).

---

## Era 1 — Operations / messaging platform

The original repository contained a full production-oriented application aimed
at service businesses (cleaning, HVAC, plumbing, landscaping, salons, studios,
and similar). Over time it grew from an SMS / voice marketing tool into a
broader operational execution platform with booking, quoting, billing, team
ops, and an autonomous AI agent layer.

Public positioning included:

- Automating follow-up and customer reactivation for service businesses
- A lighter self-serve offering (**Vistrial Lite**) around ~$49/month for reactivation campaigns
- Compliance-minded SMS workflows (opt-in, quiet hours, unsubscribe handling)

Support / brand domain historically referenced: `vistrial.io`.

### Core capabilities

**Customer engagement & messaging**

- Contact management with import (CSV), tags, validation, bulk actions, and unsubscribe flows
- SMS marketing and two-way message threads (kept in the CRM, never rebuilt here)
- Voice drops powered by ElevenLabs text-to-speech
- Messaging providers: primarily Telnyx, with Twilio as an alternative
- Email sending via Resend
- A2P / messaging registration support
- Phone number search and purchase via Telnyx APIs

**Workflow automation**

- Multi-step workflow builder and enrollment engine
- Template-based workflows plus AI-assisted workflow generation
- Cron-driven processors for enrollment steps and queued message sends

**Booking & quotes**

- Embeddable public booking pages (`/book/[slug]`, `/embed/[slug]`, `embed.js`)
- Booking page customization, pricing matrix, booking requests
- Quote creation, sending, tracking, and follow-ups

**Billing & monetization**

- Stripe subscriptions and usage-based credit billing
- Plans historically included Starter / Growth / Scale and Lite / Pro / Agency
- Credit balances, refill / auto-refill, invoices, payment methods, customer portal

**Multi-organization & team**

- Organizations, memberships, roles, onboarding wizard
- Team member management and settings
- Slack webhook integrations

**AI OPS / Autonomous Agent Engine**

- Client & project tracking for service retainers
- Health scoring, retention cases, milestones, renewals, deadline checks
- Morning priorities, weekly briefs, daily scans
- Queue-based agent scan architecture with deduplication
- Draft messaging, sentiment helpers, permission tiers

### Stack

| Area | Technology |
|------|------------|
| App framework | Next.js 14 (App Router), React 18, TypeScript |
| Styling / UI | Tailwind CSS, shadcn/ui / Radix primitives, Tremor-influenced components |
| Database / Auth / Storage | Supabase (PostgreSQL, Auth, Storage, RLS) |
| Payments | Stripe (Checkout, Portal, webhooks, metered usage) |
| SMS / Voice | Telnyx, Twilio |
| Voice AI | ElevenLabs |
| Email | Resend (+ React Email) |
| AI | Anthropic SDK |
| Data / state | TanStack Query & Table, Zustand, Zod, React Hook Form |
| Deploy | Vercel (iad1), cron jobs in `vercel.json` |

Approximate pre-reset scale: ~440 files under `src/`, ~19 Supabase migration
files, and a large surface of App Router pages + API routes.

---

## Era 3 — Case files, then a Sales OS

The tree removed on October 22, 2026 was a multi-tenant operator app for
high-ticket sales teams. The public line in the README was: every inbound lead
gets a persistent case file (readiness score, touch history, call transcripts,
extracted objections, and a follow-up drafted from what was said).
LeadConnector stayed the CRM. Vistrial was the intelligence layer on top.

By the last weeks of the era the same codebase was also being pulled toward a
fuller Sales OS: Foundation, Forsight (ads, creatives, pipeline), a separate
Stellar host, an approval gate, playbooks, and a six-agent roster. That second
shape was not finished. The TypeScript roster still listed five agents.
A Helm migration existed in the repo and was not wired through that roster.

### What a person could open

Customer app at `app.vistrial.io`, under `/app`. The short rail was Home,
Compass, Forsight (owner and admin), To call (setter, closer, operator),
People, and Settings. Quieter tools lived behind jump and `/app/more`.

Rough surface, grouped:

- Home, queue ("To call"), people and case files, call log, tasks, follow-ups
- Compass ask, agent runs, approvals, notifications
- Forsight: pipeline, sources, creatives, reports
- Reporting, results, coaching, activity
- Onboarding, foundation, workflows, command
- Settings: organization, members, billing, connections, integrations, agents, approvals, privacy, profile
- A client portal, plus Stellar at `forsight.vistrial.io` (separate from core Forsight on `pulse.vistrial.io`)
- Staff tools under the team console, meant for `admin.vistrial.io`
- Public marketing site on `vistrial.io` (the landing page this reset keeps), with request, book, contact, security, privacy, terms, and cookies

Workspace roles in the nav were owner, admin, setter, closer, and operator.
Platform staff lived outside the workspace, in `platform_admins`, and were
enrolled as owner. Auth was invite-only through Supabase Auth.

### Agents in code

| Agent | Job in this era |
|---|---|
| Compass | Answer questions about leads, calls, and numbers |
| Scribe | Turn calls, email, and texts into case files |
| Assay | Score leads and order the queue |
| Sentry | Watch response time and flag leads waiting too long |
| Relay | Draft follow-ups and wait for approval |
| Helm | End-of-day reports. Migration only; not in the TypeScript roster |

### Stack and size

| Area | Technology |
|---|---|
| App | Next.js 16.4 (App Router), React 19, TypeScript |
| UI | Tailwind CSS v4, coss / Base UI primitives, the hiring-site palette |
| System of record | Supabase Postgres, RLS, Auth. Project **Vistrial**, ref `jizzmlvpnykazrsiotqq`, created August 20, 2026, region us-east-1 |
| Live mirror | Convex 1.47. Directory, home, notifications, and agent activity, keyed by the Postgres ids. Not the system of record |
| AI | Anthropic, AI SDK, assistant-ui |
| Email / ads / CRM | Resend, GoHighLevel / LeadConnector, Telnyx webhooks, Stripe billing |
| Deploy | Vercel, with a large cron list in `vercel.json` |

About 1,700 files under `src/`, about 180 App Router pages, and 127 SQL
migrations in `supabase/migrations/` (August 17, 2026 through October 22, 2026),
from `case` / `readiness` through assay, the approval gate, the agent registry,
workflows, and helm. `npm run db:verify` checked those policies. Scores were
append-only. Money was bigint cents.

Convex tables in that mirror included workspaces, members, assignments,
invites, platform staff, activity runs, approval items, notifications, lead
access, and home briefings. Customer rows carried the old organization uuid
as `legacyId`.

A discovery note from the same week recorded that production was behind the
repo (no `assay_*`, `agent_registry`, or `playbooks` tables yet) and that
`public.billing_settings` had row level security off in production. Those
facts died with this reset. They are not a task list for the new build.

### What happened to the database

The new build does not use this Supabase project. Pausing it was attempted
and refused: the DivineAcquisition organization is on the Pro plan, and a
paid project cannot be paused unless it is first moved to a free organization.
The organization was not downgraded. These other projects were left running:
DivineACQ, AlphaLuxClean, NovaraCleaning, and BayAreaCleaningPros.

The project was still `ACTIVE_HEALTHY` when the code stopped referencing it.
Dashboard: `https://supabase.com/dashboard/project/jizzmlvpnykazrsiotqq`

## Why this archive exists

Each reset leaves:

1. This document as institutional memory of product scope and architecture
2. Git history as the recoverable source of truth for any prior implementation
3. The landing page and the hiring-site visual system as the foundation for the next build

The source of truth for the rebuild is `docs/foundation/00-product-brief.md`.
Nothing in this file is a commitment to rebuild every former feature. It is a
map of what once shipped in this repo.
