# Vistrial

Sales OS for service companies, SaaS companies, coaches, consultants, and agencies.
The public site is the landing page. The signed-in product is a fresh build.

The source of truth is [`docs/foundation/00-product-brief.md`](docs/foundation/00-product-brief.md).
What the previous apps were is in [`docs/WHAT_THE_APP_ONCE_WAS.md`](docs/WHAT_THE_APP_ONCE_WAS.md).

## Setup

1. `npm install`
2. `cp .env.local.example .env.local`
3. `npx convex dev` once a Convex project is linked, then put its URL in `NEXT_PUBLIC_CONVEX_URL`
4. `npm run dev` → http://localhost:3000

`/` is the landing page. `/app` is the empty workspace shell. `/admin` is the empty staff page.
Sign-in is not wired yet. Workspace rules (roles, invites, lead visibility, staff grants) live in `convex/` and are covered by `npm test`.

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 · Convex · Vercel.

Convex is the system of record. The old Vistrial Supabase project is not used.
The DivineAcquisition organization is on the Pro plan, so that project could not be paused from here without moving it to a free organization. It was left in place, and the other projects in that organization were not changed.

## Visual language

The workspace is white by default. A person can switch to dark from the shell header.
The public site stays dark. Brand `#9A88FC`, ink `#07070B`, Inter Display for UI type, Geist Mono for code.
Filled actions use near-black type on the brand fill. Write color through tokens (`text-foreground`, `bg-background`, `text-muted-foreground`), not hard-coded white.

| Where | What |
|---|---|
| `src/app/globals.css` | Light `:root` and dark `.dark` palettes |
| `src/lib/theme.ts`, `src/components/app/theme-toggle.tsx` | Theme choice and the header toggle |
| `src/lib/ui.ts` | Type and control recipes |
| `src/components/ui` | Shared components |
| `src/components/brand/logo.tsx` | Ink mark on white, silver mark on dark |
