# Context Engine brief (from the founder, 2026-11-04)

The founder's own statement of how every Vistrial agent should work. The doctrine (`doctrine-understanding-precedes-advantage.md`) was written from this; this file keeps the original intent in the founder's words, condensed. Where they differ, this brief is the intent and the doctrine is the locked specification.

## The foundation

When someone asks an agent to complete a task, Vistrial first establishes what the agent knows about the business, determines what else it needs, gathers that information, and then produces finished work. **The process must be visible**: the user should feel Vistrial studying their business, understanding the market, and developing work specifically for them.

```
User objective → Context Engine (understands the business) → Research Engine (gathers what is missing)
→ Intelligence Engine (evaluates evidence) → Creation Engine (finished assets) → Human Review (approve or revise)
→ Workspace Memory (keeps useful context) ⇢ back to the Context Engine for future tasks
```

These are shared capabilities inside one agent runtime, not separate agents. The seven-agent vision comes later.

## What the user sees: five sections

The first agent's workspace, under a **Current objective** line with status chips such as "Business context loaded" and "Research needed":

| Section | Holds |
|---|---|
| Context | Business profile, offer, audience, history and constraints |
| Research | Sources, videos, ads and competitor examples |
| Findings | Observed patterns, interpretations and opportunities |
| Assets | Campaigns, copy, scripts, creative briefs and funnels |
| Review & Approval | Inspect generated work, request changes, approve final deliverables |

It should feel like a working environment, not another chat interface.

## Three kinds of context

| Type | Purpose | Persistence |
|---|---|---|
| Business Memory | What Vistrial understands about the company | Shared across authorized runs |
| Task Context | What the agent needs for this assignment | Kept with that run |
| Research Evidence | External information gathered for the assignment | Stored with sources and timestamps |

- Every context item has a **source, a date and a verification status**, and the user can **correct or remove** it. A later task should not re-ask the industry, and should not assume an old ad budget is still accurate.
- **Task brief:** the objective, the expected deliverables, what is available, what is missing, **which sources and tools are permitted**, and **the research budget**. A critical gap gets one targeted question; otherwise the assumption is recorded.
- **Research board:** original videos and ads where accessible, platform and link, advertiser or creator, hook, offer, CTA, date retrieved, and the agent's observations. Inaccessible sources are said to be inaccessible. Research is never invented to fill gaps.

## How depth is produced

Not one big prompt. Five stages, each handing a structured result to the next: **Observation, Interpretation, Prioritization, Creation, Validation**. The AI makes judgments; Vistrial governs how those judgments become work, for repeatable quality.

## Evidence labels

Observed (a source shows it), Inferred (a reasonable interpretation), Hypothesis (worth testing, not established), First-party result (the business's own data), and Not established (for example, whether competitors' campaigns are profitable). Popularity is never presented as performance. **A user can click a finding and inspect its evidence.**

## Improving over time

Not a model that learns automatically. A controlled feedback loop: rejections with reasons become approved preferences; campaign results the user supplies become evidence for future recommendations. The workspace gets better context; the model is not retrained. Conversations are not kept as business knowledge by default; only relevant, validated, authorized information is reused.

## Security

Every record belongs to a workspace and every read and write enforces it. Company A's research, documents and results never become Company B's context.

## First release, and what waits

Ship one complete workflow in the first agent: **Context → Research → Findings (three evidence-backed opportunities) → Review → Memory**, then **Creative Production** as a separate skill with its own $3 cap, starting from the approved, version-locked report. Start with one reliable research source plus user-supplied links; widen coverage once retrieval, citation and failure handling are proven. Video scripts, offer strategy, landing pages, funnels and publishing come later. Connecting a domain, publishing or spending money always needs explicit approval.

**Five tests before shipping:** the right company's context and never another's; honest handling of missing or inaccessible sources; material findings that point to real evidence; work that reflects this company and objective; revisions kept and no external action without approval.

**The standard:** can the agent take a real business objective, gather relevant evidence, and return finished work that is demonstrably more specific and useful than a generic AI response? Make Vistrial responsible for managing the context, and Claude responsible for applying intelligence to it.

## D6 to D9, as approved

- **D6:** business facts in their own table, with `workspaceId, factKey, value, sourceType, sourceReference, recordedAt, verifiedAt, verifiedBy, status, supersedesFactId`; an AI-generated fact is never automatically verified; superseded facts are kept.
- **D7:** research report first (three actionable opportunities, each with opportunity, evidence, business relevance, proposed action and validation method); Creative Production second, as a separate run with its own $3 cap and the projected cost shown before it starts.
- **D8:** ask only when the answer would materially change the result or the task would be unsafe or unreliable; Waiting for User spends nothing; after seven days, Needs Input — Timed Out, resumable; the timeout checks it is still the same question.
- **D9:** eight completion checks; one targeted revision if the reserve allows; otherwise Needs Review with the reason ("Only two opportunities could be supported by the available evidence. Additional research or user input is required."); estimate cost before each model call.
