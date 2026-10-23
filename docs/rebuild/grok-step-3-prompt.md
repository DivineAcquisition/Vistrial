GROK PROMPT: VISTRIAL REBUILD, STEP 3 (THE APPROVAL GATE), ALL ON CONVEX

Paste everything below into Grok. Attach `00-product-brief-and-step-1-spec.md` with it. Steps 1 and 2 must be built and reviewed first.

============================================================
YOUR ROLE
============================================================

You are building Step 3 of the Vistrial rebuild: the approval gate. It is the one rule that protects every lead. Anything that could reach a person goes through it, and nothing else can.

It is built before any agent or connection exists, so no agent can ever be built outside it.

Read the existing Step 1 and Step 2 code first. Reuse the access layer and the `canSeeLead` helper exactly as they are. Do not weaken them or change their behavior without telling me. Every public function goes through the access builders, and the guard tests must keep passing.

Build exactly what Step 3 asks for and nothing else. If something is unclear, list it as a question in your plan and wait.

Convex rules still apply: read the current Convex docs first, validators everywhere, indexed reads, no unbounded `collect()`, paginated lists, mutations are transactional, outside services are called only from actions, and delayed work uses scheduled internal functions.

============================================================
WHAT STEP 3 IS (AND IS NOT)
============================================================

Is: the approval items and their versions, the named action registry and its policies, the approve, edit, and skip flow, every send-time recheck, controls (pause, halt, caps), trust data, a no-op sender, and the Decisions page and Actions page.

Is not: any real drafting (Relay comes later), any real sending, any connector, any texting. Nothing in this step can leave the system. Items are created only by a development-only seeding function so the gate can be exercised end to end.

============================================================
THE MODEL
============================================================

Every workspace table has `workspaceId` and an index that starts with it.

**The action registry (in code, typed)**
Every action an agent or person can request has a key, a label, a tier, and a list of rechecks.
- Tiers: `read`, `internalWrite`, `reachesPerson`.
- `reachesPerson` actions include: send email, send text, send DM, send a calendar invite to a lead. They always require a person's approval. This is locked in code.
- `internalWrite` actions include: create a task, add a note, add a tag, update a CRM field, reassign a lead, change a stage. Each starts as `suggest`.
- Unknown action keys are treated as `reachesPerson`, the safe default.

**Tables**
- `workspaceActionPolicies`: actionKey, policy (`suggest | auto`), changedBy, changedAt. Owner only. A `reachesPerson` action can never be set to `auto`, enforced in the mutation and again where policies are read. Reassigning a lead, changing stage or value, writing to a CRM, and calendar changes are also locked to `suggest` for now, as listed in the product brief.
- `approvalItems`: leadId, personId, actionKey, channel (optional), status, proposedBy (`agent | person` plus id), reasonCode and reason parameters (ids and numbers only, rendered into plain words by the screen), currentDraftVersion, approverMemberId, expiresAt, notBefore (when it may go out), createdAt, resolvedAt, resolvedBy, blockedReason, idempotencyKey. At most one open item per lead and purpose.
- Statuses: `waiting`, `scheduled`, `approved`, `sent`, `skipped`, `expired`, `blocked`, `undone`.
- `approvalDrafts`: itemId, version, subject (optional), body, createdBy, createdAt. A separate table with tighter access. An edit adds a version and keeps the original. Message text never goes into logs, the audit log, or events.
- `gateChecks`: itemId, at, phase (`approve | send`), results as a list of check code and pass or fail. Codes only.
- `sendAttempts`: itemId, at, adapter, result, idempotencyKey.
- `workspaceControls`: paused, pausedBy, reason, changedAt. `platformControls`: halted, haltedBy, reason (staff only).
- `actionCaps` and `capCounters`: per-action daily caps per workspace, with a counter per day.
- `trustCounters`: actionKey, approvedCount, editedCount, skippedCount, undoneCount, window, and a `steppedDown` flag. Data only in this step. Screens for it come later.
- `workspaceSettings` additions: frequency limits per lead (defaults: no more than 1 message in 24 hours and 4 in 7 days; an Owner may tighten but never loosen past a platform ceiling), and a confirmed workspace time zone.

============================================================
THE FLOW
============================================================

1. An item is created `waiting` with a draft and a reason. (In this step: only by the development seeding function.)
2. A person with the right role opens it in Decisions and chooses Approve, Edit, or Skip.
   - **Rep:** only items on their own leads. **Manager and Owner:** any item. **Staff:** never, even with an access grant.
   - **Edit** creates a new draft version and keeps the original. The edited version is what gets checked and sent.
   - **Skip** requires a short reason code and is counted.
3. **Approve** runs the checks (phase `approve`). If they pass, the item becomes `approved` and a short undo window opens (default 10 seconds), shown to the person.
4. After the undo window, a scheduled internal function runs the checks again (phase `send`) and, only if they all pass, calls the sender interface. If quiet hours apply, the item becomes `scheduled` for the next window and shows "Will send at 8:00 AM" so the person can approve in advance.
5. The sender is an interface with a no-op adapter that records a simulated `sendAttempt` and nothing else. Real adapters arrive in later steps and are registered only through the gate.

============================================================
THE CHECKS
============================================================

Run at approve time and again at send time. Each has a code, a plain-words message, and a result of `block` (stop, with a reason), `hold` (wait until it clears), or `pass`.

| Check | Behavior |
|---|---|
| Opt-out and do-not-contact | `block`. Always, immediately, even mid-wait. |
| Consent for the channel | `block` when consent for that channel is not `granted`. |
| Quiet hours | `hold` outside 8 am to 8 pm in the lead's local time. Locked, not a setting. Time zone comes from the person, then the phone area code if present, then the workspace zone, and the item shows which it used. Must be correct across daylight saving. |
| Frequency limits | `block` when the lead would exceed the limits. |
| Lead replied since the draft | `block`, and flag it for a person. |
| Expiry | `block` once `expiresAt` has passed. |
| Approver allowed | `block` if the approver's role or scope no longer allows it. |
| Workspace paused or platform halted | `block`. |
| Connection health | `hold` when the channel's connection is unhealthy. Provided through an interface that returns healthy for now and can be set in tests. |
| Billing state | `block` when billing is not in good standing. Same interface approach. |
| Daily cap | `hold` until the next day, and the Owner is told once. |

Opt-outs and quiet hours are checked at every step, and again at send time. A blocked item always says why, in plain words, and who can fix it.

============================================================
SCREENS
============================================================

- **Decisions (the center of the app, now real):** the queue of waiting items for the viewer (a Rep sees their own, Manager and Owner see all), ordered by urgency. Each item shows the lead, the plain-words reason, the draft, a checks line ("Can be sent now" or "Will send at 8:00 AM" or the block reason), and Approve, Edit, and Skip. A full-screen "review next" flow for working through the queue, and the empty state from Step 1 when there is nothing waiting. Phone-friendly with large touch targets.
- **Actions (Owner):** every action in the registry with its tier and policy. `suggest` and `auto` toggles for internal actions that allow it. Reach-person actions and the locked internal actions are shown as locked with the reason.
- **Controls (Owner and staff):** pause and resume the workspace, caps, and frequency settings. A platform halt switch on the staff surface.
- Replace the Step 1 empty states for these pages. Calm, quiet, plain words.

============================================================
RULES (NON-NEGOTIABLE)
============================================================

1. **One path to a send.** The sender interface is imported by the gate module and nowhere else. A guard test fails the build if any other file imports it.
2. **Reach-person actions are always gated.** No setting, role, flag, or code path makes them automatic. This is enforced in the mutation, in the policy reader, and by a test.
3. **No agent or person can approve their own proposal on someone else's lead.** A Rep approves only their own leads.
4. **Idempotency.** Approving twice, or two approvers at once, sends at most one. Convex transactions make this possible, so rely on them and test it.
5. **Edits keep the original.** Versions are never overwritten.
6. **No text in logs.** Drafts, notes, and message text never appear in the audit log, `gateChecks`, `events`, or any log line.
7. **Everything audited.** Approve, edit, skip, undo, block, policy change, pause, and halt are logged with who and when.
8. **Staff cannot approve** any message to a lead, with or without a grant.

============================================================
STEP 0: PLAN FIRST (NO CODE YET)
============================================================

Reply with:
1. The action registry as a typed list, with each action's tier, default policy, and rechecks.
2. The schema with validators and indexes.
3. The state machine for an item, drawn as a table of status, event, and next status, including the undo window.
4. How each check is implemented, especially quiet hours across time zones and daylight saving.
5. How scheduled execution works, how it is made idempotent, and how a failure is retried safely.
6. How the sender interface is isolated and how the guard test proves only the gate reaches it.
7. How the connection-health and billing interfaces work and how tests control them.
8. How the Decisions queue is paginated and ordered.
9. Every question or assumption for me to confirm.

Wait for my approval before writing code.

============================================================
THEN BUILD, IN THIS ORDER
============================================================

1. Schema, the action registry, policies, and the policy locks with their tests.
2. The checks, one by one, each with tests.
3. The item state machine, approve, edit, skip, and undo.
4. Scheduled send-time execution and the no-op sender, with the guard test.
5. Controls: pause, halt, caps, frequency limits.
6. Trust counters as data.
7. The Decisions, Actions, and Controls screens.
8. The development seeding function, phone and accessibility pass.

After each numbered part, stop and report: what changed, what you tested, and the exact commands to run it.

============================================================
ACCEPTANCE TESTS (ALL MUST PASS)
============================================================

1. A `reachesPerson` action cannot be set to `auto` by any role, by calling the mutation directly, or by editing data through any public function.
2. Only the gate imports the sender. A file that imports it elsewhere fails the guard test.
3. A Rep approves only items on their own leads. A Manager and an Owner approve any. Staff cannot approve, even with a grant.
4. A lead who opts out between approve and send is not sent to. The item becomes `blocked` with the reason.
5. A reply from the lead before approval blocks the send and flags a person.
6. Quiet hours are correct for leads in at least three time zones, including a daylight saving change, and an item approved at night shows "Will send at 8:00 AM" and goes out only then.
7. Frequency limits block the second message inside the window.
8. An expired item cannot be approved.
9. A paused workspace and a halted platform block all approvals and sends.
10. A daily cap holds items until the next day and tells the Owner once.
11. Approving twice, and two approvers at once, produce one send attempt.
12. An edit creates a new version, keeps the original, and the edited text is what gets sent.
13. Undo within the window cancels the send. After the window it cannot.
14. Draft text never appears in the audit log, `gateChecks`, `events`, or any log line.
15. Every approve, edit, skip, undo, block, policy change, pause, and halt is in the audit log with who and when.
16. The Step 1 and Step 2 guard tests still pass.
17. Phone, tablet, and desktop with no horizontal scroll, keyboard only, and screen reader labels.

============================================================
DO NOT
============================================================

- Do not build real drafting, real sending, or any connector.
- Do not add any setting that loosens a locked rule.
- Do not change the Step 1 access layer or the Step 2 `canSeeLead` helper without telling me.
- Do not add libraries without telling me their size and license.
- No em-dashes in any copy. Plain words, no jargon.

============================================================
DEFINITION OF DONE
============================================================

All seventeen tests pass and are reported one by one with the command and the result. List anything you were unsure about, anything you left out on purpose, and the dependencies you added with size and license.

============================================================
HOW I WILL REVIEW
============================================================

I will run the tests, read every check and the state machine, try to approve as every role, try to reach the sender from other code, change a clock across a daylight saving boundary, opt a lead out mid-flight, and check the shell at three widths. Anything that fails goes back to you before Step 4 starts.
