# Sales Workflows: foundation (Prompt 25, build step 2, data and rules layer)

## What this change is

The engine under Sales Workflows, with no screens yet. A workflow is the graph
form of a playbook step plan. The graph is stored once, in
`playbook_versions.graph`. The canvas and the list view are both read from it,
so they cannot disagree.

## Decisions taken

- Prompt 16 (Playbook Studio) is not built. This change adds only the storage
  Workflows needs (`playbooks`, `playbook_versions`) and does not build
  snippets, talk tracks or seeded playbooks. Those arrive with Prompt 16 and
  fill the `contentRef` slots the draft box already has.
- Stage history is added as a record only. It is not backfilled and nothing
  fires from it.
- The old follow-up sequence engine keeps running. It is the only follow-up
  path today and already holds the 8 pm to 8 am floor. It is migrated once
  workflows can send through Relay.
- The per-workspace switch is a `workspace_flags` row with flag `workflows`, switched by Vistrial staff and logged, the same way as the agent sidebar.

## What is here

- `src/lib/workflows/types.ts`: the eight box types and their settings.
- `checker.ts`: the deterministic checker (one Start, every path reaches an End,
  counted loops only, both Check exits, Draft content and channel, no back to
  back messages, 24 hour spacing, deleted references, box limit).
- `outline.ts`: the list view, one sentence per row for screen readers.
- `edit.ts`: insert, remove, update, move up and down, on the graph.
- `layout.ts`: automatic layout for Tidy up, left to right or top to bottom.
- Migration `20261022020000_workflows_foundation.sql` with a rollback and
  `supabase/tests/verify-workflows.sql`.

## Checks run

- 17 unit tests for the checker, outline parity after 200 random edits, and layout.
- Migration applied, rolled back and re-applied on a local Postgres. Checks cover
  stage history, the 40 box limit, frozen published versions, the 12 published
  limit, one live enrollment per workflow, two per lead, and role access
  (owner reads, a setter reads nothing, a browser session cannot publish or
  write enrollments).
- The local database has no pgvector, so the earlier Scribe migrations did not
  apply there. Workflows tables do not depend on them.
- `vitest` has 16 failing tests in six files (navigation, plain-language,
  portal-access, auth email templates, execution) that fail the same way
  without this change.

## Read-only pages (this slice)

- `/app/workflows` lists workflows as cards. `/app/workflows/[id]` shows the
  steps as an indented list (the same form the phone and screen readers use)
  and the checker's messages. Both return not found unless the workspace has
  the `workflows` flag on, and only owners (and staff) can open them.
- A Workflows button appears on the Sales page when the flag is on. It is not in
  the sidebar yet: the Prompt 24 registry holds one work page per area, and
  adding a second means changing the registry shape and its seed test. That is
  its own change.
- Staff open these pages through their own session, and the data policies let
  only owners and admins read, so staff see an empty list until a staff read
  path is added.

## Build step 3: Design mode (canvas, outline, settings, test run)

- AI Elements workflow pieces (canvas, node, edge, connection, controls, panel,
  toolbar) are installed in `src/components/ai-elements` through the shadcn
  installer from the AI Elements registry, on `@xyflow/react` 12.12 (MIT). The
  shadcn/ui rebuild of AI Elements did not carry these pieces over, so the
  copied code is ours to keep. The animated edge with a moving dot is replaced by
  a still, labeled edge. The library attribution is hidden because the interface
  names no other company.
- `src/components/workflows/workflow-editor.tsx` holds the graph in an undo
  history. The canvas (`toFlow` in `src/lib/workflows/flow.ts`) and the outline
  (`toOutline`) are both drawn from it. Box positions a person drags are view
  state only; Tidy up returns to `autoLayout`, which keeps the longest branch on
  one row and drops side branches (a draft's Expired line always) below it.
- Desktop and tablet edit on the canvas: select a box, add a box after any exit
  from its toolbar, drag between exits to reconnect (a line back to an earlier
  box becomes a counted loop that runs once), Delete removes. A phone edits in
  the outline (Edit, Move up, Move down, Add on each exit, Remove) and reads a
  top to bottom diagram.
- Settings are plain fields per box type with a preview line from a test run
  steered to that box (`choicesToReach`), and the checker's messages for it.
  Quiet hours are shown on every draft and cannot be changed.
- Test with a sample lead (`simulateWorkflow`) walks a labeled fake lead through
  the graph in its own time zone, holds drafts out of 8 pm to 8 am, asks at each
  Check through the Agent Elements question prompt, and lists what a real run
  would make. It runs in the browser on the graph alone and creates nothing.
  When a counted loop has run its maximum, the lead leaves as Stopped.
- The publish checklist is the checker's errors on the Agent Elements to-do card.
- Autosave writes only a draft version (`saveDraftGraph`), after
  `parseWorkflowGraph` refuses any box or setting outside the list. It updates
  the open draft or proposal, or starts a new draft after the published one, and
  stops when a version is waiting for the owner to confirm it.
- `/preview/workflows` (development only) shows the editor on three proposed
  starting workflows against a labeled fake playbook (`src/lib/workflows/samples.ts`).

## Not built yet

Publish and enrollment runner, lead strip, live counts, Compass drafting, roles
beyond the data layer, the "Where leads go" report, and sequence migration.
