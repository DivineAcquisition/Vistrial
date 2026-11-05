# Connect your Meta ads (read-only Marketing API)

Date: 2026-11-05. A workspace connects its own Meta ad account so Vistrial can read what its ads actually did. Vistrial reads; it never creates, edits, pauses or funds anything on Meta. Spending money or launching ads always needs explicit approval, and that flow is not built yet.

## What the person sees

`/app/connections`, the **Meta ads** card:

1. **Connect with Facebook** (Owner only): Meta's own login page, asking for `ads_read`. "Vistrial can / cannot" is shown before anything happens.
2. **Choose an ad account**: every account the Meta person can reach, with its business, id, currency and status. Disabled, unsettled and closed accounts cannot be picked.
3. **Results**: spend, impressions and reach, clicks and CTR, cost per click, and campaigns, over 30 days, 90 days or all time. Spend over time as bars. Each campaign with status, objective, spend, results (the result its objective is judged by, such as leads), cost per result and CTR. On a phone, campaigns are cards.

The footer counts successful Meta API calls and the success rate, which is also what Meta's access tier measures. Disconnect deletes the token and every saved read; nothing changes on Meta. When Meta signs Vistrial out, the card says so and offers **Reconnect with Facebook**.

Story page: `/dev/meta-connection?state=none|accounts|connected|reconnect`.

## How it works

| Piece | File |
|---|---|
| Tables `metaConnections` (token server-only), `metaOauthStates` (one use, 10 minutes, bound to workspace and Owner), `metaAdSnapshots` | `convex/schema.ts` |
| Functions: `status`, `startConnect`, `adAccounts`, `chooseAccount`, `syncNow`, `disconnect`; internal `syncAll` (every 3 hours) and `connectWithServerToken` (development) | `convex/metaAds.ts` |
| Facebook Login callback: checks the state, swaps the code for a long-lived token, saves it, sends the person back | `convex/http.ts` (`/meta/callback`) |
| Pure helpers: results by objective, joining campaigns to insights, error codes, safe return origins | `convex/lib/metaGraph.ts` |
| UI | `src/components/connections/meta-ads-view.tsx` (display), `meta-ads.tsx` (Convex) |

Rules kept: no public function returns the token; every read checks the workspace; the person is only sent back to Vistrial's own origins; Graph errors become short codes, never raw messages.

## Setup in Meta (once per app)

1. In the Meta app, add the **Facebook Login for Business** (or Facebook Login) product.
2. Under its settings, add both **Valid OAuth Redirect URIs**:
   - `https://calm-spider-678.convex.site/meta/callback` (dev)
   - `https://confident-meerkat-429.convex.site/meta/callback` (production)
3. `META_APP_ID` and `META_APP_SECRET` must be set in each Convex deployment (they are).
4. Optional: `META_OAUTH_SCOPES` (default `ads_read`), `META_GRAPH_VERSION` (default `v25.0`).

## The two Meta tokens in Convex

Checked on dev with `sourceCheck:metaTokenScope`, which returns no token:

| Setting | What it is | Use |
|---|---|---|
| `META_AD_ACCESS_TOKEN` | Long-lived user token (expires 2027-01-04) with `ads_read`, `ads_management`, `business_management`, `pages_*`; reaches 13 ad accounts | The Marketing API, for development and testing through `metaAds:connectWithServerToken`. Customers connect with their own login instead. |
| `META_AD_LIBRARY_TOKEN` | Short-lived user token, expired 2026-11-04 | The Ad Library search (`ads_archive`). Replace with a long-lived token once identity confirmation clears; the Ad Library also refused the valid token with code 10 / 2332002 (no Ad Library API access yet). |

## Tested on dev

`connectWithServerToken` on the Review Workspace with Bay Area Cleaning Professionals (`act_994917815468301`), all time: $5,859.21 spend, 248,082 impressions, 3,136 clicks, 14 campaigns; "BACP | New Customer $50 Special" produced 182 leads at $21.50. No failed calls.

## Next

- Use these results in research: the business's own campaign results as **First-party result** evidence in the Market Intelligence report.
- Then the paused-draft campaign builder and approve-to-launch flow (`ads_management`), submitted separately.
