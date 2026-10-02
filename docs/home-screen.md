# Home screen

`/app/home` leads with outcomes: booked calls and cost per booked call, then
four supporting numbers, then what needs approval, then what already happened.
Owners and admins land here after sign-in.

| Where | What |
|---|---|
| `src/lib/home/metrics.ts` | Every number's definition, once. Cards, drill-down lists, and future reports call these. |
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
