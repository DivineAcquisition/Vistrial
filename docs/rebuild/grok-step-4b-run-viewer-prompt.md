GROK PROMPT: VISTRIAL REBUILD, STEP 4B (THE RUN VIEWER), ALL ON CONVEX

Paste everything below into Grok. Attach `v2-brief-agents-and-areas.md` and `agentic-ui-research.md` with it. Step 4 (runtime, runs, steps, artifacts, assets) must be built and reviewed first. Step 5 adds source status later, so leave room for it.

============================================================
YOUR ROLE
============================================================

You are building the run viewer: the screen where a person watches an agent work, sees what it cost, sees why it stopped, and opens what it made. It is the main trust surface of the product.

Read the existing Step 1 and Step 4 code first. Reuse the access builders, the run, step, artifact and asset tables, and the guard tests exactly as they are. Do not change them without telling me. Every public function goes through the builders.

Build exactly what Step 4B asks for and nothing else. If something is unclear, list it as a question in your plan and wait.

Read the current Convex docs and the Next.js docs in `node_modules/next/dist/docs/` first. This Next.js version differs from older ones.

============================================================
WHAT STEP 4B IS (AND IS NOT)
============================================================

Is: a run list, a live run viewer, the view types that feed it, a small set of run components, and a story page that shows every state with fake data.

Is not: chat, a prompt box, a model picker, any new agent logic, any change to how runs execute, any publishing. Do not add assistant-ui, the Vercel AI SDK, or any chat library. Runs are Convex records, and the screen reads them with live queries.

============================================================
THE APPROACH (FIXED)
============================================================

1. **View types first.** Define the types the screen needs, built from Convex data by one mapping function per type: `RunView`, `RunStepView`, `RunArtifactView`, `SourceStatusView` (empty until Step 5, but typed now), `CostView`, `StopReasonView`. Components take these props only. Components never import from Convex.
2. **Components are pure and presentational.** A container component reads Convex live queries, maps to view types, and passes props down. The same components render the story page with fake data.
3. **Copy from the existing base.** The earlier Agent Elements install (git commit 4bb3712: `tool-row-base`, `generic-tool`, `todo-tool`, `text-shimmer`, `agent-ui.css`) is the starting point for step rows. You may take small pieces from the 21st.dev catalog listed in `agentic-ui-research.md`. For each one you take: tell me its license and dependencies first, replace Radix imports with the repo's Base UI wrappers in `src/components/ui`, delete demo data and fake timers, and map its colors to the theme tokens.
4. **No new animation library.** `motion` is already installed. Shimmer and pulsing stop in calm mode and with `prefers-reduced-motion`.

============================================================
THE SCREENS
============================================================

**Run list (per agent page and a Runs page)**
- Rows: skill name, status badge, who started it, when, cost, stop reason if any.
- Filters: status, skill, started by, date range. Paginated, newest first. Indexed reads only, no unbounded `collect()`.
- Empty state in plain words: "No runs yet."

**Run viewer (one run)**
Sections from top to bottom:
1. **Header:** skill name, status, started by and when, elapsed time (live while running), total cost, and the controls below.
2. **Summary line** in plain words, built from codes and numbers only (never model text). Example: "Stopped at the cost limit after 14 steps. Saved what it had."
3. **Cost and limits:** cost so far against the per-run cap, with a marker for the soft warning and a different marker for the hard stop. Today's use against the daily cap. Tokens in and out.
4. **Steps:** an ordered list. Each step shows an icon by kind (tool, model, note), a plain label from the tool or route registry, status, duration, tokens, cost, and a result code in plain words. The running step shows a quiet shimmer. Steps are grouped when a tool repeats (for example "Read 12 pages"), with the group expandable.
5. **Sources panel:** one row per source with `ok`, `unavailable`, `blocked` or `partial` and the reason in plain words. Built now from `SourceStatusView`, which is empty until Step 5. When empty, hide the panel.
6. **Artifacts:** what the run made or saved, with kind, size, and a link. Raw tool results and model outputs are visible only to people who can open the run, and only through a deliberate "Open" action, never inlined in the step list.
7. **Made assets:** the assets this run created, with their status (`draft` or `approved`) and a link to the asset viewer. Owner and Manager see Approve here.

**Controls**
- **Stop run:** Owner and Manager, only while `queued`, `running` or `waiting`. Asks for confirmation. Calls a Step 4 cancel mutation. If Step 4 has no cancel mutation, list it as a question in your plan, do not invent one.
- **Open asset**, **Copy link to run**.
- A Rep and any other role that can open the agent can view a run, but cannot stop it.

**Story page (development only)**
One page, reachable only in development, that renders the run viewer from fake data for every state: queued, running, waiting, completed, failed, stopped by cap, stopped by pause, stopped by halt, cancelled, a run with a blocked source, a run with zero steps, a run with 300 steps, a very long label, and narrow phone width.

============================================================
WHAT THE SCREEN MUST NEVER SHOW
============================================================

- No model text, page text, ad text or file content in a step row, the summary line, the page title, the browser tab, a toast, or any log line. Rows show ids, kinds, counts, durations, cost and result codes only.
- No raw error messages from providers. Show a plain-words message mapped from a result code, and the code itself in small type.
- No model names or provider names unless the Platform Admin is viewing. Workspace users see "Research", "Classify" and "Write" style labels.
- No words like "earned" or "converted".
- No em-dashes in copy. Plain words, no jargon.

============================================================
LIVE UPDATES
============================================================

- Use Convex live queries for the run, its steps and its artifacts. No polling.
- Steps load in pages of a fixed size, newest at the bottom, and the list stays pinned to the latest step only while the person has not scrolled up.
- Elapsed time ticks on the client from `startedAt`, and stops on `finishedAt`.
- If the connection drops, show a quiet "Reconnecting" line. Never show stale data as if it were live.
- A step row must not re-render the whole list when one step changes.

============================================================
ACCESS (NON-NEGOTIABLE)
============================================================

1. Every query goes through the Step 1 builders. Workspace A can never read workspace B's runs, steps, artifacts or assets, through any function. Add tests.
2. Roles that can open an agent can open its runs. Staff read nothing without a grant. With a grant, staff see ids, codes and counts only, the same as workspace users.
3. Artifact download goes through a function that checks the run's workspace and the person's access every time. Never return a permanent public URL.
4. The Stop control is enforced in the mutation, not only hidden in the screen.

============================================================
ACCESSIBILITY AND DEVICES
============================================================

- Phone, tablet and desktop. No horizontal scroll at 320 px. Large touch targets.
- Fully keyboard operable: step groups expand with Enter and Space, focus is visible, focus order follows reading order.
- Live changes are announced politely (for example "Step 5 finished") without spamming. Do not announce every second of the timer.
- Status is never color alone. Every status has an icon and a word.
- Respect `prefers-reduced-motion` and the app's calm mode.
- Screen reader labels on every control, step, marker and cost figure. Cost figures are read as full words (for example "42 cents").

============================================================
STEP 0: PLAN FIRST (NO CODE YET)
============================================================

Reply with:
1. The view types, with every field and which Convex table and field each comes from.
2. The component list, each with its props, which are new, and which are taken or adapted from the earlier Agent Elements install or the 21st.dev catalog.
3. For every catalog component you propose to take: its license, its dependencies and their size, and what you will replace.
4. The query design: which queries, which indexes, how pages and live updates work, and how large runs stay fast.
5. How grouped steps are computed and how they stay stable while new steps stream in.
6. The mapping from result codes and stop reasons to plain words, as a table.
7. How the Stop control is enforced and what happens if the run already finished.
8. The test plan, including how you test live updates with a fake provider and long runs.
9. Every question or assumption for me to confirm.

Wait for my approval before writing code.

============================================================
THEN BUILD, IN THIS ORDER
============================================================

1. View types, mapping functions, and their unit tests.
2. The story page with fake data and the pure components, one state at a time.
3. The run list with filters and pagination.
4. The run viewer container with live queries.
5. Cost and limits, sources panel, artifacts, made assets.
6. The Stop control and its server-side enforcement.
7. Phone, keyboard and screen reader pass.

After each numbered part, stop and report: what changed, what you tested, and the exact commands to run it.

============================================================
ACCEPTANCE TESTS (ALL MUST PASS)
============================================================

1. The story page renders every listed state with no errors and no horizontal scroll at 320 px.
2. A run in progress updates live as steps are added, without a reload and without re-rendering unchanged rows.
3. A completed, failed, capped, paused, halted and cancelled run each show the correct status, stop reason in plain words, and saved-work message.
4. The cost bar shows the soft warning and the hard stop as different markers, and the figures match `agentRuns.costCents`.
5. A run with 300 steps stays responsive and loads in pages.
6. The summary line, step rows, tab title and toasts contain no model text, page text or file content. A test feeds a run whose artifacts contain such text and checks the rendered output.
7. A Rep and a Manager can open a run. Only an Owner and a Manager can stop one. A Rep and staff without a grant cannot, enforced in the mutation.
8. A user in workspace A cannot read workspace B's runs, steps, artifacts or assets, through any function.
9. Artifact download checks access every time and returns no permanent public link.
10. Stopping a run that already finished does nothing and says so.
11. A dropped connection shows "Reconnecting" and not stale data as live.
12. Keyboard only works for every control, status is never color alone, and live changes are announced politely.
13. Calm mode and reduced motion stop all shimmer and pulsing.
14. The Step 1 and Step 4 guard tests still pass.

============================================================
DO NOT
============================================================

- Do not add assistant-ui, the Vercel AI SDK, or any chat library.
- Do not add a library or copy a catalog component without telling me its size and license first.
- Do not change how runs execute, the Step 1 access layer, or the Step 4 tables without telling me.
- Do not build a prompt box, a model picker, or anything that starts a run (starting runs belongs to each skill's own screen).
- No em-dashes in any copy. Plain words, no jargon.

============================================================
DEFINITION OF DONE
============================================================

All fourteen tests pass and are reported one by one with the command and the result. List anything you were unsure about, anything you left out on purpose, every catalog component you took with its license, and every dependency you added with size and license.

============================================================
HOW I WILL REVIEW
============================================================

I will run the tests, open the story page at three widths, run the fake provider to watch a live run, hit the caps, stop a run as each role, read another workspace's run, put injection text in an artifact and look for it in the rendered page, and use the screen with a keyboard only. Anything that fails goes back to you before Step 5 starts.
