# Vistrial

Vistrial is being rebuilt from a clean slate. This repository keeps the
**Divine Acquisition hiring-site visual language** and nothing else from the
previous product.

Git history still contains earlier implementations. A factual record of what
shipped before lives in [`docs/WHAT_THE_APP_ONCE_WAS.md`](./docs/WHAT_THE_APP_ONCE_WAS.md).

## Stack

| Concern | Choice |
|---|---|
| Framework | Next.js 16 (App Router) + React 19 + TypeScript (strict) |
| Styling | Tailwind CSS v4, dark-only design tokens |
| Components | shadcn/ui (`radix-nova` style) + Radix primitives + lucide icons |
| Toasts | sonner |

## Getting started

```bash
npm install
cp .env.local.example .env.local
npm run dev
```

Visit http://localhost:3000 — a style-foundation page confirms the visual
system is intact.

| Script | Purpose |
|---|---|
| `npm run dev` | Dev server (Turbopack) |
| `npm run build` | Production build |
| `npm run typecheck` | Route typegen + `tsc --noEmit` |
| `npm run lint` | ESLint |

## Design system

The visual language comes from the hiring site in the [Divine Acquisition
repo](https://github.com/DivineAcquisition/DA) (`app/hiring`, `app/globals.css`,
`app/components/ui.ts`). The app is **permanently dark** — no light mode, no
toggle. Tokens live in `app/globals.css`:

| Colour | Token | Used for |
|---|---|---|
| Brand `#9A88FC` | `brand-500`, `--primary`, `--ring` | The prime colour and the action colour: filled buttons, focus rings, active navigation, card top borders. |
| `#C3B6FE` | `brand-300` | Eyebrows, section labels, links, and quieter accents. |
| Deep `#1E1940` | `brand-950`, `--secondary` | Table header fills and active navigation ground. |

`#9A88FC` is light enough that near-black type reads better on it than white, so
filled buttons invert their label (`bg-brand-500 text-ink-950`). Never put white
text on a brand fill.

Neutrals are violet-shifted so the brand sits naturally on top: page `#07070B`
(`ink-950`), panels and cards `#0B0A11` (`ink-900`), popovers and muted surfaces
`#100F18` (`ink-850`), then `#16151F` and `#1E1D29`. Hairlines, borders, and
inputs are white at 6–10%. Text: body `#A3A3A3` (`silver`), headings `#FFFFFF`,
dimmed `#737373` (`dim`).

Semantic tones are for metric values and status indicators only, never interface
chrome: `flag-good #52D6A4`, `flag-critical #F87171`, `flag-warning #F0B45C`.

shadcn's semantic tokens (`background`, `card`, `primary`, `border`, …) are mapped
onto those values, so shadcn components inherit the palette automatically.

Surfaces and helpers, also from the hiring site: `.panel` (gradient top edge over
`#0B0A11`), `.panel-hover`, `.hairline-glow`, `.text-gradient`, `.animate-rise` /
`.animate-fade` / `.animate-ping` / `.animate-drift`, and `.delay-1`…`.delay-6`.
They sit in `@layer components` so a Tailwind utility on the element still wins.
Typography is Inter throughout with DA's `font-feature-settings` and heading
letter-spacing.

Kept from the hiring site:

| Where | What |
|---|---|
| `app/globals.css` | Palette, semantic tokens, panel surfaces, motion |
| `lib/ui.ts` | Button / input / label / eyebrow class recipes |
| `lib/format.ts` | Display formatters (`formatMoney`, `formatPercent`, `orGap`, `initials`, dates) |
| `components/ui/backdrop.tsx` | Ambient grid, spotlight, and drifting orbs |
| `components/ui/tone.tsx` | `Tone` vocabulary, `TonePill`, `Dot`, `Meter`, `RatePill` |
| `components/ui/panel.tsx` | `Panel`, `PanelLink` |
| `components/ui/kpi-card.tsx` | `KpiCard` (brand top border, tone-coloured value), `KpiGrid` |
| `components/ui/page-header.tsx`, `section-header.tsx` | Page and section headers |
| `components/ui/empty-state.tsx`, `avatar.tsx`, `definition-list.tsx` | Empty, avatar, key/value |
| `components/auth/auth-card.tsx` | Signed-out card on the hiring hero treatment |
| `components/brand/logo.tsx` | DA trident mark + wordmark |
| `components/ui/*` | shadcn primitives mapped onto the same tokens |
