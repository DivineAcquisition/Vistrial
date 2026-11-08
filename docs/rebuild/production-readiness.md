# Production readiness (C)

Date: 2026-11-08. Read-only checks on production, and the Meta App Review text ready to paste.

## What was checked

| Check | Result | Evidence |
|---|---|---|
| `main` deploys to the right Convex production | Yes | Vercel production build of `5fbed54` (#210), deployment `dpl_HiEcwVeUhGzFoyFzDbxsoagLPb2E`: "Deployed Convex functions to https://confident-meerkat-429.convex.cloud" |
| Results files reached production | Yes | Same build: added `resultUploads.by_workspace`; "No indexes are deleted by this push" |
| Production build is healthy | Yes | Last three production deployments (#212, #213, #210) all READY |
| Form settings in Vercel | Missing | Build log: `PUBLIC_FORM_SECRET is not set in Vercel; skipping` and `FORM_ALERT_TO is not set in Vercel; skipping` |
| Production Convex settings, model routes, agent migration finished | Not checked | Needs a production deploy key for `confident-meerkat-429`; none is set in this environment |
| Vercel environment variable names | Not checked | The Vercel connection here is refused (403) when listing project variables |

## To do before App Review

1. **Privacy policy:** `/privacy` does not mention Meta or Facebook. Meta's reviewers check that the policy says what is read from Meta and how it is deleted. Suggested paragraph, for you to approve:

   > **Meta ads.** If a workspace Owner connects a Meta ad account, Vistrial reads that account's campaigns and results (spend, impressions, reach, clicks, and the results Meta reports) with read-only access. Vistrial never creates, edits, pauses or pays for ads. The access token is kept on our servers and never shown in the app. Disconnecting in Connections deletes the token and every saved read straight away; you can also remove Vistrial in your Facebook settings under Business Integrations. To ask for deletion of anything else, see Privacy requests.

2. **Data deletion URL:** `/privacy/requests` explains how to ask for deletion from inside the product. Add one line saying that disconnecting Meta deletes its data immediately, so the page answers Meta's question on its own.
3. **Form settings:** set `PUBLIC_FORM_SECRET` and `FORM_ALERT_TO` in Vercel production if the public request form should verify submissions and send alerts.
4. **Production checks still open:** with a production deploy key saved as `CONVEX_PROD_DEPLOY_KEY`, run read-only: `npx convex run agentsMigration:remaining`, `npx convex env list` (names only), and confirm the model routes table.

## Meta App Review: `ads_read`

Paste into the permission's "How will your app use this permission?" box.

> Vistrial is a marketing workspace for local service businesses (cleaning, home services). A business Owner connects their own Meta ad account so Vistrial can show how their ads performed and use those results as evidence in research reports written for that same business.
>
> We request `ads_read` only. After Facebook Login, the Owner picks one of the ad accounts they can access. Vistrial then reads, for that account: the campaign list (name, status, objective), and insights (spend, impressions, reach, clicks, CTR, cost per click, and the result each campaign is judged by, such as leads, with cost per result) for the last 30 days, 90 days or all time. These are shown on the Owner's Connections page and cited as "Your data" in reports for that business.
>
> Vistrial never creates, edits, pauses or funds ads, and never reads another business's accounts. The token is stored server-side, is never returned to the browser, and is deleted when the Owner disconnects, together with every saved read. Data is used only for the business that connected it, and is not sold or shared.

**Screencast outline** (2 to 3 minutes, on production with a test business):

1. Sign in as a workspace Owner. Open **Connections**, show the Meta ads card with "Vistrial can / cannot".
2. Click **Connect with Facebook**, go through Meta's login, and grant `ads_read`.
3. Choose an ad account. Show the results: totals, spend over time, and campaigns with cost per result.
4. Start a research session for the Growth Architect. Open the report and show a finding labelled **Your data** that cites the Meta results.
5. Back in Connections, click **Disconnect**, and show that the results are gone.

**Test user for reviewers:** a Vistrial login whose workspace has no Meta connection, plus a Meta test user with access to a test ad account. Put both in the "Instructions for reviewers" box.

**Settings to confirm in the Meta app before submitting:**

- Valid OAuth Redirect URIs include `https://confident-meerkat-429.convex.site/meta/callback`.
- Privacy policy `https://vistrial.io/privacy`, terms `https://vistrial.io/terms`, data deletion `https://vistrial.io/privacy/requests`.
- Business verification complete.
