# Prompt 3, Phase 0: Application shell and page layouts — discovery and plan

Status: discovery only. No application code, component, token, route or permission has changed.
This waits for your approval.

Read from `main` at `74dbab2`. Findings come from reading the code. Phone behaviour has not yet
been checked in a browser; that happens during implementation (see "How each Done When will be
checked").

## 1. The short version

- **Most of a shell already exists, but only for `/app`.** `AppShell` already has a collapsible
  sidebar that remembers its state, a top bar, the staff workspace switcher, a staff "inside a
  customer workspace" band, a notification bell, a jump palette, and a phone dock. Upgrading it is
  the right move, not a rebuild.
- **Four areas sit outside it, each with its own chrome:** the customer portal (`/portal`), Stellar
  (`/stellar/*`), the setup wizard (`/app/onboarding/*`) and the Ask Vistrial chat (`/app/ask`).
- **Most `/app` pages already render through one page header** (`PageFrame` → `PageHeader`). It is
  in effect the "Standard page" layout today. Home and Stellar are the exceptions.
- **About half the navigation the prompt describes has no page behind it yet**: Approvals (as its
  own page), Agents (for customers), Results (as one place), Today, Escalations, Operator Logs,
  Templates, Template Library, Platform Defaults and Billing. Section 6 proposes how to handle that
  without building those screens.
- **Members can't enter `/app` today.** They see only `/portal`. The Member navigation in the prompt
  (Case Files, Agents, Approvals) would widen what Members can reach. That needs your call
  (section 6, decision A).
- **Prompt 2 is not on `main`.** Its four commits are on `claude/configuration-discovery`. They add
  the configuration data layer but no screens. So Configuration, Templates, Template Library and
  Platform Defaults have nothing to link to yet.

## 2. What is reused (nothing here changes)

All of this stays exactly as it is:

- **Tokens:** `src/app/globals.css`. This covers:
  - the brand scale `brand-50…950`;
  - neutrals `ink-950…700`;
  - status colours `flag-good/warning/critical`;
  - text tones `silver` and `dim`;
  - control heights `control-sm/md/lg`;
  - radii, motion, and the shadcn semantic tokens.
- **Fonts:** `src/lib/fonts.ts` (Inter Display, Geist Mono).
- **Class recipes:** `src/lib/ui.ts`. This covers:
  - the type scale: `pageTitle`, `sectionTitle`, `cardTitle`, `eyebrow`, `sectionLabel`;
  - surfaces: `surfacePad`, `pageStack`, `cardStack`, `insetChrome`, `filterBar`, `formMeasure`.
- **Components (`src/components/ui/`):**
  - `sidebar` (coss, with an icon rail and a phone sheet);
  - `page-header`, `breadcrumbs`, `tabs` (`NavTabs`, `SegmentedControl`);
  - `badge`, `status-badge`, `kpi-card` (`KpiCard`, `KpiGrid`), `panel`, `card`;
  - `table`, `data-table`, `stepper`, `skeleton`, `states` (`Notice`, `LoadingRegion`), `empty-state`;
  - `sheet`, `drawer`, `scroll-area`, `toolbar`, `menu`, `popover`, `command`, `tooltip`, `avatar`.
- **App pieces (`src/components/app/`):**
  - `app-shell`, `app-sidebar`, `app-nav-links`, `mobile-dock`;
  - `workspace-switcher` (with `StaffWorkspaceBand`), `org-switcher`, `user-menu`;
  - `notification-bell`, `jump-palette`, `page-frame`, `page-skeletons`, `page-loader`,
    `connection-status`, `glow-link-card`.
- **Auth:** `components/auth/auth-card.tsx`, the centred card used by sign-in.
- **Icons:** `lucide-react`. Tabler is also installed.
- **Charts:** `components/ui/chart.tsx`.

**Confirmed: nothing in this prompt requires changing any of the above.** New layout pieces are
built from these and from the existing spacing scale. No new dependency is needed.

## 3. Every page today, by who can reach it, and how it is laid out

Legend: **S** = inside `AppShell` (sidebar, top bar, 1400px max width, `PageFrame` header).

| Area | Pages | Who | Layout today | Phone today |
|---|---|---|---|---|
| Sign-in | `/login`, `/accept-invite/[token]`, `/no-access` | Anyone | Centred `AuthCard`, no shell | Works |
| Public site | `/`, `/book`, `/book/calendar`, `/contact`, `/privacy`, `/terms`, `/disclaimer` | Public | Marketing header/footer | Works |
| Home | `/app/home`, `/app/home/[metric]`, `/app/home/activity` | Owner, staff (Operators can open it; it's in their rail) | **S**, but Home uses its own header at 768px wide, not `PageFrame` | Works, single column |
| Ask Vistrial | `/app/ask` | Everyone in `/app` | Full-screen chat with its **own rail** (nav, org switcher, account), no app sidebar or dock | Own sheet menu |
| Ask history and assets | `/app/ask/history`, `/app/ask/assets`, `/app/ask/assets/[id]` | Everyone in `/app` | **S**; history is a table | History table is cramped |
| To call | `/app/queue` | Owner, Operator, staff | **S** | Works, has the dock |
| What happened | `/app/log` | Owner, Operator, staff | **S** | Works, has the dock |
| People (case files) | `/app/cases`, `/app/cases/[id]`, `/app/cases/[id]/brief` | Owner, Operator (assigned and unassigned), staff | **S**; the list and the case file are separate pages | Works |
| Calls | `/app/calls`, `/app/calls/[id]` | Owner, Operator, staff | **S** | Works |
| Follow-up draft | `/app/follow-ups/[id]` | Owner, approvers, staff | **S** | Works |
| Forsight | `/app/forsight` (redirects to pipeline), `/pipeline`, `/reports`, `/reports/[period]`, `/creatives` (switched off) | Owner, staff | **S** plus Forsight tabs | Pipeline works; report tables are cramped |
| Forsight, staff only | `/app/forsight/sources`, `/app/forsight/workspaces` | Staff | **S**, tables | Tables are cramped |
| Numbers | `/app/reporting`, `/adoption`, `/calibration`, `/coaching`, `/client` | Staff (in the "More" list) | **S** plus tabs, `DataTable` | Partly; some columns hide |
| Settings, everyone | `/app/settings/profile`, `/notifications`, `/history` | All `/app` users | **S** plus settings tabs | Forms work; the History table is cramped |
| Settings, owner | `/app/settings/organization`, `/members` | Owner, staff | **S** plus tabs | The members table is cramped |
| Settings, staff | `/approvals`, `/integrations` (and `/advanced`), `/advanced`, `/business-profile`, `/scoring`, `/follow-up` (switched off), `/data`, `/vistrial`, `/agents` | Staff | **S** plus tabs | Forms work |
| Setup wizard | `/app/onboarding`, `/[stage]`, `/approvals`, `/report`, `/vistrial` | Staff seat in a workspace that isn't set up | Its **own wizard chrome** (logo, "Setup", account), 768px wide, stage rail | Works |
| Vistrial team | `/app/team`, `/staff`, `/holds`, `/activity` | Service Team (workspaces and activity); Platform Admin (all four) | **S** plus team tabs, tables | Tables are cramped |
| System | `/app/ops` | Platform Admin | **S**, `DataTable`, 652 lines | Cramped |
| Coaching, Activity | `/app/coaching`, `/app/activity` | Staff; switched off by product scope | **S** | n/a |
| More, Install | `/app/more`, `/app/install` | All `/app` users | **S** | Works |
| Customer portal | `/portal` (and `/portal/export`) | Owner, **Member**, staff | **Own header**, 896px wide, no sidebar, no phone nav | Single column; no navigation |
| Stellar | `/stellar` (redirects), `/stellar/log`, `/stellar/console`, `/stellar/portal` | Stellar placed setter, Stellar staff, Stellar client | **Own header**, 896px wide, sign-out only | Single column; the portal table is cramped |
| Errors | `app/error.tsx`, `app/not-found.tsx`, `app/loading.tsx`, `src/app/error.tsx`, `global-error.tsx` | All | `PageFrame` inside the shell. There is no root `not-found` (Next's default shows) | Works |

## 4. Current navigation

**Customer and staff working app (`/app`).** The rail comes from `PRIMARY_NAV` in
`src/lib/navigation.ts`. It is one flat group with no section labels and no count badges.

| Item | Path | Who sees it |
|---|---|---|
| Home | `/app/home` | Everyone in `/app` |
| Ask Vistrial | `/app/ask` | Everyone in `/app` |
| Forsight | `/app/forsight` | Owner, staff |
| To call | `/app/queue` | Operator, staff |
| People | `/app/cases` | Everyone in `/app` |
| Settings | `/app/settings` | Everyone in `/app` |

- **More (`/app/more`) and the jump palette (⌘J)** add: Portal, What happened, Calls, plus Coaching,
  Activity and Numbers for staff.
- **Staff get a second list** (`DA_CONSOLE_LINKS`): System, Agents, Tracking sources, All workspaces.
- **Account menu:** You, Portal, Vistrial team, System, and Sign out.

**Phone dock (Operators only):**

- To call;
- What happened (the highlighted action);
- Person (the last person opened).

Owners get no dock, and the dock is hidden on Ask.

**Staff.**

- The workspace switcher is in the top bar. It:
  - is searchable;
  - shows each workspace's status;
  - remembers the last workspace in a cookie;
  - reloads the page on switch.
- The team area is reached from the account menu ("Vistrial team"). It has tabs: Workspaces, Staff,
  Holding area, Activity.

**Customer portal.** A header with the business name and the account menu. Owners also get
"Forsight" and "People" text links, hidden on phones. Members get no navigation at all.

**Stellar.** No navigation. Each identity lands on its one page:

- a placed setter goes to Log;
- Stellar staff go to Console;
- a client goes to Portal.

**Forsight, Settings, Team, Numbers.** Each uses `NavTabs` under the page header.

## 5. Shell pieces to upgrade, and layout pieces that do not exist yet

**Upgrade in place (same files, same look):**

| Existing | Becomes |
|---|---|
| `AppShell` | The one shell for `/app`, `/portal` and `/stellar`, with the wizard and chat branches folded in as layouts |
| `app-sidebar` + `app-nav-links` | Role-aware grouped navigation with section labels, count badges, nested items and the active state |
| `lib/navigation.ts` | One navigation model per role (Owner, Member, Operator, Service Team, Platform Admin), unit-tested |
| `mobile-dock` | Bottom navigation: 4–5 items per role plus "More", for every role |
| `StaffWorkspaceBand` | Workspace cue strip: name, status and a thin brand tint, plus the status banner |
| `WorkspaceSwitcher` | Adds "No workspace", for platform pages |
| `user-menu` | Adds role in plain words, personal settings and help; removes internal names |
| `use-sidebar-collapsed` | Adds a tablet default (rail) without overriding a saved choice |
| `PageFrame` / `PageHeader` | The Standard page header, used by all eight layouts |
| `page-skeletons` | Skeletons per layout |
| `AuthCard` | Base of the Message and Error layout |

**Layout pieces to build (layout only, existing visual style):**

1. **Top bar.** Title and breadcrumbs on the left. On the right: search, notifications, help and
   account. Search reuses the jump palette and stays scoped to the current workspace.
2. **Bottom navigation bar and "More" sheet.** The sheet uses `Sheet`.
3. **Workspace status banner.** Covers paused, onboarding and closed, using `Notice`.
4. **Shell footer.** Legal links and the product version.
5. **The eight layouts:**
   - `StandardPage`;
   - `DashboardPage` (stat row from `KpiGrid`, then a 3 → 2 → 1 panel grid);
   - `ListDetailPage`;
   - `TablePage` (sticky header and filter bar);
   - `RecordPage` (header block, tabs, main area and side panel);
   - `WorkflowPage` (`Stepper`, step area, sticky footer);
   - `ChatPage` (conversation and activity panel);
   - `MessagePage` (sign-in, not found, no access, maintenance and loading).
6. **`ResponsiveTable`.** A wrapper that renders the existing `Table`/`DataTable` rows as stacked
   cards below the `sm` breakpoint. It wraps them; it doesn't change them.
7. **Root `not-found` and a maintenance page.** Both use `MessagePage`.
8. **The layout reference page.** It is Platform Admin only and returns not-found to everyone else.

## 6. Conflicts with what exists, and what I propose

Each item has a recommendation. Reply "as recommended" or change any of them.

**A. Member navigation would widen Member access.**

- Today Members are redirected out of `/app` and see only `/portal`.
- The prompt lists Overview, Case Files, Approvals (if granted), Agents and Results for Members.
- The database allows Members to read leads, but no Member-safe case file, approvals or agents
  screen exists.

*Recommendation:*

- Members move into the shell, and their navigation lists only what they can reach today: Overview
  and Results (both `/portal`).
- The other three slots are defined in the nav model but stay hidden until a screen prompt builds
  Member-safe versions.
- No Member gets new access in this prompt.

**B. Several navigation items have no page yet.**

*Recommendation:* map each item to the existing page where there's an honest match, and hide the
item where there isn't. No placeholder pages.

| Item | Maps to |
|---|---|
| Overview | `/app/home` |
| Case Files | `/app/cases` (the label changes from "People") |
| Approvals | The approval queue on Home, reached at `/app/home#approvals`, until an Approvals screen exists |
| Results | `/portal`, with Forsight nested under it for Owners and staff |
| Settings | `/app/settings` |
| Agents | Hidden for customers. `/app/settings/agents` is described in the code as "not a client control" |
| My Leads | `/app/queue` |
| Today | `/app/log` (what happened and what to confirm), until the Today screen exists |
| Profile | `/app/settings/profile` |
| Client Roster | `/app/team` |
| Operator Logs | `/app/team/activity` |
| Onboarding | `/app/onboarding` |
| Configuration | `/app/settings/advanced` and the staff settings tabs |
| Workspaces, Assignments | `/app/team` (assignments are managed there) |
| Activity Log | `/app/team/activity` |
| Escalations | Hidden (no concept exists). Platform Admins see "Holding area" (`/app/team/holds`) in that group |
| Templates, Template Library, Platform Defaults | Hidden until Prompt 2's screens exist |
| Billing | Hidden (nothing exists) |

The nav model lists every slot, so each one appears as soon as its screen is built.

**C. Pages the prompt's navigation doesn't mention:** Ask Vistrial, Forsight, Calls, Numbers,
System, More, Install.

*Recommendation:*

- **Ask Vistrial:** stays a top-level item for Owners and staff. It is today's front door and the
  later "Sales OS chat page".
- **Forsight:** nested under Results.
- **Calls:** nested under Case Files.
- **Numbers and System:** go in the Platform Admin group. Numbers is also visible to Service Team,
  as today.
- **More and Install:** stay reachable as today.

No page loses a way in.

**D. Stellar doesn't run on a Vistrial workspace seat.** Stellar staff can have no `/app`
membership, and the shell's `OrgProvider` needs one.

*Recommendation:*

- The shell takes a navigation model as input.
- Stellar renders inside the same shell with its own navigation for each identity:
  - a placed setter gets Log;
  - Stellar staff get Console;
  - a client gets Portal.
- It has no workspace switcher and keeps its addresses and host.
- Stellar's auth and gates are untouched.

**E. Another company's name is shown in the interface.** Violates "Everything shown is Vistrial".

| Where | Today | Proposed |
|---|---|---|
| `/app/more` | Heading "Divine Acquisition" | "Vistrial team" |
| Forsight sources and workspaces | Eyebrow "Divine Acquisition only" | "Vistrial team only" |
| Stellar console | "DA Console", "DA access log" | "Vistrial team console", "access log" |

These are copy-only fixes. Code comments that mention the company are not shown and stay as they
are.

**F. Blocked pages redirect today; they don't show not-found.** Staff and admin gates send people
to `/app/queue` or `/portal`.

*Recommendation:*

- Add a neutral not-found response for role-blocked routes inside the shell.
- Who is blocked doesn't change; only what a blocked person sees.
- The `/app` → `/portal` redirect for Members stays a redirect, because that is their home and not
  a block.

Say no if you'd rather keep the redirects.

**G. The operator's phone bar drops "What happened" as its own button.** Today it is the
highlighted phone action. It is also tied to the mobile-outcome training flag.

*Recommendation:* the "Today" slot points to `/app/log` and keeps the highlighted style, so the
one-handed logging action survives.

**H. "No workspace" for staff.**

- Every session currently has an active workspace (`AuthContext` requires one).
- *Recommendation:* "No workspace" is a shell mode, not an auth change.
  - Platform pages (team area, System, the reference page) render with the switcher reading
    "Platform" and no customer cue.
  - Choosing "No workspace" goes to the Client Roster.
  - The session and data rules are untouched.

**I. A Member's "Results" is the portal.** It moves into the shell with a sidebar. Its content and
access stay the same.

**J. The public marketing site.**

- The prompt says "every page" uses the shell. The marketing site is public and has no signed-in
  person or role.
- *Recommendation:* leave it out of the shell, and list it as intentionally outside it.

**K. Old demo files.**

- `components/sidebar-demo.tsx` and `components/ui/aceternity-sidebar.tsx` aren't used by any page.
- A test asserts that the shell doesn't use the aceternity sidebar.
- *Recommendation:* list them, don't delete them. They are components, which this prompt says not
  to touch.

## 7. Product-specific components later screens will need (not built here)

- **Approvals:** approval card (draft, reason, approve/edit/decline).
- **Response clock:** a speed-to-lead timer shown on a lead.
- **Agents:** agent activity item, and agent status row and controls for the customer Agents page.
  `sales-os/agent-state.tsx` covers the chat side only.
- **Escalations:** escalation item and its triage states.
- **Operator logs:** log entry and a confirm-summary card (for Today).
- **Today:** follow-up due item.
- **Client Roster:** roster row with workspace health.
- **Templates:** template card and the "inherited, overridden or custom" field marker (Prompt 2
  screens).
- **Billing:** summary.
- **Onboarding:** go-live checklist item.
- **Chat:** live activity feed item for the chat side panel (partly in `sales-os`).

## 8. The plan

**Branch:** `claude/app-shell-layouts`. Each step is a separate commit, checked before the next. The
checks are typecheck, unit tests, lint and a production build. Before the first change I install
dependencies and record the baseline: test count, lint errors and build status.

1. **Navigation model and tests.** One pure function from role to navigation. Unit tests pin each
   of the five roles to exactly the items in section 6B.
2. **Shell upgrade.** In `AppShell`:
   - grouped sidebar with badges;
   - top bar with search, notifications, help and account;
   - workspace cue strip and status banner;
   - bottom navigation and the More sheet;
   - tablet rail default;
   - footer;
   - print rules (`print:hidden` on the chrome).

   Every `/app` page picks this up without moving.
3. **The eight layouts and `ResponsiveTable`**, as components.
4. **Move pages, simplest first:**
   1. Message pages: sign-in, accept invite, no access, root and app not-found, error, loading,
      maintenance.
   2. Standard: settings tabs, install, more, profile.
   3. Table: team area, settings members and history, Ask history, Forsight reports, sources and
      workspaces, System.
   4. Dashboard: Home, Home metric, Forsight pipeline, Numbers.
   5. List-and-detail and Record: queue, log, case files, calls, follow-up draft.
   6. Workflow: setup wizard. Its separate chrome is folded into `WorkflowPage`.
   7. Chat: Ask Vistrial. Its own rail overlaps the sidebar. If folding it in risks behaviour, I wrap
      it in the shell as is and list it.
   8. Customer portal into the shell, with Member navigation.
   9. Stellar into the shell, with its own navigation.
5. **Layout reference page:** `/app/team/layouts`.
   - Platform Admin only; not-found for everyone else.
   - Also not-found in production unless the person is a Platform Admin.
   - Shows all eight layouts and the shell at phone, tablet and desktop widths (iframes at 390,
     820 and 1440px) with sample content.
6. **Remove the old wrappers** once unused: the portal header, the Stellar header, the wizard
   chrome, and the conversation branch in `AppShell`. List what was removed.
7. **Report:** `05-shell-layouts-report.md`.

## 9. How each Done When will be checked

**Navigation per role.**

- Unit tests on the navigation model, for all five roles.
- A browser check per role when sign-in can run locally.

**Workspace cue and switching.**

- Code check: the cue strip renders whenever `isStaff` and not on a platform page.
- Switching already does a full reload. I add a skeleton gate keyed on the workspace, so nothing
  from the previous workspace can render.

**No switcher for customers.**

- A unit test confirms customers' shell state never contains other workspaces' names.
- The existing `OrgSwitcher` shows an owner's own businesses only.

**Layouts, phone, bottom navigation, stacked tables.**

- Playwright (Chromium is installed) screenshots each layout at 360, 390, 768, 1024, 1440 and
  1920px.
- Each run asserts there's no horizontal page scroll (`scrollWidth <= innerWidth`).
- Also checked at 200% zoom and with large text.

**No component, colour, font or token changed.** `git diff main --stat` is empty for:

- `src/app/globals.css`;
- `src/components/ui/`;
- `src/lib/ui.ts`;
- `src/lib/fonts.ts`;
- `src/fonts/`.

**No route or permission changed.**

- A before/after list of every `page.tsx` and `route.ts` path.
- `git diff` is empty for:
  - `src/lib/auth/permissions.ts`;
  - `src/lib/auth/gates.ts` (except decision F, if approved);
  - `supabase/`;
  - `src/proxy.ts`;
  - `src/lib/domains/`.
- The existing permission tests still pass.

**Risk:** signing in as each role in a browser needs a local Supabase with the seed. If that can't
run in this environment, the browser checks run against the reference page and a local-only
preview. The report will say which checks ran in a browser and which were checked in code.

## 10. Decisions I need from you

1. A: Member navigation limited to what Members can reach today (recommended), or widen Member access.
2. B: hide navigation items that have no page yet (recommended), or show placeholder pages for staff.
3. Prompt 2 isn't merged. Should this branch start from `main` (recommended) or from
   `claude/configuration-discovery`?
4. F: neutral not-found for role-blocked pages (recommended), or keep today's redirects.
5. E: approve the copy changes that remove the other company's name.
