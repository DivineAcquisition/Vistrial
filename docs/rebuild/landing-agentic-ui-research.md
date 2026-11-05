# Landing page: platform logos and agentic UI components

Date: 2026-11-04. For the public landing page (`src/components/marketing/landing.tsx`). Companion to `agentic-ui-research.md`, which covers the signed-in run screens.

## 0. How this was researched, and what is not verified

I read the Magic UI component index, the React Flow UI page, the 21st.dev catalog (through the connected 21st tool), web search results, and this repo. I did not open each 21st component's source or license. Web search returned mostly secondhand pages for Vercel AI Elements, and nothing useful on how named agent companies (Lindy, Decagon, Sierra, Manus, Devin) build their heroes, so I make no claims about those sites.

21st installs need `API_KEY_21ST` and use account credits. Check each component's license and code before it goes in (rules in section 6).

## 1. Platform logos (done in this change)

All marks live in `public/brand/platforms/`, with a typed registry in `src/lib/marketing/platforms.ts` and a `<PlatformLogo id tone="color|mono" />` component. A contact sheet is at `docs/rebuild/assets/platform-logos.png`.

| Group | Platforms | Mono version |
|---|---|---|
| Research sources (match `platform` in `convex/lib/researchShapes.ts`) | YouTube, Meta (for Meta Ad Library), TikTok, Instagram, plus Facebook in reserve | All |
| Connectors the product describes | HighLevel, Google Calendar, Outlook Calendar, Fathom, Fireflies, Google Drive | All except Outlook |
| Named but not live (keep off the landing page) | HubSpot, Salesforce, Airtable | HubSpot, Airtable |
| Candidates for customer results (open question in `v2-brief-agents-and-areas.md`) | Google Ads, Google Analytics, LinkedIn | All except LinkedIn |
| Model provider | Claude, Anthropic | Both |

Sources: svgl.app for full-color SVGs, simple-icons 16.36.0 (CC0) for mono glyphs, and the companies' own sites for HighLevel, Fathom and Fireflies. "The open web" and "your own results" have no brand mark. Keep the Globe and upload icons for those.

Two findings:
- The current `ToolMark` (`src/components/connectors/tool-mark.tsx`) draws HighLevel, Fathom, Fireflies, Salesforce and Outlook as hand-made stand-ins. Those are not the real logos. Swapping them for the registry files is a small follow-up.
- simple-icons' "Fathom" is Fathom Analytics, a different company. The Fathom logo here comes from fathom.ai.

## 2. What the repo already has

Installed under `src/components/ui` but not used on any page: Animated List, Terminal, Marquee, Number Ticker, Particles, Globe (cobe), Text Animate, iPhone and Safari mocks, Bento Grid, Glowing Effect, Shine Border, Shimmer Button, Animated Circular Progress Bar, Scroll Progress, and the Live Orb.

Used today: Blur Fade, Border Beam, Magic Card, Animated Shiny Text.

The product's own run pieces take plain props and can be fed sample data: `StepList` (`runs/step-list.tsx`), `SourcesPanel` and `RunStatusBadge` (`runs/run-parts.tsx`), and `StageProgress` and `SourceStatusList` (`research/studio-parts.tsx`). Real product UI is the most believable "agentic" visual we have.

## 3. What "agentic" should mean on this page

The page should look like work being done, not like a decoration. Each pattern below shows one true thing about how Vistrial behaves:

1. **It works in stages, and the stage is visible:** planning, collecting, sorting, writing, then waiting for a person.
2. **It reads real places:** the source logos, each with an honest status (found, link only, unavailable).
3. **It shows its evidence:** claims carry observed, inferred or hypothesis labels with a source.
4. **It stops for a person:** the approval moment is the most agentic and most trust-building beat.

Rules carried over from the product: sample data is labeled as sample (`HERO.exampleLabel`), no invented customers, logos or numbers (`SECTIONS.proof` stays off), the calm visual system, and `prefers-reduced-motion` freezes every animation on its last frame.

## 4. Recommendations, by landing section

Effort: S means under a day, M means one to two days.

| # | Section | Pattern | Component | Effort |
|---|---|---|---|---|
| 1 | Source strip, under the hero | **Sources flowing into the agent.** Mono logos on the left, Growth Architect in the middle, a report card on the right, joined by light beams. Replaces the flat icon row. | Magic UI **Animated Beam** (21st id 919, MIT) with `PlatformLogo tone="mono"` | S |
| 2 | Hero visual | **A live run, from the real product.** Feed `StepList`, `SourcesPanel` and `StageProgress` sample steps on a timer, inside the current `BeamFrame`. Status lines use a text shimmer ("Collecting from Meta Ad Library..."). | Our run components, plus installed **Animated List** for new findings appearing | M |
| 3 | How it works (five steps) | **The doctrine as a plan that runs.** Each step goes pending, running, done as you scroll, with a short "what it found" line. | **AI Task List** (21st 23793, reduced-motion aware) or **Task Steps** (23569). Restyle on our tokens | S |
| 4 | Evidence | **Hover a claim, see its source.** The source chip opens a small card: platform logo, date seen, link. | AI Elements **Inline Citation** pattern, rebuilt on our popover (see `agentic-ui-research.md`) | S |
| 5 | Safety | **The approval moment.** A draft card with "Waiting for your approval", and a hold-to-approve button that flips it to Approved, not published. | **AI Tool Approval** pattern (21st 39558, hold-to-confirm), on our `button` | S |
| 6 | Agents (workforce map) | **Seven agents around one organization.** Agent tiles orbit the Vistrial crest. Live agents glow, and planned ones are dimmed and labeled. | Magic UI **Orbiting Circles** (21st 1411, MIT), or the **Integrations Orbit Section** layout (18964) | S |
| 7 | Agent identity | **A small status orb** beside an agent's name, with states thinking, working and waiting for you. | Installed **Live Orb**, or **AI Orb** (38324, ten states and a still frame for reduced motion) | S |
| 8 | Optional, for How it works | **A replayable run.** A waterfall of one research run, with a scrubber. | **Agent Trace** (21st 26968, keyboard accessible, theme tokens) | M |

Suggested first pass, in order: 1, 2, 5. Those three carry the story (it reads real places, you watch it work, a person approves) and use parts we already own or that cost little.

## 5. What to avoid here

- **A chat box as the hero.** Vistrial's agents are not chat (see `agentic-ui-research.md`, section 2). A prompt bar implies the wrong product.
- **Terminal and code-style logs.** The buyers sell considered purchases and are not developers. The installed Terminal reads as a developer tool.
- **A React Flow canvas.** The React Flow UI "AI Workflow Editor" is MIT and shadcn-installable, but it adds `@xyflow/react` and reads as an editor to configure, which this product does not offer. Animated Beam gives the flow feeling without that.
- **Ambient decoration:** particles, meteors, the spinning globe, rainbow buttons. They break the calm system and say nothing true.
- **Live-looking counters** ("12,481 ads analyzed today"). Not true, and it conflicts with `SECTIONS.proof`. The Number Ticker is fine for sample figures inside a labeled example.
- **Partner-style logo walls.** Show logos only as "researches across" or "connects to". Never use them as customers or partners, and never show HubSpot, Salesforce or Airtable as working.

## 6. Rules for any component taken from a catalog

Same as `agentic-ui-research.md`, section 5, plus:
- Check the specific component's license on its page before install. 21st components vary by author.
- Remove demo data, fake timers and invented names. Every sample string goes through `content.ts`.
- Replace Radix imports with our Base UI wrappers, and colors with our tokens.
- Reduced motion shows the final state, never a blank or a spinner.
- Check keyboard use, labels, phone width with a 16px gutter, and no horizontal scroll.

## 7. Libraries at a glance

| Library | License | Install | Fit |
|---|---|---|---|
| Magic UI | MIT | Copy-in (shadcn, or 21st) | Already our base. Animated Beam and Orbiting Circles are the two missing pieces. |
| 21st.dev catalog | Per component | `npx shadcn add` with `API_KEY_21ST` | Best range of agent pieces (task list, trace, approval, orb). Quality varies. Review each one. |
| Vercel AI Elements | Apache-2.0 | `ai-elements` CLI | Good shapes (chain of thought, plan and task, sources, inline citation). Built around AI SDK messages, so borrow the pattern and not the data model. |
| Motion Primitives (text shimmer, text loop) | MIT | 21st registry | `motion` is already a dependency. Text shimmer suits status lines. |
| React Flow UI | MIT (xyflow) | shadcn CLI | Skip for the landing page (section 5). |
| assistant-ui | MIT | npm | Skip. It is a chat runtime. |

## 8. Needs checking before build

- The exact props and license lines of 21st components 919, 1411, 23793, 39558, 38324 and 26968.
- Each brand's current guidelines for showing its mark in a "works with" row (links are in `platforms.ts`). Meta and LinkedIn are strict about color and clear space.
- Whether Anthropic's partner rules allow a "Built on Claude" badge before using the Claude mark.

## Sources

- [Magic UI components](https://magicui.design/components)
- [React Flow UI](https://reactflow.dev/ui)
- [Magic UI on 21st.dev](https://21st.dev/@dillionverma/library/magic-ui.md)
- [Text Shimmer (Motion Primitives) on 21st.dev](https://21st.dev/@ibelick/components/text-shimmer.md)
- [AI Elements skill notes (secondhand)](https://www.skills.lc/vercel-labs/vercel-plugin/vercel-labs-vercel-plugin-skills-ai-elements-skill-md)
- [assistant-ui chain-of-thought guide](https://www.assistant-ui.com/docs/guides/chain-of-thought)
- [The anatomy of a high-converting AI SaaS landing page (DEV)](https://dev.to/thekitbase/the-anatomy-of-a-high-converting-ai-saas-landing-page-with-real-examples-5hj6)
- [svgl](https://svgl.app) and [simple-icons](https://simpleicons.org) for the logos
