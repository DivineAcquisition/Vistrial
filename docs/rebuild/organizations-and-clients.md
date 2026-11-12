# Accounts, organizations and clients

Step 1 of 3 of the multi-organization rebuild. This document is the design the code in this step follows,
and the place steps 2 (sidebar, Home, Tasks board, Briefing) and 3 (side chat panel, Library > Chats) read
before they start.

Status of each part is marked **[PR 1]** to **[PR 4]** (this step), **[step 2]**, **[step 3]** or **[later]**.

## 1. The owner's decisions

These come from the discovery interview and are settled. Quoted words are the owner's.

**Who the customers are.** Agencies, consultants, coaches and info sellers. Every sample and dev story uses
those: an agency such as "Northlight Growth" with business clients, or a coach with individual clients.
Never a cleaning or home-service company as the customer.

**Three levels.**

1. **Account**: the paying owner, the billing, one shared credit balance.
2. **Organization**: one of the owner's *own* businesses (their agency, their coaching brand). Each has its
   own team, agents, connections, Briefing and Tasks. Today's `workspaces` are organizations.
3. **Client**: someone an organization serves. One word, "Client", everywhere. A client has a type:
   **business** (company profile, brand kit, offers, ad results) or **person** (their goals, where they are
   now, notes and call transcripts). Agent work is done either for the organization itself or for one of
   its clients. Clients do not log in.

**Billing.** One account, shared credits. $179 a month covers the first organization, with $150 of credits,
as now. Each extra organization adds **$99 a month and $50 of credits** to the shared pool. The reason:
"over time more users will cost and maintain systems; I need to make sure our cost of servicing them is
worth it and we get a profitable return." Clients are not charged for and not capped for now. **The standing
cost per client should be measured** (section 6.6) so that decision can be revisited with numbers.

**People.** A person is invited to the account and given access to **chosen organizations, with a role per
organization**. Roles inside an organization:

- **Owner**: billing and everything.
- **Admin**: runs the organization, approves, connects accounts.
- **Member**: works with agents and tasks; cannot approve spending or publishing.
- **Viewer**: read-only.

These replace owner / manager / rep. Inside an organization, Admins **assign people to clients**: a Member
or Viewer sees only the clients they are assigned to (plus the organization's own work if granted); Owners
and Admins see all.

**Choosing scope in the app.** At the top of the sidebar: an organization selector, and under it a client
picker with "All clients", "<Organization> itself", or one client. Everything on screen filters to that
choice. Under those sit the Attract | Convert | Keep tabs (moving them is step 2; room is left).

**What steps 2 and 3 need from the data** (screens are not built here): tasks proposed by agents and
approved by people, with expected return, credit cost and evidence, statuses Proposed / Approved / Running /
Needs you / Done and a recorded Result; personal notes-to-self; a "Briefing" feed of approvals, a weekly
growth report, finished work, alerts, drafts to review, and industry trend posts that can be switched off
per organization in Settings; approvals required for anything that goes public, spending above a limit the
owner sets, changes inside connected accounts, housekeeping, and tasks an agent wants to run. Every one of
these is scoped to an organization and optionally a client.

## 2. Words

| On screen | In code | Notes |
|---|---|---|
| Account | `accounts` | New table. The Autumn customer and the credit balance belong here. |
| Organization | `workspaces` | **Not renamed in code.** A workspace *is* an organization; only wording changes. |
| Client | `clients` | New table. `type: "business" \| "person"`. |
| Owner / Admin / Member / Viewer | `members.role` | Stored as `owner` / `admin` / `member` / `viewer`. Old rows hold `manager` and `rep` until the backfill has run. |

`workspaceId` stays the argument every function takes. Renaming it across about 120 modules would be a very
large diff with no change in behaviour, and every stored row already carries the field.

## 3. Data model

Every change is additive: new tables, or optional fields on existing ones. Nothing is dropped or rewritten
in the PR that introduces its replacement.

### 3.1 New tables

```ts
/** The paying customer: who is billed and whose credits every organization under it spends. */
accounts: {
  name: string,
  /** The Autumn customer id. For an account made from an existing workspace this is that workspace's id,
      so the customer Autumn already has is reused and nothing moves in Autumn or Stripe. */
  billingCustomerId: string,
  createdBy: string,           // Clerk user id
  createdAt: number,
  /** An organization the Owner confirmed and is paying for at checkout; created when the payment lands. */
  pendingOrganization?: { name: string, requestedBy: string, requestedAt: number },
}                                                             // [PR 2], pendingOrganization [PR 4]

/** A person on the account. Their reach into each organization is a `members` row there. */
accountMembers: {
  accountId, userId, displayName, email?,
  /** "owner" manages billing and organizations, and is Owner in every organization of the account. */
  role: "owner" | "member",
  active: boolean, removedAt?: number,
}   indexes: by_account, by_user, by_account_user             // [PR 2]

/** Someone an organization serves. Clients do not log in. */
clients: {
  workspaceId, type: "business" | "person", name, normalizedName,
  status: "active" | "archived", archivedAt?,
  /** type "business" */
  business?: { website, industry, offer, audience, geography, notes },
  /** type "person" */
  person?: { goals, currentState, notes },
  createdBy, createdAt, updatedAt,
}   indexes: by_workspace [workspaceId, status, updatedAt]     // [PR 3]

/** A Member or Viewer may see this client. Owners and Admins need no row. */
clientAssignments: {
  workspaceId, clientId, memberId, assignedBy, assignedAt,
}   indexes: by_workspace_member, by_workspace_client          // [PR 3]
```

### 3.2 Optional fields on existing tables

| Table | Field | PR | Meaning |
|---|---|---|---|
| `workspaces` | `accountId?` + index `by_account` | 2 | The account the organization belongs to. Missing only until the backfill reaches the row. |
| `members` | `role` union widened to six values | 2 | `owner, manager, rep` (old) and `admin, member, viewer` (new). Readers always go through `roleOf()`. |
| `members` | `ownWork?: boolean` | 3 | For a Member or Viewer: may they see the organization's own work (records with no client)? **Missing means yes**, so nobody loses sight of anything on the day this ships. |
| `invitations` | `accountId?`, `grants?: [{ workspaceId, role }]`, `role` widened | 2 | One invite, several organizations, a role in each. An old invite (no `grants`) still works as one grant. |
| `billingAccounts` | `accountId?` + index `by_account`, `extraOrganizations?` | 4 | The mirror becomes one row per account. `workspaceId` stays as the row's original organization. |
| `billingLedger` | `accountId?` + index `by_account_at` | 4 | `workspaceId` keeps saying which organization spent; `accountId` says whose balance paid. |
| `researchProjects`, `offerCards`, `brandKits`, `assets`, `teardownRequests`, `decisions`, `callTranscripts`, `resultUploads`, `creativeRequests`, `intakes`, `agentRuns` | `clientId?` | 3 | The client the work is for. **Missing means the organization itself.** |
| `integrationConnections`, `metaConnections` | `clientId?` | 3 | A connection that belongs to one client, such as a client's ad account. See 3.4. |

A record's client is set when it is made and follows from its parent where there is one: a run takes its
project's client, an asset its run's, a decision its project's, a creative request its brand kit's. Step 2
and 3 records do the same.

### 3.3 Brand kits and real clients

Brand kits already hold "one for the business and one per client": `brandKits.kind` is `"own"` or
`"client"`, and a client kit is only a name. That idea becomes the real thing:

- `brandKits.clientId?` is added. `kind` stays and keeps its meaning.
- The backfill visits every `kind: "client"` kit with no `clientId`, creates a **business** client named
  after the kit (website and industry copied from the kit's current version), and links the kit to it.
  Kits, versions, logos and every creative that names a kit are untouched. Running it again changes nothing
  because a linked kit is skipped.
- So that nobody loses sight of a kit they could open yesterday, each active Member and Viewer of that
  organization is assigned to every client the backfill creates.
- After this, making a client kit means choosing (or adding) a client. A business client has at most one
  kit; the own kit stays one per organization. A person client has no brand kit.

### 3.4 Connections that belong to a client

Today there is one Meta connection per organization and one connection per provider per organization.
An agency needs its own ad account *and* one per client. The key becomes (organization, client or none):

- `integrationConnections`: index `by_workspace_provider_client`. Lookups that mean "the organization's
  own connection" ask for `clientId: undefined`, which is every row that exists today.
- `metaConnections`: the same, with index `by_workspace_client`.
- Decisions and creative tests read "current figures" from the connection of the record's client, falling
  back to none (never to another client's account).

PR 3 adds the `clientId` fields. No row with a client is ever written yet, so every existing lookup still
finds the organization's one connection and behaviour is unchanged; a client's work never reads it. **Connecting a second account for a client from the screen is not in PR 3**
(the Meta sign-in state, sync cron and snapshot tables all assume one row); it is listed under "not built"
there and is the first thing a client-results screen in step 2 will need.

## 4. Roles and permissions

### 4.1 The four roles

`convex/lib/roles.ts` is the only place that knows the old words:

```ts
roleOf("owner") === "owner"   roleOf("manager") === "admin"   roleOf("rep") === "member"
isOwner(role)   // owner
isAdmin(role)   // owner or admin
canWork(role)   // owner, admin or member: everyone except a Viewer
```

### 4.2 The builders

Every public function still goes through a builder (the `guard` test refuses a raw `query`, `mutation` or
`action`). The builders change like this:

| Builder | Who passes | Change |
|---|---|---|
| `workspaceQuery` | any active member | Adds `ctx.role` (normalised) and `ctx.clients` (4.4). |
| `workspaceMutation` | Owner, Admin, Member | **Now refuses a Viewer.** A write a Viewer needs uses `selfMutation`. |
| `selfMutation` (new) | any active member | Only for a person's own choices: theme, notices, their own name and email on their row, the planned-agent waitlist. |
| `adminMutation` (new) | Owner, Admin | Approving, connecting accounts, people and client assignments. |
| `ownerMutation` | Owner | Unchanged. |
| `adminQuery` (was `managerQuery`) | Owner, Admin | Same check with the new words. |
| `memberAction` | Owner, Admin, Member | **Now checks membership itself** (it did not: each action remembered to). `ctx.role` is given to the handler. `viewerAction` exists for the few read-only actions. |

Putting the Viewer check in `workspaceMutation` rather than in each handler means a new mutation is
read-only-safe by default; forgetting is no longer possible.

### 4.3 Who can do what

| | Owner | Admin | Member | Viewer |
|---|---|---|---|---|
| See the organization (shell, Home, lists) | yes | yes | assigned clients, own work if granted | assigned clients, own work if granted |
| Start agent work: research, offers, creative, page teardowns, chat | yes | yes | yes, inside their clients | no |
| Edit profile, facts, brand kits, offers, goals, results files, transcripts | yes | yes | yes, inside their clients | no |
| Record a decision and its outcome | yes | yes | yes, inside their clients | no |
| Leads: see | all | all | their own | their own |
| **Approve: anything that goes public** (an asset, an ad set, a page change) | yes | yes | no | no |
| **Approve: spending above the limit** | yes | yes | no | no |
| **Approve: a change inside a connected account** (browser steps) | yes; restricted steps Owner only, as now | yes, except restricted steps | no | no |
| **Approve: housekeeping** (merges, archiving, deleting) | yes | yes | no | no |
| **Approve: a task an agent wants to run** | yes | yes | no (may propose and comment) | no |
| Connect or disconnect an account; grant an agent use of it | yes | yes | no | no |
| Clients: add, edit, archive; assign people | yes | yes | no | no |
| People: invite to this organization, change a role, remove | yes | yes, up to Admin; cannot touch an Owner | no | no |
| Organization settings: name, country, agents on or off, caps, pause, trend posts, the spending limit | yes | yes | no | no |
| Vistrial support access switch and its log | yes | no | no | no |
| Billing: see the balance | yes | yes | yes | yes |
| Billing: see the ledger and what each organization used | yes | yes (their organizations) | no | no |
| Billing: subscribe, buy credits, auto-refill, Stripe portal | yes | no | no | no |
| Add or archive an organization | yes | no | no | no |
| Their own theme and notices | yes | yes | yes | yes |

Two rows changed meaning on purpose and are worth the owner's eye:

1. **A former Rep is now a Member, and a Member can start agent work.** A Rep could not. That is what the
   owner decided a Member is ("works with agents and tasks"); it does mean a person who was a Rep yesterday
   can spend credits today, inside the caps the organization already sets. Open question 1.
2. **A former Manager is now an Admin, and an Admin can connect accounts and manage people.** Only the
   Owner could. Again this is the decision as stated ("runs the organization, approves, connects accounts").

A single-owner account sees no change at all.

### 4.4 Client scope

Each builder works out once per call what the member may see:

```ts
ctx.clients = {
  all: boolean,                     // Owner or Admin
  ownWork: boolean,                 // may see records with no client
  ids: Set<Id<"clients">>,          // assigned clients (empty when all)
  sees(clientId | undefined): boolean,
  require(clientId | undefined): void,   // throws the same "Not found." as a missing record
  filter<T extends { clientId?: Id<"clients"> }>(rows: T[]): T[],
}
```

Rules every client-scoped function follows:

- **Get by id**: load the row, check `workspaceId`, then `ctx.clients.require(row.clientId)`. A client the
  member is not assigned to answers "Not found.", exactly like a row in another organization, so nothing
  about its existence leaks.
- **List**: `ctx.clients.filter(rows)`, then the picker's choice (`scope` argument: missing = everything
  visible, `"own"` = the organization itself, or a client id).
- **Create**: the new row's `clientId` comes from an argument, and `ctx.clients.require(clientId)` runs
  before the insert. A child takes its parent's client and never accepts one from the caller.
- A client id from another organization fails the `workspaceId` check first.

**As built (PR 3).** The three rules are enforced one level lower than each function, so none can forget:

- `lib/clientGuard.ts` wraps the database a Member or Viewer reads through. Every row that belongs to a
  client is left out of `get`, `first`, `unique`, `take`, `collect`, `paginate` and iteration unless the
  member may see that client. A row belongs to a client through its own `clientId`, or through its parent:
  a run's steps, an asset's versions and evidence, a project's sources and chats, a kit's versions, a
  card's versions, an intake's messages. An asset with no `clientId` takes its run's. The builders hand the
  handler this database in place of `ctx.db`. Owners and Admins get the plain one.
- The picker is the same mechanism: every `workspaceQuery` takes an optional `scope` (`"own"` or a client
  id) and narrows the guard to it, for any role. So a list filters to the picker's choice without each
  query being changed, and `scope` can only take away, never add.
- `clientForNew(ctx, clientId)` is the create rule: the client is in this organization, visible to the
  member, and not archived.
- The explicit `requireClientIn` checks in the shared loaders (`ownProject`, `ownKit`, `ownCard`, the
  transcript and upload loaders) stay as a second line.

**What an agent reads for a client.** `readBusinessContext` gives a client's run the client's profile
(as "known" items), the client's own results files and calls, and decisions made for that client. The
organization's own profile, facts, Meta account and goal are left out, and a chat about a client does not
write to the organization's memory.

### 4.5 Isolation tests

`convex/organizations.test.ts` and `convex/clients.test.ts` hold one test per boundary, each asserting the
refusal is the plain "Not found." or "Not allowed.":

1. **Another account**: a member of account A calling with an organization of account B.
2. **Another organization in the same account**: a person with a role in organization 1 only, calling
   with organization 2 of the same account (account membership alone opens nothing).
3. **A client the member is not assigned to**: get, list, create-under and child records (a run of a
   project of that client), for a Member and a Viewer.
4. **A Viewer attempting any write**: a sweep that calls every public mutation registered through
   `workspaceMutation`, `adminMutation` and `ownerMutation` as a Viewer and expects a refusal, so a
   mutation added later is covered without anyone remembering to add a case.
5. The old words: a `manager` row behaves as Admin and a `rep` row as Member before the backfill runs.

## 5. Migration of existing workspaces

Modelled on `agentsMigration`: an internal mutation that pages through workspaces and reschedules itself,
plus an `IfNeeded` wrapper on a cron, so production finishes without anyone running anything.
`organizationsMigration.remaining` reports what is left and must read zero before any old value or field is
removed in a later PR.

For each workspace, in one transaction per workspace:

1. **Account.** If `workspace.accountId` is missing: insert an `accounts` row (`name` = workspace name,
   `billingCustomerId` = the workspace id as a string, `createdBy` = its oldest active owner), set
   `workspace.accountId`. One workspace becomes one account with one organization.
2. **Account members.** For each `members` row of the workspace, active or not, upsert `accountMembers`
   by (account, user): role `owner` if the member row is an owner, else `member`; `active` copied.
3. **Roles.** `manager` → `admin`, `rep` → `member`. `owner` is unchanged.
4. **Invitations.** Open invites get `accountId`; their `role` is mapped the same way.
5. **Billing mirror** [PR 4]. The workspace's `billingAccounts` row gets `accountId`. Ledger rows get
   `accountId` in batches.
6. **Client brand kits** [PR 3]. As in 3.3.

Safe to run twice: every step tests for its own result first. Safe to be interrupted: a workspace whose
`accountId` is set but whose members are half done is picked up again because `remaining` counts by rows
still holding an old value, not by a "done" flag.

**Order of deploys.**

1. PR 2 ships with the role union **widened** and every reader going through `roleOf()`. The backfill runs
   by cron. Code that makes new rows writes the new words from this deploy on. (Writing the old words until
   the backfill finished was considered; it cannot be kept up, because a Viewer has no old word. The
   consequence is noted under "Rollback".)
2. When `remaining` is zero on every deployment, a later PR narrows the union to the four new words and
   deletes the fallbacks that read a workspace without an account.

**Before the backfill reaches a workspace** everything still works: `roleOf()` maps the old words, and
`accountOf(workspace)` treats a workspace with no `accountId` as its own one-organization account (the
billing customer id is the workspace id either way).

**Rollback.** Convex refuses to deploy a schema the stored data does not fit. Once a row holds `admin`,
`member` or `viewer`, the code from before PR 2 cannot be deployed again without first mapping those rows
back (`organizationsMigration.revertRoles`, internal, provided for that case: `admin` → `manager`,
`member` → `rep`; it refuses while any `viewer` exists, because there is nothing to map a Viewer to).

## 6. Billing

### 6.1 Today

The Autumn customer id is the workspace id. `billingAccounts` mirrors one balance per workspace;
`chargeUsage` writes `billingLedger` and lowers the mirror; `billingActions.push` sends usage to Autumn.
`assertCanSpend` blocks new work at zero.

### 6.2 Design

- **The customer is the account.** `accounts.billingCustomerId` is what every Autumn call uses. For an
  account made from an existing workspace it *is* that workspace's id, so **no customer, subscription,
  balance or payment method moves in Autumn or Stripe**. This is the single most important choice here: the
  production migration is a rename of who we think the customer belongs to, not a transfer.
- **One mirror per account.** `accountFor(ctx, workspaceId)` resolves the workspace's account and reads the
  mirror `by_account`; it falls back to `by_workspace` for a workspace the backfill has not reached. Every
  organization of the account reads and lowers the same row, so `assertCanSpend` and the balance notice are
  shared without further change at the call sites.
- **The ledger says who spent.** `billingLedger.workspaceId` is unchanged; `accountId` is added. "What each
  organization used" on the Billing page is a sum over `by_account_at` grouped by `workspaceId`. Usage sent
  to Autumn carries `properties.workspaceId` so Autumn's own records can be split the same way.
- **The extra-organization fee.** A new Autumn add-on plan, id `extra_org` (`AUTUMN_EXTRA_ORG_ID`):
  the `credits` feature, prepaid, **$99 per 5,000 credits, monthly**. Its quantity is 5,000 × the number of
  organizations after the first. One unit is therefore exactly "+$99 a month and +$50 of credits to the
  shared pool", using the same prepaid-quantity mechanism the top-up packs already use, and the credits
  land in the one balance with no second feature to reconcile.
- **Adding an organization.** Owner only. The dialog states the price before anything happens: "Adds $99 a
  month to your plan and $50 of credits to your shared balance each month. Charged today for the rest of
  this period." On confirm:
  1. `billingActions.addOrganization` records `accounts.pendingOrganization`, then asks Autumn for
     quantity (extra + 1) × 5,000 (`billing.attach` the first time, `billing.update` after).
  2. If Autumn answers with a payment page, the Owner is sent there; on return the page refreshes the
     mirror.
  3. `saveAccount` sees more paid extra organizations than exist and creates the pending one.
  An organization therefore never exists unpaid, and a payment never lands without its organization.
- **While billing is off** (local, tests, a deployment with no Autumn key) an organization is created at
  once and nothing is charged, as with every other billing check.
- **The Growth plan must be active** to add an organization (the add-on rides on its subscription).
- **Archiving an organization** lowers the quantity from the next renewal. *Not built in PR 4*: it is
  stated in the dialog as "contact us", and listed in the PR under what does not work yet.

**As built (PR 4).** Three things are simpler than first drawn:

- No backfill touches billing. `accountFor` finds the mirror by account, and otherwise by the account's
  first organization (its billing customer id), which is where the row already is. The row is stamped with
  its `accountId` the next time Autumn is read. `billingLedger` did not need an `accountId`: "what each
  organization used" is read per organization from the index that exists. It did gain `clientId`.
- The organization being paid for is held on `accounts.pendingOrganization` and created by `saveAccount`
  when Autumn reports more paid extra organizations than exist. Returning from checkout calls `refresh`,
  which is that read.
- `organizations.create` (no charge) only works where billing is off. Where billing is on, the only way
  to add an organization is `billingActions.addOrganization`, which takes the price the Owner agreed to
  and refuses if it is not the current one.

### 6.3 Switches

| Variable | Default | Meaning |
|---|---|---|
| `AUTUMN_EXTRA_ORG_ID` | `extra_org` | The add-on's plan id. |
| `BILLING_EXTRA_ORGS` | on in test mode, **off in live mode** | Whether an Owner may buy another organization. Off shows "Contact us to add another organization." |

`setupProducts` creates `extra_org` **only when the deployment is in test mode**. On a live key it reports
"extra_org: not created (live mode)" and changes nothing, so merging this code cannot create a product or
a price on production.

### 6.4 Production runbook (for the owner; nothing here was run)

Each step says how to check it worked. Stop at the first check that fails.

**A. Before merging PR 4**

1. On **dev** (test mode): Convex dashboard → Functions → `billingActions:setupProducts` → Run. Expect
   `created` to include `plan extra_org`.
2. `billingActions:checkSetup` → expect `missing: []` and `testMode: true`.
3. In the app on dev, as an Owner with the Growth plan on a test card (4242…): Billing → Add an
   organization → confirm. Check in Autumn (test) that the customer shows `extra_org` with quantity 5,000,
   the invoice line is $99 (prorated), and the credits balance rose by 5,000 for a full period.
   **This is the one behaviour not verified in this session** (it needs a key): that a monthly prepaid
   quantity is granted again at each renewal. If Autumn grants it once only, change the plan item to an
   included monthly grant per unit before going live; the app code does not change.
4. Add a second extra organization; expect quantity 10,000 and $198 a month.

**B. Merging and the first production deploy** (PRs 2, 3, 4 in order)

5. Merge. Vercel deploys from `main`; Convex deploys with it. No Autumn call is made by deploying.
6. Within about ten minutes the cron runs the backfill. Convex dashboard → `organizationsMigration:remaining`
   → expect every count `0`. Until then everything works through the fallbacks in section 5.
7. Spot-check one paying customer: Billing shows the same balance and plan as before, and the same usage
   rows. In Autumn (live) their customer id is unchanged.

**C. Switching on extra organizations in production** (only when the owner chooses to)

8. Publish the Terms and pricing wording (section 7) first.
9. In Autumn **live**, create the plan by hand, matching dev exactly: id `extra_org`, add-on, the `credits`
   feature, prepaid, $99 per 5,000, monthly. (By hand on purpose: no code path creates a live product.)
10. `billingActions:checkSetup` on production → expect `missing: []`, `testMode: false`.
11. Set `BILLING_EXTRA_ORGS=on` in the **Convex production** environment variables.
12. Add an organization on the owner's own account first and check the invoice in Stripe.

**D. Undoing**

- Unset `BILLING_EXTRA_ORGS`: the button returns to "Contact us". Organizations already added stay and stay
  billed until their add-on quantity is lowered in Autumn.
- Nothing in A to C touches an existing customer's subscription.

**E. Archiving an organization and its fee** (PR 7; do this on dev, in Stripe test mode, before C)

None of the Autumn calls below has been made. They follow the SDK's documented parameters.

1. With two extra organizations bought on dev, archive one in Settings, Business. Check in Autumn that the
   `extra_org` quantity dropped from 10,000 to 5,000 credits, that **no** credit note or charge was made
   today, and that the next invoice preview shows $99, not $198. Check whether the 5,000 credits already
   granted this month were taken back; the owner's decision is that they stay until renewal. If Autumn
   takes them back at once, the lowering has to wait for the renewal instead, and that is a code change.
2. Archive the last extra one. Check in Autumn that `extra_org` shows as ending at the period end, not
   cancelled now, and that no refund was made.
3. Bring that one back before the renewal. Check the ending was undone and nothing was charged.
4. After a renewal with an archived organization, check its place is gone: Billing shows one fewer paid,
   and bringing it back is refused with "Its place on the plan has ended".
5. Where `BILLING_EXTRA_ORGS` is off (production today), archiving changes nothing in Autumn. An extra
   organization that Vistrial added by hand has to have its fee stopped by hand too; the confirmation
   says so.

### 6.5 What is deliberately not solved

- Merging two existing paying accounts into one (two Autumn customers, two subscriptions). No customer has
  asked; it would be done by hand with Autumn's support and a credit for the unused period.
- Moving an organization between accounts.
- A per-organization spending cap inside the shared balance. Agent caps (`agentCaps`) already limit spend
  per organization per day and are unchanged.

### 6.6 Measuring the standing cost per client

Clients are free and uncapped for now. To revisit that with numbers, PR 3 puts `clientId` on `agentRuns`
and PR 4 copies it onto the ledger row (`billingLedger.clientId?`), so real cost per client per month is a
query. What the ledger cannot see is storage and scheduled reads (Meta and calendar sync per connected
client account); those should be counted from `metaCallDays` and the sync crons once client connections
exist.

## 7. Pricing and Terms wording (proposed, not published)

PR 4 carries these as a diff in their own commit so the owner can take or leave them separately.

**Public pricing** (`src/lib/marketing/pricing.ts`, Private Access `includes`), replacing "Your own private
workspace":

> Your first organization, with $150 of credits every month
>
> Each additional organization: $99 a month, and $50 more credits in your shared balance
>
> Unlimited clients inside each organization

**Terms of Service, Section 9, "Plans and credits"**, after the first sentence:

> The plan covers one organization. Each additional organization you add to your account is $99 per month
> and adds $50 of credits each month. All organizations on your account share one credit balance. An
> additional organization is charged from the day you add it, pro-rated for the rest of that billing period,
> and then with each renewal until you remove it. We do not currently charge for or limit the clients you
> add inside an organization; if that changes we will tell you before it applies to you.

**Terms, the roles paragraph** ("Each workspace has an Owner…") would read: "Each account has an Owner, who is
responsible for the account and every organization in it. Organizations use roles (Owner, Admin, Member,
Viewer), and what each person can see and approve depends on their role and on the clients they are
assigned to."

"Workspace" elsewhere in the Terms and Privacy Policy would become "organization" or "account" depending on
the sentence. That is a wording pass the owner should approve as a whole; it is not in this step.

## 8. What steps 2 and 3 need, and where it lives

**Step 2 has been built from these shapes: see `tasks-briefing-home.md` for what was built and where it
differs** (the limit is stored in credits as `spendApprovalCredits`; `briefingReads` became one mark per
person in `memberVisits`; trend posts are off until switched on).

Nothing below is built in step 1 beyond the scoping it stands on (organization, client, roles, assignments,
`ctx.clients`). The shapes are recorded so step 2 does not have to re-decide them.

### 8.1 Tasks: a new table, not the existing one

The existing `tasks` table is a sales follow-up list: it requires `assignedMemberId` and a `purposeKey`,
is indexed by lead, has two statuses, and belongs to the (hidden) Sales Conversion screens. The new tasks
are proposals from agents with money on them. Reusing the table would mean making its required fields
optional and giving half its rows fields that mean nothing to the other half. **Recommendation: a new
table, `agentTasks`,** and leave `tasks` to leads.

```ts
agentTasks: {
  workspaceId, clientId?,
  title, why,
  proposedBy: { kind: "agent", agentSlug, runId? } | { kind: "person", userId },
  status: "proposed" | "approved" | "running" | "needsYou" | "done" | "declined",
  expectedReturn?: { text, cents? },        // "about 12 more booked calls a month"
  creditCostCents: number,                  // the estimate shown before approval
  evidence: [{ kind: "sourceRef" | "asset" | "decision" | "figure", refId, note? }],
  approvalId?: Id<"approvals">,
  runId?: Id<"agentRuns">,
  result?: { outcome: "better" | "same" | "worse" | "tooEarly" | "notDone", note, figures?, recordedBy, recordedAt },
  assignedMemberId?, dueAt?, createdAt, updatedAt,
}  indexes: by_workspace_status [workspaceId, status, updatedAt], by_workspace_client
```

`result` deliberately mirrors `decisions.outcome`, so the outcome loop that exists (baseline figures,
check-in, recorded result) can feed it rather than be rebuilt.

### 8.2 Notes to self

The existing `notes` table is tied to a lead. **New table `personalNotes`**:
`{ workspaceId, userId, clientId?, body, pinned?, createdAt, updatedAt }`, index `by_workspace_user`.
Only its author reads it, whatever their role; it uses `selfMutation`, so a Viewer can keep notes.

### 8.3 Approvals

One table for the five kinds, so the Briefing and the Tasks board read one queue:

```ts
approvals: {
  workspaceId, clientId?,
  kind: "publish" | "spend" | "accountChange" | "housekeeping" | "task",
  subject: { table: string, id: string },   // the asset, browser step, merge, agent task…
  summary, amountCents?,                    // amountCents for kind "spend"
  status: "waiting" | "approved" | "declined" | "expired",
  requestedBy, requestedAt, decidedBy?, decidedAt?, reason?,
}  indexes: by_workspace_status, by_subject
```

- Deciding is `adminMutation` (table 4.3); restricted browser steps stay Owner-only as they are today.
- `workspaceSettings.spendApprovalCents?` is the limit the owner sets. Missing means the agent caps alone
  apply, as now.
- Existing approval-like flows (`browserSteps` proposed/approved, asset review in `assets.ts`,
  `possibleMatches` merges) keep their own rows and write an `approvals` row alongside, so nothing existing
  is rewritten.

### 8.4 Briefing

```ts
briefingItems: {
  workspaceId, clientId?,
  kind: "approval" | "weeklyReport" | "finished" | "alert" | "draft" | "trend",
  title, body?, ref?: { table, id }, at, forUserId?,      // forUserId: an item for one person only
}  index by_workspace_at
briefingReads: { workspaceId, userId, itemId, at }
```

- `workspaceSettings.trendPosts?: boolean`; missing means on. Off stops `kind: "trend"` items being
  written for that organization (Settings > Agents).
- The feed is read through `workspaceQuery` and `ctx.clients.filter`, so a Member's Briefing only ever
  holds their clients.
- "Waiting on you" on Home today (`home.waiting`) is the seed of this feed; step 2 should fold it in.

### 8.5 Chats (step 3)

Chats are `intakes` (+ `intakeMessages`, `sessionChats`). PR 3 puts `clientId?` on `intakes` and
`agentRuns`, so the side panel can open "a chat with the Growth Architect about Client X" and
Library > Chats can filter by the picker. The client is fixed when the chat starts.

### 8.6 The scope picker

The picker's choice is per person per browser (`localStorage`, key `vistrial.scope.v1`:
`{ workspaceId, client: "all" | "own" | <clientId> }`) and is exposed by `useWorkspaceShell()` as `scope`.
A stale choice (an archived client, an organization the person left) falls back to "All clients" of the
first organization they can open. Step 2 screens pass `scope` to their list queries; they must not filter
on the client, because the server is what enforces assignments.

The sidebar leaves a fixed block at the top (organization selector, client picker) and renders the
Attract | Convert | Keep tabs directly beneath it, unchanged, ready for step 2 to move.

## 9. How the PRs stack

| PR | Branch | Base | Holds | State |
|---|---|---|---|---|
| 1 | `claude/orgs-foundation` | `main` | This document. | Merged (#245) |
| 2 | `claude/orgs-foundation-2-accounts` | PR 1's branch | Accounts, organizations, four roles, the selector, People. | Merged (#246) |
| 3 | `claude/orgs-foundation-3-clients` | PR 2's branch | Clients, assignments, `clientId` on work records, the picker. | Merged (#250) |
| 4 | `claude/orgs-foundation-4-billing` | `main` | Shared balance, the extra-organization fee, Billing page. No public wording. | Open (#251) |
| 5 | `claude/orgs-foundation-5-credits` | PR 4's branch | Credits shown as credits, not dollars; public wording in its own commit. | Open (#253) |
| 6 | `claude/orgs-foundation-6-decisions` | PR 5's branch | The owner's answers recorded here (section 10), and a test for decision 4. | Open |
| 7 | `claude/orgs-foundation-7-archive` | PR 6's branch | Archiving an organization and exporting its data. Copying material to another organization is designed in section 11, not built. | Open |

Merge in order. Each is reviewable on its own diff against the one before.

## 10. Decisions the owner made on 2026-11-11

Quoted words are the owner's, answering the open questions this document first listed.

**10.1 Former Reps are Members, and credits are shown as credits.** "Yes also instead of showing a dollar
amount for credits let's show the actual credit amount." A Rep became a Member and may start work that
spends credits, inside the existing limits; this is as built in PR 2. Credit amounts are written as a number
of credits everywhere (PR 5). One credit is one cent of balance, so the plan's $150 is 15,000 credits and an
extra organization adds 5,000. Money charged to a card stays in dollars. Credits are whole numbers; a charge
and every amount shown round up to the next whole credit.

**10.2 Admins invite people and change roles.** "Yes admin can invite and change people roles". As built in
PR 2: an Admin invites and changes roles up to Admin in their own organization. Only an Owner can make or
change an Owner.

**10.3 Archiving an organization.** "Yes $99 stop also users should have the ability to export the data or
add it as context for their other orgs". The $99 for an archived organization stops at the next renewal,
with no credit for the part of the month already paid. Before or after archiving, the Owner can export the
organization's data, and can copy chosen material into another organization of the same account for its
agents to read. Archiving and export are built in PR 7. Copying is designed in section 11 and waits for four answers.

**10.4 One person, several organizations.** "yes 1 person can belong to 2 orgs if admin assign but of
course their role can be edited". A person joins an organization only by an invitation from an Owner or
Admin of it, and has a separate role in each, which an Owner or Admin of that organization can change. As
built in PR 2, and now tested (`convex/settings.test.ts`). The same holds when the two organizations belong
to different accounts, for example a freelancer invited by two agencies: nothing is shared between the
accounts, and a person can never create a second account of their own. The owner's words speak of two
organizations and do not mention two accounts; say if a person should be limited to one account.

## 10a. Still open

1. **Can someone be an Owner of one organization without being an Owner of the account?** This design says
   no: Owner means the account's owner, in every organization. A partner who runs one brand is an Admin
   there. Say if a per-organization Owner (without billing) is needed.
2. **Client brand kits become clients automatically** (3.3). This is merged and running. The alternative
   was to link each one by hand; say if any client that appeared this way should not have.
3. **The spending limit that needs approval**: one amount per organization, or per account? The design
   stores it per organization. Needed for step 2.
4. **Should an Admin see the ledger** for their organization? As built, yes (Managers did before).
5. **How long an archived organization's data is kept.** As built in PR 7 it is kept, read-only, until the
   Owner brings the organization back; nothing deletes it.

## 11. Archiving, exporting and copying (PR 7)

**Archiving.** Owner only. The organization's row keeps everything; `status` becomes `archived`, with when
and by whom. From then on:

- it is **read-only**: `workspaceMutation`, `adminMutation`, `ownerMutation` and `memberAction` refuse with
  one sentence, so no function has to remember. Reading, and a person's own preferences, still work. The
  two writes that must work while archived say so: bringing it back, and starting an export;
- its **open runs are stopped**, the same way pausing agents stops them;
- it **leaves the selector's main list**. Its Owners see it under "Archived" and can open it to read or
  export. Nobody else has it listed;
- it can be **brought back** by an Owner while the account still has a paid place for it.

The account's **first organization cannot be archived**: the plan, the balance and the Autumn customer id
are held under it. Stopping the plan is done in Billing.

**The fee.** $99 stops at the next renewal with no credit for the month already paid (decision 10.3). The
call that tells Autumn is behind the same switch as buying one, and is unverified (runbook E).

**Export.** An Owner starts it; it is built in the background into one `.zip` and kept for a week, then the
file is removed and the row stays as the record. It is audit-logged when started and when built. Contents:
`data/*.json` (clients, research, reports and assets with their versions, offers and versions, decisions,
goals, results files' summaries, call transcripts, brand kits and versions, creative requests and tests,
page teardowns, the business profile), `reports/*.md` (the current version of each written asset) and
`transcripts/*.txt`. The list of tables is written out in `convex/lib/exportShape.ts`; a new table is not
exported until it is added there. Never exported: connections and tokens, people and invitations, billing,
the audit log, uploaded files themselves (logos, images, screenshots), anything of another organization.
Keys that look like a credential, a stored file's id or a person's id are dropped at every depth.

**Copying material into another organization ("add it as context").** Proposed, not built; it needs the
owner's answers below.

- *What is copied*: an approved report or offer analysis the Owner picks, as a snapshot of its current
  version's text. Not its sources, not its run, not the client it was for.
- *Where it lands*: a new row in the receiving organization, kind "reference", labelled "From <organization>,
  copied on <date> by <Owner>". Read-only there. Removing it deletes only the copy.
- *How agents see it*: listed in the business context under its own heading, "Reference material from
  another of your organizations (not facts about this business)", each item with its label, so an agent
  can quote it but does not treat it as this organization's own figures or approved facts.
- *Deliberately not copied*: connections and tokens, people and their assignments, clients, brand kits,
  results files, call transcripts.
- *Who*: an Owner of the account, between two organizations of the same account, from an active or an
  archived one into an active one.

Questions for the owner before it is built:

1. **May work that was done for a client be copied?** A Member of the receiving organization who was never
   assigned to that client would then be able to read it. The proposal says no: only the organization's
   own work.
2. **Which kinds**: reports and offer analyses only (the proposal), or also brand kits and transcripts?
3. **A snapshot or a live link?** The proposal is a snapshot; a later version in the source does not change
   the copy.
4. **Should people in the receiving organization see where it came from**, by name? The proposal says yes.
