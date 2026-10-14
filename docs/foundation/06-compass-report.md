# Compass, the chat agent: implementation report

Branch: `claude/compass`. Discovery and plan were agreed in the session (fifteen decisions,
listed at the end).

## Status in one paragraph

**Built and tested locally; nothing is deployed, and no model has been called yet.** Compass
replaces the Ask Vistrial chat. It answers questions about the workspace's own leads, calls,
follow-ups and numbers. Each answer shows the lookups it ran and links the records and
definitions it used. Its numbers come from the same database functions as Home and Results. A
figure it cannot match to a lookup is flagged under the answer. Compass can read, and it can
offer a suggestion; nothing changes until a person confirms it. Conversations are private to
the person who asked. One migration does the database work, and it has a tested rollback. Model
accuracy, time to first words and cost per question have not been measured: this environment
has no model key. The evaluation runner that measures them is ready (see "Not yet measured").

## What changed

### Database: `20261014010000_compass.sql` (rollback in `supabase/rollbacks/`)

- **Transcript permission.**
  - `org_members.can_see_transcripts` is off by default. Only an Owner can change it; a
    trigger enforces that and records the change.
  - `ws_can_see_transcripts(org)`: Owners, Operators and staff may read transcripts. Members
    may only with the grant.
  - The grant is enforced in four places:
    - transcript passages (a restrictive RLS policy);
    - meaning-search excerpts;
    - `call_transcript_texts`;
    - every Compass lookup.
- **Old Ask Vistrial conversations.**
  - Each is now visible only to its author. Old tool-call records keep their earlier rule, so
    "What Vistrial did" still works.
  - `compass_legacy_delete` lets the author delete one. It removes the messages and the title,
    and keeps an audit row.
- **Compass's own runs are visible only to the person who asked**, staff included. Other
  agents are unchanged.
- **Activation.**
  - Existing workspaces are set to on, so nobody loses the chat.
  - New workspaces switch Compass on as the last activation step.
  - `compass_availability` gives the reason when Compass is unavailable: closed or paused
    workspace, halted agents, paused agent, switched off, or not switched on yet during setup.
  - `compass_set_enabled` is for Platform Admins and the workspace's Service Team, and only
    while Relay is not off.
- **New tables.** All are RLS-protected, owner-only where personal, and closed to writes in
  closed workspaces:
  - `compass_conversations` and `compass_messages`;
  - `compass_shares`: at most 7 days, revocable, every view logged;
  - `compass_usage`: route, model, tokens, cost, lookups, timings and outcome, with no text;
  - `compass_feedback`: thumbs and a reason, with no text;
  - `compass_pins`: up to 20 per person;
  - `compass_platform_settings`: the limits;
  - `compass_workspace_limits`: overrides for one workspace;
  - `help_articles`: 18 seeded, product-neutral.
- **Lookups** run as the person, through the existing permission helpers:
  - `compass_find_leads`, `compass_case_file` and `compass_lead_transcript`;
  - `compass_metric_summary`, `_breakdown` and `_leads`, which call the same `portal_*`
    functions as Results. An Operator gets their own numbers through a self-scope setting that
    is reset inside every call. Results itself stays closed to Operators.
  - A lead the person cannot open returns nothing, the same as a lead that does not exist.
  - Lookups never return emails or phone numbers.
- **Actions.** Each one goes through the existing checks:
  - `compass_request_draft`: Relay's normal duplicate and daily checks, plus 10 per person per
    day. Members need the approver grant; Operators can ask only for assigned leads.
  - `compass_create_next_action`: not available to Members.
  - `compass_record_action`.
- **`compass_purge`** runs from the retention cron. It removes conversations older than the
  workspace's retention setting, and shares that expired more than 90 days ago. Deleting a
  conversation removes it at once.

### Server

- **`/api/compass/chat`** handles each question in this order:
  1. The person must be signed in, own the conversation, and have Compass available.
  2. It checks the limits, the question length and the turn count, then saves the question.
  3. The local router refuses out-of-scope questions without a model call.
  4. Haiku answers lookups and Sonnet answers reasoning; Opus is refused. The answer streams,
     with prompt caching.
  5. Numbers in the answer are checked against what the lookups returned.
  6. It records usage (no text), then the answer metadata and the title. Titles are named from
     the lookups, never from the question.
- **Retrying** an answer that failed replaces the unanswered question, so it isn't asked twice.
- **The old `/api/sales-os/chat`** now answers 410 ("Ask Vistrial is now Compass"). The script
  and delivery capabilities in `src/lib/sales-os` are kept for later, as approval-gated cards.
- **Confirming a suggestion** finds the suggestion in the person's own saved conversation, then
  runs the existing flow for it. Navigation suggestions only open a page.

### Screens

- **`/app/compass`**:
  - the conversation list: search, rename, share with the Vistrial team for 7 days, stop
    sharing, and delete;
  - earlier Ask Vistrial conversations, read-only and deletable;
  - the empty state: what Compass can and can't do, "Your conversations with Compass are
    private to you", the template's starter questions and the person's pinned questions;
  - each answer: lookup steps, sources (each metric links to its definition and to the leads
    behind it), notes for unmatched figures and for a nearby limit, copy, thumbs with a reason,
    retry, and stop;
  - on phones, the conversation list moves into a sheet.
- **`/app/compass/definitions`** lists every metric and rate definition, with anchors.
- **Ask Compass** in the top bar opens a panel: a sheet from the right, or from the bottom on a
  phone.
  - It starts with removable context: the case file, the lead list and its filters, Home or
    Today, or the Results range.
  - It shares conversations with the full page ("Open in full page").
  - It is the entry point for Members and Operators.
- **`/app/ask`** redirects to Compass. Old `?c=` links open read-only in Compass history.
  `/app/ask/history` and `/app/ask/assets` are unchanged.
- **Navigation:**
  - Compass is a child of Agents for Owners and in the staff workspace group. There is no
    seventh main item, and a test guards that.
  - Staff get a "Compass" page under Team.
  - The jump palette's "Ask Vistrial" entry is now "Compass".
- **People (Members page):** a "Transcripts" column. Only an Owner can change it, and staff see
  it read-only.
- **Masking for Members without the grant.** They see no transcript text, quotes or objection
  wording on:
  - case files and the case print page;
  - call pages: instead of the paste-a-transcript form, the transcript area says transcripts
    are not shared with them;
  - Scribe fields and coaching handlings.
- **Help** shows "How Vistrial works" from `help_articles`, with `#slug` links. Platform Admins
  edit the articles at `/app/team/compass/help`.
- **Staff page `/app/team/compass`:**
  - switch Compass on or off for the current workspace, with a reason;
  - conversations shared with the team, each opening into a read-only, logged viewer;
  - for Platform Admins only: 30-day usage per workspace (median time to first words, errors,
    "no data", unmatched figures, limits hit, thumbs, cost per question), answers worth a look
    (outcomes only, never text), the platform limits, per-workspace limits, and the help
    article editor.
- **The Compass agent page** shows Owners and staff the counts against the limits: today, this
  month, and how many people asked.
- **Layout reference:** `/app/layouts/compass` shows nine states at phone, tablet and desktop
  width: empty, looking it up, answer with sources, no data, unchecked figure, suggested
  action, error, limit reached, and earlier conversation.
- **Simulator:** the Compass "normal" run now matches real Compass (lookups, not scripts). Two
  scenarios are new: "no records" and "suggestion, confirmed".

## Tests and results

| Check | Result |
| --- | --- |
| Typecheck | Clean |
| Lint | 22 errors, 9 warnings: the same 22 errors as before this work, none in new or changed code. One commented exception for the chat transport (`react-hooks/refs`): it reads refs only when sending. |
| Unit tests | 963 of 965 pass. The 2 failures are the settings-tab tests in `navigation.test.ts`, which failed before this work. New: 24 Compass tests (grounding, routing, models, starters, help search, titles, figures, the eval set's offline layer, and product-neutral seeds). |
| `verify-compass.sql` (new) | Passes. It covers availability and activation (only assigned staff and Platform Admins switch it), Operator assigned-only on every lookup, cross-workspace not-found, no email or phone in lookups, injected lead text staying data, the transcript grant (who can change it, what Members see), private conversations, 7-day shares and their logs, old conversations, numbers equal to Results for Owner and Member, the Operator's own numbers with no breakdown by person, draft and follow-up permissions, duplicates and the daily cap, the per-minute limit, and the `relay_drafts` trigger values. |
| All database suites | 20 pass. The same 14 suites fail as before this work. `verify-sales-os` was updated: the Owner no longer reads a setter's old conversation (decision 2). `verify-reporting` now stops one step earlier in the same failing block: its fixture's made-up signed-in user trips a foreign key when the new platform default for starter questions makes the workspace configuration write go through. |
| Rollback | `scripts/test-compass-rollback.sh` (new, in `verify.sh`) passes. Compared with a database built without Compass, the rollback leaves identical functions, columns and policies, and the migration then re-applies cleanly. |
| Accessibility | axe (WCAG A and AA, plus best practice), at phone and desktop width, on all nine Compass states and the conversation list: no violations, and no horizontal scroll at 390px. The staff forms show the same label findings as the existing health-rules form when server-rendered without hydration (base-ui links the labels on the client), so they are not new. |
| Lookup speed | Workspace with 50,000 leads and 5,000 transcribed calls, best of 5 runs. Lead search: 32–103 ms. Case file: 4 ms. Transcript: 2 ms. Metric summary: 195–286 ms, against 185 ms for Results' own function. Operator's own numbers: 35 ms. Breakdown: 64 ms. Leads behind a number: 38 ms. Limit check: under 1 ms. |

## Not yet measured, and how to measure it

There is no model key in this environment, so these are not measured:

- answer accuracy;
- time to first words (the target is about 2 seconds);
- cost per question.

To measure them, run `scripts/compass-eval/run.mjs`:

- It needs a running app, a model key on that app, and one test person each for Owner, Member
  and Operator. The settings are documented at the top of the script.
- It asks the 32 cases in `scripts/compass-eval/cases.json` through the real route, and grades:
  - refusals, the lookups used, sources, unmatched figures and forbidden phrases;
  - emails or phone numbers in an answer.
- It reports accuracy, the median and 90th-percentile time to first words, and the average cost
  per question. Cost comes from the person's own usage rows.
- The staff Compass page shows the same cost per question from real use.

**I'll report cost per question once it is measured, as agreed.**

The first visible step is fast for most questions:

- The routing check is local.
- Haiku is called to route only when that check cannot tell, with a 1.5-second cap.
- Lookups take well under 300 ms.

So time to first words depends mainly on the model's own first-token time.

## Data sent to the AI provider (decision 8)

- **Anthropic only.** Haiku and Sonnet; Opus and other models are refused, even if set by
  environment.
- **Sent:** the question, the workspace's business description, the person's role, and lookup
  results. Lookup results carry lead names but no emails or phone numbers. Transcript text is
  sent only when someone who may see transcripts asks about one lead (at most 3 calls and 6,000
  characters).
- **Never sent:** notes marked internal, credentials, configuration internals, other
  workspaces' data, inbound message text, or the bodies of activity.
- **Theme questions** use the existing meaning search, and the embedding call goes to Google.
  They return only lead references unless the person may see transcripts.
- **Zero data retention is unknown** for both Anthropic and Google until you confirm it with
  each provider. The report claims neither.

## Found and fixed along the way

- **`relay_drafts` did not accept `trigger = 'sample'`**, so Prompt 10's onboarding sample draft
  would fail. Fixed here, and the rollback keeps the fix.
- **The on/off check let anyone switch Compass off.** `compass_set_enabled` compared a NULL
  access value, so the check never raised. Anyone signed in to any workspace could switch
  another workspace's Compass off. Fixed before it shipped, and the verify suite now covers it.
  The draft permission check was hardened the same way.
- **A switched-off Compass said "coming soon".** It now says it is switched off, and says
  "coming soon" only during setup.
- **The router sent some plain lookups to the reasoning model.** It now treats "how much",
  "what share", "find" and "what did … say" as lookups, and comparisons and forecasts as
  reasoning.

## Known gaps

1. **Transcript text is not fully closed at the database level for Members.** Screens and
   Compass hide it, and the passages table and meaning search enforce the grant. But
   `calls.raw_transcript`, `case_file_fields.quote` and the objection wording can still be read
   by a Member who queries those tables directly with their own session. Revoking those columns
   would break existing pages, because many invoker functions read them. Closing this properly
   means moving those readers to definer functions first; I recommend that as a follow-up.
2. **Realtime:** case file field updates broadcast over realtime can include `quote`. The
   screen re-reads through the masked loader, but the raw payload reaches the browser.
3. **The workspace export does not include Compass conversations.** This is deliberate:
   conversations are private to their author, and an Owner's export would expose other
   people's. Usage counts are on the agent page and the staff page.
4. **Prompt 10's rollback check, `scripts/test-migration-rollback.sh`, fails.** Rolling back the
   configuration system is blocked by `onboarding_template_defaults`, which references
   `config_templates`. This is not caused by Compass (the Compass round trip passes on its own),
   but it needs a fix in the onboarding rollback order.
5. **Not yet in the staff spend views:** Compass cost appears on the staff Compass page only.

## Deploying

1. Apply `20261014010000_compass.sql`. It is safe on a live database: it adds tables, columns
   and functions; the changed functions keep their signatures; existing workspaces get Compass
   on.
2. No new secrets are needed: it uses the existing `ANTHROPIC_API_KEY`.
   `COMPASS_FAST_MODEL` and `COMPASS_REASONING_MODEL` are optional, to pin model versions.
3. The retention cron now also purges old Compass conversations; it needs no new schedule.
4. Run the evaluation set against a staging workspace before turning it on for customers. The
   Platform Admin can switch Compass off per workspace from `/app/team/compass` at any time.

## The fifteen decisions, as built

1. **Compass replaces the Ask chat.** Scripts, Slack, Discord and Drive delivery left the chat.
   Their code stays, and existing scripts, history and pages are unchanged.
2. **Old conversations** are visible only to their author, read-only in Compass history, and
   deletable.
3. **"Can see transcripts"** is Owner-controlled and off by default. Compass, the case file
   screens and call pages respect it.
4. **Operators** see assigned leads only, in every lookup.
5. **Members:**
   - They reach Compass from the top bar and the panel.
   - They can ask for drafts only if they are approvers.
   - They get no follow-up next actions.
   - Scribe refresh is for Owners and staff only.
6. **Operators** can ask for a draft and add a follow-up on their own assigned leads. They
   cannot ask for a Scribe refresh.
7. **Drafts asked from Compass** use Relay's caps and duplicate checks, plus 10 per person per
   day.
8. **Provider and data:** Anthropic; names but not emails or phone numbers; transcripts only as
   described above. Zero data retention is unknown pending your confirmation.
9. **Limits** default to:
   - 10 questions per minute and 100 per day per person;
   - 500 per day and 8,000 per month per workspace;
   - 2,000 characters per question;
   - 40 turns per conversation;
   - a warning at 80%.

   Platform Admins can change all of them.
10. **Models:** Haiku for routing and plain metric answers, Sonnet for reasoning, no Opus.
11. **Retention:** the workspace's own setting. A deleted conversation is gone at once, and team
    shares end after 7 days.
12. **Activation:** switching Compass on is the last activation step, and existing workspaces
    are on.
13. **Starter questions** per template are product-neutral, and a test checks there are no
    Divine Acquisition references.
14. **No new embedding store.** Theme questions use the existing transcript search, and return
    lead references only unless the person may see transcripts.
15. **No tag filter,** and no invented tags field.
