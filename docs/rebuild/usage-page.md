# Usage page: data model and plan

The owner, 2026-11-13: "Don't display Claude and credit usage everywhere. All those details will be in a very
detailed usage page. Break down everything and how credits are consumed."

Two changes follow:

1. **Off the work screens.** Results, run views, briefing posts, chat answers, task cards, asset pages and
   result headers stop showing the model mark ("Claude Opus 5.5" with its logo) and after-the-fact credit
   lines ("42 credits so far", "9 credits" under an answer, per-run cost lines). The data stays stored.
2. **One usage page** at `/app/usage`, with a sidebar entry, that breaks every credit down and explains how
   credits are consumed.

## 1. What stays on the work screens, and why

| Stays | Why |
| --- | --- |
| The model picker in chat boxes and Creative, with its "Usually costs more / less" hint | The owner asked for the picker; the hint is a choice made before work starts. |
| A budget a person confirms before work starts: the Start button's "up to N credits", plan cards ("Up to N credits for this run"), the research estimate before Run, the image price confirmed before making, the teardown budget | Billing safeguard: nobody is charged more than they confirmed, so the number must be in front of them when they confirm. |
| Balance and low or empty balance notices, and the sidebar balance | Work stops when the balance is empty; people need to see it coming. |
| Approval cards that say "Up to N credits" | An Owner or Admin approves spending against that number. |
| Settings: caps and the spending limit, with "N used today" next to the daily cap | Settings is where limits are set; the day's use tells whether the cap is near. Not a work screen. |
| Billing: plan, packs, and its short list of charges | Billing is the account screen, not a work screen. It links to the usage page for the detail. |

Removed: every model mark on finished work; "Spent N of M" and "so far" lines; the live "Credits used"
counter; the run viewer's cost bar and cost line; per-run credits in run lists, Creative and Pages lists;
"Used N credits" on briefing posts; per-answer credits in follow-ups; "this conversation N of M" in chat
footers. The markup number is also taken off Billing ("times 3"): customers see credits only.

## 2. Where the numbers come from today

Every charge goes through `chargeUsage` (`convex/lib/billing.ts`) and writes one `billingLedger` row:

| Field | Meaning |
| --- | --- |
| `workspaceId` | The organization that spent. The balance is its account's (`billingAccounts`, one per account). |
| `clientId?` | Stamped only for `source: "run"` today (from the run). |
| `source` | `run`, `followup`, `intake`, `file`, `creative`, `page`. |
| `ref` | The id of the thing charged (see below). |
| `costCents` | What it cost Vistrial. **Never sent to a customer screen.** |
| `priceCents` | What the customer paid: credits (1 credit = 1 cent of balance), `priceFor(cost) = ceil(cost × markup)`. |
| `markup`, `at`, `syncedAt?`, `syncError?` | Markup used, time, Autumn sync state. |

What each `source`'s `ref` points at, and what can be learnt from it:

| source | ref → table | Started by | Agent / skill | Client | Model | Link |
| --- | --- | --- | --- | --- | --- | --- |
| `run` | `agentRuns` | `startedBy` | `agentSlug`, `skillSlug` | `clientId` | `madeWith` (writing model; missing on old runs) | `/app/runs/{id}` |
| `followup` | `sessionChats` | `createdBy` | Growth Architect, research follow-up | project's `clientId` | `madeWith` | `/app/research/{projectId}` |
| `intake` | `intakes` (chat) | `createdBy` | `agentSlug`, `skillSlug` | `clientId` | per message `madeWith`; not on the intake | run, project, else `/app/chats` |
| `file` | `sessionFiles` or `creativeReferences` | `createdBy` | the chat's agent, else none | the chat's or project's client | platform route (not stored) | the chat or project |
| `creative` | `creativeImages` | `createdBy` | Creative Production | the asset's `clientId` | `model` | `/app/assets/{assetId}` |
| `page` | `pageReadJobs` | `startedBy` | Page reader | none | none (fetch or browser) | none |

Facts that shape the design:

- **A run writes many ledger rows**: one per model call or tool call (`charge` in `convex/runs.ts`). A busy
  agency (50 runs a day, ~20 steps each) writes ~1,000 rows a day; 90 days is ~90,000 rows, too many to
  read and join in one Convex query.
- The model of each run step is known at charge time (`complete` gets `provider` and `model`) but is not
  written to the ledger. The run's `madeWith` is only the writing model; a run that classified on one model
  and wrote on another would be credited wholly to the second.
- Tool calls (web search, page reading inside a run) are charged with no model.
- Packs bought are not stored: checkout happens on Stripe through Autumn and only the balance comes back.
- The free onboarding session (`agentRuns.free`) never reaches the ledger. It is not usage of credits and
  stays off the page.

## 3. New fields, going forward

### 3.1 `billingLedger`: attribution on every new row

`chargeUsage` resolves who and what a charge is for from its `ref` once, at write time
(`convex/lib/usage.ts` `attributionFor`), and stamps it:

```ts
startedBy?: string        // the person (Clerk user id) who started the work
agentSlug?: string
skillSlug?: string
model?: string            // the model id that did this step; missing for tool calls and page reading
clientId?: Id<"clients">  // now for every source, not only runs
```

`runs.ts` passes the step's `model` to `chargeUsage`, so a run's spend splits across the models it used.
Rows written before this change lack `startedBy`, `agentSlug`, `skillSlug` and `model`; the backfill below
fills the first three from the `ref`, and the model from the run's `madeWith` where it was kept.

### 3.2 `usageItems`: the table the page reads

One row per **(organization, piece of work, day, model)**: everything a piece of work spent on one UTC day
on one model. The page never reads the ledger directly.

```ts
usageItems: defineTable({
  workspaceId: v.id("workspaces"),
  source: ledgerSource,           // run | followup | intake | file | creative | page
  ref: v.string(),
  day: v.string(),                // "2026-11-13", UTC, the same key as caps (lib/caps.ts dayKey)
  model: v.string(),              // model id, or "" for tools and page reading
  priceCents: v.number(),         // credits charged, summed
  charges: v.number(),            // ledger rows folded in
  firstAt: v.number(),
  lastAt: v.number(),
  startedBy: v.optional(v.string()),
  agentSlug: v.optional(v.string()),
  skillSlug: v.optional(v.string()),
  clientId: v.optional(v.id("clients")),
  title: v.optional(v.string()),  // what the work was, for the drill list
  backfilled: v.optional(v.boolean()),
})
  .index("by_workspace_day", ["workspaceId", "day"])
  .index("by_workspace_person_day", ["workspaceId", "startedBy", "day"])
  .index("by_key", ["workspaceId", "source", "ref", "day", "model"])
```

`chargeUsage` upserts the row in the same mutation as the ledger insert, so the two never disagree.
`costCents` and `markup` are deliberately **not** on this table: nothing the page reads can leak the markup.

Volume: the same busy agency is ~50–100 rows a day, ~9,000 for 90 days across the account. Reads are capped
(8,000 rows per query); when the cap is hit the page says the period is too large to break down in full and
suggests a shorter one.

### 3.3 Backfill

`usage.backfill` (internal mutation, paginated, idempotent: it rebuilds rows marked `backfilled` per
organization) walks `billingLedger` by `by_workspace_at`, resolves attribution from each `ref`, and writes
`usageItems`. It is run once per deployment by the owner:

```
npx convex run usage:backfill '{}'
```

Not run by this work: the rules forbid running against shared dev or production from here.

### 3.4 Packs bought

`billingAccounts.packsCents?` is read from Autumn on every refresh (the top-up plan's rows in the
customer's subscriptions/purchases, summed). Until a refresh has seen the field, or if Autumn reports top-ups
in another shape, the page says "Packs: not reported yet" rather than a guess. **Unproven** against live
Autumn; Stripe test mode should confirm it before it is relied on.

## 4. Who sees what

| Role | Sees |
| --- | --- |
| **Owner** | Everything in the account: every organization (filterable), every person, client, agent, skill and model, the forecast, plan, packs and limits. |
| **Admin** | Everything spent in the organization they are in: every person, client, agent, skill, model. Balance, plan, forecast and limits. Not other organizations' spending (the same line Billing draws today). |
| **Member** | Only work they started, in the organization they are in, with every breakdown of it. The balance and reset date (already on the sidebar). No forecast and no team totals: those would show what colleagues spend. |
| **Viewer** | A summary: the balance, the reset date and "How credits work". No breakdown: a Viewer cannot start work, so there is nothing of theirs to break down. |

The server decides; screens only choose what to show. A Member's filter for "person" is fixed to themselves
and the query ignores any other value sent.

## 5. The page

`/app/usage`, a sidebar entry "Usage" under Billing, `src/components/usage/`.

1. **Balance ring.** An animated ring: credits left of this month's included credits plus packs, with the
   number in the middle. Beside it: included this month, used this month, left, packs bought, the reset
   date, and a forecast ("At this pace the balance lasts until 2 Dec", from the last 14 days' average daily
   use; "Lasts past the reset" when it does; nothing when there is no use to measure).
2. **Filters.** Period (7 days, 30 days, this month, 90 days), organization (Owner, when there are several),
   client, agent, skill, person (Owner and Admin), model. Each is a select; filters combine.
3. **Over time.** Daily bars, stacked by agent, on an axis that starts at zero and is labelled in credits.
   Each bar's total on hover and focus; a table version for screen readers.
4. **Breakdowns.** Tabs: by skill, by agent (with the agent's avatar), by client, by model, by person, and
   by organization for an Owner. Each row: name, a glowing bar sized to its share, credits, share of total.
   A row opens the list of the work it covers.
5. **The work list.** Every run, chat, follow-up, image or page read in the filter: date, what it was, who
   started it, the model that ran, credits, and a link to the work. Newest first, 50 at a time.
6. **How credits work.** Plain words: one credit is one cent of balance; every piece of AI work is charged
   in whole credits for what it really used; what each kind of work typically uses (the middle half of real
   runs in this account over 90 days, per skill, shown once there are at least 3 of them; otherwise "not
   enough runs yet"); the limits that apply (per run and per day caps per agent, the spending limit that
   needs an Owner or Admin's approval, the monthly cap on auto-refill, the chat cap); and that work never
   starts with an empty balance and stops at the budget a person confirmed.

No markup, no cost in cents, no dollar value of credits on this page except the plan price and pack prices,
which are real money charged to a card.

### Look

The landing page family: `GlowPanel` and `SpotlightCard` surfaces from `saas-frame.tsx`, the agent avatars
from `live/agent-avatar.tsx`, the motion vocabulary of `agentic-visuals.tsx` (staggered rise, soft glow).
Bars grow from zero on first view; the ring draws in; numbers tick. `prefers-reduced-motion` turns every
animation off and shows the end state. Light and dark both use the theme tokens. Layout holds from 320 to
1920 px with no horizontal scroll: breakdown rows wrap, the chart scrolls inside its own box only when 90
daily bars do not fit, and long names truncate with the full name in a title.

Dataviz rules: credits only, the axis starts at zero, units labelled ("credits"), no dual axes, colours by
agent from one palette that passes contrast in both themes, values available as text.

## 6. Queries

`convex/usage.ts`:

- `usage.overview({ period, organizationId?, clientId?, agentSlug?, skillSlug?, person?, model? })`
  returns `{ access, balance, totals, daily[], by: { skill, agent, client, model, person, organization }, typical[], limits, truncated }`.
  All amounts are credits (`priceCents`).
- `usage.items({ same filters, cursor? })` returns the work list, grouped per piece of work (rows of the
  same `source`+`ref` folded together), with `{ kind, title, at, startedBy name, models[], credits, href }`.

Names (agents, skills, clients, people, organizations, models) are resolved on the server; a client the
person may not see is never named.

## 7. Delivery

1. This document (draft PR).
2. Part 1: take the model mark and after-the-fact credits off the work screens; markup off Billing.
3. Part 2: ledger attribution, `usageItems`, backfill, `usage.ts`, the page, the sidebar entry, the dev
   story at `/dev/usage` with agency and coach sample data, screenshots at 390 and 1280.

## 8. Unproven until checked on a deployment

- The backfill on real data (not run from here).
- Packs bought from Autumn's customer record (shape not verified against live Autumn).
- Query cost on the largest real account; the 8,000-row cap is the guard.
