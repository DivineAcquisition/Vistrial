# Vistrial

Case files for high-ticket sales teams. Every inbound lead gets a persistent
record that setters and closers open before working it: readiness score, full
touch history, call transcripts, extracted objections, and follow-up drafted
from what was actually said. GoHighLevel stays the CRM. Vistrial is the
intelligence layer on top.

## Setup
1. `npm install`
2. `cp .env.local.example .env.local` and fill in the Supabase keys.
   Anthropic and GHL can stay blank until their prompts.
3. `npm run dev` → http://localhost:3000

## Stack
Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 + shadcn/ui · Supabase
(Postgres, RLS, multi-tenant) · Anthropic API · GoHighLevel. Deploy on Vercel.

Domains (later): `app.vistrial.io` (operator app), `admin.vistrial.io` (DA
staff console). API routes live inside this Next app.

## Build order
1. Foundation (this)
2. Schema + multi-tenancy + RLS
3. Auth + org membership
4. App shell and navigation
5. Readiness scoring engine
6. GHL sync and webhook ingestion
7. Case File surfaces
8. Transcript ingestion and extraction
9. Pre-Call Brief
10. Follow-up drafting
11. Reporting
