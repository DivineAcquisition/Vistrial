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

## 9. Second pass: guardrail and oversight patterns (2026-11-12)

Asked for by the owner: make "Safe by design" more agentic, and find where else agentic pieces fit.

### How this was researched, and what is not verified

The 21st.dev catalog (searched through the connected tool; no component source or license was opened and nothing was installed), web search results on human-in-the-loop and guardrail interfaces, and this repo. The web results are mostly vendor blogs, so their figures are heuristics. The AI Elements component list comes from third-party mirrors, not Vercel's own docs.

### What the sources agree on

- An approval screen should show the resolved action in plain words: what will actually happen, not an internal name.
- An audit trail should read as an accountability record a non-technical person can follow, with who, what and when.
- A soft warning and a hard stop are different things and should look different.
- A refusal is a trust signal. Show the action the agent did not take, and why.

### What was built: Safety as a guarded run

`src/components/marketing/guarded-run.tsx`. One sample Market Intelligence run plays when it scrolls into view. Nothing was installed; each pattern is rebuilt on our tokens.

| Pattern | Seen in | What ours shows |
|---|---|---|
| Tool-call rows with states | 21st "AI Tool Call" (23789), "Tool Call Inspector" (27026) | Five steps going queued, running, done. One is refused: a page that asks for a login |
| Budget guard | 21st "Budget Guard" (36075), "Cost Meter" (36488) | Spend against the run's limit, with the warning mark at 80 percent and the stop at the end. Both values come from `convex/lib/caps.ts` |
| Tool approval | 21st "AI Tool Approval" (39558), "Tool Approval" (26580) | The existing hold-to-approve, now the last step of the run |
| Audit log | 21st "Audit Log" (25163) | A short activity record that fills in as the run plays, and gains an "Approved" line when the visitor approves |
| Guardrail checklist | Our own | The six safety statements, each lighting up when the run reaches it |

### Where else these fit on the landing page

Effort: S is under a day, M is one to two days. Each one must show something the product does today.

| # | Area | Pattern | What it would show | Effort |
|---|---|---|---|---|
| 1 | How it works | Agent trace with a scrubber (21st "Agent Trace", 26968) | One research run as a timeline the visitor can drag through. Replaces five static cards | M |
| 2 | Growth Architect skills | Plan with nested tasks (21st "AI Task List", 23793) | Pick a skill and see the plan it would run and what it hands back. Makes the five live skills feel like work, not a feature list | M |
| 3 | The loop | Check-in card that plays through | "We'll try this", a check-in date, then before and after figures. The loop is named on the page but never shown | S |
| 4 | Evidence | Refused and unavailable sources in the report | A "Not read" row in the sample report, like the one in the Safety run. Shows honesty inside the product's output | S |
| 5 | Agents | Status orb beside the one live agent | Thinking, working, waiting on you. The six planned agents stay still and dimmed | S |
| 6 | Pricing | Budget guard on the credits line | "$150 of credits" drawn as the same meter, with one sample run's cost taken from it | S |
| 7 | Request form | "What happens next" as a run | The aside already lists steps. Give them the same queued, running, done states | S |

Suggested order: 3, then 1, then 2. The loop is central to the product and has no visual yet.

### Still to avoid

Everything in section 5 still holds. Two more from this pass: do not show "always allow" on an approval (the product has no such setting), and do not show reasoning text streaming as if it were live.

### Sources for this pass

- [Human-in-the-loop AI agents (Dataiku)](https://www.dataiku.com/blog/human-in-the-loop-ai-agents)
- [Agentic AI UX: human oversight and control patterns (UI/UX Atlas)](https://uiux-atlas.pages.dev/lessons/emerging/agentic-ai-ux-human-oversight-and-control-patterns)
- [10 HITL tool approval patterns for AI agents (Kunal Ganglani)](https://www.kunalganglani.com/blog/tool-approval-patterns-ai-agents)
- [Human in the loop (Understanding Data)](https://understandingdata.com/learn/agent-framework/human-in-the-loop/)
- [AI Elements on 21st.dev](https://21st.dev/@vercel/library/ai-elements)
- 21st.dev components: [Budget Guard](https://21st.dev/@astralyxdev/components/budget-guard), [AI Tool Approval](https://21st.dev/@kokonutd/components/ai-tool-approval), [Agent Trace](https://21st.dev/@n1m4mz/components/agent-trace), [Audit Log](https://21st.dev/@corr/components/audit-log), [AI Tool Call](https://21st.dev/@educalvolpz/components/ai-tool-call), [AI Task List](https://21st.dev/@educalvolpz/components/ai-task-list)
