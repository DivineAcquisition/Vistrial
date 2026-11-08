# Doctrine: Understanding Precedes Advantage

Date: 2026-11-04. This is the product doctrine for every Vistrial agent. Section 1 is the doctrine itself. Sections 2 and 3 compare it to what is built on `main` at `d8f50f2` (Phase 2 Milestones A and B) and specify the Phase 2 changes. D6 to D9 were locked the same day (Section 4).

Read with: `growth-architect-v1-plan.md`, `phase-2-progress.md`.

---

## 1. The doctrine

> An agent must understand the task before attempting to complete it.
>
> It must gather relevant context, distinguish evidence from assumptions, and recognize the limits of its knowledge.
>
> Its responsibility is not to produce the greatest volume of information. Its responsibility is to transform understanding into detailed, accurate, and usable work.
>
> Where evidence is insufficient, the agent must say so. Where judgment is required, the agent must explain its recommendation. Where action carries consequences, the agent must obtain human approval.

**The architectural split.** Vistrial manages context: what is known, where it came from, what is missing, and what may be reused. The model applies judgment to that context. The model is never responsible for remembering everything, researching everything, or deciding on its own that it knows enough.

**The acceptance standard.** An agent cannot call its work complete until it shows four things:

1. It understood the objective.
2. It used relevant context.
3. It supported its material claims.
4. It produced the requested deliverable.

### 1.1 Five stages of every run

| Stage | What the agent does | What it produces |
|---|---|---|
| Observe | Gathers the context and sources the task needs | Context in use, source references |
| Distinguish | Separates what sources show from what it infers | Classified sources, each marked as a model classification |
| Prioritize | Picks what matters most for this business's offer, resources and objective | A short ranked list of opportunities, each with its reasoning |
| Create | Produces finished, usable work | Assets |
| Validate | Checks the work against the brief, the evidence and the business context | A pass or fail per check, saved with the run |

Each stage hands a structured result to the next. The model makes judgments inside each stage. The runtime decides the order and what each stage receives.

### 1.2 Five kinds of context

| Context | What it covers |
|---|---|
| Business | Offer, positioning, customers, pricing, objectives, constraints |
| Market | Competitors, ads, customer language, visible market activity |
| Historical | Past campaigns, decisions, approved assets, results, feedback |
| Task | What the user wants, why, and what a good deliverable looks like |
| Operational | Tools, permissions, budgets, deadlines, what the business can realistically execute |

An agent asks only for the context its task needs. It records what is missing. It asks the user only when the gap would change the result, or would make the task unsafe or unreliable. Otherwise it records an assumption and continues.

### 1.3 What depth means

A run is judged on four standards. The number of outputs is not one of them.

- **Relevance:** the work is tied to the business's actual objective.
- **Specificity:** the work is written for this company and its customers.
- **Evidence:** observed facts are kept apart from the agent's interpretations.
- **Execution:** someone can take the finished work and use it.

A publicly visible ad is not evidence that the campaign was profitable. Vistrial never presents popularity as performance.

### 1.4 Four shared capabilities

Every agent, now and later, uses the same four parts of the runtime. A new agent does not rebuild any of them.

1. **Context Engine:** keeps business knowledge, finds what a task needs, and marks what is missing or contradictory.
2. **Evidence System:** tracks sources, claims, assumptions and uncertainty.
3. **Artifact Engine:** produces and versions finished deliverables.
4. **Approval System:** keeps a person responsible for every consequential action.

### 1.5 Learning is controlled, not automatic

The model is not retrained. Vistrial gets better because the workspace holds better context and better evidence. A rejection with a reason, a confirmed preference, or results the business uploads become reusable context only when a person confirms them. Conversations are not saved as business knowledge by default.

---

## 2. What is built, against the doctrine

"Built" means tested and checked on the dev deployment, as recorded in `phase-2-progress.md`.

| Doctrine | Built | Gap |
|---|---|---|
| **Evidence System:** observed, inferred, hypothesis, first-party, and "not established" | Done (2.5). `evidence.basis` with five values, enforced in `convex/lib/evidence.ts` on add, approve and screen. "Not established" is `insufficient` ("Not enough data"). Labels are set in code, never by the model. | None for the rules. The Findings view (2.15) still has to show them. |
| **Research sources** with platform, link, creator, hook, offer, CTA, retrieved date, and honest failures | Done (2.6 to 2.10). `sourceRefs` and `sourceStatus`. Adapters return available, partial, unavailable or awaiting authorization with a reason, and never work around a block. | None for collection. The board (2.14) still has to show it. |
| Never invent research to fill gaps | Done. A blocked adapter completes its step with an honest status. Counts come from code, not the model. | None |
| **Artifact Engine:** versioned deliverables | Done. `assets` and `assetVersions`; a version is never overwritten. | `adCopySet` and `creativeBrief` kinds exist but no skill writes them. See decision D7. |
| **Approval System** | Done. Approval by Owner or Manager. Editing an approved asset sends it back to draft. Approval is refused when a cited source is gone. | No reject-with-reason (see 3.5). No external action exists yet, so nothing yet needs an approval gate for publishing or spend. |
| Workspace isolation for every record | Done. Access builders on every public function. Isolation tests call every research function from a second workspace. | Every new table below needs the same isolation test. |
| **Business context** | Partly. `profileVersions` holds offer, price notes, audience, geography, channels, brand voice and competitors, as draft or confirmed, with who confirmed and when. | No `businessFacts` table yet (D6, Section 3.1). Profile fields have no source, date or status of their own, and an agent cannot yet record a single fact without treating it as verified. |
| **Task context:** a short brief of objective, deliverables, known, missing, permitted sources, budget | Partly. `researchProjects` holds objective, market, geography, competitors, platforms and pasted links, and locks its scope once it runs. The plan step (2.11) will write research questions and queries. | No list of what is missing, no recorded assumptions, no definition of a good deliverable. See 3.2. |
| Ask the user when a gap would change the result | Not built. `agentRuns.status` already has `waiting`, but nothing sets it, and there is no recoverable timeout. | See 3.3 (D8). |
| **Prioritize** stage | Not built. The current 2.11 plan stops at write. | Locked into 2.11. See 3.4. |
| **Validate** stage and the acceptance standard | Partly. `screenClaims` drops claims that break the evidence rules. Nothing checks the work against the brief or the business context. | See 3.4. |
| **Historical context and feedback** | Partly. Approved assets are kept and later skills will take them as inputs (plan 2.3). | Rejections carry no reason. Results uploads (`customerData`) are planned but not built. See 3.5. |
| Workspace sections: Context, Research, Findings, Studio, Review | Partly. Run viewer, Decisions queue, Assets library and asset page exist. Research Studio, board and report view are 2.13 to 2.15. | No Context panel and no Findings view. See 3.6. |

The Evidence System, Artifact Engine and Approval System are mostly in place. The Context Engine is the thinnest of the four. That fits the doctrine's main point: the work to do now is in how the agent understands the situation, not in the model.

---

## 3. Changes to the Phase 2 backlog

These come before or inside 2.11 (the Market Intelligence skill). They change the skill's shape, so building 2.11 first and adding them later would mean doing 2.11 twice.

### 3.1 Business facts (new task 2.18, before 2.11) — D6, locked

The profile holds the company's identity and configuration: the workspace, and the confirmed `profileVersions` fields (offer, audience, geography, channels, brand voice, competitors, price notes). A fact that can change on its own, and that a later agent must be able to trust or doubt, goes in `businessFacts`.

Examples of facts, not of profile fields: average contract value, monthly ad budget, primary customer objections, previous campaign performance, sales-cycle duration.

| Field | Holds |
|---|---|
| `workspaceId` | The workspace. Every read and write checks it. |
| `factKey` | A stable key, such as `monthlyAdBudget`. One live fact per key. |
| `value` | The fact as text. |
| `sourceType` | `owner`, `agent`, `assumption`, `upload`, or `feedback`. |
| `sourceReference` | The `sourceRefs` id, asset id, or a short note such as "onboarding". Empty only for `owner` and `assumption`. |
| `recordedAt` | When this row was written. |
| `verifiedAt`, `verifiedBy` | Set when a person verifies it. Kept as history if the status later changes. |
| `status` | `unverified`, `verified`, `disputed`, or `superseded`. |
| `supersedesFactId` | The earlier fact this row replaces. Empty on the first fact for a key. |

Rules:

- A fact an agent writes is `unverified`. Nothing an agent produces becomes `verified` on its own.
- Only an Owner or Manager can set `verified` or `disputed`.
- An answer the user gives to a waiting run (3.3) is `sourceType: owner` and `verified`, because the person stated it.
- Promoting a feedback row (3.5) is a person confirming it, so that fact is `verified` with `sourceType: feedback`.
- Replacing a fact inserts a new row. The new row's `supersedesFactId` points at the old row, and the old row's status becomes `superseded`. The old row is never edited into the new value and never deleted.
- A run uses `verified` facts. It may mention `unverified` and `disputed` facts only with their status shown. It never uses a `superseded` fact as current.
- A run records the fact ids it used.
- Correcting a fact is a new row, not an edit. Removing one is a soft delete, audited, and only by an Owner or Manager.

`profileVersions` stays as it is for this release. Moving its fields into `businessFacts` is a later change.

### 3.2 Task brief (inside 2.11's plan step)

The plan step's structured output gains these fields:

- `objective` and `deliverables`: for Market Intelligence, the deliverable is a report of three actionable opportunities (3.4)
- `known`: the profile version and the `businessFacts` ids it will use
- `missing`: each gap, and whether it blocks the run (3.3)
- `assumptions`: one line for each gap that does not block the run

The brief is saved as an artifact and shown before collection starts. The completion check (3.4) tests the report against it.

### 3.3 Ask, pause, resume, timeout (new task 2.19) — D8, locked

The agent asks only when the missing information would materially change the result, or would make the task unsafe or unreliable. The skill declares which gaps meet that bar. The model may ask only from that list.

For Market Intelligence the list is: the industry or market, and the geography, when neither the objective nor the confirmed profile supplies them. A missing ad budget does not block a research run. The brief records the assumption ("Budget not provided; recommendations do not depend on a budget figure.").

When a declared gap is empty, the run moves to `waiting` and the Decisions queue shows one question, for example "Which industry should I research?". The run stores `waitingFor: { questionId, question, askedAt }`. While it is waiting:

- no further model calls run, and no further research runs;
- the brief, sources and any draft stay as they are;
- the time cap does not count the wait;
- the screen says **Waiting for User**.

The answer is saved as a verified `businessFacts` row (3.1) and the run resumes. `questionId` changes, so the old timeout no longer applies.

**Seven days with no answer.** A scheduled function is set for seven days out when the question is asked. It does not keep a process running. When it fires, it changes the run only if the run is still `waiting` on that same `questionId`. If the run has resumed, finished, or is waiting on a newer question, the function writes nothing.

The run is not deleted and its context is not deleted. The status becomes `needsInput` with reason `timedOut`, shown as **Needs Input — Timed Out**. The user reopens the assignment and resumes it explicitly. Resume asks the same question again, with a new `questionId` and a new seven-day schedule.

A project cannot start a second run while one is `waiting`. Once the run has timed out, a new run is allowed. The new run may read the timed-out run's sources and facts, and it must show the date of each one it uses. It must not treat them as newly retrieved.

### 3.4 Opportunities and the completion check (inside 2.11) — D7 and D9, locked

The skill is: plan (brief), collect, classify, compute, **prioritize**, write, **check**. The first release delivers the report, not advertising assets. Creative Production is a separate skill (Section 5) and starts only from an approved report.

**Prioritize** returns three opportunities, or fewer if the evidence supports fewer. Each opportunity has five fields:

| Field | Holds |
|---|---|
| Opportunity | What the business could pursue |
| Evidence | The `sourceRef` ids behind it, or an explicit uncertainty label (`hypothesis` or `insufficient`) |
| Business relevance | Why it matters to this company, naming the profile fields and fact ids it uses |
| Proposed action | What the company could actually do |
| Validation method | How the company would tell whether it worked |

An opportunity with no supporting source is a hypothesis, and it says so. The write step must not add an opportunity the prioritize step could not support. Two well-supported opportunities are a valid draft. A third invented to fill the format is not.

**The completion check** is code. A model call does not decide that the report passed. Before the run can finish, all eight must pass:

1. The report's objective is the brief's objective. Each opportunity's business relevance names at least one profile field or fact id. If the workspace has neither, the relevance says that no business context was on record.
2. The report lists the profile version and fact ids it used. If the workspace has a confirmed profile or any verified fact, that list is not empty.
3. The report contains three opportunities, and no two share the same proposed action.
4. Every material claim has `sourceRef` ids in this workspace, or an explicit uncertainty label. `screenClaims` is the check.
5. Every claim has a basis, so an observation is not stored as an interpretation.
6. Every source that came back unavailable, partial, or awaiting authorization is named in the report's limits.
7. The report matches the required structure: the brief's fields, the five opportunity fields, and the limits.
8. The run's cost is within its $3 cap.

Checks 1 and 3 use the structured fields, not a model's opinion of the prose. A report that holds two opportunities must include a one-line reason for the missing third, and check 3 still fails.

On a failure the run gets one revision, and only for the checks that failed. The revision may rewrite from the sources already collected. It may not start new research, and it may not add an opportunity that has no support in those sources. The revision runs only when the reserve below can pay for it. Then the same eight checks run again.

If the reserve cannot pay for the revision, the run does not revise. It goes to **Needs Review** and says the revision was not run because the reserve could not cover it. If a revision ran and any check still fails, the run finishes with the draft kept and the asset marked **Needs Review**. The user sees the draft and the failed checks in plain words, for example: "Only two opportunities could be supported by the available evidence. Additional research or user input is required." The run is never marked passed, and it never fills a gap by inventing a claim.

**Budget reserve.** Market Intelligence keeps the $3 run cap (decision D3). Of that, **50¢ is held back** for the completion check and the one revision. Research and writing steps cannot spend it. The 50¢ is a starting figure, to be changed from measured run cost, not a second product decision. Before every model call the runtime estimates the worst case (the prompt's tokens, the step's max output, and the search fee from `max_uses`) and does not start a call that would pass the amount that step is allowed to spend. The cap check today runs after the cost is recorded; this pre-check is added for any skill that declares a reserve.

### 3.5 Feedback (new task 2.20)

- `assets.reject` with a required reason, by Owner or Manager. The asset stays as a version history and leaves the queue.
- Each rejection or revision request is saved as a `feedback` row (workspace, asset version, reason, who, when).
- A person can promote a feedback row into a verified business fact ("Do not lead with price"). Nothing is promoted automatically. See 3.1.
- Uploaded results (CSV, `customerData` platform) become first-party sources, as already planned.

### 3.6 Screens (changes to 2.13 to 2.15)

| Section | Built from | Change |
|---|---|---|
| Context | New panel in the Research Studio | Shows the brief: what the agent knows (with origin and date), what is missing, and the assumptions. Each item can be corrected inline. |
| Research | Board (2.14) | No change |
| Findings | New tab on the Research Studio | The opportunities, each with its five fields (3.4) and its basis. Clicking the evidence opens those sources on the board. A report in Needs Review shows the failed checks above the draft. |
| Studio | Asset page | No change |
| Review | Approvals and Decisions | Adds reject with reason, Waiting for User, Needs Input — Timed Out with a resume action, and Needs Review |

Every opportunity links back to the sources and business facts behind it.

### 3.7 Acceptance (changes to 2.17)

The five pre-ship tests, and what covers each one:

| Test | Covered by |
|---|---|
| Uses the right company's context and never another workspace's | Existing isolation tests, plus new ones for `businessFacts`, `feedback` and the brief |
| Handles missing or inaccessible sources honestly | Existing adapter status tests. 2.17 adds one run with every adapter unavailable: the report must say so and make no observed claims. |
| Material findings point to real evidence | Existing evidence rules, plus completion checks 3 to 6. A fixture whose sources support only two opportunities finishes as Needs Review, names the missing third, and does not contain an invented one. |
| Work reflects this company and objective | New. Two fixture businesses with the same market and different offers must get different proposed actions. Each opportunity names the fact or profile field it used. A no-context baseline (same research, empty profile) is compared on the four depth standards by a fixed rubric, and the result is recorded in `phase-2-progress.md`. |
| Keeps revisions, and takes no external action without approval | Existing version and approval tests. No external action exists in V1. |

---

## 4. Decisions locked (2026-11-04)

D6 and D7 are adopted as proposed. D8 and D9 are adopted with the safeguards in 3.3 and 3.4.

| Decision | Locked as | Where |
|---|---|---|
| D6. Business facts in their own table | `businessFacts`, with source, dates and status. An agent cannot verify its own fact. Superseded rows are kept. | 3.1 |
| D7. Research first, creative production second | The first release is a report of three actionable opportunities. Creative Production is a later skill, with its own run, its own $3 cap, and the approved report version as its input. | 3.4, Section 5 |
| D8. Ask, then a seven-day timeout | Ask only when the gap would change the result or make the task unreliable. Waiting spends nothing. After seven days the run becomes Needs Input — Timed Out and can be resumed. The timeout fires only if the run is still waiting on the same question. | 3.3 |
| D9. One revision, then Needs Review | Eight code checks. One targeted revision if the 50¢ reserve can pay for it. Otherwise, or on a second failure, Needs Review, with the failed checks named. A missing opportunity is reported, not invented. | 3.4 |

The first release is held to one question: can Market Intelligence take a real objective, use this company's facts, and return a report whose opportunities a person could act on, each one traceable to evidence? Creative Production and the other six agents wait on that.

## 5. Order of work

1. 2.18 `businessFacts`, and 2.20 feedback (both data and access, testable on their own)
2. 2.11 Market Intelligence with the brief, the five-field opportunities and the eight checks, plus 2.19 ask, resume and the guarded timeout
3. 2.13 to 2.15 screens with the Context and Findings sections
4. 2.16 injection test, then 2.17 acceptance, including the two-opportunity fixture and the specificity comparison
5. Creative Production, once 2.17 passes. It is a separate skill. It takes the approved, version-locked report and does not repeat the research unless a source it needs is missing. Its cap is $3 per run, and the screen shows the estimated cost before the user starts it. Its assets are `adCopySet` and `creativeBrief`, and they wait for their own approval.
