# What Vistrial Once Was

This repository previously contained a full production-oriented application named **Vistrial**. The codebase was wiped on purpose so the product can be rebuilt from a clean slate. This document preserves a factual record of what existed before the reset.

Git history still contains the previous implementation if anything needs to be recovered.

---

## Product summary

**Vistrial** was a multi-tenant business automation and operations platform aimed at service businesses (cleaning, HVAC, plumbing, landscaping, salons, studios, and similar). Over time it grew from an SMS / voice marketing tool into a broader operational execution platform with booking, quoting, billing, team ops, and an autonomous AI agent layer.

Public positioning included:

- Automating follow-up and customer reactivation for service businesses
- A lighter self-serve offering (**Vistrial Lite**) around ~$49/month for reactivation campaigns
- Compliance-minded SMS workflows (opt-in, quiet hours, unsubscribe handling)

Support / brand domain historically referenced: `vistrial.io`.

---

## Core capabilities (pre-reset)

### Customer engagement & messaging

- Contact management with import (CSV), tags, validation, bulk actions, and unsubscribe flows
- SMS marketing and conversational inbox (conversations / messages)
- Voice drops powered by ElevenLabs text-to-speech
- Messaging providers: primarily **Telnyx**, with Twilio support as an alternative
- Email sending via **Resend**
- A2P / messaging registration support
- Phone number search and purchase via Telnyx APIs

### Workflow automation

- Multi-step workflow builder and enrollment engine
- Template-based workflows plus AI-assisted workflow generation
- Cron-driven processors for enrollment steps and queued message sends
- Conversion / follow-up style automation for quotes and reactivation

### Booking & quotes

- Embeddable public booking pages (`/book/[slug]`, `/embed/[slug]`, `embed.js`)
- Booking page customization, pricing matrix, booking requests
- Quote creation, sending, tracking, and follow-ups
- “Powered by Vistrial” branding options on public booking surfaces

### Billing & monetization

- Stripe subscriptions and usage-based credit billing
- Plans historically included Starter / Growth / Scale and Lite / Pro / Agency pricing models
- Credit balances, refill / auto-refill, invoices, payment methods, customer portal
- Usage tracking for SMS, email, and voice overages

### Multi-organization & team

- Organizations, memberships, roles, onboarding wizard
- Team member management and settings (business, notifications, messaging, integrations, API)
- Slack webhook integrations

### AI OPS / Autonomous Agent Engine

Later commits repositioned Vistrial as an **operational execution platform** with an AI OPS / agent system, including:

- Client & project tracking for service retainers
- Health scoring, retention cases, milestones, renewals, deadline checks
- Morning priorities, weekly briefs, daily scans
- Queue-based agent scan architecture with deduplication
- Draft messaging, sentiment helpers, permission tiers
- Admin tools such as an ROI calculator (`/tools/roi-calculator`)
- Slack (and related) notification routing for agent actions

---

## Tech stack

| Area | Technology |
|------|------------|
| App framework | Next.js 14 (App Router), React 18, TypeScript |
| Styling / UI | Tailwind CSS, shadcn/ui / Radix primitives, Tremor-influenced components |
| Database / Auth / Storage | Supabase (PostgreSQL, Auth, Storage, RLS) |
| Payments | Stripe (Checkout, Portal, webhooks, metered usage) |
| SMS / Voice | Telnyx, Twilio |
| Voice AI | ElevenLabs |
| Email | Resend (+ React Email) |
| AI | Anthropic SDK (workflow generation / agent intelligence) |
| Data / state | TanStack Query & Table, Zustand, Zod, React Hook Form |
| Deploy | Vercel (iad1), cron jobs in `vercel.json` |

Approximate pre-reset scale:

- ~440 files under `src/`
- ~436 TypeScript / TSX modules
- ~19 Supabase migration files
- Large surface of App Router pages + API routes

---

## Application structure (as it existed)

```
src/
  app/
    (auth)/            # login, signup, forgot password
    (dashboard)/       # contacts, inbox, messaging, workflows, bookings,
                       # clients, projects, team, reports, settings, tools
    (marketing)/       # landing, Lite, compliance pages
    (onboarding)/      # org setup wizard
    api/               # REST-style route handlers (billing, agent, cron,
                       # contacts, workflows, webhooks, etc.)
    book/ & embed/     # public booking experiences
  components/          # UI + feature components
  lib/                 # supabase, stripe, telnyx, agent, workflows, email...
  services/            # domain services (contacts, credits, messaging, etc.)
  hooks/, types/, constants/
supabase/
  migrations/          # schema evolution (auth → messaging → booking →
                       # billing → AI OPS → autonomous agent)
  seed.sql, templates/, config.toml
public/                # brand assets, embed.js
```

Middleware handled auth / session gating for protected routes.

---

## Notable data domains

Historical schema covered (non-exhaustive):

- `organizations`, `user_profiles`, `organization_memberships`
- `contacts`, conversations / messages, messaging registrations
- `workflows`, enrollments, templates
- `quotes`, `bookings`, booking pages / pricing
- `credit_balances`, transactions / billing artifacts
- AI OPS: `clients`, `team_members`, projects/interactions/invoices,
  health scoring fields, agent drafts, priorities, retention cases
- Autonomous agent: client assignments, scan queue, dedup log,
  scheduled runs, channel routing / health overrides

---

## Background jobs (Vercel crons)

Examples that ran in production config:

- Agent scan queue / process / morning brief
- Health scan, weekly brief, morning priorities, auto-execute
- Deadline / renewal / milestone checks
- Workflow execute / process jobs
- Message send queue and credit balance checks

---

## Why this archive exists

The previous codebase grew into a large, multi-concern platform (messaging + booking + billing + AI ops agent). The intentional reset leaves:

1. This document as institutional memory of product scope and architecture
2. Git history as the recoverable source of truth for any prior implementation detail
3. A blank repository ready for a new foundation

Nothing in this file is a commitment to rebuild every former feature. It is a map of what once shipped in this repo.
