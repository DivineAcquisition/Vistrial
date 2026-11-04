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

### Still to come in Milestone D

- **2.14 Visual Research Board:** media cards with official embeds, filters, collections, and compare two.
- **2.15 rest:** basis badges on the asset page, version compare for reports, and export as PDF or Markdown.
- **Review queue:** Waiting for User, Needs Input, and Needs review in Decisions.
- **Production model routes**, set up with you.
