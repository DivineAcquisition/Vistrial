# Connect HighLevel (read, and act with approval)

Date: 2026-11-13, revised the same day when the owner widened the scope: *"HighLevel can't be read only.
Vistrial needs to execute within it as well."* The first of three CRM connections (HighLevel now; HubSpot
and Salesforce later). A workspace connects a HighLevel **sub-account** so Vistrial can learn how the
business sells: its pipelines and stages, what moves, what is won and for how much, where leads come from,
and what happens to a lead (calls, messages, appointments, stage changes). Onboarding uses it for business
context; the Dealmaker agent (sales conversion) uses it next.

**Reading** needs no approval and is described in sections 1 to 7. **Acting** is section 2A: an agent (or a
person) *proposes* a change; nothing changes in HighLevel until an Owner or Admin approves that one change;
anything that touches money or messages a lead is a separate Owner approval with a typed word; every action
is recorded with who approved it; and an Owner can switch acting off for one connection or for the whole
organization. Acting is **off by default** for every connection, and messaging leads has its own switch, also
off, checked against a fresh read of the lead (opt-out, local time) at the moment each message is sent.

This page is the plan, written from HighLevel's official documentation before any code. Sources are at the
end; where the documentation is silent or unclear, it says so under **Unproven until a real app exists**.

---

## 1. How HighLevel's API works (what matters here)

| Topic | What the docs say |
|---|---|
| API | API v2, base `https://services.leadconnectorhq.com`, every call sends `Authorization: Bearer <token>` and a `Version` header (`2021-07-28`; a few conversation and calendar endpoints list `2021-04-15`). |
| App type | A **Marketplace app** (public or private) using the OAuth 2.0 authorization-code grant. Private Integration tokens are a per-account static key and are not used: customers would have to paste a secret. |
| Install | The person installing opens the app's install link, `https://marketplace.gohighlevel.com/oauth/chooselocation?response_type=code&client_id=…&redirect_uri=…&scope=…` (white-label: `marketplace.leadconnectorhq.com`), chooses the sub-account, and is sent to the redirect URI with `?code=`. |
| Token exchange | `POST /oauth/token`, form-encoded: `client_id`, `client_secret`, `grant_type=authorization_code`, `code`, `user_type=Location`, `redirect_uri`. |
| Token answer | `access_token`, `refresh_token`, `expires_in` (≈86,400 s, one day), `scope`, `userType` (`Location` or `Company`), `locationId` (Location tokens only), `companyId`, `userId` (who installed). |
| Refresh | `POST /oauth/token` with `grant_type=refresh_token`. **A refresh token works once**: the answer carries a new one and the old one stops working. Unused, a refresh token lasts up to a year. |
| Location vs agency token | A **Location** (sub-account) token reads that sub-account's contacts, opportunities, conversations and calendars. A **Company** (agency) token reads agency-level things and can mint Location tokens with `POST /oauth/locationToken` (scope `oauth.write`) for sub-accounts it was approved for. |
| Rate limits | Per Marketplace app **per resource** (one sub-account or one agency): **burst 100 requests / 10 s**, **daily 200,000 / day**. Each install has its own budget. A refused request gets `429` with no `Retry-After`; headers `X-RateLimit-Remaining`, `X-RateLimit-Max`, `X-RateLimit-Daily-Remaining`, `X-RateLimit-Daily-Reset` (ms) say where you are. Windows are fixed, start at the first counted request, and a 429 does not count. |
| Webhooks | One webhook URL per app, set in the app's settings. Events are sent for the scopes the app holds (`OpportunityStageUpdate` needs `opportunities.readonly`, `InboundMessage` needs `conversations/message.readonly`, …). `INSTALL` / `UNINSTALL` need no scope. Signed with **Ed25519** in `X-GHL-Signature` (HighLevel's public key is published); the legacy RSA `X-WH-Signature` was to be retired on 2026-09-01. Non-2xx answers are retried up to 12 times with backoff. |
| Redirect URI rule | HighLevel refuses to save a redirect URI that contains "highlevel" ("The redirect uri contains a Highlevel reference"). Our callback path is therefore `/crm/hl/callback`, not `/highlevel/callback`. |

## 2. Scopes: the smallest set, by data type

All are Sub-Account scopes; no agency scope. Reading:

| Data the owner wants | Endpoint(s) Vistrial calls | Scope |
|---|---|---|
| The sub-account's name, time zone, currency (to label the connection and read money correctly) | `GET /locations/{locationId}` | `locations.readonly` |
| Pipelines and their stages | `GET /opportunities/pipelines?locationId=` | `opportunities.readonly` |
| Deals per stage, movement, won deals and revenue (`monetaryValue`), deal source, `lastStageChangeAt`, `lastStatusChangeAt` | `GET /opportunities/search?location_id=&limit=100` (paged with `startAfter` / `startAfterId`) | `opportunities.readonly` (same scope) |
| Lead sources, new leads, the contact's details (name, email, phone, source, tags, date added) | `POST /contacts/search` (paged) | `contacts.readonly` |
| Recent conversations (which leads were talked to, last message type and direction) | `GET /conversations/search?locationId=&startDate=` | `conversations.readonly` |
| Calls, texts, emails and chats on those conversations (type, direction, time, status, call length) | `GET /conversations/{conversationId}/messages` | `conversations/message.readonly` |
| The calendars, needed because appointments can only be listed per calendar | `GET /calendars/?locationId=` | `calendars.readonly` |
| Appointments (booked, confirmed, showed, no-show, cancelled) | `GET /calendars/events?locationId=&calendarId=&startTime=&endTime=` | `calendars/events.readonly` |

Acting (section 2A), only for the actions built first:

| Action | Endpoint | Scope |
|---|---|---|
| Move a deal to another stage; mark it won, lost or abandoned, or reopen it | `PUT /opportunities/{id}`, `PUT /opportunities/{id}/status` | `opportunities.write` |
| Add or remove a tag; add a note; create a task on a lead | `POST`/`DELETE /contacts/{id}/tags`, `POST /contacts/{id}/notes`, `POST /contacts/{id}/tasks` | `contacts.write` |
| Text or email a lead (behind the messaging switch) | `POST /conversations/messages`, after a fresh `GET /contacts/{id}` (`contacts.readonly`) | `conversations/message.write` |

**Requested, in total (10):**
`locations.readonly opportunities.readonly contacts.readonly conversations.readonly conversations/message.readonly calendars.readonly calendars/events.readonly opportunities.write contacts.write conversations/message.write`

HighLevel's scopes are coarse: `contacts.write` also allows creating, updating and deleting contacts, and
`opportunities.write` deleting deals. Vistrial's code calls only the endpoints in the table above: every
write goes through one function with an allow-list of method and path, and a test checks nothing else is
sent. `calendars/events.write` (appointments) is **not** requested until appointments are built; adding a
scope later means every connected sub-account must approve again, which is why messaging is built (and off)
now rather than later.

Considered and **not** requested: `users.readonly` (team names; deals keep the HighLevel user id only),
`payments/orders.readonly` and `invoices.readonly` (won deals' value is the revenue figure Dealmaker needs;
payments can come later if asked), `oauth.readonly` / `oauth.write` (only needed for agency-level installs,
see section 6), the `.write` scopes for actions not built yet. **Stage changes** have no history endpoint: Vistrial records a stage
change when a deal's stage differs from the last read, dated by HighLevel's `lastStageChangeAt`. The
`OpportunityStageUpdate` webhook would give exact moments; it is planned, not in the first build (section 8).

## 2A. Acting in HighLevel, with approval

Designed the way Vistrial already handles changes in someone's account (`docs/rebuild/browser-with-approval.md`,
`convex/lib/approvals.ts`), but through HighLevel's API, never a browser.

### The rules

1. **Off until an Owner turns it on**, per connection: *Let Vistrial act in this HighLevel sub-account*.
   Turning it off declines everything waiting at once; nothing approved earlier but not yet carried out runs.
   An Owner can also stop **every** CRM action across the organization with one switch (*Allow CRM actions
   anywhere in this organization*), whatever each connection allows.
2. **Propose, then approve.** An agent (or a Member) proposes one action with a reason. It waits in the
   organization's one approvals queue (the Briefing, the Tasks board and the HighLevel page all show it).
   Nothing is sent to HighLevel until an **Owner or Admin approves that one action**. The next one asks again.
3. **Restricted actions** need a separate approval from an **Owner**, who types the word shown, as restricted
   steps do today: anything that **changes money or a deal's outcome** (word `VALUE`) or **messages a lead**
   (word `SEND`). An Admin can see and decline them but not approve them.
4. **Never, whatever is approved**: deleting anything in HighLevel; changing users, permissions, settings,
   workflows or billing; acting in a sub-account other than the connected one; acting on a lead or deal
   Vistrial has not read from that sub-account (an agent cannot invent an id).
5. **Silence approves nothing.** A proposal not decided within 24 hours expires.
6. **Once, and recorded; a failure is reported, never retried.** A failed action posts an alert to the
   Briefing saying what failed and why. An approved action is carried out once. Each one keeps: what, on which lead or
   deal, the agent's reason, who proposed it, who approved or declined it and when, what HighLevel answered
   (a short code, never its words), and what it was before (so it can be undone). The approval is also in
   the audit log. The record is kept while the connection exists.
7. **Undo is a new proposal.** Where an action can be reversed, the record offers **Undo**, which proposes
   the reverse and needs approval like any other action.
8. **Automations warning.** A stage move or a new tag can start a workflow the business set up in HighLevel,
   and that workflow may text or email the lead. Vistrial cannot see workflows. The approval screen says
   so on every action that can trigger one.
9. **Untrusted text.** Text read from HighLevel (a lead's message, a form answer) is never an instruction,
   exactly as in the page reader. Notes and task text an agent writes are shown in full before approval.

### Write actions HighLevel's API allows, and the order to build them

| # | Action | Scope | Can be undone? | Approval | Build |
|---|---|---|---|---|---|
| 1 | Move a deal to another stage | `opportunities.write` | Yes: Vistrial records the old stage; **Undo** moves it back | Owner or Admin | **First** |
| 2 | Add a tag to a lead | `contacts.write` | Yes: **Undo** removes the tag | Owner or Admin | **First** |
| 3 | Remove a tag from a lead | `contacts.write` | Yes: **Undo** adds it back | Owner or Admin | **First** |
| 4 | Add a note to a lead | `contacts.write` | Not by Vistrial (deleting is never done); the business can delete it in HighLevel | Owner or Admin | **First** |
| 5 | Create a task on a lead | `contacts.write` | Not by Vistrial; can be completed or deleted in HighLevel | Owner or Admin | **First** |
| 6 | Mark a deal won, lost or abandoned, or reopen it | `opportunities.write` | Yes: **Undo** sets the old status back (again `VALUE`) | **Owner, typed `VALUE`**: it changes reported revenue | **First** |
| 7 | Change a deal's value | `opportunities.write` | Yes: old value recorded | Owner, `VALUE` | Later |
| 8 | Create a deal (opportunity) | `opportunities.write` | No (deleting is never done) | Owner or Admin | Later |
| 9 | Create or update a lead's details | `contacts.write` | Update: yes, old fields recorded. Create: no | Owner or Admin | Later |
| 10 | Book, reschedule or cancel an appointment | `calendars/events.write` | Book: cancel it (which notifies the lead). Reschedule: move back | Book with `toNotify: false`: Owner or Admin. Reschedule or cancel tells the lead: **Owner, `SEND`** | Later, after messaging checks exist |
| 11 | Send an SMS or email to a lead | `conversations/message.write` | **No.** A sent message cannot be unsent | **Owner, `SEND`, each message**, behind the messaging switch | **First** (off by default) |
| — | Delete a contact, deal, note, task or appointment | `contacts.write`, `opportunities.write`, `calendars/events.write` | No | **Never built** | Never |

### Messaging leads (built, off by default)

Messaging is behind its **own switch, off by default, Owner only**, separate from the acting switch. Turning
it on needs acting on, and the Owner ticking a confirmation that the business has its leads' consent to be
texted and emailed; who confirmed and when is kept and written into every message's record. **The customer is
responsible for consent**: Vistrial cannot see consent records. Each message needs the **Owner's typed
`SEND`**. Just before sending, Vistrial reads the lead **fresh** from HighLevel (`GET /contacts/{id}`), and the
send is refused, recorded and reported in the Briefing if any of these fail:

| Check | Built |
|---|---|
| Do Not Disturb (`dnd`) or DND on the channel (`dndSettings.SMS` / `.Email`, anything but `inactive`) | Yes: refused as `opted_out` |
| The lead has a phone number (text) or email address (email) | Yes: `no_address` |
| **Quiet hours**: nothing between **8 pm and 8 am** in the lead's own time zone (the contact's, else the sub-account's) | Yes: `quiet_hours`; no known zone is refused as `no_timezone` |
| At most one message from Vistrial to the same lead in 24 hours | Yes: `too_soon` |
| The record: DND state, time zone, local hour, consent basis and result, kept on the action | Yes |

Laws these address: the **TCPA** (consent for automated texts, the 8 am to 9 pm calling window, which the
8 pm end is stricter than; some states such as Florida and Oklahoma end at 8 pm) and **CAN-SPAM** for email
(the business's HighLevel email adds the unsubscribe link and postal address). Further design, not built:

- **Consent.** US texting law (TCPA) needs prior express consent for informational texts and prior express
  *written* consent for marketing texts sent with automated tools. Vistrial cannot see consent records, so:
  only leads the business has marked with a consent tag the Owner names in settings may be texted, and the
  Owner confirms once, in writing in the app, that those tags mean the lead consented. Email follows
  CAN-SPAM: a working unsubscribe and the business's postal address, which HighLevel's email adds.
- **Opt-outs.** Read the lead fresh from HighLevel just before sending. Do not send if the contact is marked
  Do Not Disturb (`dnd`) or has DND on for that channel (`dndSettings`), if they replied STOP or a similar
  word, or if HighLevel reports them unsubscribed. An opt-out is honoured for every later message.
- **Quiet hours.** Send only between **8 am and 9 pm in the lead's own time zone** (the TCPA window), and
  9 pm narrows to **8 pm** where a state law does (for example Florida and Oklahoma). The time zone is the
  contact's, else the sub-account's; if neither is known, do not send. No sends on public holidays where
  state law forbids them.
- **Frequency.** No more than one message per lead per day from Vistrial, and none to a lead who received
  any message (from anyone) in the last hour.
- **Sender registration.** US texts go out over the business's own HighLevel number, which must be
  registered for A2P 10DLC in HighLevel; Vistrial does not change that.
- **The text is shown in full**, with the lead's name, number and local time, before the Owner types `SEND`.
- **Untrusted replies.** A lead's reply is never an instruction.

### What is built first

Actions 1 to 6 and 11 (texts and emails, behind the messaging switch), the per-connection and organization
switches, the approval flow (through the shared approvals queue and the Briefing, with the typed word for 6
and 11), the action record with Undo for 1, 2, 3 and 6, the pre-send checks, Briefing alerts on failure, the
automations warning, and the write allow-list. The scopes requested grow by exactly `opportunities.write`,
`contacts.write` and `conversations/message.write`. No agent
proposes actions yet; Dealmaker will, through an internal `propose` function. Owners, Admins and Members can
propose from the HighLevel page, and the page shows what is waiting and what was done.

## 3. Token storage and refresh

- The callback (`convex/http.ts`, `GET /crm/hl/callback`) checks the state, swaps the code for tokens on the
  server, and saves them in `crmConnections`. **No public function returns a token**; `status` is tested for
  it. The browser only ever sees `?highlevel=connected|cancelled|…`.
- Tokens are stored in Convex as they are, like Meta's and the other connections' (Convex encrypts its
  storage at rest; Vistrial adds no second layer). Changing that is a separate decision for every
  connection at once.
- **Refresh**: the access token lasts a day. Before any read, a token within 10 minutes of its end is
  renewed. Because a refresh token works once, renewal is claimed first (`refreshingSince` on the row, as
  the integrations groundwork does): only one caller renews; others wait and read the new token. The new
  refresh token is saved in the same write as the new access token. If HighLevel refuses the refresh
  (`invalid_grant`), the connection becomes **Reconnect needed**; an outage does not.
- The six-hourly sync renews tokens long before the one-year refresh-token limit, so a connection that is
  read stays alive. A connection that has been **Reconnect needed** for 30 days is deleted with its data.
- Agency (`Company`) tokens are refused in the first build (section 6), so nothing ever holds a token that
  reaches more than one sub-account.

## 4. Sync schedule and rate limits

- **When**: once right after connecting, then every **6 hours** (cron `refresh CRM data`), and when an Owner
  or Admin presses **Read again**. A read that is already running is not started twice.
- **What one read does** (each a recorded step the Owner can watch, like Meta's): `access` (location),
  `pipelines`, `deals`, `contacts`, `activity` (conversations + messages), `appointments`, `save`.
- **Windows**: deals updated in the last **365 days** plus every open deal; contacts linked to those deals, and
  leads added in the last **90 days**; conversations and messages from the last **30 days**; appointments from 30
  days back to 30 days ahead.
- **Caps per read**: deals 2,000 (20 pages), contacts 2,000, conversations 200 with up to 20 messages each,
  10 calendars. At most **400 calls per read**, which is 0.2% of the daily budget, and far less with the
  usual account.
- **Pacing**: one request at a time, at least 150 ms apart (under 70 per 10 s, below the 100 burst). When
  `X-RateLimit-Remaining` falls under 10, the read waits the full 10 s window. A `429` ends the read with
  `rate_limited` and nothing is retried around it; the next scheduled read tries again.
- Every call is counted (successful and failed, per UTC day) and shown to the Owner, like Meta's.

## 5. What is stored, and for how long

Only what Dealmaker needs to judge a sales process. Every row carries `workspaceId`, the `clientId` it is
for (missing means the organization itself) and the connection it came from.

| Table | Kept | Not kept | How long |
|---|---|---|---|
| `crmConnections` | location id, name, currency, time zone, company id, tokens, scopes, who connected, counts | the installing HighLevel user's details | until disconnect |
| `crmPipelines` | pipeline id, name, stages (id, name, order) | | replaced each read |
| `crmDeals` | deal id, pipeline, stage, status (open, won, lost, abandoned), value, currency, source, contact id, assigned user id, created / updated / last stage change / last status change | **deal name** (usually the person's name), notes, tasks, custom fields, followers | open deals while open; others 365 days after their last update |
| `crmContacts` | contact id, name, email, phone, source, up to 10 tags, date added, last activity | address, date of birth, company details, custom fields, notes, DND settings, attachments | while linked to a kept deal or added in the last 90 days (re-checked every read) |
| `crmActivities` | kind (call, sms, email, chat, social, appointment, stage change, status change), direction, time, contact id, deal id, short facts (call seconds, message status, appointment status, from-stage → to-stage) | **message bodies, email subjects, call recordings and transcripts, attachments** | 90 days |
| `crmSummaries` | counts and value per stage, won count and revenue (30 / 90 / 365 days), lead sources, activity counts | | replaced each read |
| `crmSyncRuns`, `crmCallDays` | what each read did, call counts | | last 30 reads; 30 days |

Contact details are personal data of the customer's leads: Vistrial is the customer's processor for it.
The privacy policy change is its own pull request (section 9).

## 6. A Client in Vistrial ↔ a HighLevel sub-account

- **One HighLevel sub-account (location) per Vistrial Client**, and optionally one for the organization
  itself (no client). An agency connects each client's sub-account from that client; a business connects
  its own sub-account as the organization.
- The Owner presses **Connect HighLevel** on a client (or on the organization). The state records that
  client. On HighLevel's page they choose the matching sub-account. The callback saves the connection on
  that client.
- The same sub-account cannot be connected twice in one workspace (to two clients); the second attempt is
  refused with `already_connected` and the first stays.
- Everything read is stored with that `clientId`, so the existing client guard (`convex/lib/clientGuard.ts`)
  hides it from a Member or Viewer who may not see that client. The `crm*` tables are added to the guard.
- **Agency installs** (`userType: Company`) are refused in the first build with `agency_install` ("choose a
  sub-account"). The app's **Target user** is set to **Sub-account**. Bulk agency installs would need
  `oauth.readonly` + `oauth.write` and a token that reaches every client at once; that is a later decision.

## 7. Disconnect, uninstall, and what is deleted

- **Disconnect** (Owner only) deletes, in one step: the connection and its tokens, and every
  `crmPipelines`, `crmDeals`, `crmContacts`, `crmActivities`, `crmSummaries`, `crmSyncRuns` row for that
  connection. Large connections are deleted in batches that continue in the background until none is
  left; the connection disappears from every screen at once. Nothing changes in HighLevel. The Owner is
  told to also uninstall the app in HighLevel to cancel its access there (HighLevel has no token-revoke
  endpoint in its API documentation).
- **Uninstalled in HighLevel**: the app's webhook receives `UNINSTALL` with the `locationId`; Vistrial deletes
  every connection to that location and its data, exactly as on disconnect. If the webhook does not arrive,
  the next read's refusal marks the connection **Reconnect needed**, and 30 days later it is deleted.
- **Signed out for 30 days** (**Reconnect needed** and not reconnected): the six-hourly job removes the
  connection and its data.
- **Client archived**: the connection stays (an archived client can be brought back) but an Owner can
  disconnect it. Deleting an organization's data is not built for any connection yet; when it is, it must
  call `removeData` for every `crmConnections` row.
- The audit log keeps that a connection was made or removed (who, when, location id), never contact data.

## 8. What the Owner sees

- **Connections → HighLevel** card (`src/components/connections/highlevel-view.tsx`): states *Not set up*
  (deployment lacks the app), *Not connected* (Owner: **Connect HighLevel**; others: "An Owner can connect
  this"), *Connected* (sub-account, last read, **Read again**, **Disconnect**), *Reading* (steps light up),
  *Reconnect needed*, *Error* with a plain sentence for each short code.
- **What Vistrial read**: pipelines with deal count and value per stage, won deals and revenue, top lead
  sources, activity counts. Contact details are not listed on the card.
- **What Vistrial did** (Owner only): each read, step by step, with calls and rows; calls per day; and how
  many writes were sent, each with who approved it.
- **Actions**: the acting switch (Owner), what is waiting for approval, and what was done, declined or
  expired, with Undo where it applies.
- **Onboarding slot**: `<HighLevelConnectSlot workspaceId clientId? returnPath returned />`, a compact card
  the new onboarding can drop in. It returns to the page it was opened from.
- Story page: `/dev/highlevel-connection?state=…`, screenshots at 390 and 1280 wide.

Later (not in this build): `OpportunityStageUpdate`, `OpportunityStatusUpdate`, `InboundMessage` webhooks
for exact movement times; agency installs; Dealmaker's reads of this data.

## 9. Privacy

Reading leads' names, emails, phone numbers and their activity is new personal data. A separate pull
request changes `src/lib/trust/privacy-policy.ts` with a HighLevel section: what is read, what is kept
(table above), that message bodies and recordings are not kept, retention, deletion on disconnect and
uninstall, that HighLevel (LeadConnector) is where the data comes from, that Vistrial acts as the
customer's processor, and that Vistrial may act in the connected CRM only when a person approves. It publishes when merged, so it is kept apart from the code and should be merged
**before** the app's settings are added to production.

## 10. What the owner must do in HighLevel (marketplace app review)

1. Create a developer account at `marketplace.gohighlevel.com` and **Create App**.
2. **Basic info**: name "Vistrial", type **Private** first (only your own agency and invited sub-accounts can
   install it while testing), later **Public**. Category: Reporting / Analytics. **Target user:
   Sub-account**. **Who can install: Both Agency & Sub-account** (an agency admin can still install on a
   sub-account). Distribution: not white-label only.
3. **Advanced settings → Auth**:
   - **Scopes**: exactly the ten in section 2 (seven read, `opportunities.write`, `contacts.write`,
     `conversations/message.write`).
   - **Redirect URLs**: `https://<dev>.convex.site/crm/hl/callback` and
     `https://<prod>.convex.site/crm/hl/callback` (the same Convex hosts Meta uses:
     `calm-spider-678` for dev, `confident-meerkat-429` for production). No "highlevel" in the URL.
   - **Client keys**: generate a client id and secret. Put them in Convex (below). Never in the repo.
4. **Advanced settings → Webhooks**: URL `https://<prod>.convex.site/crm/hl/webhook` (and dev). Events:
   `UNINSTALL` (and `INSTALL`, which Vistrial only acknowledges).
5. **Listing** (only for Public): description: *"Vistrial reads your pipelines, deals, leads and their
   activity to help you sell. It changes something in your CRM (moving a deal, tagging a lead, adding a note
   or task, marking a deal won or lost) only when a person on your team approves that change. If you turn
   messaging on, it can text or email a lead only after an Owner approves that one message, and never to a
   lead who opted out or at night in their time. It never deletes anything."* The ten permissions in plain words, privacy policy URL `https://vistrial.io/privacy` (after the privacy PR merges), terms URL,
   support email, logo, screenshots, a short video of connecting and disconnecting.
6. **Test**: install on your own test sub-account from the install link; connect from Vistrial on a test
   client; confirm the card fills; turn acting on, approve one stage move and one tag, check them in
   HighLevel, undo both; turn messaging on and text your own test contact in daytime, then with DND on
   (it must be refused); disconnect; uninstall in HighLevel and confirm the webhook arrives.
7. **Submit for review** (Public): HighLevel reviews the listing, scopes and a working install. Answer
   reviewer questions on why each scope is needed (section 2's table is the answer).

**Settings in Convex** (dev and production deployments, Settings → Environment Variables):

| Name | Needed | What |
|---|---|---|
| `HIGHLEVEL_CLIENT_ID` | yes | the app's client id |
| `HIGHLEVEL_CLIENT_SECRET` | yes | the app's client secret |
| `HIGHLEVEL_INSTALL_HOST` | no | `marketplace.leadconnectorhq.com` for a white-label install page; default `marketplace.gohighlevel.com` |
| `HIGHLEVEL_API_VERSION` | no | default `2021-07-28` |

No Vercel setting is needed: every HighLevel call is made from Convex.

## What was built

| Piece | File |
|---|---|
| Tables `crmConnections` (tokens server-only), `crmOauthStates`, `crmPipelines`, `crmDeals`, `crmContacts`, `crmActivities`, `crmSummaries`, `crmSyncRuns`, `crmCallDays`. All carry `clientId` and are in the client guard | `convex/schema.ts`, `convex/lib/clientGuard.ts` |
| Install, callback, token renewal, the paced read, disconnect, uninstall, the 30-day removal | `convex/highLevel.ts` |
| Pure helpers: scopes, install address, error codes, parsers that drop what is not kept, stage-change detection, the summary, Ed25519 webhook check | `convex/lib/highLevel.ts` |
| `GET /crm/hl/callback`, `POST /crm/hl/webhook` | `convex/http.ts` |
| Every 6 hours: `refresh CRM data` | `convex/crons.ts` |
| Card (display) and Convex container; `HighLevelConnectSlot` for onboarding | `src/components/connections/highlevel-view.tsx`, `highlevel.tsx` |
| Page with a switcher for the organization and each client | `src/app/(product)/app/connections/highlevel/page.tsx` |
| Settings → Data card | `src/components/settings/settings-sections.tsx` |
| Story: `/dev/highlevel-connection?state=none\|notsetup\|admin\|connected\|reading\|reconnect\|ratelimited\|slot\|slot-connected\|acting-off\|acting\|acting-admin`; screenshots at 390 and 1280 | `src/app/dev/highlevel-connection/`, `docs/screenshots/crm-highlevel/` |
| Acting: the action rules (kinds, Owner-only `VALUE`, the write allow-list, undo, summaries) | `convex/lib/crmActions.ts` |
| Acting: propose (people and agents), decide (also from the shared approvals queue), carry out once, undo, the Owner's switch, expiry after 24 hours. Table `crmActions` (in the client guard) | `convex/crmActions.ts`, `convex/approvals.ts` |
| Acting panel: the switch, propose a change, every action with approve, decline and undo | `src/components/connections/highlevel-actions-view.tsx`, `HighLevelActions` in `highlevel.tsx` |
| Tests against a fake HighLevel (no real call), reading and acting | `convex/highLevel.test.ts`, `convex/lib/highLevel.test.ts`, `convex/lib/crmActions.test.ts` |

Who can do what: an **Owner** connects and disconnects, and alone sees *What Vistrial did* (each read,
step by step, and calls per day). **Owners and Admins** press *Read again*. Any member who may see the
client sees the card's numbers; a Member not assigned to that client sees nothing of it. For acting: an
**Owner** turns it on or off; Owners, Admins and Members **propose**; **Owners and Admins approve**, except a
deal's outcome and every message, which only an **Owner** approves by typing `VALUE` or `SEND`; only an
Owner turns messaging on or stops every action for the organization; a Viewer reads.

The onboarding slot:

```tsx
import { HighLevelConnectSlot } from "@/components/connections/highlevel";

<HighLevelConnectSlot
  workspaceId={workspaceId}
  clientId={clientId}               // omit for the organization itself
  returnPath="/app/onboarding?step=crm"
  returned={searchParams.get("highlevel")}
/>
```

It follows Convex live, so it switches to the connected numbers on its own after the first read.

`HIGHLEVEL_CALL_GAP_MS` (default 150) is the pause between calls; the tests set it to 0. Leave it unset.

## Unproven until a real app exists

- Whether `chooselocation` passes our `state` back unchanged. The external-auth docs say HighLevel keeps
  `state`; the marketplace install docs do not mention it. The callback **requires** it; if HighLevel
  drops it, connecting fails safely with `expired` and this must change.
- The exact bytes the Ed25519 webhook signature covers (the docs' sample signs `JSON.stringify(body)`), and
  whether Convex's runtime verifies Ed25519 with Web Crypto. Until proven, a delivery that does not verify
  is refused, and the 30-day **Reconnect needed** removal is the fallback.
- Field formats in real answers (dates as ISO strings or milliseconds, `monetaryValue` currency) are taken
  from the OpenAPI specs; the parser accepts both date forms.
- Real rate-limit headers and 429 bodies; the version header needed by each endpoint.
- The body of `POST /contacts/search` (`locationId`, `page`, `pageLimit`, `sort`): the OpenAPI spec leaves it
  empty; this is HighLevel's documented search shape, but untested.
- Where a call's length sits in a message's `meta` (`meta.call.duration` or `meta.callDuration`): both are read.
- Whether a refresh needs `user_type` and `redirect_uri` (sent, as HighLevel's sample does).
- Every write: the request bodies are taken from HighLevel's OpenAPI spec (`UpdateOpportunityDto`,
  `UpdateStatusDto`, `TagsDTO`, `NotesDTO`, `CreateTaskParams`) and have not been sent to a real sub-account.
- Which HighLevel workflows a write triggers depends on each business's own setup and cannot be read.
- The message body: HighLevel's spec lists `type`, `subType`, `contactId` and `status` as required for
  `POST /conversations/messages`; Vistrial sends `type`, `contactId`, `message` (and `subject`, `html` for
  email), as HighLevel's own examples do. The DND field shapes (`dnd`, `dndSettings.<channel>.status`) are
  from HighLevel's contact schema.

## Sources

- OAuth 2.0: `https://marketplace.gohighlevel.com/docs/Authorization/OAuth2.0`
- Scopes table: `https://marketplace.gohighlevel.com/docs/oauth/Scopes` (and `docs/oauth/Scopes.md` in
  `github.com/GoHighLevel/highlevel-api-docs`)
- OpenAPI specs (endpoints, parameters, scopes per endpoint): `apps/oauth.json`, `apps/opportunities.json`,
  `apps/contacts.json`, `apps/conversations.json`, `apps/calendars.json`, `apps/locations.json` in the same repo
- Rate limits: `https://marketplace.gohighlevel.com/docs/other/rate-limits`
- Webhooks and signatures: `https://marketplace.gohighlevel.com/docs/webhook/WebhookIntegrationGuide`;
  `INSTALL` / `UNINSTALL` payloads: `docs/webhook events/AppInstall.md`, `AppUninstall.md`
- Redirect URI rule: HighLevel's own error message, as reported at `community.make.com/t/77054`
