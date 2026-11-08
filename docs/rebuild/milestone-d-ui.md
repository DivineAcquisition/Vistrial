# Milestone D: screens for Market Intelligence

Date: 2026-11-04. Tasks 2.13 to 2.15 of `growth-architect-v1-plan.md`, with the section changes in `doctrine-understanding-precedes-advantage.md` 3.6. This file covers three things: the philosophy the screens carry, the UI research behind the layout, and what is built so far.

## 1. The philosophy in the screens

Vistrial's philosophy is written in two places in the code. The landing page has it (`PHILOSOPHY` in `src/lib/marketing/content.ts`, under "Study first. Then act." and "Understanding precedes advantage."). The agents have it (`docs/rebuild/doctrine-understanding-precedes-advantage.md`). Each tenet has a place on screen, so a person can see the philosophy at work rather than read about it.

| Tenet (landing page) | Doctrine | Where it shows |
|---|---|---|
| Observation before opinion | Observe stage; "understand the task before completing it" | **Brief** (the plan, written before any research) and the **Progress** stages: Observe, Distinguish, Prioritize, Create, Validate. The New assignment form shows what each source can and cannot see before anything runs. |
| Know what you know | Evidence System; business facts (D6) | **Context panel**: market, area, the profile, and each business fact with its status (Verified, Not verified, Disputed) and where and when it came from. Missing items and assumptions are listed. Every finding carries a basis badge (Observed, Inference, Untested hypothesis, Your data, Not enough data) and numbered source chips. |
| Say when you do not | `insufficient`, limits, completion check 6, D9 | **What it could not see**, one line per limited source. **Needs review** shows the failed checks above the draft, in plain words, with "Nothing was invented to make them pass." If fewer than three opportunities were supported, it says how many and why. |
| Judgment stays human | Approval System; ask, wait, resume (D8) | **Question card**: one question, why the agent stopped, and exactly what an answer does. **Your decision** card: what approving does ("Nothing is published, sent or spent") before anyone presses it. Reject takes a reason. A draft that failed its checks cannot be approved as it is. |

## 2. UI research

The question was which layouts show an agent's work, and its approval prompts, the way this assistant's own interface does: the steps visible beside the result, and clear prompts when a person must decide.

### What the products and guides say

- **Two panes win for research.** Gemini's deep research puts conversation and research details in separate panels. ChatGPT keeps live steps in a sheet and collapses them when done. Perplexity puts sources first, with numbered inline citations and a sources panel. Manus shows every intermediate document, which reads as busy. The common lesson is to keep the working surface (the report) apart from the activity, and not to bury the steps. ([Deep research UIs compared, gitconnected](https://levelup.gitconnected.com/deep-research-uis-perplexity-vs-manus-vs-chatgpt-vs-gemini-4740ca01365a); [DEV mirror](https://dev.to/franciscomoretti/deep-research-uis-perplexity-vs-manus-vs-chatgpt-vs-gemini-5cc2); [Kitemetric](https://kitemetric.com/blogs/deep-research-uis-a-comparison-of-perplexity-manus-chatgpt-and-gemini))
- **Streaming and progress are different signals.** Streaming says "something is happening", and progress steps say "what kind of work". A side panel or workspace holds the artifact. ([AI design patterns](https://ai-design-patterns.pages.dev/blog/designing-better-ai-chat-part-1))
- **Approval prompts must show the resolved action.** A bare approve or deny prompt is weak oversight. The prompt should show what will actually happen, and approval is often better made at the plan level. Review belongs only where a mistake is expensive, and every approval needs a timeout policy. ([HITL tool approval patterns](https://www.kunalganglani.com/blog/tool-approval-patterns-ai-agents); [Mastra on where approval goes](https://mastra.ai/blog/hitl-where-to-put-approval-in-agents-and-workflows); [Agent UX checklist](https://www.agenticwire.news/article/agent-ux-design-patterns); [Fast.io on timeouts](https://www.fast.io/resources/ai-agent-human-in-the-loop.md); [7 interface architectures](https://www.aiacceleratorinstitute.com/nobody-wants-another-chatbot-7-interface-architectures-worth-building/))
- **Protocols are converging on pause-for-a-person events.** AG-UI's human-in-the-loop flows are an example. That matches our `waiting` run status. ([Agno, AG-UI](https://www.agno.com/changelog/handle-more-human-in-the-loop-patterns-in-ag-ui))
- **Vercel AI Elements** has named pieces for the same jobs: Confirmation (tool approval), Chain of Thought, Plan and Task, Sources, and Inline Citation. Their state model follows the AI SDK's message parts, which Vistrial does not use for runs. This was not checked against Vercel's own docs, because the pages found were third-party mirrors. ([skills.sh, AI Elements](https://skills.sh/vercel/vercel-plugin/ai-elements))

### Catalog components looked at (21st.dev)

| Pattern | Components | What we took |
|---|---|---|
| Approval with the action shown | Tool Approval (26580), AI Tool Approval with hold-to-confirm (39558), Approval Card (36498) | The decision card states what approving does. Destructive actions do not exist yet; hold-to-confirm is kept for when they do. |
| Agent asks a question | Question Tool (12422), Question (40125), Approval Card with one question at a time (23595) | One question, a free-text answer, and a line on what the answer does |
| Activity and plan | Agent Activity (29318), AI Task List (23793), Agent Plan (2127), Agent Progress (29323) | The five-stage progress list, with done, working, and to come |
| Citations | Source Citation Rail (29355), Source Lens (37660), Citations (29317) | Numbered source chips on every claim that open the source itself |

None were installed. As decided in `agentic-ui-research.md`, the screens use our own primitives fed by Convex. That keeps one design system and keeps every rule (isolation, no raw model or page text) in our hands.

## 3. What is built (2.13 and the core of 2.15)

| Screen | Route | What it does |
|---|---|---|
| Research list | `/app/research` | Projects newest first, plus New assignment (Owner and Manager). "Research" is in the nav. |
| New assignment | `/app/research/new` | Objective, name, market, area (empty means the profile is used, or the agent asks), competitors, where to look, and pasted links. Beside the form: **What it can see here**, live per source for the area typed (for example, Meta reads "no API outside the EU and UK"), and **Cost** ("Usually 60¢ to $1.50. Never more than $3.", the 50¢ reserve, and what is left today). Start creates the project and the run. |
| Research Studio | `/app/research/[id]` | Two panes. Left: **Progress** (five stages, cost, link to every step), **Sources** (each source's status and count), **Context**. Right: **Findings** or **Brief**. On a phone the question comes first, then the work, then the context. |
| Findings | inside the Studio | Needs review block with the checks, summary, opportunities (five fields, basis badge, source chips), findings with basis, what it could not see, the checks, and **Your decision** (Approve, Reject with a reason, Open the full report). |
| Growth Architect page | `/app/agents/growth-architect` | New assignment and Research buttons |
| Story page | `/dev/research-studio?state=done\|review\|waiting\|timedOut\|working&width=390\|320` | Every state from the real dev run's data. Development only. |

New server queries: `studio.studio` (the project with its run, waiting question, context, brief, checks, report and asset, built from the run's own records) and `studio.sourceSetup` (which sources are set up and the cost figures; it reads settings for presence only and never returns a value). `runs.get` now returns each step's phase.

### Checked

- 215 tests pass (2 new for the Studio queries: a project before any run, isolation, and that no key value appears). Typecheck is clean and lint has 0 errors.
- The story was screenshotted at 1280, 390 and 320 px for done, needs review and waiting. No sideways scroll at any width.

## 4. Visual Research Board (2.14)

`/app/research/[id]/board`, opened from the Studio ("Open the board") and from any evidence chip in Findings. A chip opens the board on exactly the sources behind that claim (`?focus=`), highlighted, with "Only the sources behind the finding you opened" ticked.

- **Cards:** platform, kind or format, relevance, title, creator, the official player or a link card, the attributed excerpt, **the agent's reading** (hook, offer, call to action, and audience marked "a guess"), any limitation, when it was seen and published, and Open source.
- **Official embeds only, and click to load.** The YouTube player is `youtube-nocookie.com` (privacy-enhanced). TikTok uses its own player, and Instagram its embed page, shown only once oEmbed confirmed the post. Each URL is built from an id we parsed and checked, never from page text. No third party is contacted until a person presses "Load the player". The site's frame policy now allows exactly those three hosts. Media is never downloaded or rehosted.
- **Filters:** platform, kind, relevance, and collection.
- **Collections:** pick a collection to save to, make a new one (personal by default; an Owner or Manager can share it with the workspace), and Save on any card. The server keeps the access rules from 2.6.
- **Compare two:** tick Compare on two cards to get a field-by-field table. Under it: "These are the agent's readings of what each source shows, not facts about results."
- The board is split into a data container (`ResearchBoard`) and a display view (`BoardView`), so `/dev/research-board` can show it from fixtures.

Checked: screenshots at 1280 px (with compare open) and 390 px (with focus), with no sideways scroll. 218 tests pass, 3 of them new: embed URLs are built only from safe ids, and an id that could change the address is refused.

## 5. Report, Review queue, and launch routes (rest of 2.15)

- **Report page** (`/app/assets/[id]`):
  - The body renders as a document, through `ReportBody`, a small renderer for the Markdown subset reports use. It builds React elements only and never sets HTML, so a `<script>` in a source or model text shows as text.
  - Each claim carries a coloured **basis badge**: Observed, Inference, Untested hypothesis, Your data, Not enough data.
  - Version compare was already in place.
- **Export:**
  - **Download Markdown** saves the body, every claim with its basis, and each cited source once, with links.
  - **Print or save as PDF** uses the browser. The app's navigation and the Approve and Reject controls are hidden when printing.
- **Decisions queue:**
  - **Questions for you** lists every run waiting for an answer, or timed out, with its project, the question, and Answer or Resume. It reads from the new `studio.attention`.
  - **Needs review** lists drafts that failed their checks, with what to do next.
- **Launch routes:** `platform:ensureDefaultRoutes` is an internal function you run once from the Convex dashboard.
  - It sets research and write to Opus 5.5 with Sonnet 5.5 as fallback, and classify and summarize the other way round (decision D2).
  - It fills only kinds of work with no route and never changes one a Platform Admin set.
  - On dev it kept the three routes set earlier and added `summarize`.

Checks: 223 tests pass, 5 of them new. They cover the routes helper (fills only missing routes, a second run adds nothing), the Decisions query (with isolation), and the report renderer (structure, no markup injection, export lists each source once). Typecheck is clean and lint has 0 errors. The report body and basis badges were checked on the asset story page.

**Milestone D is complete.** Next is Milestone E: 2.16, the injection test, and 2.17, end-to-end acceptance against the doctrine's five tests.

## Context Engine alignment (founder brief, 2026-11-04)

The founder's brief is kept in `context-engine-brief.md`. The Studio now follows its "What the user sees":

- **One layout, `src/components/research/studio-layout.tsx`**, used by both `/app/research/[id]` and the `/dev/research-studio` story (`?state=done&section=review` opens a section directly).
- **Current objective** line with status chips: business context loaded or not, sources collected or research needed, checks passed or needs review.
- **Five sections:** Context, Research, Findings, Assets, Review. Progress and source status stay at the side.
- **Context** holds *Business memory* (each fact with source, date and status; Correct and Remove) and the *Task brief*: objective, deliverable, what is already known (with origin and date), what is missing and assumed, permitted sources and tools, and the research budget with the reserve.
- **Assets** lists the report with its version and says Creative Production is a separate skill (D7) that starts from the approved report.
- **Review** holds the eight completion checks and the decision: Approve, **Request changes** (a reason, kept as feedback), or Reject.

## Live research view

The founder's brief asks that the process be visible: the user should feel Vistrial studying the business. The Research section now opens with **Working now** (or, after the run, **How the research went**), from `src/components/research/live-activity.tsx` and the pure feed builder `src/lib/research/activity.ts`.

- **What it is doing now**, in plain words from the last finished step ("Searching the web", "Reading each source"), with a live dot, a moving bar on the current stage, and an elapsed clock that ticks in the browser. While a run works, the Current objective panel shows "Working now. Watch it live", which opens this section.
- **Stage rail:** the five stages (Observe, Distinguish, Prioritize, Create, Validate) as a horizontal bar, each done, working or still to come.
- **Counters:** searches, pages read, sources kept and money spent. They show the real number at once and spring to each new value as Convex pushes it.
- **Feed:** one line per step with an icon, its time since the start (`runs.get` steps now carry `at`), and a sentence on what it did. Failed steps, failed checks and a skipped revision say so in warning or critical tones. Links you gave come first; sources the agent kept sit under the collect step as tiles that open the original.
- **Rules kept:** no model names, no page text, no third-party images (tiles use platform icons, not thumbnails, matching the board's click-to-load rule). Motion follows the person's reduced-motion setting.

UI research reused from section 2, plus three catalog pieces looked at, none installed: Agent Activity (21st.dev 29318, an animated step timeline), Agent Trace (26968, a waterfall with statuses flipping from queued to done) and AI Agent Pipeline (20802, a request flowing through stages with live stats). We took the timeline with a rail, the stage bar, and live stats; the pieces are built from our own primitives, `motion`, `lucide-react`, and the existing BorderBeam and AnimatedShinyText.

## Folder sidebar and sessions (2026-11-06)

The workspace is organised by agent, and work reads as a conversation.

- **Folder sidebar** (`src/components/shell/folder-tree.tsx`, data from `convex/agentFolder.ts`): each live agent is a folder holding **Sessions** (each with a live state: working, waiting for you, ready to review, done), **Connections** (Meta ads with its mark, YouTube, Instagram, Meta Ad Library, each with a status dot), **Memory**, **Reports** and **Activity**, with live counts. Planned agents show greyed. "Across agents" keeps the indexes (Decisions, all research, activity, assets, connections); "Workspace" holds Profile, Team, Controls and Settings. Opened folders are remembered in the browser; opening a page opens its folder.
- **Agent folder pages** under `/app/agents/[slug]`: Overview (latest sessions, connections, counts, skills), Sessions, a session thread, New session, Connections, Connections → Meta ads, Memory, Reports and Activity, under a shared header with tabs (`src/components/agents/agent-frame.tsx`).
- **Session thread** (`src/components/sessions/session-thread.tsx`): your question with its scope chips, then the agent's turns: the task brief (folded to known, missing, budget and questions), its one question when it needs an answer, the live work (folded to a summary once finished), the findings with evidence chips, the eight checks, and your decision. A side panel holds progress, source status and links to the board, the report and every step. The composer follows the session: Stop while it works, a pointer to the question while it waits, a change request while a report is waiting, and a follow-up session afterwards. Every turn is a record from the run; chat is not kept as business knowledge.
- **Connections belong to the workspace; agents are granted use.** `metaConnections.agents` lists the agents granted (missing means the Growth Architect); an Owner switches it per agent (`metaAds.setAgentAccess`). The Meta view lives in the agent's folder; `/app/connections` is the cross-agent index, and Facebook Login's return is forwarded to the folder.
- Old links redirect: `/app/research/[id]` and `/app/research/new` open the session pages.
- Story page: `/dev/agent-session?state=done|review|waiting|working`.
