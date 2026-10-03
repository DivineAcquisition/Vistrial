# Execution integrations: Slack, Discord, Google Drive

Where the agent writes once a person has approved. Internal-facing: your team
sees what is posted or filed; no lead ever does. Settings → Integrations →
"Where Vistrial posts".

| Where | What |
|---|---|
| `src/lib/execution/kinds.ts` | The three destinations, their scopes, the three operation names. |
| `src/lib/execution/slack.ts`, `discord.ts`, `google-drive.ts` | One client per provider. |
| `src/lib/execution/operations.ts` | `postSlackMessage`, `postDiscordMessage`, `storeDriveAsset`. No generic post. |
| `src/lib/execution/authorize.ts` | What lets a write happen. |
| `src/lib/execution/write-log.ts` | Every attempt, including blocked ones. |
| `src/app/api/execution/oauth/{start,callback}` | One redirect URI for all three. |
| `supabase/migrations/20261003030000_execution_integrations.sql` | Connections, write log, action types. |

## How a write is authorised

A write needs exactly one of three, each checked against the database:

1. **`approval_item`**: a person approved a queue item of the matching type
   (`slack_post`, `discord_post`, `drive_store`).
2. **`auto_run`**: an owner set that action type to auto-run in Settings →
   Approvals. They ask first by default.
3. **`owner_test`**: an owner or admin pressed "Send a test" on the card.

Also required: the workspace's agents are not paused, the action type is not
off, and the connection is active with a destination chosen. Anything else is
logged as `blocked` and nothing is sent. The destination is always read from
the stored connection; no operation takes a channel or folder from its caller.

## Setup per provider

Redirect URI for all three: `https://<app domain>/api/execution/oauth/callback`.

**Slack.** Create the app, add bot scopes `chat:write`, `channels:read`,
`channels:join` and no user scopes, enable "Manage distribution" so other
workspaces can install it. Set `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`. The
signing secret, app-level token, and verification token are not used: Vistrial
receives no Slack events.

**Discord.** Create the application and add a bot user. Add the redirect URI
under OAuth2. Set `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, and
`DISCORD_BOT_TOKEN` (Bot tab). The invite asks for `permissions=3072` (View
Channels + Send Messages). One bot serves every server, so Vistrial stores only
each client's server id, not a per-client token.

**Google Drive.** In a Cloud project: enable the Drive API and the Picker API,
configure the consent screen, and add only the `drive.file` scope. Create an
OAuth client (type Web application) with the redirect URI, and a browser API
key restricted to this app's origins. Set `GOOGLE_DRIVE_CLIENT_ID`,
`GOOGLE_DRIVE_CLIENT_SECRET`, `GOOGLE_PICKER_API_KEY`, and
`GOOGLE_CLOUD_PROJECT_NUMBER`. Check Google's verification requirements for the
consent screen before real clients connect.

## Decisions made without an answer

These were open when the work started. Each is one place to change.

- **Gate.** Writes are authorised through the Home approval gate (new action
  types), not the agent framework's closed allowlist, which is CRM and calendar
  only. Adding these there too is a separate change.
- **Drive layout.** `<root>/<asset kind>/<YYYY-MM>/<file>`, in
  `drive-layout.ts`. A placeholder for the Sales OS Agent's structure, which is
  not in this repository.
- **Message shape.** Title, optional summary, up to 10 label/value fields, optional footer
  (`message.ts`). Same shape for Slack and Discord.
- **Slack channels.** Public only. Private channels would need another scope.
- **Discord disconnect.** The bot leaves the server, the only way to remove its
  ability to post. Leaving deletes nothing.
- **Drive "create".** Google's picker cannot create folders, so "Create a
  Vistrial folder" makes one in My Drive through the API.
- **Who connects.** Owners and admins.

## Live verification

The automated tests use mocked HTTP and prove the rules, not the providers.
Run these against real accounts on a deployed preview.

**Slack**
- Connect Slack: consent screen lists only posting, listing public channels, joining.
- The channel list on the card is your workspace's, not typed.
- "Send a test" appears in the chosen channel, formatted with a header.
- Disconnect, then try "Send a test" again: not available. The earlier post is still there.

**Discord**
- The invite page shows only View Channels and Send Messages, not Administrator.
- The channel list is your server's. "Send a test" appears as an embed with no pings.
- Disconnect: the bot leaves; earlier messages remain.

**Drive**
- Consent shows only "See, edit, create, and delete only the specific Google Drive files you use with this app".
- "Choose a folder" opens Google's picker; no path is typed.
- "File a test" creates `Connection checks/<YYYY-MM>/Vistrial connection check.txt` in that folder.
- Outside the root: with a Drive folder id the app was not given, call
  `files.create` with that id as `parents` using the connection's token. Google
  returns 404 (not found), and nothing is written. `drive.file` enforces this.
- Disconnect: filing stops; files stay.

**Shared**
- Each card disconnects in one click, with no confirmation step.
- Revoke access from the provider's side (Slack app settings, Discord server
  integrations, Google account permissions), then "Send a test": the card
  turns to "Needs attention" with plain words and a Reconnect button.
- Settings → Integrations has no field that accepts a token, key, or webhook URL.
- `execution_writes` shows content, destination, and the authorising approval
  or person for every attempt. Search logs and the activity stream for `xoxb-`,
  `ya29.`, `Bot `: nothing.

## Known gaps

- Nothing in this repository yet produces these writes on its own. The three
  operations are ready for the Sales OS Agent to call with an approved queue
  item; until then the only caller is the "Send a test" button.
- The Content Security Policy now allows Google's picker (`apis.google.com`,
  `www.gstatic.com`, `docs.google.com`, `content.googleapis.com`). Not tested in
  a real browser; if the picker is blank, check the browser console for a
  blocked host and add it in `next.config.ts`.
- The picker needs a short-lived Drive access token in the browser. It is
  limited to `drive.file`, requested only by an owner or admin, and never logged.
