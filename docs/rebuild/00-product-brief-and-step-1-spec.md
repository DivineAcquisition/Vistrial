# Vistrial rebuild: product brief and Step 1 spec

This is the source of truth for the fresh build. Every build prompt for Grok points back to it. If a prompt and this document disagree, this document wins until we change it on purpose.

## 1. What Vistrial is

Vistrial is a Sales OS. It helps service companies, SaaS companies, coaches, consultants, and agencies run their sales department as a system instead of a pile of tools and habits.

It works in three stages, and the whole product is organized around them:

1. **Foundation (Goal).** What the business is trying to achieve: revenue goal, offer, ideal customer, team, pipeline stages, and targets per person.
2. **Organization (Structure).** How the sales department is organized to hit it: every lead and conversation captured in one place, scored, put in order, and owned by someone.
3. **Execution (Agentic).** Agents do the work inside that structure, and people approve what matters.

**The result a customer should feel in the first week:** clarity, synchronization, and execution across the sales department, largely on its own.

**The daily habit that keeps a customer:** a setter or closer opens Vistrial in the morning to see who to contact first and finds the message already written. A prepared, ranked list with drafts is something they would miss if it were gone. Owners open it for a fast approval view.

## 2. Decisions already made

| Area | Decision |
|---|---|
| Customers | All four (service, SaaS, coaches and consultants, agencies). One product, not four. |
| Starting point | Fresh app. We reuse ideas, not code. Proven pieces are copied only when we choose to. |
| Stack | Convex is the whole backend: database, server functions, realtime, scheduled jobs, file storage, and HTTP endpoints for webhooks. Next.js (TypeScript) on Vercel for the front end. A hosted auth provider connected to Convex. There is no separate SQL database. |
| Who builds | I write the specs and the build prompts. Grok builds. I review code and tests before we move on. |
| Look and feel | Calm, white, premium. Light by default, dark as an option. Soft color only to show state. |
| Workspaces | One workspace per customer business. It is the isolation boundary. Agencies running several client workspaces come later, and the data is designed so they can be added without a rewrite. |
| Roles | Owner, Manager, Rep inside a workspace. Staff stay outside. |
| Autonomy | Per action, set by the Owner. Anything a lead can see always needs a person's approval. |
| Texting | Email first. Texts go live per workspace after carrier registration clears. |

## 3. The six agents

The names stay. Each agent has one job, and each job belongs to one of the three stages.

| Agent | Stage | One job |
|---|---|---|
| **Compass** | Foundation | Drafts the Foundation from connected data and the owner's answers, answers questions from records a person can see, and keeps a live "what is true now" summary for every lead. |
| **Scribe** | Organization | Brings every source into one structured record: matches the same person across sources, turns calls and conversations into facts, and flags what it is unsure of. |
| **Assay** | Organization | Scores every lead, orders the list, and shows the reasons. |
| **Relay** | Execution | Owns the playbooks (how each kind of lead is followed up) and writes every message as a draft for approval. |
| **Sentry** | Execution | Watches response times and the pipeline, and raises structured alerts to the right people, grouped per lead. |
| **Helm** | Execution | Manages the team: drafts each rep's end of day report from real activity, keeps scorecards against the Foundation targets, and suggests coaching. |

**Rules for all six**

- Agents act only through named actions. There is no "call any API" and no free-form code.
- Text from emails, transcripts, notes, or CRM fields is data, never instructions.
- Every agent has a plain promise of what it never does, shown in the product.
- Every agent action is logged with the reason, and undoable where the source app allows it.

## 4. What agents may do on their own

Trust is set per action by the Owner, not per agent. Everything starts as a suggestion.

**Can run without approval once the Owner allows it (stays inside the team, no lead sees it):**
reading and understanding (facts from calls, emails, and notes; case summaries; objection tags; timeline notes), scoring and ordering, internal tasks and alerts, morning briefing items, drafting (a draft is not a send), team messages to Slack or Discord, and housekeeping such as filing assets in Drive.

**Always gated, because a lead can feel it:**
anything a lead sees (always approval, locked, and a Rep approves only their own leads), reassigning a lead, writing back to the customer's CRM, calendar changes, changing deal stage or value, and editing a live workflow or playbook (Owner approval, never an agent action).

**Guardrails**

- Daily caps per workspace and per action.
- A visible log with the reason for every action, and Undo.
- Automatic step-down: if an agent's actions are undone or rejected often, it goes back to asking first.
- A closed ceiling: the level where an agent acts outside the team without approval never opens.
- A trust record shown when the Owner decides to loosen a setting, for example "Assay created 38 tasks this week and you changed 2."
- Quiet hours (8 pm to 8 am in the lead's local time), consent, opt-out, frequency limits, billing state, and connection health are checked again at send time.

## 5. Roles

| Role | Who | Can do |
|---|---|---|
| **Owner** | The business owner who pays | Everything: billing, connections, which agents are on, trust settings, publishing playbooks, adding and removing people, approving anything. |
| **Manager** | Sales manager or team lead | See all leads and the whole team's work, approve drafts for anyone, reassign leads, edit scoring views, review EODs and scorecards. Cannot change billing, connections, trust settings, or published playbooks. |
| **Rep** | Setter, closer, or VA | See and work only their own leads, approve drafts on those leads, use My day and My Leads. Cannot see other reps' leads or any settings. |

**Rules that hold for all three**

- Anything a lead will see needs a person's approval, and a Rep approves only their own. Locked.
- Trust settings are Owner only.
- Reasons for scores and drafts are visible to everyone who can see the lead.
- Every role action is logged with the person's name.
- A Rep sees only their own scorecard. Owners and Managers see the team.

**Outside the workspace**

Service Team and Platform Admin are staff, not a workspace role. They sign in at admin.vistrial.io, require a second factor, and enter a customer's workspace only through a separate, scoped, logged path. Platform Admin tunes scoring and enables agents. Service Team handles support. Neither can approve a message to a lead.

**Left out for now:** custom roles, read-only viewers, sub-teams with separate queues.

## 6. The layout

**Center: decisions waiting for you.** In an agentic product the agents do the work and a person's job is to approve it. The first thing someone sees is a queue of drafts, flagged leads, and tasks that need a yes. Each item shows its reason, for example "Hot lead, no reply in 2 days, here is Relay's draft", with Approve, Edit, and Skip right there.

**Above the center: a command bar.** "Ask Compass anything or tell it what to do." It steers. It is not the whole screen.

**At the edges**

- Crew band: a thin row showing which agents are working or waiting.
- Briefing: two or three lines on "here is your day", above the queue.
- Due now and work next: beside or below the queue.
- Live stream of what agents are doing: a quiet side panel.

**For a Rep**, the center is their own ranked list with the draft ready, because the morning question is "who do I go after, and what do I say?" The ordering and the quality of the first draft matter more than anything else on the screen.

**Empty queue:** never blank. In Step 1 it says "Nothing is waiting." Once Compass has real data, it adds a next best action drawn from real records, for example "Compass suggests calling these warm leads today", with the real count. A number is shown only when it comes from data.

**First sign-in:** before any agent has done anything, the center is the setup path: connect your tools, pick which agents to turn on, then go live. Once data is flowing it becomes the decisions queue and stays that way.

**Phone:** bottom tabs, the command bar as a button, and every approval works with large touch targets and no horizontal scroll.

## 7. Connections, in order

Start now, in the background: **Telnyx texting registration.** Carriers take time to approve, it costs nothing to begin, and it is the one item that can hold up launch. The texting itself is built later.

1. **Email and calendar (Nylas).** Real conversations, replies, and meetings. The lead record starts to fill and Scribe has something to read.
2. **GoHighLevel (CRM).** Leads and deal stages. Assay needs it to score anything.
3. **Call transcripts.** File upload first, then the tool the first customer uses. This is when the product feels intelligent.
4. **Texting goes live (Telnyx)** once registration clears. Until then the product runs on email drafts.

After launch: Slack or Discord summaries, Drive for assets, Airtable and other data apps. Always available: file upload and manual entry.

**Rule:** each connection is done before the next starts. Done means a real customer account is connected, data is flowing, and one agent has acted on it.

Note: Gmail and Google Calendar are covered by Nylas. Google Drive, Docs, and Sheets move to after launch. Say if you want that changed.

## 8. Build order

1. **Step 1: workspace, roles, and the empty shell.** Defined below.
2. The data spine: leads, people, conversations, calls, tasks, and events as one normalized model.
3. The approval gate, with the locked rules and send-time rechecks.
4. First connection: email and calendar. Scribe and the lead record come alive.
5. Second connection: GoHighLevel. Assay scores and orders.
6. Relay drafts into the decisions queue. The first real loop: intake, score, draft, approve.
7. Sentry alerts, and the live agent stream. Convex queries are reactive, so the stream needs no separate system.
8. Transcripts and Scribe facts.
9. Playbooks.
10. Helm: EODs and scorecards.
11. Foundation page drafted by Compass, and the trust settings.
12. Texting goes live.

Each step ships behind its own review and is verified on a real or seeded account before the next one starts.

---

# Step 1 spec: workspace, roles, and the empty shell

## Goal

A signed-in person lands in their own workspace in the new layout. Every page exists and is real but empty. Roles and isolation are enforced on the server for every function. No agent runs and nothing is sent.

## How isolation works in Convex

Convex has no Row Level Security. Isolation is something we build and prove, so it is designed first.

1. **One access layer.** Every public query and mutation is created through shared builders (for example `workspaceQuery`, `workspaceMutation`, `staffQuery`). A builder resolves the signed-in identity, finds that person's membership in the workspace, checks the role, and hands the function a trusted context. A function never accepts a role or member id from its arguments.
2. **Every workspace table is indexed by workspace.** Reads go through an index that starts with `workspaceId`. No unbounded `collect()`. Lists are paginated.
3. **A guard test fails the build** if any public function in `convex/` is not created through a builder. A new function cannot be added that skips the access layer.
4. **Rep scoping is enforced in the function,** not on the screen. A Rep's lead queries filter to their own leads on the server.
5. **Audit in the same transaction.** Mutations write their audit row in the same mutation, so an action and its log cannot disagree.
6. **Private logic is internal.** Anything that should not be called from a browser is an internal function. Outside services are called only from actions.
7. **Secrets** live in Convex environment variables, never in client code.

## What exists at the end of Step 1

**Sign-in and workspaces**

- Sign-in through the hosted auth provider, connected to Convex. The provider supplies email sign-in and a second factor.
- Creating a workspace makes the creator its Owner.
- Invite a person by email with a role (Manager or Rep). Accepting the invite creates their membership.
- A person belongs to one workspace in Step 1. The data model must not prevent more later.

**Roles and isolation**

- Owner, Manager, Rep, enforced by the access layer above on every function.
- A Rep sees only leads assigned to them. (The leads table is a stub in Step 1, but the scoping is real and tested.)
- Every write by a person is logged to the audit table with who, when, and what.

**Staff path**

- Platform Admin and Service Team are separate from workspace membership.
- A staff member can enter a workspace only by creating a logged access grant with a reason and an expiry. Without a grant they read nothing.
- Staff sign-in requires a second factor, read from the auth provider's token claims and checked on every staff function. The staff surface is a separate route group served at admin.vistrial.io.

**The shell**

- Left rail generated from the `agents` table, not hard-coded: Compass above, then the agents grouped by stage (Foundation, Organization, Execution), then Connections and Settings.
- The six agents appear in the rail with state "Off" and their one-line job and promise.
- Center: the first-sign-in setup path, with steps shown but not connected. When setup is marked done, the center shows the empty decisions queue with its briefing and next-best-action empty state.
- A command bar above the center with the Compass prompt. It accepts input and answers "Compass is not on yet" until a later step.
- Crew band, briefing slot, due now and work next slot, and a quiet side panel, all present as empty states.
- The side panel is already subscribed to the `events` table through a reactive Convex query. It shows nothing yet. This proves the live path end to end, and later steps only add producers.
- Pages that exist and are real but empty: Decisions, My day (Reps), Leads, Team (Owner and Manager), each agent's page, Connections, Settings (Owner), and a Staff area.
- Light theme by default with a dark option. Tokens for color, type, and spacing defined once.
- Phone: bottom tabs, command bar button, no horizontal scroll.

**Not in Step 1:** any connection, any agent behavior, the approval gate logic, billing, texting, and any call to an outside service.

## Data model (Step 1)

Convex tables with validators in `convex/schema.ts`. Every table that belongs to a workspace has `workspaceId` and an index that starts with it.

- `workspaces` (name, slug, timezone, status)
- `members` (workspaceId, userId, role: owner | manager | rep, displayName, active). Indexes by workspace and by user.
- `invitations` (workspaceId, email, role, tokenHash, expiresAt, acceptedAt)
- `staff` (userId, role: platform_admin | service_team)
- `staffAccessGrants` (staffUserId, workspaceId, reason, startsAt, expiresAt, revokedAt)
- `auditLog` (workspaceId, actorType, actorId, action, subject, detail). No message or transcript text.
- `agents` (id, area, stage, name, job, promise, sort). Seeded with the six agents. The registry the rail reads from.
- `workspaceAgents` (workspaceId, agentId, state: off | suggesting | on, updatedAt, updatedBy)
- `workspaceSettings` (workspaceId, setupDone, themeDefault)
- `events` (workspaceId, agentId, kind, subjectId, at). Ids and kinds only, never text. The live stream contract.
- `leads` (stub: workspaceId, assignedMemberId), only to prove Rep scoping.

## Acceptance tests (all must pass before Step 2)

Tests run with `convex-test` using real function code and fake identities, and are repeated once against a dev deployment.

1. A user in workspace A cannot read or write any document in workspace B through any public function. Tested by calling every public function as a member of A with B's ids.
2. A Rep reads only leads assigned to them. A Manager and an Owner read all.
3. A Manager cannot change settings or workspace agents. An Owner can.
4. Staff with no grant read nothing. Staff with a grant read only that workspace until it expires. Staff without a second-factor claim are refused. Every grant and every entry is in the audit log.
5. An invite for the wrong email, an expired invite, and a reused invite are all refused.
6. The guard test: adding a public function that does not use a builder fails the test run.
7. The rail shows exactly the rows in `agents`. Adding a row with no code change adds it to the rail.
8. First sign-in shows the setup path. After setup is marked done it shows the decisions empty state. Inserting an `events` row appears in the side panel without a refresh.
9. Phone, tablet, and desktop widths with no horizontal scroll. Keyboard-only navigation. Screen reader labels. Reduced motion honored.
10. No secret appears in client code, and the build, type check, and tests run in CI.

## Known costs of an all-Convex backend

We chose this on purpose, and these are the things to plan around:

- No SQL joins or ad hoc analytics. Reports (scorecards, "where leads go") will use maintained counters and indexed queries, and heavy analytics may later export to a warehouse.
- Query and document size limits. Large lists are paginated, large text goes to file storage, and nothing unbounded is read in one function.
- Isolation is our code, not a database feature, which is why the access layer and the guard test are in Step 1 and are non-negotiable.

## Decisions

Confirmed: Clerk for auth, "Rep" as the lowest role, one active workspace per person in Step 1, and no `convex-helpers` (the access builders are hand-written). Still open for you:

1. **Auth provider.** I recommend Clerk: it has organizations, invitations, and a second factor, and it connects to Convex. Alternatives are WorkOS AuthKit and Convex Auth. Convex Auth keeps one vendor but means building staff MFA and invites ourselves.
2. Call the lowest role "Rep" in the product, or "Member"? (I recommend Rep.)
3. Confirm the Google Drive, Docs, and Sheets items move to after launch, with Nylas covering Gmail and Calendar.
4. One workspace per person in Step 1 (recommended), or allow several from the start?
5. New repo name and domain plan: app.vistrial.io for customers and admin.vistrial.io for staff.
