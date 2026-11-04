# Doctrine: Understanding Precedes Advantage

Date: 2026-11-04. This is the product doctrine for every Vistrial agent. Section 1 is the doctrine itself. Sections 2 to 5 compare it to what is built on `main` at `d8f50f2` (Phase 2 Milestones A and B), and list the changes it makes to the Phase 2 backlog in `growth-architect-v1-plan.md`.

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

An agent asks only for the context its task needs. It records what is missing. It asks the user when a missing item is critical, and records an assumption when it can go on without it.

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
| **Business context** | Partly. `profileVersions` holds offer, price notes, audience, geography, channels, brand voice and competitors, as draft or confirmed, with who confirmed and when. | Fields have no source, date or verification status of their own. There is no freshness: an old budget reads as current. Objectives, constraints and budget have no fields. See 3.1. |
| **Task context:** a short brief of objective, deliverables, known, missing, permitted sources, budget | Partly. `researchProjects` holds objective, market, geography, competitors, platforms and pasted links, and locks its scope once it runs. The plan step (2.11) will write research questions and queries. | No list of what is missing, no recorded assumptions, no definition of a good deliverable. See 3.2. |
| Ask the user when critical information is missing | Not built. `agentRuns.status` already has `waiting`, but nothing sets it. | See 3.3. |
| **Prioritize** stage | Not planned. 2.11 goes plan, collect, classify, compute, write. | See 3.4. |
| **Validate** stage and the acceptance standard | Partly. `screenClaims` drops claims that break the evidence rules. Nothing checks the work against the brief or the business context. | See 3.4. |
| **Historical context and feedback** | Partly. Approved assets are kept and later skills will take them as inputs (plan 2.3). | Rejections carry no reason. Results uploads (`customerData`) are planned but not built. See 3.5. |
| Workspace sections: Context, Research, Findings, Studio, Review | Partly. Run viewer, Decisions queue, Assets library and asset page exist. Research Studio, board and report view are 2.13 to 2.15. | No Context panel and no Findings view. See 3.6. |

The Evidence System, Artifact Engine and Approval System are mostly in place. The Context Engine is the thinnest of the four. That fits the doctrine's main point: the work to do now is in how the agent understands the situation, not in the model.

---

## 3. Changes to the Phase 2 backlog

These come before or inside 2.11 (the Market Intelligence skill). They change the skill's shape, so building 2.11 first and adding them later would mean doing 2.11 twice.

### 3.1 Context items (new task 2.18, before 2.11)

The profile stays the owner-confirmed core. A new `contextItems` table holds individual facts with provenance:

- `workspaceId`, `kind` (business, market, historical, operational), `key`, `statement`
- `origin`: stated by the owner, found by an agent (with `sourceRefIds`), from a past run, or an assumption
- `status`: verified (a person confirmed it), unverified, or contradicted
- `observedAt`, and an optional `reviewBy` date for facts that go stale (budgets, offers, prices)
- `supersedes`, so a correction keeps the history

Rules:
- Only an Owner or Manager can mark an item verified.
- A run can add items only as unverified.
- An item past its `reviewBy` date reads as unverified until someone confirms it again.
- A run records which items it used, so a finding can be traced back to them.
- Every member can correct or remove an item; removal is a soft delete and is audited.

The profile fields can later move onto context items. That is not needed for V1.

### 3.2 Task brief (inside 2.11's plan step)

The plan step's structured output gains these fields:

- `objective` and `deliverables`: what a finished result looks like
- `known`: which context items and profile fields it will use
- `missing`: each with `critical: true | false`
- `assumptions`: one line for each missing item that is not critical

The brief is saved as an artifact and shown in the Research Studio before collection starts. The validate step checks against it.

### 3.3 Ask when something critical is missing (new task 2.19)

When the brief has a critical missing item, the run moves to `waiting`. A question then appears in the Decisions queue, worded by the model and limited to the missing items. The answer is saved as an owner-stated context item and the run resumes. A waiting run uses no model calls and does not count toward the run's time cap. A run left unanswered for 7 days stops with `cancelled`.

The bar for "critical" is set by the skill, not the model. For Market Intelligence: geography and the service being researched. Budget is not critical for research. It is recorded as an assumption ("Budget not provided; recommendations assume a small local budget").

### 3.4 Prioritize and validate (inside 2.11)

The skill becomes: plan (brief), collect, classify, compute, **prioritize**, write, **validate**.

- **Prioritize** (model, structured output): up to three opportunities. Each one names the customer problem, the evidence behind it (`sourceRefIds`), the context items it relies on, why it fits this business, and what would prove it wrong. An opportunity with no supporting source can only be a hypothesis.
- **Validate** (code first, then model):
  - Code checks: every deliverable in the brief exists, every claim passes `screenClaims`, every opportunity cites sources or is labeled hypothesis, and every assumption appears in the report's limits section.
  - Model check: the report's recommendations are tested against the business context for contradictions, for example a promoted service the business does not offer.
  - Results are saved as a `validation` artifact.
- **Completion check in the runtime:** a skill that declares a validate step cannot reach `done` unless that step passed. A failed check gets one revision pass. If it fails again, the run completes with the asset marked "Needs review" and the failed checks listed. It is never marked as passed.

### 3.5 Feedback (new task 2.20)

- `assets.reject` with a required reason, by Owner or Manager. The asset stays as a version history and leaves the queue.
- Each rejection or revision request is saved as a `feedback` row (workspace, asset version, reason, who, when).
- A person can promote a feedback row into a verified context item ("Do not lead with price"). Nothing is promoted automatically.
- Uploaded results (CSV, `customerData` platform) become first-party sources, as already planned.

### 3.6 Screens (changes to 2.13 to 2.15)

| Section | Built from | Change |
|---|---|---|
| Context | New panel in the Research Studio | Shows the brief: what the agent knows (with origin and date), what is missing, and the assumptions. Each item can be corrected inline. |
| Research | Board (2.14) | No change |
| Findings | New tab on the Research Studio | The prioritized opportunities, each with its basis badge. Clicking one opens its sources on the board. |
| Studio | Asset page | No change |
| Review | Approvals and Decisions | Adds reject with reason, and the "Needs review" state with the failed checks |

Every recommendation links back to the sources and context items behind it.

### 3.7 Acceptance (changes to 2.17)

The five pre-ship tests, and what covers each one:

| Test | Covered by |
|---|---|
| Uses the right company's context and never another workspace's | Existing isolation tests, plus new ones for `contextItems`, `feedback` and the brief |
| Handles missing or inaccessible sources honestly | Existing adapter status tests. 2.17 adds one run with every adapter unavailable: the report must say so and make no observed claims. |
| Material findings point to real evidence | Existing evidence rules, plus the validate step's code checks |
| Work reflects this company and objective | New. Two fixture businesses with the same market and different offers must get different opportunities. A no-context baseline (same research, empty profile) is compared on the four depth standards by a fixed rubric, and the result is recorded in `phase-2-progress.md`. |
| Keeps revisions, and takes no external action without approval | Existing version and approval tests. No external action exists in V1. |

---

## 4. Decisions needed

- **D6. Context items as a separate table** (3.1) rather than more profile fields. Recommended: separate table. Each fact needs its own source, date and status, which a profile version cannot give per field.
- **D7. The first milestone's deliverable.** The current V1 delivers a market report. The doctrine's first milestone also includes three finished ad concepts. Recommended: keep 2.11 as the report with its Findings (three opportunities). Then add a short follow-on skill that turns one approved opportunity into an `adCopySet` asset, which takes an approved report as input (plan 2.3). That keeps research and creation as separate approvals and keeps the run under the $3 cap.
- **D8. The ask-the-user flow** (3.3), and its 7-day limit for an unanswered question.
- **D9. The completion check** (3.4): one revision pass, then "Needs review", never a silent pass.

## 5. Order of work

1. 2.18 context items, and 2.20 feedback (both data and access, testable on their own)
2. 2.11 Market Intelligence with the brief, prioritize and validate steps, and 2.19 ask-the-user
3. 2.13 to 2.15 screens with the Context and Findings sections
4. 2.16 injection test, then 2.17 acceptance with the specificity comparison
5. The ad-concept follow-on skill (D7), once 2.17 passes
