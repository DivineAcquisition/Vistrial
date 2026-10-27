# Agentic UI research: what to use for the Sales Agent screens

Date: 2026-10-26. Written for the Vistrial rebuild (Convex, Next.js 16, React 19.2, Tailwind 4, Base UI plus shadcn "radix-nova", Clerk).

## 0. How this was researched, and what I could not verify

I could read: the 21st.dev catalog and its install commands (through the connected 21st tool), the npm registry (versions, licenses, sizes, peer dependencies), this repo's current code, and git history of the earlier AI Elements and Agent Elements installs.

I could not open: ai-sdk.dev / elements.ai-sdk.dev, prompt-kit.com, assistant-ui.com, github.com, and CDN mirrors. The network policy for this session denied them. I did not work around that.

So these statements are **not** checked against each library's own documentation:
- The exact component names and props of AI Elements and prompt-kit.
- Whether prompt-kit components depend on Radix or Base UI internally.
- assistant-ui's tool UI and human-approval APIs beyond what the package names and peer dependencies show.

Also: **elements.ai is not the Vercel library.** The Vercel "AI Elements" library lives at elements.ai-sdk.dev (npm CLI `ai-elements` 1.9.1). I treated "elements.ai" in your message as that.

Before any of this is built, one person (or Grok, with open network) should confirm the "Needs checking" items in section 7.

## 1. The sources, side by side

| Source | What it is | License | Install | Fit for Vistrial |
|---|---|---|---|---|
| **Vercel AI Elements** | shadcn-style source components for AI apps (conversation, message, prompt input, tool, reasoning, sources, inline citation, plan, task, queue, artifact, canvas). Built to pair with the Vercel AI SDK. | Apache-2.0 (CLI `ai-elements` 1.9.1) | CLI copies source into the repo | Strong on structure and names. We already installed the canvas pieces once (commit 3999d92). Its data model assumes AI SDK message parts, which Vistrial does not use for runs. |
| **prompt-kit** | shadcn-registry components for chat UIs (prompt input, message, chat container, reasoning, steps, source, loader, markdown, code block, feedback bar). | Not checked (not on npm) | shadcn registry | Good small pieces. Needs a license and dependency check before use. |
| **assistant-ui** | A headless runtime plus primitives for chat and tool UIs. `@assistant-ui/react` 0.15.31. Adapters for AI SDK, AG-UI, and a generative-UI package. | MIT | npm | Heavy (2.8 MB unpacked core). It wants to own the conversation state. Our runs live in Convex tables, so it would sit on top of a second state system. Best used for ideas, not as a dependency. |
| **21st.dev catalog** | Community component marketplace, 500 credits on this account, installs through shadcn. Includes "Agent Elements", the 21st-published agent UI set, already in `components.json`. | Per component, must be checked each time | `npx shadcn add` | Biggest range of approval, citation, plan and trace pieces. Quality varies by author. |
| **streamdown** | Streaming-safe markdown renderer. | Apache-2.0, 2.7.1, 125 KB | npm | Useful only for streamed model text. Our reports are structured, so low priority. |
| **AG-UI / interrupt patterns** | A protocol idea for agent-to-UI events and "pause for a human" steps. | n/a | Pattern | Matches our `waiting` run status and the approval gate. Take the pattern, not a package. |

## 2. The deciding constraint

Vistrial's agents are **not chat**. A run is a durable record in Convex with steps, cost, evidence and assets, and a person reviews and approves it. Chat libraries are built around a live message stream from one model call. If we adopt one as the backbone, we fight it.

So the plan is: **our own thin run components, fed by Convex live queries, using pieces copied from these libraries only where they match.** No library owns state. This also keeps the isolation and "no model text in logs" rules in our control.

Second constraint: the repo mixes Base UI primitives with radix-nova styling. Components copied from shadcn-based sources import Radix pieces (popover, collapsible, tooltip). Each copied component needs a swap to our `src/components/ui` primitives. Cheap per component, but it is a cost on every one.

## 3. Vistrial's agent surfaces and the pieces that fit

| Surface (from Steps 4 and 5) | What it must show | Best candidates | Verdict |
|---|---|---|---|
| **Agent page** (skills, promise, recent runs) | Skill cards with available or coming soon, a one-line promise, recent runs list | Our own `panel`, `status-badge`, `agent-identity`. Agent Elements "Agent Status" (21st id 36497) for the compact status line | Build from our primitives |
| **Start a report form** | Channels, geography, keywords, competitors, cost preview | Our `form`, `field`, `combobox`, `meter`. "Cost Meter" (36488) for the estimate display | Build, borrow the cost display idea |
| **Run viewer** (live steps, per-source progress, blocked sources, cost) | Ordered steps, status per step, durations, tokens, cost, stop reason | Agent Elements "Tool Group" (12424), "Subagent Tool" (12379), "Agent Activity" (29318), "Agent Trace" waterfall (26968), "Agent Progress" (29323), AI Elements Task and Queue | Core. Use Agent Elements row pattern (already installed in 4bb3712: `tool-row-base`, `generic-tool`, `todo-tool`, `text-shimmer`) |
| **Source status** (ok, unavailable, blocked, partial) | A row per source with a plain reason | Agent Elements tool row with our `status-badge` | Build |
| **Budget and caps** | Soft warning and hard stop shown as different markers | "Budget Guard" (36076), "Cost Meter" (36488), our `meter` | Borrow Budget Guard's two-marker idea |
| **Report viewer** (six sections, evidence on each claim) | Structured sections, claim with evidence chips, version history, Approve | "Source Citation Rail" (29355), "AI Citations" (39090), "Inline Citation" (36530), AI Elements Inline Citation and Sources | Core. Evidence chips are the product's trust feature. Adapt to our evidence record (source id, fetch time, computed value), not URLs only |
| **Not enough data / limits section** | Plain empty and limit states | Our `empty-state`, `alert` | Build |
| **Approval** (assets in Decisions, Owner and Manager approve) | Draft preview, checks line, Approve, Edit, Skip, undo window | "AI Tool Approval" (39558, hold-to-confirm), "Tool Approval" (26580), Agent Elements Edit Tool approval footer (12386). Existing `decisions-view` | Use the pattern. Keep our own Decisions queue |
| **Version history and compare** | Versions never overwritten, show what changed | "AI Prompt Diff" (18098), "File Diff" (23584), "Kokonut AI Diff Review" (39916) | Borrow diff view for text versions |
| **Past results CSV upload and mapping** | Dropzone, column mapping, totals preview | "Import Patchbay" (26969), "File Upload Drag & Drop" (18121), "ReUI trace CSV import" (40158) | Patchbay is the closest fit. Check keyboard use and zero dependencies claim |
| **Swipe file** | Upload or paste a link, list with notes | Our `data-table`, a dropzone from the CSV candidates | Build |
| **Ad excerpt cards** | Short attributed excerpt, source, dates, link out, no creative media | Nothing suitable. Social post cards in the catalog show full media, which we must not store | Build our own |
| **Patterns with counts** | Bar or stacked counts, minimum sample marker | Our `chart` and `kpi-card` | Build |
| **Test plan** | Hypotheses, what to measure | Agent To-do List (23589) or Task List (23793) pattern | Borrow |
| **Library collection switch** | Risk statement, Owner acceptance | Our `confirm-dialog` | Build |
| **Chat command bar** | Short instruction entry | Our `command-bar`; prompt-kit or AI Elements prompt input only if we need attachments | Defer |

## 4. Recommended approach

1. **Keep the Agent Elements base that was already proven here** (tool row, generic tool, to-do, shimmer, `--an-*` tokens mapped to our theme). It is small, was already adapted to calm mode and reduced motion, and matches the run-step shape.
2. **Add a small set of new pieces from the catalog**, each reviewed before install: citation rail, approval card with hold-to-confirm, budget guard, diff view, import mapper.
3. **Do not adopt assistant-ui or the Vercel AI SDK runtime** for runs. Revisit only if we add a free-form chat surface for the Sales Agent later.
4. **Own the data contract.** Define the UI types once, from Convex: `RunStepView`, `EvidenceView`, `SourceStatusView`, `AssetVersionView`. Components take these props and never touch Convex directly, so the pieces can be swapped.
5. **Restyle on our tokens.** Every copied component loses its own colors and uses our theme variables. Calm mode and `prefers-reduced-motion` must turn off shimmer and pulsing.

## 5. Rules for taking any component from a catalog

- Check the license of that specific component and its dependencies. Report package size to the user before adding a dependency (this matches the Step 4 and 5 prompt rules).
- Replace Radix imports with our Base UI wrappers.
- Remove demo data, fake timers and hard-coded names.
- No component may render or store ad creative media. Text excerpts only.
- Fix known copy problems from the earlier install: hooks after an early return, refs written during render (both were fixed in 4bb3712).
- Every component gets keyboard, screen reader label and phone-width checks, and no horizontal scroll.
- Copy follows the product rules: plain words, no em-dashes, no jargon, no words like "earned" or "converted" for ads.

## 6. Proposed build order for the UI (after Steps 4 and 5 data exists)

1. Types and a fake-data story page for each surface (so design can be reviewed before backend is final).
2. Run viewer rows and source status (the part users watch live).
3. Report viewer with evidence chips and version history.
4. Approval card and Decisions integration.
5. Budget and caps display.
6. CSV mapping and swipe file.
7. Phone and accessibility pass.

## 7. Needs checking before build

1. prompt-kit: license, dependency list, whether it needs Radix.
2. AI Elements: confirm current component names, and which of Plan, Task, Queue, Sources and Inline Citation are worth taking over the 21st versions.
3. Each 21st component picked: license, dependencies, and a visual check against our theme. The previews above are descriptions from the catalog, not tested by me in this repo.
4. Import Patchbay: confirm it works by keyboard and handles our column set.
5. Whether `motion` (already installed, 13.2) is enough for every animation, so no second animation library gets added.

## 8. Catalog items shortlisted (21st.dev ids)

Approval: 39558 AI Tool Approval, 26580 Tool Approval, 12386 Edit Tool (approval footer).
Evidence: 29355 Source Citation Rail, 39090 AI Citations, 36530 Inline Citation, 29350 AI Sources.
Run viewer: 12424 Tool Group, 12379 Subagent Tool, 29318 Agent Activity, 26968 Agent Trace, 29323 Agent Progress, 36497 Agent Status.
Plans: 23589 Agent To-do List, 23793 AI Task List, 2127 Agent Plan.
Budget: 36076 Budget Guard, 36488 Cost Meter.
Versions: 18098 AI Prompt Diff, 23584 File Diff, 39916 Kokonut AI Diff Review.
Import: 26969 Import Patchbay, 18121 File Upload Drag & Drop, 40158 ReUI trace CSV import.
