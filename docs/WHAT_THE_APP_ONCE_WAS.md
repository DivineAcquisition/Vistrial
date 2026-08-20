# What Vistrial Once Was

This repository has been wiped on purpose more than once so the product can be
rebuilt from a clean slate. This document preserves a factual record of what
existed before each reset.

Git history still contains previous implementations if anything needs to be
recovered.

The current tree keeps only the Divine Acquisition hiring-site visual language
(`app/globals.css`, `lib/ui.ts`, `components/ui`, `components/brand`,
`components/auth/auth-card.tsx`). Nothing below is a commitment to rebuild
every former feature.

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

## Why this archive exists

Each reset leaves:

1. This document as institutional memory of product scope and architecture
2. Git history as the recoverable source of truth for any prior implementation
3. The hiring-site visual system as the foundation for the next build

Nothing in this file is a commitment to rebuild every former feature. It is a
map of what once shipped in this repo.
