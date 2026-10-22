PROMPT 27 (DETAILED): SALES CALENDAR. THE SCHEDULE OF HOW LEADS, REPS, AND AGENT WORK MEET IN TIME. BUILT ON THE REUI EVENT CALENDAR COMPONENT.

Paste everything below into Cursor.

Run order: after Prompt 24 (agent registry and sidebar). It reads data from Prompts 19 (tasks), 22 (Assay), Sentry clocks, Relay drafts, the calendar connector, and the workflow engine from Prompt 25. It fits the Sales OS direction in Prompt 26 but does not depend on it.

============================================================
CONTEXT
============================================================

Vistrial already exists (Next.js 16, Supabase, Convex, deployed on Vercel at app.vistrial.io). Read `AGENTS.md` first: this Next.js version differs from your training data. Read the guide in `node_modules/next/dist/docs/` before writing routes or server code.

This prompt adds a Sales Calendar: a calendar view of the sales schedule. It is a view, not a new store. It is not a general calendar and not a scheduling product. Google Calendar and Outlook already do that.

What it is, in one sentence: one place to see when calls are booked, what follow-up work is due, what is waiting to send, and which reps and days are covered.

What it is not: a booking page, a room or resource booker, a recurring-event editor, or a second calendar the team has to maintain. Do not build any of these.

Data that already exists and must be reused (confirm each in Phase 0):
- Booked calls: `calls.scheduled_at`, `calls.occurred_at`, `calls.outcome` (the `calls` table).
- Calendar events kept by the connector: `src/lib/connectors/calendar-match.ts` keeps only sales events (matched attendee or sales title), drops descriptions, notes, and other attendees. No-show is never guessed from a calendar. Keep this rule.
- Tasks and due times: `src/lib/tasks`, table `next_actions` (sources: person, sentry, scribe, playbook, booking, service_team, assay).
- Relay drafts and the approval gate: `follow_up_drafts`, `approval_items`, `src/lib/gate`.
- Sentry response clocks and windows: `src/lib/sentry`.
- Workflow waits and next steps: `workflow_enrollments.next_due_at` (migration `20261022020000_workflows_foundation.sql`).
- Assay tiers: `assay_lead_scores`.
- Calendar blocks: `calendar_blocks`.
- Per-workspace switches: `workspace_flags` (set by Vistrial staff, logged).
- Sidebar and work pages: the agent registry (`agent_areas.work_page`, `src/lib/agents/roster.ts`, `src/lib/agents/summary.ts`).

Use Context7 for current docs on every library you touch. Never pull real customer data through any MCP during development. No em-dashes in any copy you write.

============================================================
THE COMPONENT
============================================================

Use the ReUI Event Calendar component (headless-first event calendar with month, week, day, N-day, agenda, and resource views, a subscribable store, and an external CRUD contract). I will paste its source files into the conversation. They are:
- `reui-event-calendar.tsx` (the root, hooks, and store)
- `reui-event-calendar-utils/event-calendar-lib`, `event-calendar-types`, `event-calendar-i18n`, `event-calendar-content`, `event-calendar-nav`, and `style-nova.css`
- its example (`demo.tsx`) as a usage reference only

Place them where the code's own imports expect: `src/components/ui/reui-event-calendar.tsx` and `src/components/ui/reui-event-calendar-utils/`. The demo imports Avatar, Button, Card, Label, Popover, Select, Switch, and Tabs from `reui-event-calendar-utils/`; in Vistrial, point those imports at the existing components in `src/components/ui/` (avatar, button, card, label, popover, select, switch, tabs, tooltip) instead of copying duplicates. Dependencies `@base-ui/react`, `date-fns`, and `lucide-react` are already installed; do not add others without telling me. If any helper file is missing, stop and ask me for it. Do not guess its contents.

Restyle to Vistrial's existing tokens, fonts, and spacing. Do not change the design system. Do not name the component library in the interface.

============================================================
PHASE 0: DISCOVERY (REPORT ONLY, CHANGE NOTHING)
============================================================

Report:
1. Whether all component files were supplied, their total size, license, and any import you could not resolve.
2. Every source of time-based data in the repo and exactly which columns give start, end, owner, lead, status, and source. For each: how many rows a typical seeded workspace has, and how far back and forward it reaches.
3. How bookings are written today (connector sync, GoHighLevel, manual) and whether a booking has an end time, an owner, and a lead id.
4. Which roles may see which leads today (owner, admin, closer, setter, placed operator, staff) and how Row Level Security scopes calls, tasks, and drafts. The calendar must never show a person a lead they cannot open.
5. How the calendar connector writes (if at all) and what it would take to write a reschedule back to Google Calendar. Do not build it.
6. How to declare a Calendar work page in the registry, given that the area currently allows one `work_page` (Case Files). Propose the smallest safe change.
7. Anything that conflicts with earlier prompts, with a proposed fix.

Then give me a short plan, build order, and effort per part. Wait for my approval before implementing.

============================================================
PART 1: PRINCIPLES (NON-NEGOTIABLE)
============================================================

1. A view, not a store. The calendar reads existing records and never keeps its own copy of an event. Every item keeps its source and source id.
2. True and traceable. Nothing appears that is not in a record. No-show is never guessed. No invented events, no fake motion.
3. Role honest at the data layer. Row Level Security and server checks decide what each person sees, including on live channels. Reps see only their own leads. Owners and managers see the team.
4. People approve what reaches people. Nothing on the calendar sends, invites, or notifies a lead without the approval gate. Any later write into a connected calendar follows the internal-write policy, set by the Owner.
5. No message, transcript, note, or document text in the calendar, its logs, or its tooltips. Titles are derived from lead name, event kind, and rep name only.
6. History is quiet. Past events are shown but trigger nothing.
7. Phone first for reading. Agenda is the phone view. Month, week, and day are for desktop and tablet.
8. Registry driven. The page is declared in the registry, not hard-coded in navigation.
9. Behind a flag. Ship behind a `workspace_flags` flag `sales_calendar` so I can switch it on workspace by workspace.

============================================================
PART 2: WHAT THE CALENDAR SHOWS
============================================================

Each item is a `CalendarEvent` built by a server-side adapter. Kinds, with their source and color rule (color comes from existing tokens, and the kind is always also shown by an icon and a label, never by color alone):

1. Call or meeting (from `calls` and kept calendar events). Title: "Call: {lead name}". Colored by the lead's Assay tier. Shows rep as the resource. Past calls show their outcome from the record (completed, canceled, no-show only if the record says so).
2. Task due (from `next_actions`). Title from the task kind, never free text. Timed if it has a time, all-day otherwise. Overdue items are marked by a text label.
3. Draft waiting (from the approval gate). Title: "Draft ready: {lead name}". If its send time falls in quiet hours (8 pm to 8 am, lead's local time), show "Will send at 8:00 AM" and make it plain that approval is still needed.
4. Response window (from Sentry clocks). A short block ending at the deadline: "Reply due: {lead name}". Only open windows appear.
5. Workflow step due (from `workflow_enrollments.next_due_at`). Title: the box's plain title, for example "Follow-up 2: {lead name}".
6. Team holds and blocks (from `calendar_blocks`).

Capacity cues (computed, not stored):
- A day or rep with no calls booked, against the Foundation target when one exists.
- A day with more booked calls than the rep's target.
Shown as small text badges on the day and rep header, with sample-size rules so a thin count never shows a percentage.

============================================================
PART 3: VIEWS, FILTERS, AND ACTIONS
============================================================

Views (use the component's own views):
- Month: the team's overall load.
- Week and Day: working views.
- Resource (one column per rep, from the team list): the Sales Manager's coverage view. Reps are `EventCalendarResource` entries with their color token.
- Agenda: the default on phones.

Filters (above the calendar, saved per person): rep, kind, tier, source, stage. Owners and managers can pick any rep. A rep has only themselves.

Click behavior:
- Click an event: open a side panel (bottom sheet on phone) with the lead name, rep, tier chip, kind, time in the workspace time zone and the lead's local time, and one primary action: "Open lead record". Draft items show "Review draft", which opens the existing approval card.
- Click an empty slot: for roles allowed to create, a small menu to add a task or a team hold. It does not create a call or send an invite in this version.

Release 1 is read-only for events from other systems. Rescheduling by drag, resize, and drag-to-create are turned off (`interactions` all false). Tasks created from the calendar use the existing task creation path and follow the workspace's "suggested" versus "direct" setting.

Release 2, only after I approve it: drag to reschedule a call, written back to the connected calendar through the connector as an internal write, set by the Owner to Suggest (default) or Do and log, with before and after logged and Undo. Never changes anything a lead sees without the approval gate.

Settings kept small: time zone, week start, working hours (from the Foundation or business hours), now indicator, weekends. Keep the component's settings popover only for these. Remove its demo-only controls (language and many internals).

============================================================
PART 4: DATA ADAPTER AND PERFORMANCE
============================================================

- A server function loads items for a date range, a user, and filters, and returns plain `CalendarEvent` objects. It runs with the asking person's session so Row Level Security applies. No service-role client in this path.
- The calendar asks for data by range through its `onRangeChange` callback and caches by range and filter. Range queries use indexes on the time columns; add indexes if Phase 0 shows they are missing.
- Counts and capacity cues come from indexed queries or maintained counters, never a scan per view.
- The calendar renders only the visible range. Report measured numbers: a team of 10 reps with 2,000 events in a month, on a mid-range phone for Agenda and a laptop for Month and Week.
- Use a stable `events` array for the calendar and update it by range, so the component's index does not rebuild on every render.

============================================================
PART 5: WHERE IT LIVES AND ROLES
============================================================

- Declare a Calendar work page for the Sales area in the registry (see Phase 0 item 6). Keep it pinned under Case Files. If the registry shape needs to change to allow more than one work page, make the smallest change that keeps the existing sidebar and its tests passing, and show me before doing it.
- Route: `/app/calendar`. It returns not found unless the `sales_calendar` flag is on for the workspace.
- Owner and Admin: whole team. Manager (if present): whole team. Closer and Setter: their own leads only. Placed operator: only the leads they are assigned, same as the lead list today. Staff: as the workspace access rules already allow.
- A small "Next on my calendar" strip on the command center or Home (their next three items), if that surface exists after Prompt 26. Build it only if cheap; otherwise list it as follow-up.

============================================================
PART 6: SECURITY AND PRIVACY
============================================================

- Event titles never contain notes, transcripts, message text, or free text typed by anyone else.
- Logs hold identifiers, kinds, counts, and states only.
- The calendar never exposes a lead to a person who cannot open that lead. Test through the list, the side panel, the filters, and any live channel.
- Fairness: capacity cues use only counts of booked calls against targets. No inference about any person.

============================================================
PART 7: TESTING
============================================================

- Adapter: each kind maps correctly from a seeded fake workspace. Counts on the calendar equal the underlying rows for the same range and filters.
- No-show is shown only when a record says so. Historic and past events trigger nothing.
- Drafts show "Will send at 8:00 AM" when outside the send window. Nothing on the calendar can send.
- Roles and isolation: owner, admin, closer, setter, placed operator, staff, and cross-workspace. A rep cannot see another rep's calls through the calendar, the filters, or the live channel.
- Flag: with the flag off the route is not found and no data is loaded.
- Phone, tablet, and desktop; keyboard only; screen reader (the Agenda view is the accessible equivalent); reduced motion; calm mode; dark theme; right-to-left does not break the layout.
- Performance numbers from Part 4.
- Use seeded fake workspaces and labeled fake leads only. Never real customer data.

============================================================
BUILD ORDER
============================================================

1. Phase 0 report and plan. Stop if component files are missing.
2. Install the component files and restyle them to Vistrial tokens, behind a flag, with seeded fake events on a development-only preview page.
3. The data adapter for calls, tasks, drafts, response windows, and workflow steps, with range loading and filters.
4. The page, registry work page, side panel, role scoping, and capacity cues.
5. Phone Agenda pass, accessibility pass, performance, tests, and the layout reference page update.
6. Release 2 (drag to reschedule) only after my approval.

============================================================
DECISIONS I NEED TO MAKE (ASK ME, WITH YOUR RECOMMENDATION FOR EACH)
============================================================

1. Read-only in release 1 (recommended: yes), or drag to reschedule from the start.
2. The page name ("Calendar" recommended) and its position under Case Files.
3. Which item kinds ship first (recommended: calls, tasks, drafts waiting; then response windows, workflow steps, and holds).
4. Whether capacity cues compare against Foundation targets (recommended: yes, shown only when a target exists).
5. Whether clicking an empty slot can create anything in release 1 (recommended: tasks and holds only, never a call).
6. Whether to add the "Next on my calendar" strip to Home in this change (recommended: later).

============================================================
DO NOT
============================================================

- Do not create a second store of events or a new events table. The calendar reads existing records.
- Do not guess no-shows. Do not infer anything from a calendar that a record does not say.
- Do not send, invite, or notify anyone from the calendar. Anything a lead sees goes through the approval gate.
- Do not write to a connected calendar in release 1.
- Do not show notes, transcripts, message text, or other attendees on any event.
- Do not add a booking page, recurring events, or resource booking.
- Do not change the design system, roles, or permissions beyond adding the registry-declared Calendar page.
- Do not name the component library, any other company, or any internal firm in the interface.
- No em-dashes in any copy.

============================================================
REPORT BACK
============================================================

1. After Phase 0: the component files received, every data source with row counts, the role and Row Level Security findings, the registry change needed, and your plan.
2. After each build step: what changed, descriptions or screenshots at phone, tablet, and desktop widths, and which data feeds each part.
3. Dependencies added, if any, with size and license.
4. Test results for every item in Part 7 with the measured performance numbers.
5. Anything that conflicts with earlier prompts, and your recommendation.
