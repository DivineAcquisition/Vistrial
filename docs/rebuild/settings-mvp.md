# Settings: the map

One Settings page at `/app/settings`, with the group kept in the URL (`?section=business|people|agents|data|billing|you`).
Groups are in a left column on wide screens and a select on a phone. Each group is a stack of **status cards**: each card
says what is true now in a sentence, says who a change reaches, and holds its controls underneath.

Legend: **[built]** in this PR · **[next]** the next piece · **[later]** after that · **[not planned]** deliberately out.

## Roles (enforced on the server)

| | Owner | Manager | Rep |
|---|---|---|---|
| Business, People, Agents, Data, Billing | read and change | read only | no access (queries refuse) |
| Support access log (staff grants, reasons) | read | no | no |
| You | own choices | own choices | own choices |

Managers change only what the code already allowed them before (results files, profile drafts, facts). Every
workspace-wide change writes an `auditLog` row (ids and counts only, never text).

## Business

- **[built]** Workspace name: rename (owner, audited `workspace.renamed`).
- **[built]** Country for phone numbers (`workspaceSettings.defaultCountry`, owner, audited `settings.country_updated`).
- **[built]** Business profile: status card; the existing `ProfileEditor` opens inside it. `/app/profile` redirects here.
- **[built]** Memory: count of business facts and a link to the Growth Architect's memory folder.
- **[later]** Time zone editing.

## People

- **[built]** Members: name, email, role, joined. Change role and remove (owner only, never the last owner, audited
  `member.role_changed` / `member.removed`). A removed member keeps their row (inactive, `removedAt`); invited back,
  the same row is reactivated.
- **[built]** Invites: create with a role (existing `workspace.invite`), one-time link shown to copy, pending list,
  cancel (owner, audited `invite.canceled`; a cancelled link is refused by `acceptInvite`). Links open `/join`, which
  signs the person in and accepts. `/app/team` redirects here.
- **[built]** Vistrial support access: a switch for `workspaceSettings.serviceTeamAccess` (owner, audited
  `support_access.on|off`). Turning it off also ends any open grant at once. The owner sees a read-only log of
  `staffAccessGrants`: who (staff role and a short reference), when, reason, expiry, whether it ended early, and how
  many times staff opened the workspace under it (from `staff.entered` audit rows).
- **[later]** Sending invite emails (today the owner copies the link).

## Agents

- **[built]** Catalog: every agent, live or planned, with its skills (read-only, from the catalog).
- **[built]** On/off for live agents (existing `workspace.setAgentState`, owner only).
- **[built]** Pause and caps (existing `controls.setPaused` / `controls.setCaps`). `/app/controls` redirects here.
- **[built]** Default research quality, fast or thorough (`workspaceSettings.defaultResearchMode`, owner, audited
  `settings.research_mode_updated`). The chat box starts on it until a chat picks its own.
- **[later]** Per-skill caps for skills that have their own budget.

## Data

- **[built]** Meta ads and Results files status cards, linking to the existing manage pages (whose back link now
  returns to Settings → Data). `/app/connections` redirects here, except when Facebook Login returns with `?meta=`.

## Billing

- **[built]** A link to `/app/billing` (owned by the billing work; not changed here).

## You

- **[built]** Account card and a button to Clerk's account page (password, sessions, two-step sign-in).
- **[built]** Theme: light, dark or system. Uses the existing cookie/localStorage theme sync (now with "system",
  which follows the device) and saves the choice on `memberPreferences`.
- **[built]** In-app notices: check-ins due, questions waiting, report ready (`memberPreferences`, per member).
- **[later]** Delivering the notices themselves by these choices.

## Developer (staff only)

- **[next]** A staff-only Developer section. Not built in this PR.

## Not planned

Slack/Discord, other integrations, hooks/webhooks, API keys, automations, affiliate, multi-business switching.
They are not shown, not even as "coming soon".

## Schema changes (all optional fields or new tables)

- `members.email?`, `members.removedAt?`
- `invitations.canceledAt?`, `invitations.invitedBy?`
- `workspaceSettings.defaultResearchMode?`
- new table `memberPreferences` (`workspaceId`, `userId`, `theme?`, `notifyCheckInsDue?`, `notifyQuestionsWaiting?`,
  `notifyReportReady?`, `updatedAt`)

## Where things are

- Server: `convex/settings.ts`, tests in `convex/settings.test.ts`; small changes in `convex/workspace.ts`.
- Screen: `src/components/settings/*`, page `src/app/(product)/app/settings/page.tsx`, invite page `src/app/join`.
- Story: `/dev/settings?section=…&role=owner|manager|rep&support=off`. Screenshots in `docs/screenshots/settings`.
