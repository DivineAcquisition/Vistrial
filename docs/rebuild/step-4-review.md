# Step 4 review: the shared agent runtime (commit 5d8eb28 on main)

Reviewed 2026-10-27 against `grok-step-4-agent-runtime-prompt.md` and the plan answers (caps, gating, durable steps).

On main the 88 tests pass and typecheck is clean. The pieces that are right: the side effect and its step marker are written in one mutation with an idempotency key, the dev skill is gated by `ALLOW_DEV_SKILLS`, caps have a platform ceiling, there is a fake provider, and only Owner and Manager can approve or confirm.

Step 4 does not pass review yet. Every item marked **Confirmed** below was reproduced with a throwaway test against main. Fix them before Step 5.

## Must fix

1. **Model steps ignore pause and halt.** Confirmed: with the workspace paused, `commitModel` still records the step and returns `running`. `commitTool` checks the controls but `commitModel` does not. Pause and halt also cancel only the first 50 open runs of each status (`take(50)`), and anything past that keeps running. Fix: check the controls in `commitModel` and in `plan` before the model is called. Make cancellation cover every open run (page through in batches, or have each step refuse to run while paused or halted).

2. **Money spent past the cap goes unrecorded.** Confirmed: a run already at its 25-cent cap makes a 7-cent model call, and afterwards the day counter is empty and the run still shows 25 cents. The model is called first, and `commitModel` throws the cost away when the run was already over its cap. Fix: check the caps in `plan` before the model call. Then always record the real cost of any call that happened, and stop the run after recording it.

3. **The run list hides new runs.** Confirmed: after 21 runs, `runs.list` returns 20 rows and the newest is missing. It takes the first 20 from the index in ascending order and sorts them afterwards. Fix: `.order("desc")` and paginate.

4. **Agents can read an old profile.** `profile.get`, `saveDraft` and `profile.read` read `take(20)` or `take(10)` in ascending order and then sort. After enough versions, agents read an old confirmed profile and `saveDraft` can reuse a version number. Earlier confirmed versions also stay `confirmed`. Fix: index on `[workspaceId, version]` (and status), read with `.order("desc")`, and mark the previous confirmed version as superseded when a new one is confirmed.

5. **Evidence can be faked.** Confirmed: a run with no confirmed profile completes, and its claim is saved with `sourceId: "none"`. The validator only checks that the field exists. Fix: `profile.read` must fail the run with a plain reason when no profile is confirmed. The validator must check that the source record exists in the same workspace, or that the claim is marked computed.

6. **Editing an approved asset keeps it approved.** Confirmed: after approval, a Manager adds a version, and the asset still reads `approved` with the new body. Fix: approval belongs to a version. A new version sets the asset back to `draft`, or records which version was approved and shows the newer one as waiting.

7. **Runs only move while a browser keeps calling them.** `advance` is a public action that the page has to call over and over. If the tab closes, the run sits in `queued` or `running` and the time cap is never checked. Fix: `start` schedules an internal action (`ctx.scheduler.runAfter(0, ...)`), and each step schedules the next. Add a scheduled sweep that stops runs past `maxDurationMs`. Make `advance` internal.

8. **A missing route silently uses the fake model in production.** When there is no `modelRoutes` row, `plan` falls back to the fake provider and the run "completes" with the text "ok". Fix: in production, a missing route fails the run with a plain reason. The fake provider is allowed only in tests and with the dev flag.

9. **Claude cost is invented.** `ceil(tokens / 1000)` cents is not a price. Fix: a price table per model (input and output price per million tokens), and record cost from it. Also: `max_tokens: 32` is too small for real work and should come from the work kind. The fallback route is never used. Errors should map to result codes.

10. **Any staff member can change model routes.** `platform.setRoute` uses `staffMutation`, so the Service Team can change routes. The brief says Platform Admin only. Validate `workKind` against `WORK_KINDS` and the provider against a known list.

## Decide

11. **Who starts runs.** Confirmed: a Rep can start and advance a run. Step 5 says Owner and Manager start runs. Recommendation: Owner and Manager only, checked in `start`.

12. **Raw artifacts in the run query.** `runs.get` returns every artifact `body` inline, including model output and the injection fixture, to every member. Recommendation: return metadata only, and load a body through a separate function that checks access, as the 4B run viewer prompt says.

13. **Old tables.** `businessProfiles`, `approvalAssets`, `swipeEntries` and `libraryAcceptances` are still in the schema with no code using them. Drop them, or say which Step 5 will reuse.

## Tests to add

- Each fix above gets a test that fails before the fix. The six probes used in this review are a good start.
- A run left alone after `start` finishes or stops by itself (scheduler).
- Isolation for `runSteps`, `runArtifacts`, `assetVersions` and `evidence` through every public function, not only `profile.get`, `runs.list` and `assets.get`.

## Not yet reviewed

The screens (profile editor, run page, assets, controls), and the phone and accessibility pass.

## Status (2026-10-27)

Fixed directly on `claude/visual-sales-workflows-c6aw7j`, each with a test that failed before the fix:

| # | Fix |
|---|---|
| 1 | Pause and halt are checked before every step and again after a model call returns. A call that lands during a pause is counted, then the run stops. |
| 2 | Caps are checked before the model call. The real cost of any call that happened is always recorded. |
| 3 | `runs.list` reads newest first. |
| 4 | Profile reads use the version index, newest first. `profile.read` takes the newest confirmed version. |
| 5 | `profile.read` fails the run (`no_confirmed_profile`) when nothing is confirmed. A cited source must be a real profile, example, or artifact record in the same workspace. |
| 6 | A new version of an approved asset sets it back to `draft`. |
| 7 | `start` schedules the steps on the server, and each step schedules the next. A time-cap stop is scheduled at start. The public `advance` action is gone, and the screens no longer drive runs. |
| 8 | A missing route fails the run (`no_route`) unless dev skills are on. |
| 9 | Claude calls go through `@anthropic-ai/sdk` with a price table per model. An unpriced model cannot run. Output room is set per kind of work, the fallback route takes over on retryable failures and refusals, and errors become result codes. |
| 10 | Only a Platform Admin can change routes. Kind of work and provider are validated. |
| 11 | Only an Owner or Manager can start a run. |
| 12 | `runs.get` returns artifact metadata. Bodies load one at a time through `runs.artifact`. |
| Lint | `profile-editor.tsx` seeds its form from props, so no state is set inside an effect. |

Platform ceiling added: at most 200 steps and 1 hour per run.

Still open: item 13 (the four unused tables), refusal billing (a refused call that was billed is not counted yet), and the screen and accessibility review.
