# Connections groundwork: what every new provider shares

Date: 2026-11-11. The shared parts behind Google, calendar and note taker connections, modelled on the
Meta ads connection, which is untouched. Owner steps are in `integrations-setup.md`. With no settings on
the deployment, everything builds and every provider shows **Not set up yet**.

## What a person sees

**Settings → Data → More connections** (`/app/connections/integrations`): three groups (Google, Calendar,
AI note takers). Each provider card says what Vistrial reads and never does, and one of:

| Shown | Means |
|---|---|
| Not set up yet | The deployment lacks that provider's settings. Nothing for the customer to do |
| Not built yet | Settings are present (or none are needed) but reading is not built |
| Not connected, with **Connect** | An Owner can sign in. Others see "A workspace Owner can connect this" |
| Connected, with **Disconnect** | Shows the account and the date |
| Reconnect needed | The provider signed Vistrial out (Google does this after 7 days while its app is in Testing) |

After this pull request, with their settings present, Google Calendar and Calendly can be connected and
disconnected. Nothing is read from them until the next pull request.

Story page: `/dev/integrations?state=none|ready|connected|returned|cancelled&role=owner|rep&theme=dark`.
Screenshots: `docs/screenshots/integrations-setup/`.

## How it works

| Piece | File |
|---|---|
| The providers: group, words, sign-in app, scopes, settings needed, webhook scheme, how far built | `convex/lib/integrations/providers.ts` |
| State, PKCE, the address to open, reading a token answer | `convex/lib/integrations/oauth.ts` |
| Webhook signature checks (Calendly, Standard Webhooks for Fathom, X-Hub-Signature for Fireflies) | `convex/lib/integrations/signatures.ts` |
| Tables `integrationConnections` (tokens, server only), `integrationOauthStates` (one use, 10 minutes), `integrationSnapshots` (saved reads), `integrationWebhookEvents` (which and when, never the body). All new; no existing table changed | `convex/schema.ts` |
| `list`, `startConnect`, `setAgentAccess`; internal token, snapshot and webhook records | `convex/integrations.ts` |
| Finishing a sign-in, renewing a token (`liveToken`), `disconnect` | `convex/integrationActions.ts` |
| `/integrations/google/callback`, `/integrations/calendly/callback`, `/integrations/webhook/<provider>/<hook id>` | `convex/integrationHttp.ts`, added to `convex/http.ts` |
| Screen | `src/components/connections/integrations-view.tsx` (display), `integrations.tsx` (Convex) |

Rules kept:

- Only an Owner starts a sign-in or disconnects. A sign-in attempt works once, for ten minutes, and only
  while the person who started it is still an Owner.
- No public function returns a token, a secret or a setting's name. `list` is tested for it.
- Every read and write is by workspace; another workspace's member is refused.
- PKCE (S256) is sent to Google and Calendly. The verifier is deleted when used.
- A state made for one provider is refused at another provider's callback.
- If a person unticks the permission on Google's screen, nothing is saved and the token is cancelled.
- Token renewal: one caller at a time (renewal tokens are often one-use), the rotated token is kept, a
  refusal marks the connection **Reconnect needed**, a provider outage does not.
- Disconnect deletes the connection and its saved reads in one step, then asks the provider to cancel
  the token. The deletion does not depend on the provider answering. A read that finishes afterwards
  cannot bring data back.
- A webhook is refused unless its signature is right and recent; every refusal looks the same (401).
  A repeated delivery is counted once. Only the event's kind is kept.
- Provider answers become short codes; their own words never reach a person.

Like the Meta token, tokens are stored in Convex as they are, not separately encrypted by Vistrial.

## Adding a provider

1. Set its `stage` to `connect` in `providers.ts` (and add a sign-in app there if it has its own).
2. Read with `liveToken(ctx, workspaceId, provider)` inside an action, reduce what comes back to what
   Vistrial keeps, and store it with `internal.integrations.saveSnapshot`.
3. Record the outcome with `recordSync`. Nothing else is needed for disconnect: snapshots go with it.

## Not done here

- No provider is read yet. No webhook leads to a read yet; verified deliveries are only recorded.
- Nothing was tried against a real provider: no accounts exist. The tests use fakes.
- `INTEGRATIONS_CALLBACK_ORIGIN` changes the callback address, but nothing forwards from your own domain
  yet (the guide's redirect option B).
- Old sign-in attempts are not swept (the same as Meta's).
