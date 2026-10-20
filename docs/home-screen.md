# Home screen

## Agentic workspace (behind a per-workspace switch)

When Vistrial staff switch it on for a workspace (the switch sits at the
bottom of Home for staff), `/app/home` becomes the sales team's office and
Operators get the same language on `/app/today`. Every other workspace keeps
the Home described below until the old one is retired.

| Where | What |
|---|---|
| `src/lib/workspace/voice.ts` | Every sentence the workspace says: crew lines, briefing, decisions, checks, stream, empty and error states, welcome. One edit changes the copy everywhere. |
| `src/lib/workspace/state.ts` | Lifecycle state from real records: setup, importing, quiet, steady, the welcome (Owners, 14 days or until dismissed), learning, attention banner, paused. |
| `src/lib/workspace/load.ts` | Every read, through the person's row-level-security client. |
| `src/lib/workspace/briefing.ts` | Briefing facts counted from saved records. History imports never count. |
| `src/lib/workspace/work.ts` | Due now (Sentry clock order, always on top), Work next (Assay score or age), tasks, and the rule that rows never move under the cursor. |
| `src/lib/workspace/outcomes.ts` | Outcome tiles built from ids in the one metric catalog. Untracked tiles are left out. |
| `convex/home.ts`, `convex/homeRules.ts` | The switch, the Owner's four numbers, and each person's own view: collapsed sections, Work next order and scope, snoozed leads, last visit, three days of briefings (counts and lead ids only). |
| `src/components/workspace/*` | The sections. Decisions reuse the shared request card, so a decision anywhere shows everywhere. |
| `/app/agents/autonomy` | What each agent does on its own, only suggests, and never does, from the real approval settings. |
| `/preview/workspace?state=…` | Development only: every state from seeded fake records, for layout checks. Returns 404 in production. |

Nothing on this page sends. Drafts are approved one at a time through the
shared card and sent by a person from the CRM; "Text draft" asks Relay through
`compass_request_draft`, which keeps its daily cap and do-not-contact refusal.
A swipe on a decision or a work row only reveals a confirmation tap. The
buttons stay, and calm mode or reduced motion turns the swipe off.

Home and Today show one banner. A blocked payment outranks a broken
connection, and the rest are a count. The same warnings stay on other pages.
After an Owner dismisses the welcome, Help keeps a Welcome tour link for 14
days (`/app/home?tour=1`).

`/app/home` leads with outcomes: booked calls and cost per booked call, then
four supporting numbers, then what needs approval, then what already happened.
Owners and admins land here after sign-in.

| Where | What |
|---|---|
| `src/lib/metrics/definitions.ts` and `public.portal_metric_rows()` | Every customer-facing number, once. Home, Results, Reports, and Compass read these. `src/lib/home/metrics.ts` is an older calculator the Home cards no longer use. |
| `src/lib/home/periods.ts` | This week, last week, last 30 days, this month, in the workspace time zone, each with an equal-length previous period. |
| `src/lib/home/catalog.ts` | Areas, action types, modes, who may approve. |
| `src/lib/home/queue.ts` | Drafting, queue order, activity grouping. Pure. |
| `src/lib/home/run.ts` | The only path that sends anything from the queue. |
| `src/lib/home/scan.ts` | `/api/cron/home-agents`, every 15 minutes: find work, auto-run what is allowed, escalate long waits. |
| `supabase/migrations/20261002010000_home_screen.sql` | Registry, settings, history, queue, owner-only setters. |

## Approval gate

Each action type has a mode per workspace: ask first, auto-run, or off.
Anything that messages a lead or a client ships as ask first, and only an owner
can switch it to auto-run (the database checks this too, from its own registry,
not from a flag the caller passes). An action type the registry has never seen
asks first. Auto-run messages respect quiet hours and the per-lead daily limit;
a lead over the limit is held in the queue instead. An item that waits past the
limit is escalated: it never sends on its own, only an owner can approve it, and
owners are notified if escalations are on.

Every change to these settings lands in `approval_gate_changes` with who and
when, shown at the bottom of Settings → Approvals.

## Adding an area

Show-up, retention, and client success are not built. Each plugs in the same way:

1. **Definition** — `src/lib/home/areas/<area>.ts` exporting a `HomeArea`: its
   action types (label, group, whether it reaches people, default mode, activity
   wording), its queue kinds (with urgency), and the metric ids its cards show.
   Add it to `HOME_AREAS` in `catalog.ts`.
2. **Registry rows** — a migration inserting each new action type into
   `approval_action_types`. Until that row exists the type asks first and cannot
   be set to anything else. `queue.test.ts` fails if code and seed disagree.
3. **Producer** — `src/lib/home/areas/<area>-producer.ts` returning
   `NewQueueItem[]`, registered in `areas/producers.ts`. Producers only draft;
   `scan.ts` decides from the workspace's settings whether an item waits or runs.
4. **Numbers** — add the metric id and its calculator to `metrics.ts`, its input
   rows to `load.ts`, and a case to `cardFor` in `app/app/home/number-cards.tsx`.
5. **Execution** — if an item does something other than send a message or add a
   task (for example, email a report), add that branch to `runDraft` in `run.ts`.

The settings page, onboarding step, queue, and activity log read from the
catalog, so they pick up the new area with no page changes.

## Data gaps

- Revenue splits by `revenue_log.lifecycle` (new, repeat, recurring,
  reactivation). Nothing writes that column yet, so revenue shows as
  "Not classified yet" until it is filled in.
- Cost per booked call reads `ad_spend_days`, filled by a Meta or Google Ads
  source connected in the owner portal. Without one, the card asks to connect
  ad spend instead of showing a number.
- First reply to a new lead, reports to the client, and CRM stage or tag changes
  are in the settings so owners can decide them now, but no producer drafts them
  yet.
