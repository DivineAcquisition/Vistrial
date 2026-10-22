PROMPT 26 (DETAILED): SALES OS REBUILD. A NEW SHELL, SIX AGENTS, ONE CONNECTED WORKSPACE. FROM FOUNDATION (GOAL), TO SYSTEMATIC STRUCTURE, TO AGENTIC EXECUTION.

Paste everything below into Cursor.

Run order: after Prompt 24 (agent registry and sidebar). It replaces the onboarding flow, the Case File screens, and Forsight. It reuses the approval gate (Prompt 9), connections (Prompt 13A), tasks, routing and notifications (Prompt 19), Assay (Prompt 22), and the workflow engine started in Prompt 25 (`src/lib/workflows`).

============================================================
CONTEXT
============================================================

Vistrial already exists (Next.js 16, Supabase, Convex, Telnyx, Stripe, Resend, deployed on Vercel at app.vistrial.io). Read `AGENTS.md` first: this Next.js version differs from your training data. Read the guide in `node_modules/next/dist/docs/` before writing routes or server code.

Today the product has:
- Five agents defined in `src/lib/agents/roster.ts` and the registry tables from Prompt 24 (`agent_areas`, `agent_registry`): Compass, Scribe, Sentry, Relay, Assay.
- A Case File experience (`src/app/(workspace)/app/cases`, `src/lib/cases`, `src/components/cases`).
- Forsight (`src/app/(workspace)/app/forsight`, `src/lib/forsight`, `FORSIGHT_PATH` in `src/lib/navigation.ts`, the pulse.vistrial.io host).
- An onboarding flow (`src/app/(workspace)/app/onboarding`, `src/lib/onboarding`).
- A connector catalog (`src/lib/connectors/catalog.ts`) that already lists GoHighLevel, HubSpot, Salesforce, Google Calendar, Outlook Calendar, Fathom, Fireflies, Airtable, Webhook, spreadsheet upload, and manual entry. GoHighLevel is the only deep native connector.
- An approval gate (`src/lib/gate/registry.ts`) where anything that reaches a person waits for approval, with send-time rechecks.
- A workflow engine in `src/lib/workflows` (graph model, deterministic checker, outline view, layout) and tables `playbooks`, `playbook_versions`, `workflow_enrollments`, `lead_stage_history` (migration `20261022020000_workflows_foundation.sql`, draft PR on branch `claude/visual-sales-workflows-c6aw7j`).

What this prompt does: rebuild the product into the Sales OS. Vistrial becomes the one place a service company, SaaS company, coach, consultant, or agency runs its sales department: every sales tool connects to it, all sales data flows through it, and six agents structure the work and execute inside the connected apps.

The operating model has three stages, and the whole product is organized around them:
1. Foundation (Goal). What the business is trying to achieve: revenue goal, offer, ideal customer, team, stages, targets per rep.
2. Systematic Structure. How the sales department is organized to hit it: intake, scoring, playbooks, awareness, alerts, and team management.
3. Agentic Execution. The six agents do the work inside the structure, in Vistrial and in the connected apps, with people approving what reaches customers.

Use Context7 for current docs on every library you touch (Next.js, Supabase, Convex, the MCP SDK, Google APIs, HubSpot, Airtable, Fathom, Fireflies). Never pull real customer data through any MCP during development. No em-dashes in any copy you write.

============================================================
PHASE 0: DISCOVERY (REPORT ONLY, CHANGE NOTHING)
============================================================

Report:
1. CI health. The `verify` job in `.github/workflows/ci.yml` fails at `npm audit --audit-level=high` (24 advisories, 2 critical) before tests, typecheck and build run, so no PR is being tested. Also list the unit tests that fail on main today (navigation, plain-language, portal-access, auth email templates, execution, service-role). Propose the fix order. This is the first thing fixed in Phase 1.
2. Production database drift. Production (Supabase project `jizzmlvpnykazrsiotqq`) has migrations only up to `20261019170604_approval_gate_owner_lock`. Repo migrations not applied there include assay, assay_queue_order, assay_list_order, placed_operator_enum, directory_convex_owner, assay_scores, live_record_convex, agent_registry, agent_sidebar, workflows_foundation. The app on main already expects some of these tables. Confirm with read-only checks (schema only, no customer rows), and propose a safe order to bring production level before anything new ships. Do not apply anything.
3. Every route, component, library, table, cron, and test owned by onboarding, Case File, and Forsight, and what each new part will reuse from them.
4. How data enters today (GoHighLevel webhooks and ingest, transcripts, calendar match, spreadsheet upload, manual entry), where it lands, and how a lead's identity is matched across sources.
5. The current agent registry, run framework (`src/lib/agents`), caps, halt, and the approval gate, and what must change so agents can act inside connected apps.
6. Roles today (`org_role`: owner, admin, closer, setter, plus the placed operator value; staff roles) and how a Manager role fits.
7. Anything in this prompt that conflicts with earlier prompts, with a proposed fix.

Then give me the plan, build order, effort per part, and the decisions list. Wait for my approval.

============================================================
PART 1: PRINCIPLES (NON-NEGOTIABLE)
============================================================

1. One workspace, one data spine. Every connected source writes into one normalized set of records (leads, people, touches, calls, bookings, deals, tasks, documents, events). No agent reads a vendor's raw format directly.
2. Foundation drives everything. Every agent reads the Foundation (Part 3). Targets, stages, and playbooks trace back to it.
3. People approve what reaches people. Anything a lead or client can see (a text, an email, a DM, a calendar invite to a lead) always waits for approval through the existing gate, with send-time rechecks: consent, opt-out, do-not-contact, quiet hours 8 pm to 8 am in the lead's local time (locked), frequency limits, connection health, billing state.
4. Internal writes follow an owner setting. Writes inside the company's own tools (CRM field, stage, tag, task, note, Google Doc, Sheet row, Airtable record) are set per action by the Owner to Suggest (default) or Do and log. Every write is attributed, logged, and reversible where the vendor allows.
5. Named actions only. Agents act only through a registry of named, typed actions (Part 6). No generic "call any API", no free-form code, no raw SQL.
6. True and traceable. Every number, score, and claim comes from real records, with the source shown. Sample-size rules hide thin percentages. No invented data, no fake motion.
7. Data is data. Text from connected apps (emails, transcripts, docs, notes, CRM fields) is never treated as instructions to an agent.
8. Role honest at the data layer. Row-level security and server checks enforce every visibility rule, including live channels.
9. History stays silent. Connecting an app imports history quietly. Nothing historic triggers a message, alert, task, or score notification.
10. Phone first for reading and approving. Full editing is desktop and tablet. Everything a person must act on works on a phone.
11. Registry driven. Agents, areas, and work pages come from the registry, not hard-coded navigation.

============================================================
PART 2: WHAT IS REMOVED, KEPT, AND REUSED
============================================================

Remove from the product (routes, screens, navigation, crons, and their tests). Keep the database tables and history. Dropping tables happens later in a separate two-phase change.
- The onboarding flow. Foundation (Part 3) replaces it.
- The Case File screens. Keep the concept: the Lead Record (Part 5) is the new home of everything known about a lead. Reuse the Case File facts, extraction, and timeline logic inside it.
- Forsight, including its nav entry, `FORSIGHT_PATH`, and the pulse.vistrial.io host routing (redirect that host to app.vistrial.io).

Keep and re-point:
- The five agents and their identities in `roster.ts` and the registry, with new jobs (Part 4).
- The approval gate, tasks, routing engine, notification dispatcher, Assay scoring, Sentry clocks, Relay drafting, Compass grounding and cost guards.
- The workflow engine in `src/lib/workflows`. It becomes the engine for Relay's playbooks.

Leave in place but out of scope: billing, staff console, trust center, marketing site, auth.

============================================================
PART 3: FOUNDATION (GOAL)
============================================================

One Foundation page per workspace, in the shell's top level. It replaces onboarding.

Contents (each a structured, versioned field, not free text where structure is possible):
- Business: type (service company, SaaS, coach, consultant, agency, other), offer(s), price points, sales cycle length.
- Goal: revenue goal for the period, deals needed, average deal value, target close rate.
- Ideal customer: who they sell to, using approved fields only (no protected attributes, no zip code alone, no inferred income, no health details).
- Team: setters, closers, managers, and who owns which leads (routing rules).
- Pipeline: stages and what each stage means, mapped to each connected CRM's stages.
- Targets per rep and per role: activity targets (calls, conversations, follow-ups), outcome targets (booked, shows, closes).
- Rules: business hours, response windows, channels allowed.

How it is filled:
- Compass drafts it from connected data (CRM stages and history, calendars, transcripts) and the industry template. Every drafted field shows its source ("From your CRM", "From your calendar", "Industry default", "Compass suggestion").
- The Owner edits and confirms. Each confirmation is a new version with a note. Nothing runs off an unconfirmed field.
- Until the Foundation is confirmed, the command center shows one clear card: "Confirm your foundation", with how many fields are drafted and how many need the Owner.

============================================================
PART 4: THE SIX AGENTS AND THE SIX JOBS
============================================================

Each agent owns one job, with a plain promise of what it never does. Their names and visual identity stay as they are in `roster.ts`. Sales Manager is added to the registry and roster the same way (glyph, accent token, promise, autonomy lists, plan inclusion).

1. Scribe: Lead and data intake, and structure.
   - Every source (CRM, forms, calendars, Gmail, call transcripts, Airtable, Sheets, webhooks, uploads) flows into the data spine through Scribe.
   - Matches identities across sources (email, phone, CRM id, calendar attendee) and merges with a visible, reversible merge record.
   - Maps vendor fields to Vistrial fields and flags unmapped or conflicting fields for a person.
   - Turns calls and conversations into structured facts on the Lead Record (need, timeline, budget signals, objections, next step), quoting only short spans with a link to the source.
   - Never: contacts a lead, deletes a record in a connected app.

2. Assay: Scoring.
   - Lead scores and tiers as today, now reading the Foundation's ideal customer and the full data spine.
   - Each score shows its reasons and sources. Tier changes are events other agents use.
   - Never: contacts a lead, alerts on historic leads.

3. Relay: Playbooks and communication.
   - Owns playbooks: how communication should be executed per stage, source, and tier (channels, timing, talk tracks, snippets, the sequence of steps).
   - Uses the workflow engine (`src/lib/workflows`) as the playbook engine: the graph is the one stored form, the checker validates every playbook before it can be published, and the list view and canvas are views of the same object.
   - Drafts every message that reaches a lead and sends it through the approval gate. Approved messages are sent from the connected tool (CRM, Gmail) where the workspace allows it, or handed to the person to send.
   - Never: sends without approval, sends between 8 pm and 8 am in the lead's local time, exceeds frequency limits.

4. Compass: Awareness and the feedback loop on every lead, and the assistant across the workspace.
   - Keeps a live "what is true now" summary per lead: where it is, what happened last, what is next, who owns it, what is overdue, and what changed since the person last looked.
   - Closes the loop: after each step (a call, a message, a booking, a no-show), records the outcome, checks it against the playbook and the Foundation targets, and proposes the next step or a playbook change with the evidence and sample size.
   - Answers questions across the workspace from records the asking person may see. Drafts the Foundation. Lives in the command bar.
   - Never: changes anything without a person's confirmation.

5. Sentry: Team alerts, structured and organized around the lead.
   - Response windows and clocks as today.
   - Alerts are organized per lead: one alert thread per lead that collects every alert, who it went to, who acknowledged, and what was done. No duplicate alerts for the same purpose.
   - Routes alerts by role and ownership (setter, closer, manager, owner), with escalation steps and quiet hours for the team, delivered in app, push, email, and connected chat where allowed.
   - Never: contacts a lead.

6. Sales Manager: Managing the team (new).
   - Builds and maintains management assets for setters and closers:
     - EOD reports: drafted automatically from each rep's real activity across connected tools (calls, conversations, bookings, follow-ups, CRM updates), then the rep adds notes and confirms.
     - Rep scorecards: activity against target, conversion at each stage, speed to lead, follow-up discipline, show rate, close rate, all against the Foundation targets, with sample-size rules.
     - Performance views: team board, per-rep trend, pipeline by rep, coaching moments linked to call moments from Scribe.
     - Reports: daily and weekly team reports, and the Owner's summary, exportable under the existing export rules.
     - Coaching suggestions: specific, evidence-based, linked to the calls or leads they come from.
   - Data sources: CRM activity, calendars, Gmail and Outlook metadata, call transcript tools, dialers if connected, Sheets and Airtable trackers already used by the team.
   - Visibility: Owners and Managers see the whole team. Setters and closers see only their own scorecard, EOD, and coaching notes. Enforced at the data layer.
   - Never: changes a rep's pay, role, or access; shares one rep's data with another rep.

All six run through the existing agent framework: caps, daily spend limits, halt switch, observation mode for new writing agents, run viewer, and the registry's plan and enablement rules.

============================================================
PART 5: THE LEAD RECORD (REPLACES THE CASE FILE SCREENS)
============================================================

One page per lead, the same layout everywhere:
- Header: name, owner, stage, Assay tier and reasons, source, and the next step with its due time.
- Now (Compass): what is true now and what changed.
- Timeline: every touch, call, booking, stage change, task, document, and agent action across all connected apps, with the source app shown on each row.
- Facts (Scribe): structured facts with sources and confidence. People can correct a fact and the correction is kept.
- Playbook (Relay): which playbook the lead is in, the current step, what comes next and when, and drafts waiting for approval.
- Alerts (Sentry): the lead's alert thread.
- Team: who has touched the lead and the handoffs.
- In connected apps: links to the lead in each connected app, and the last sync time.
Operators and reps see only leads they are allowed to see, as today.

============================================================
PART 6: THE CONNECTED WORKSPACE (DATA IN, ACTIONS OUT)
============================================================

Two ways of connecting, both behind one connector contract:
- Native connectors for the core apps, where sync must be reliable and incremental: GoHighLevel (exists), HubSpot, Google Workspace (Gmail, Calendar, Drive, Docs, Sheets), Airtable, Fathom, Fireflies.
- MCP servers for breadth and for agent actions: agents call connected apps through MCP tools, but only through the named action registry below. Each MCP server is registered per workspace with its scopes, and every tool it exposes is mapped to a named action or blocked.

The connector contract (one interface every connector implements):
- connect (OAuth or key, minimal scopes, tokens encrypted server side, never sent to the browser),
- import history (quiet, marked historic, paced),
- incremental sync (webhooks where the vendor offers them, polling otherwise, idempotent, with cursors),
- map fields (to the data spine, with a mapping screen),
- health (status, last sync, errors in plain words, reconnect),
- actions (the named actions this connector supports),
- disconnect (revoke tokens, stop sync, keep imported data unless the Owner deletes it).

Data in: all sources land as normalized events in the data spine. Scribe owns identity matching and mapping. Every record keeps its source and source id.

Actions out (the action registry). Every action is named, typed, has a tier, and has a policy:
- Reaches a person (always approval): send email, send text, send DM, send calendar invite to a lead.
- Internal write (Owner setting, Suggest by default, or Do and log): update CRM field, move CRM stage, add tag, create CRM task, add CRM note, create or update a Google Doc or Sheet row, create or update an Airtable record, create a calendar hold for a team member.
- Read: search and fetch from connected apps for agents and Compass, within the asking person's visibility.
Each action records who or what asked, who approved, the before and after values, and the result. Reversible actions offer Undo.

First release apps: Google Workspace, CRMs (GoHighLevel native, HubSpot next, then Salesforce), call transcripts (Fathom, Fireflies, then Zoom or Gong), Airtable.

============================================================
PART 7: THE SHELL (COMMAND CENTER)
============================================================

Rebuild the app shell. Keep Vistrial's design tokens, fonts, and components. Do not change the design system.

Desktop and tablet:
- Top: Compass command bar (ask anything, jump to any lead, run an action), workspace switcher, notifications, account.
- Left rail: Foundation, Command center, Leads, then the six agents from the registry, each with its live state and its waiting count, then Connections and Settings. The rail is generated from the registry.
- Center (Command center): what needs a person now, ordered by urgency: approvals waiting, alerts open on my leads, hot leads with no next step, playbook steps due, EODs to confirm, and a short "what the team just finished" stream.
- Right panel: the selected lead's Lead Record summary, or the selected agent's detail (what it is doing, recent runs, settings, its promise).

Phone:
- Bottom tabs: Command center, Leads, Approvals, Agents, More. The command bar is a button at the top.
- Every approval, alert, and EOD works on the phone with large touch targets. No horizontal page scroll.

Each agent has its own page: its job, its live work, its settings (autonomy, internal write policy per action), its results, and its promise.

Motion stays calm: only real activity animates, reduced motion and calm mode are honored.

============================================================
PART 8: ROLES
============================================================

- Owner: everything, including Foundation, action policies, agent enablement, connections, team scorecards.
- Manager (new role): team scorecards and reports, EOD review, coaching, alerts escalated to managers, playbook editing if the Owner allows. Cannot change billing, connections, or action policies.
- Closer and Setter: their own leads, their own EOD and scorecard, approvals they are assigned, their alerts.
- Service Team and Platform Admin: as today, with Owner confirmation for anything they enable.
Enforce at the data layer, including live channels, and test every role.

============================================================
PART 9: SECURITY, PRIVACY, AND COST
============================================================

- Tokens and secrets server side only, encrypted, rotated on reconnect, revoked on disconnect. The existing `assert-no-secrets-in-client` check covers new code.
- Least scopes per connector. Read scopes and write scopes are requested separately, and write scopes only when the Owner turns on an action that needs them.
- Logs hold ids, action names, states, and counts only. No message text, transcript text, or document content in logs.
- Content from connected apps is data, never instructions. Test prompt injection through emails, transcripts, docs, CRM notes, and Airtable cells.
- Cost guards per agent and per workspace reuse the existing caps. MCP calls count toward them.
- Fairness: scoring and routing use only approved fields.

============================================================
PART 10: BUILD ORDER (SHIP BEHIND A PER-WORKSPACE FLAG)
============================================================

Use `workspace_flags` (from Prompt 24) with a new flag `sales_os` so I can switch it on workspace by workspace. The old shell stays for workspaces without the flag until I retire it.

1. Phase 0 report and plan.
2. Hygiene: fix CI so tests, typecheck, and build actually run; fix or explain the failing tests on main; reconcile production migrations with my approval.
3. Data spine and connector contract; Scribe intake and identity matching on top of the existing GoHighLevel data.
4. The new shell, the Lead Record, and the Command center, reading existing data.
5. Foundation page and Compass drafting.
6. Native connectors: Google Workspace, HubSpot, Airtable, Fathom, Fireflies, each with import, sync, mapping, health.
7. The action registry and execution: approval gate for anything that reaches a person, Owner policies for internal writes, MCP mapping.
8. Relay playbooks on the workflow engine; Assay reading the Foundation; Sentry alert threads per lead; Compass awareness and feedback loop.
9. Sales Manager: EOD drafting, scorecards, team board, reports, coaching suggestions.
10. Remove onboarding, Case File screens, and Forsight from the product; redirect the pulse host; update the layout reference page.
11. Roles pass, phone and accessibility pass, performance, and tests.

============================================================
PART 11: TESTING
============================================================

- Data spine: the same person from CRM, calendar, Gmail, and a transcript resolves to one lead; merges are reversible; history never triggers anything.
- Connectors: each one passes connect, import, incremental sync, mapping, health, and disconnect tests with seeded fake accounts. No real customer data.
- Actions: nothing that reaches a person runs without approval; internal writes follow the Owner policy; every write is logged with before and after; Undo works where supported; MCP tools not mapped to a named action are blocked.
- Gate rechecks: opt-out, do-not-contact, quiet hours, frequency, unhealthy connection, billing state.
- Prompt injection through every connected source has no effect.
- Sales Manager: EOD drafts equal the underlying activity for a seeded team; scorecards respect sample-size rules; reps cannot see each other's data, including through Compass and live channels.
- Roles and isolation: every role, cross-workspace, cross-role.
- Shell: phone, tablet, desktop; keyboard only; screen reader; reduced motion; calm mode.
- Performance: a workspace with 20,000 leads, 10 reps, and a burst of 500 events; report measured numbers.

============================================================
DECISIONS I NEED TO MAKE (ASK ME, WITH YOUR RECOMMENDATION FOR EACH)
============================================================

1. Whether Manager is a new `org_role` value or a permission on the existing `admin` role.
2. The internal write actions that start on Suggest versus Do and log (recommended: all start on Suggest).
3. Which MCP servers to support at first, and whether workspaces can add their own (recommended: a curated list only).
4. Scorecard formula and weights per role, and the minimum sample before a score shows.
5. EOD timing and format (recommended: drafted at the end of each rep's business day, confirmed by the rep, summarized to managers the next morning).
6. Whether approved messages send from the connected CRM or Gmail, or are handed to the person to send (recommended: send from the connected tool when the workspace allows, else hand off).
7. Plan gating for the Sales Manager agent and for connectors.
8. The order of native connectors after Google Workspace.
9. The new names and copy for the Command center cards, the Foundation fields, and the agent pages, for my approval before shipping.

============================================================
DO NOT
============================================================

- Do not let any agent send or show anything to a lead or client without approval.
- Do not give agents a generic API, code execution, or raw database tool. Named actions only.
- Do not store message, transcript, or document text in logs, alerts, or stream lines.
- Do not drop the old tables in this prompt. Removal of screens only; data stays.
- Do not change the design system, or the auth and billing flows.
- Do not let historic imports trigger messages, alerts, tasks, or notifications.
- Do not show reps each other's scores or data.
- Do not name any other company, agency, or internal firm in the interface, except the names of the apps the customer connects.
- No em-dashes in any copy.

============================================================
REPORT BACK
============================================================

1. After Phase 0: CI and production database state, everything being removed, the data spine design, the connector contract, and the plan.
2. After each build step: what changed, screenshots or descriptions at phone, tablet, and desktop widths, and which data feeds each part.
3. The action registry as implemented, with each action's tier and default policy.
4. Dependencies added with size and license.
5. Test results for every item in Part 11 with measured numbers.
6. Anything that conflicts with earlier prompts, and your recommendation.
