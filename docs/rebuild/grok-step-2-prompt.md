GROK PROMPT: VISTRIAL REBUILD, STEP 2 (THE DATA SPINE), ALL ON CONVEX

Paste everything below into Grok. Attach `00-product-brief-and-step-1-spec.md` with it. Step 1 must be built and reviewed first.

============================================================
YOUR ROLE
============================================================

You are building Step 2 of the Vistrial rebuild. Step 1 gave us workspaces, roles, the access layer, the audit log, the staff path, and the empty shell. Step 2 adds the data spine: one normalized model that every connection and agent will read and write later.

Read the existing Step 1 code first. Reuse the access layer exactly as it is. Do not weaken it, bypass it, or change its behavior without telling me first. Every public function you add goes through its builders, and the guard test must keep passing.

Build exactly what Step 2 asks for and nothing else. If something is unclear, list it as a question in your plan and wait.

============================================================
WHAT STEP 2 IS (AND IS NOT)
============================================================

Is: the tables, rules, screens, and tests for people, leads, conversations, calls, bookings, tasks, notes, and a lead timeline, plus manual entry, CSV import, identity matching, and reversible merges.

Is not: any connector (Nylas, GoHighLevel, transcripts), any agent, any scoring, any drafting, any sending, any approval logic. Those come later. Data enters only by hand and by CSV in this step, which is enough to prove the model.

Convex rules still apply: read the current Convex docs before writing schema or functions, use validators everywhere, index every read, no unbounded `collect()`, paginate lists, keep functions small and deterministic, put long work in scheduled internal functions and batches, and call outside services only from actions (none in this step).

============================================================
THE MODEL
============================================================

Every table below has `workspaceId` and an index that starts with it. Names are guidance. Propose better ones in your plan if you have a reason.

**People and identities**
- `people`: displayName, firstName, lastName, timezone (IANA, optional), consent per channel (`email`, `text`, `call`, each `unknown | granted | revoked` with a changed-at and a source), `doNotContact` (boolean), optedOutAt, createdFromSource, mergedIntoPersonId (optional).
- `identities`: personId, kind (`email | phone | crmId | calendarAttendee | other`), value (normalized), source. Indexed by workspace, kind, and value. Normalize email to lowercase and trimmed. Normalize phone to E.164. Tell me before adding a phone library, with its size and license.

**Leads and pipeline**
- `pipelineStages`: name, order, kind (`open | won | lost`), plain-words meaning. Seed a sensible default set per workspace that the Owner can edit.
- `leads` (replaces the Step 1 stub): personId, stageId, source, ownerMemberId, status (`open | won | lost | closed`), closedAt, closedReason, historic (boolean), lastActivityAt. Indexed by workspace and owner, by workspace and stage, and by workspace and status.

**Conversations, calls, bookings**
- `conversations`: leadId, channel (`email | text | call | other`), externalThreadId (optional), lastMessageAt.
- `messages`: conversationId, leadId, direction (`in | out`), channel, at, sourceRecordId, hasBody.
- `messageBodies`: messageId, text. A separate table with tighter access so message text never travels with metadata.
- `calls`: leadId, ownerMemberId, scheduledAt, occurredAt, durationSec, outcome, source. A transcript, when one exists later, is a separate `transcripts` table. Create the table now with no UI.
- `bookings`: leadId, ownerMemberId, startsAt, endsAt, status (`booked | completed | canceled | noShow`), source, externalId. A no-show is set only by a record or a person, never inferred.

**Work**
- `tasks`: leadId (optional), assignedMemberId, kind, title (short), dueAt, status, createdBy (`person | agent`), purposeKey. At most one open task per lead and purposeKey.
- `notes`: leadId, authorMemberId, body.
- `leadTimeline`: leadId, kind, refTable, refId, at, actor. Ids and kinds only, never text.

**Sources and imports**
- `sources`: key (`manual`, `csv` for now), kind, status.
- `importRuns`: source, startedBy, fileStorageId, mapping, counts, status, historic.
- `sourceRecords`: source, sourceId, kind, importRunId, historic, checksum, status. Unique per workspace, source, sourceId, and kind. Raw payloads, if kept, go to file storage.

**Merging**
- `mergeRecords`: survivorPersonId, mergedPersonId, performedBy, at, snapshot of what moved, revertedAt.
- `possibleMatches`: personAId, personBId, reason, status (`pending | dismissed | merged`).

Extend the Step 1 stub carefully: add new fields as optional first, backfill, then tighten. Show me the migration plan.

============================================================
RULES (NON-NEGOTIABLE)
============================================================

1. **Source and source id on everything imported.** Every imported record keeps where it came from.
2. **Idempotent ingest.** Re-importing the same file or the same record creates nothing new and changes nothing that did not change. Key on workspace, source, source id, and kind.
3. **Identity matching.**
   - An exact normalized email or phone match merges automatically into the existing person.
   - If an incoming record matches two different people (email on A, phone on B), do not merge. Create a possible match for a person to review.
   - Similar names alone never merge. They create a possible match.
4. **Merges are reversible.** A merge records exactly what moved so it can be undone. Undo restores the original people, identities, and links.
5. **History stays silent.** Imported history is marked `historic`. Nothing historic creates a task, an alert, a timeline "new" event, or anything an agent could act on later. Only leads created by hand or arriving live after go-live are non-historic.
6. **Consent and opt-out.** Opt-out and do-not-contact are set immediately and audited. Only an Owner or Manager can clear one, never a Rep, and clearing needs a reason.
7. **Rep scoping.** A Rep sees only leads assigned to them and everything attached to those leads (calls, bookings, tasks, notes, conversations, messages, bodies). Enforce it in the functions through one helper such as `canSeeLead`, used by every read. A Manager and an Owner see all.
8. **No text in logs.** Message bodies, notes, and transcripts never appear in the audit log, the timeline, the `events` stream, or any log line. Ids, kinds, and counts only.
9. **Everything is paginated and indexed.** No function reads a whole table.

============================================================
SCREENS
============================================================

All inside the Step 1 shell, with the Step 1 empty states replaced where there is now data:

- **Leads:** a list with filters (owner, stage, status, source), search by name, email, or phone, and pagination. A Rep sees only their own.
- **Lead Record:** header (name, owner, stage, source, status), a timeline of everything on the lead with its source shown, notes, tasks, calls and bookings, a Team section, and empty slots for Scribe facts, the Relay playbook, and Sentry alerts that later steps fill.
- **Add a lead by hand**, add a note, add a task.
- **CSV import:** upload, a field-mapping screen, a dry-run preview (how many will be created, updated, skipped, and sent to review), then run in batches with progress. Imports default to historic with a clear toggle for "these are new leads."
- **Merge review:** possible matches side by side, merge, dismiss, and undo a merge.
- **Consent and opt-out** controls on the person, visible to Owner and Manager, read-only for a Rep.

Phone, tablet, and desktop. No horizontal scroll. Keyboard operable. Calm, quiet, and plain words.

============================================================
STEP 0: PLAN FIRST (NO CODE YET)
============================================================

Reply with:
1. The final table list with validators and indexes.
2. The migration plan for the Step 1 `leads` stub.
3. The matching algorithm in plain steps, including the two-people conflict case.
4. How the merge snapshot works and how undo is proven correct.
5. How CSV import is processed in batches within Convex limits, and how dry-run works without writing.
6. How `canSeeLead` is applied so no read path can skip it, and how the guard test is extended to prove it.
7. The performance plan for a workspace with 20,000 leads and 100,000 messages.
8. Every question or assumption for me to confirm.

Wait for my approval before writing code.

============================================================
THEN BUILD, IN THIS ORDER
============================================================

1. Schema, migration of the stub, seed data (a large fake workspace for performance tests, clearly labeled).
2. People, identities, matching, and merges with their tests.
3. Leads, pipeline stages, and the Rep scoping helper with its tests.
4. Conversations, messages, bodies, calls, bookings, tasks, notes, and the timeline.
5. CSV import end to end, including dry-run and idempotency.
6. The screens, one at a time.
7. Performance, phone and accessibility pass.

After each numbered part, stop and report: what changed, what you tested, and the exact commands to run it.

============================================================
ACCEPTANCE TESTS (ALL MUST PASS)
============================================================

1. Re-importing the same CSV twice creates no new rows and changes nothing.
2. The same person arriving from two sources with the same email becomes one person with two identities.
3. A record matching two different people creates a possible match and merges nothing.
4. A merge can be undone and every moved record returns to where it was.
5. A historic import creates no tasks, no timeline "new lead" events, and nothing an agent could act on.
6. A Rep cannot read another Rep's lead, call, booking, task, note, conversation, message, or message body, through any function. Tested by calling every public function.
7. A user in workspace A cannot read or write workspace B's records through any function.
8. A Rep cannot clear an opt-out. A Manager can, with a reason, and it is audited.
9. Message bodies and notes never appear in the audit log, timeline, events, or any log line.
10. A no-show is never created without a record or a person doing it.
11. The first page of the Leads list loads quickly on the 20,000-lead workspace, and pagination works to the end. Report measured numbers.
12. The Step 1 guard test still passes, extended to require `canSeeLead` on lead-scoped reads.
13. Phone, tablet, and desktop with no horizontal scroll, keyboard only, and screen reader labels.

============================================================
DO NOT
============================================================

- Do not build any connector, agent, scoring, drafting, or sending.
- Do not change the Step 1 access layer without telling me.
- Do not infer anything (no-shows, intent, tier) from data.
- Do not add libraries without telling me their size and license.
- No em-dashes in any copy. Plain words, no jargon.

============================================================
DEFINITION OF DONE
============================================================

All thirteen tests pass and are reported one by one with the command and the result. List anything you were unsure about, anything you left out on purpose, and the dependencies you added with size and license.

============================================================
HOW I WILL REVIEW
============================================================

I will run the tests, read the matching and merge code, try to read other reps' and other workspaces' data as each role, import the same file twice, merge and undo, and check the shell at three widths. Anything that fails goes back to you before Step 3 starts.
