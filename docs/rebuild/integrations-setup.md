# Setting up Google, calendar and AI note taker connections

Date: 2026-11-11. Written for the owner. This is the list of things only you can do (create accounts,
register apps, ask for approvals, set keys), in the order that gets the longest waits started first.

Every fact about a provider was read on that provider's own pages on 2026-11-11 and is linked. Where a
fact could not be confirmed on an official page it says **not verified**; the full list is at the end.
Menu names change often. If a step does not match what you see, follow the closest option and note it
here. Never paste a key into a chat or commit it. Keys go on the Convex deployment (Settings, Environment
Variables): **dev** (`calm-spider-678`) first, **production** (`confident-meerkat-429`) later. This guide
gives the names of the settings, never their values.

## What you asked for, and the defaults chosen

You have not picked providers, so these are defaults. Each section lists alternatives.

| Group | Default providers | Later options |
|---|---|---|
| Google | Google Ads, Google Analytics 4, Search Console, Google Business Profile | Merchant Center, YouTube Analytics |
| Calendar | Google Calendar, Calendly | Microsoft 365 / Outlook, Cal.com, Acuity |
| AI note takers | Fathom, Fireflies, and "upload or paste a transcript" for everything else | Otter, Granola, tl;dv, Zoom, Google Meet as direct connections |

Every connection follows the Meta ads pattern already in the product: a workspace **Owner** connects, the
access is used for **reading only**, the token stays on Vistrial's servers and is never sent to the
browser, and **Disconnect deletes the token and every saved read** straight away.

One thing to know before you promise "read-only" to a customer: three providers have **no read-only
permission to ask for**. Google Ads has one scope, described by Google as "See, edit, create, and delete";
Google Business Profile has one scope (`business.manage`); Fathom has one scope (`public_api`). For those
three Vistrial would hold a permission that could change things, and reads only because its code only
makes read calls. The product and the privacy policy should say "Vistrial only reads" for those, not
"Vistrial cannot change anything". Google Analytics, Search Console, Google Calendar and Calendly have
true read-only permissions.

---

## Do these first: they have the longest wait

Tick these in order. Items 1 to 4 start a clock that someone else controls.

- [ ] **1. Decide the redirect address (blocks Google verification).** Google only verifies an app whose
      redirect address is on a domain you can prove you own. Today Vistrial's callbacks are on
      `confident-meerkat-429.convex.site`, which is Convex's domain, not yours. Pick option A or B in
      [Redirect address](#redirect-address-decide-this-before-google-verification). Your decision; about
      an hour of work either way.
- [ ] **2. Ask for Google Business Profile API access.** Approval is manual, Google gives no time for it
      (**not verified**: no stated review time), and it needs a Business Profile that has been verified
      and active for 60 days or more. Until approved, the API returns nothing. Steps in
      [Google Business Profile](#4-google-business-profile).
- [ ] **3. Create the two Google Cloud projects and the consent screen**, then submit **brand
      verification** on the production one (Google: usually 2 to 3 business days when a person reviews
      it). Sensitive-scope verification (Google: "up to 10 days", "not guaranteed") can only be submitted
      after that **and** after there is a working flow to film, so it comes later. Steps in
      [Google: one app for five products](#google-one-app-for-five-products).
- [ ] **4. Register the Fathom app.** Fathom says OAuth apps "are subject to review" and publishes no
      timeline (**not verified**). Steps in [Fathom](#7-fathom).
- [ ] **5. Send the recording-consent questions to a lawyer.** The list is in
      [Recording consent](#recording-consent-and-what-vistrial-keeps). Nothing that stores a call
      transcript should reach paying customers before you have answers.
- [ ] **6. Register the Calendly app** (minutes; no review step is documented, **not verified**). Steps in
      [Calendly](#6-calendly).
- [ ] **7. Set the keys on Convex dev** as each app is created. Names in
      [Settings to add](#settings-to-add-names-only).
- [ ] **8. Approve the privacy policy paragraphs** (they arrive as a proposed diff in the third pull
      request). Google's reviewers read the policy.
- [ ] **9. Later, once Google Calendar works for test users on production:** record the demo video and
      submit sensitive-scope verification. Text to paste is in
      [What to prepare for Google's review](#what-to-prepare-for-googles-review).

Nothing is needed from you for **upload or paste a transcript**: it has no provider, no key and no
approval.

### What works before any approval

| Path | Works today for | What unlocks everyone |
|---|---|---|
| Upload or paste a transcript | Everyone, as soon as it ships | Nothing |
| Google Calendar | Up to 100 Google accounts you list as test users. Each must reconnect every 7 days | Sensitive-scope verification |
| Calendly | Any Calendly account, once the app's keys are set | Nothing documented (**not verified**) |
| Google Analytics 4, Search Console | Same 100 test users, 7-day reconnect | Sensitive-scope verification |
| Google Ads | Test ad accounts only, until the project has Explorer access | Explorer (usually automatic), then Basic |
| Google Business Profile | Nothing | Google's access approval |
| Fathom | Your own Fathom account while the app is in development (**not verified**) | Fathom's review |
| Fireflies | Any Fireflies account: the customer pastes their own API key | Nothing |

---

## Redirect address: decide this before Google verification

When a customer signs in at Google, Google sends them back to a fixed address. Google's rules:

- The redirect address's domain must be listed under **Authorized domains**, and "You must verify that you
  own all domains listed in your Authorized domains section", through Search Console
  ([Google: verification requirements](https://support.google.com/cloud/answer/13464321),
  [brand verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification)).
- Google's own advice is to "identify any domains that you don't own and would therefore be unable to
  verify", and for shared hosting domains to use your own domain
  ([policy compliance](https://developers.google.com/identity/protocols/oauth2/production-readiness/policy-compliance)).

`confident-meerkat-429.convex.site` belongs to Convex. Whether Google would accept it is **not verified**,
and I would not build the launch on finding out. Two ways to put the callback on `vistrial.io`:

| | Option A: Convex custom domain | Option B: forward from the website |
|---|---|---|
| What it is | A subdomain such as `connect.vistrial.io` that points at Convex's HTTP actions | The website (`app.vistrial.io`) passes `/integrations/.../callback` on to Convex |
| Cost | Needs the Convex **Pro** plan ([Convex: custom domains](https://docs.convex.dev/production/custom-domains)) | None |
| Your part | Add the domain in the Convex dashboard (Deployment Settings), add the DNS records it shows | Nothing; a small code change in a later pull request |
| Side effect | If you also override `CONVEX_SITE_URL`, the Meta callback address changes too and must be added in the Meta app. Setting only `INTEGRATIONS_CALLBACK_ORIGIN` avoids that | None |

Either way the setting is `INTEGRATIONS_CALLBACK_ORIGIN` (for example `https://connect.vistrial.io`). When
it is not set, callbacks use the deployment's own `convex.site` address, which is fine for **Testing**
status and for Calendly and Fathom. **Recommendation: option B** unless you already want Convex Pro.
Option B is not built yet; say which you want.

The addresses, for reference:

| Provider | Production | Dev |
|---|---|---|
| Google (all five products) | `https://confident-meerkat-429.convex.site/integrations/google/callback` | `https://calm-spider-678.convex.site/integrations/google/callback` |
| Calendly | `https://confident-meerkat-429.convex.site/integrations/calendly/callback` | `https://calm-spider-678.convex.site/integrations/calendly/callback` |
| Fathom (planned) | `https://confident-meerkat-429.convex.site/integrations/fathom/callback` | `https://calm-spider-678.convex.site/integrations/fathom/callback` |

With `INTEGRATIONS_CALLBACK_ORIGIN` set, replace the part before `/integrations` with that address, for
Google at least.

---

## Google: one app for five products

Google Ads, Analytics, Search Console, Business Profile and Calendar all use the same Google sign-in app.
Each product is a separate connection in Vistrial that asks only for its own permission, so a customer who
wants only Calendar is never asked about ads.

### G1. Two Cloud projects

Google's policy asks for separate projects for testing and production
([policy compliance](https://developers.google.com/identity/protocols/oauth2/production-readiness/policy-compliance)).

1. Go to the Google Cloud console, signed in with the **business's** Google account (the one that owns the
   existing "Vistrial" project used for YouTube).
2. Create a project named **Vistrial Dev**. Keep the existing **Vistrial** project for production.
3. Check billing is active on both. A project on Free Trial or with suspended billing is rejected for
   Google Ads access
   ([Google Ads: developer token page, known issues](https://developers.google.com/google-ads/api/docs/api-policy/developer-token)).

### G2. Turn on the APIs (both projects)

**APIs & Services → Library**, search, **Enable**:

- Google Calendar API
- Google Analytics Data API ([quickstart](https://developers.google.com/analytics/devguides/reporting/data/v1/quickstart))
- Google Analytics Admin API (exact console name **not verified**)
- Google Search Console API (exact console name **not verified**)
- Google Ads API
- For Business Profile: My Business Account Management API, My Business Business Information API, and
  Business Profile Performance API ([basic setup](https://developers.google.com/my-business/content/basic-setup);
  enabling the Performance API under that name is **not verified**). These work only after step 4's
  approval.

### G3. The consent screen (Google Auth Platform)

In the console, open **Google Auth Platform**. It has Branding, Audience, Data Access, Clients and
Verification Center pages ([Google: manage OAuth app branding](https://support.google.com/cloud/answer/15549049)).

1. **Branding:** app name **Vistrial**, support email, logo, home page `https://vistrial.io`, privacy
   policy `https://vistrial.io/privacy`, terms `https://vistrial.io/terms`. The home page "must be hosted
   on a verified domain you own" and cannot be only a login page; the privacy policy must be on the same
   domain ([requirements](https://support.google.com/cloud/answer/13464321)).
2. **Branding → Authorized domains:** add `vistrial.io`. Google says to "Add your Authorized Domains before
   you add your redirect or origin URIs". Verify `vistrial.io` in Search Console with the same Google
   account if it is not already.
3. **Audience:** user type **External**. Leave publishing status on **Testing** for now, and add the
   Google accounts that may connect as **test users** (up to 100).
4. **Data Access:** add exactly these scopes. The page shows whether Google treats each as sensitive or
   restricted; write down what it shows, because no documentation page lists it (**not verified**: I
   expect all of them to be labelled sensitive and none restricted).

   | Product | Scope to add | Read-only? |
   |---|---|---|
   | Sign-in identity | `openid`, `https://www.googleapis.com/auth/userinfo.email` | Yes. Shows which Google account is connected |
   | Google Calendar | `https://www.googleapis.com/auth/calendar.events.owned.readonly` | Yes ("See the events on Google calendars you own") |
   | Google Analytics 4 | `https://www.googleapis.com/auth/analytics.readonly` | Yes |
   | Search Console | `https://www.googleapis.com/auth/webmasters.readonly` | Yes |
   | Google Ads | `https://www.googleapis.com/auth/adwords` | **No read-only scope exists** |
   | Business Profile | `https://www.googleapis.com/auth/business.manage` | **No read-only scope exists** |

   Scope names: [Google's scope list](https://developers.google.com/identity/protocols/oauth2/scopes),
   [Calendar scopes](https://developers.google.com/workspace/calendar/api/auth). Add the Ads and Business
   Profile scopes only when those two are about to be built; every scope on this page has to be justified
   at verification.
5. **Clients → Create client → Web application**, name "Vistrial web". Under **Authorized redirect URIs**
   add the Google address from the table above (the dev address on the Dev project, the production address
   on the production project). The client secret is shown **once**
   ([Google: manage OAuth clients](https://support.google.com/cloud/answer/15549257)); put it straight
   into Convex.
6. On Convex, add `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET` (dev project's values on dev,
   production project's on production).

### G4. What Testing status means

- Only listed test users can connect, up to 100, and Google shows them a warning screen first
  ([Google: app audience](https://support.google.com/cloud/answer/15549945)).
- "Authorizations by a test user will expire seven days from the time of consent." In Vistrial the
  connection then shows **Reconnect needed**. This is Google's rule for Testing, not a fault.
- The 100 is a lifetime count for the project and cannot be reset. Do not spend it on throwaway accounts.

### G5. Going to production: what Google reviews

| Review | Needed for | Google's stated time | Notes |
|---|---|---|---|
| Brand verification | Showing the Vistrial name and logo; also required before Google Ads Basic access | Minutes if automatic, "usually 2-3 business days" if manual ([source](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification)) | Needs the domain verified |
| Sensitive-scope verification | Calendar, Analytics, Search Console, Ads, Business Profile for more than 100 users | "can take up to 10 days" ([source](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification)), "not guaranteed" ([source](https://support.google.com/cloud/answer/13463817)) | Needs the demo video. Plan for a round of questions |
| Security assessment (CASA) | Restricted scopes only; yearly, about 6 weeks ([source](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification)) | Not expected | **Not verified** that none of the scopes above is restricted. If the Data Access page labels one "restricted", stop and tell me |

Realistic total from "submit" to "any customer can connect Google Calendar": two to four weeks, because
reviews usually come back with at least one question. That estimate is mine, not Google's.

### What to prepare for Google's review

**Scope justifications** (paste one per scope on the Data Access page; each says why a narrower scope is
not enough, which Google asks for):

> **calendar.events.owned.readonly.** Vistrial is a marketing workspace for agencies, consultants and
> coaches. A workspace Owner connects their Google Calendar so Vistrial can count how many calls with
> outside guests were booked, cancelled or declined each week, and show that next to the Owner's ad and
> landing page results. Vistrial reads events on calendars the user owns and keeps weekly counts only. It
> does not keep event titles, descriptions, guest names or email addresses, and never creates, changes or
> deletes events. The free/busy scopes do not show whether an event has outside guests or was cancelled,
> so they are not enough; this is the narrowest scope that does.

> **analytics.readonly.** A workspace Owner connects one Google Analytics 4 property so Vistrial can show
> sessions, traffic sources, landing pages and key events as totals, beside the Owner's ad results, and
> cite them as the business's own data in reports written for that business. Vistrial runs reports only;
> it never changes a property. This is the only read-only Analytics scope.

> **webmasters.readonly.** A workspace Owner connects one Search Console property so Vistrial can show
> which searches and pages brought clicks and impressions. Vistrial queries Search Analytics only and
> never submits sitemaps or changes a property. This is the read-only Search Console scope.

> **adwords.** A workspace Owner connects one Google Ads account so Vistrial can show campaign names,
> status, spend, impressions, clicks and conversions, and use them as evidence in reports for that same
> business. Vistrial only sends search (reporting) requests. It never creates, edits, pauses or funds
> campaigns. Google Ads offers no read-only scope, so this is the narrowest available.

> **business.manage.** A workspace Owner connects one Business Profile location so Vistrial can show
> views, calls, direction requests, website clicks and the searches that found the listing. Vistrial reads
> performance metrics only. It never edits the listing, posts, or replies to reviews. Business Profile
> offers no read-only scope, so this is the narrowest available.

**Demo video** (unlisted on YouTube, in English; Google asks that it show the consent screen, the app
name, the OAuth client ID in the address bar, and each scope in use):

1. Sign in to Vistrial on production as a workspace Owner. Open **Settings → Data → More connections**.
2. Show the Google Calendar card and its one line on what Vistrial reads.
3. Click **Connect**. On Google's screen, pause so the address bar (with `client_id=`) and the permission
   text are readable. Approve.
4. Back in Vistrial, show the card as Connected with its last read time, then show the booked-call
   counts where the product presents them (the Sales conversion area, once built). Say out loud that only
   counts are kept. Google asks to see each scope in use, so the video waits for that screen.
5. Click **Disconnect** and show the card return to Not connected and the counts gone.
6. Repeat 2 to 5 for each other scope being submitted.

**Privacy policy.** Google requires the policy to say how the app "accesses, uses, stores and shares
Google user data" ([user data policy](https://developers.google.com/terms/api-services-user-data-policy)).
The third pull request proposes the paragraphs. Whether Google requires one exact "Limited Use" sentence
is **not verified**; the proposed text includes a plain statement that Vistrial follows the Google API
Services User Data Policy, including its Limited Use requirements, which is the wording reviewers
commonly ask for.

**Two Google rules that touch how Vistrial works:**

- **Limited Use.** Data from these scopes may be used only for "providing or improving user-facing
  features that are prominent in the requesting application's user interface", may not be sold or used
  for advertising, and people may not read it except in listed cases (same policy). Vistrial's use
  (showing the customer their own numbers and citing them in that customer's reports) fits.
- **AI.** For Google Workspace APIs, which include Calendar, Google prohibits "using user data to create,
  train, or improve a machine learning or artificial intelligence model"
  ([Workspace API policy](https://developers.google.com/workspace/workspace-api-user-data-developer-policy);
  that it names Calendar is **not verified**, it says "and other Google Workspace APIs"). Vistrial's
  agents *read* figures to write a report; that is not training. But it only holds if the model provider
  does not train on what Vistrial sends. The privacy policy already has a switch for that line
  (`aiNoTraining`), off until a Platform Admin confirms the provider setting, and the policy's own tests
  refuse any "not used to train" sentence while it is off. So the proposed Google paragraph does not say
  it yet. **Confirm the setting and turn the switch on before submitting to Google.** Calendar data kept by Vistrial is weekly counts, which keeps the
  exposure small either way.

---

## 1. Google Ads

**Vistrial will read:** campaign names, status and type; spend, impressions, clicks, conversions and
conversion value, by campaign and by day. **Vistrial will never:** create, edit, pause or pay for ads;
change budgets or bids; add or remove users; read another business's accounts.

**The note in `browser-with-approval.md` is correct.** Google's page says: "Developer tokens were sunset
on September 9, 2026, and API access levels are now managed per Google Cloud project"
([access levels](https://developers.google.com/google-ads/api/docs/api-policy/access-levels)), and "You no
longer need a developer token or a Google Ads manager account to get started"
([developer token](https://developers.google.com/google-ads/api/docs/api-policy/developer-token)). So
there is **no developer token setting**. Access belongs to the Cloud project that owns the sign-in app.

| Access level | Reaches | Operations a day | How |
|---|---|---|---|
| Test | Test accounts only | 15,000 | Automatic when the API is enabled |
| Explorer | Real accounts | 2,880 | Apply on the project's Google Ads API **Overview** page; usually automatic |
| Basic | Real accounts | 15,000 | Brand verification first, then automatic "within minutes" |
| Standard | Real accounts | Unlimited | Manual review, "10 business days" |

Steps:

1. In the **production** project open `https://console.cloud.google.com/google/ads-apis/overview` and apply
   for **Explorer**. Applications made in the old Google Ads "API Center" are not processed.
2. After brand verification (G5), apply for **Basic** on the same page. Basic needs the app to be External
   and In production
   ([Ads brand verification](https://developers.google.com/google-ads/api/docs/api-policy/brand-verification)).
3. Standard is not needed at the start. One report request is one operation
   ([quotas](https://developers.google.com/google-ads/api/docs/best-practices/quotas)); a workspace
   refreshed every three hours uses well under 100 a day. Google's "required minimum functionality" rules
   apply only at Standard ([RMF](https://developers.google.com/google-ads/api/docs/api-policy/rmf)).
4. Known problem on Google's page: some projects upgraded after September 9 get an authorization error on
   real accounts, and Google's workaround is a new project. If that happens it means repeating G1 to G3.

What the application form asks is **not verified**. That the API is free is **not verified** (no price is
published; nothing indicates a charge).

**Customer side:** any Google Ads account the person can sign in to. No plan needed.
**Status:** designed, not built. It needs the sign-in app (G3) and Explorer access, then code.

## 2. Google Analytics 4

**Vistrial will read:** sessions, users, traffic source and medium, landing pages, key events and their
counts, as totals by day. **Vistrial will never:** change a property, its settings, audiences or users,
or read individual visitors.

- Scope `analytics.readonly`; property list from the Admin API's account summaries
  ([reference](https://developers.google.com/analytics/devguides/config/admin/v1/rest/v1beta/accountSummaries/list)).
- Limits are per property: 200,000 "tokens" a day and 40,000 an hour on a standard property
  ([Data API quotas](https://developers.google.com/analytics/devguides/reporting/data/v1/quotas)). A daily
  summary uses a few hundred.
- No approval beyond Google's sensitive-scope verification. Cost: none published (**not verified**).

**Customer side:** at least Viewer on the GA4 property. **Status:** designed, not built.

## 3. Search Console

**Vistrial will read:** search queries, pages, clicks, impressions, click rate and average position.
**Vistrial will never:** submit sitemaps, request removals, or change a property or its users.

- Scope `webmasters.readonly`; Search Analytics query
  ([reference](https://developers.google.com/webmaster-tools/v1/searchanalytics/query)).
- Data arrives 2 to 3 days late and the API returns top rows, not every row
  ([Google: getting all your data](https://developers.google.com/webmaster-tools/v1/how-tos/all-your-data)).
  The 16-month history limit is **not verified** on a Search Console page.
- Limits: 1,200 queries a minute per site ([limits](https://developers.google.com/webmaster-tools/limits)).
- No approval beyond sensitive-scope verification.

**Customer side:** the site must be a verified property the person can open. **Status:** designed, not
built.

## 4. Google Business Profile

**Vistrial will read:** daily views (Search and Maps, desktop and mobile), calls, direction requests,
website clicks, bookings, and the monthly search terms that showed the listing
([metrics](https://developers.google.com/my-business/reference/performance/rest/v1/DailyMetric)). Reviews
could be added later. **Vistrial will never:** edit the listing, publish posts, or reply to reviews.

This matters less for agencies and coaches than for local businesses. It is the slowest approval, so the
request is worth making now even if it is built last.

1. Requirements ([prerequisites](https://developers.google.com/my-business/content/prereqs)): "Manage a
   Google Business Profile that is verified and active for 60+ days", and a website for the business that
   matches the listing. **If Vistrial has no Business Profile of its own, create and verify one now; the
   60 days start then.**
2. Open the Business Profile API contact form (linked from the prerequisites page), choose **Application
   for Basic API Access**, and give the **production** project's number. Use an email that is an owner or
   manager of the profile.
3. To check: in the Cloud console, the Business Profile APIs' quota reads **0** queries a minute until
   approved and **300** after. Do not ask for a quota increase while it is 0; Google says to send the
   access application instead ([limits](https://developers.google.com/my-business/content/limits)).

Text for the form's "how will you use the API" box:

> Vistrial is a marketing workspace for agencies and consultants. A business owner connects their own
> Business Profile so Vistrial can show them how people found the listing (views, calls, direction
> requests, website clicks and search terms) next to their ad and website results. Vistrial reads
> performance data for the locations the signed-in owner manages. It does not edit listings, publish posts
> or reply to reviews, and does not combine data across businesses.

**Customer side:** owner or manager of a verified profile. **Status:** designed, not built; blocked on
approval.

## 5. Google Calendar

**Vistrial will read:** events on the connected person's own calendar for the last 90 days and next 30,
and from them count, per week: meetings with at least one guest outside the person's own email domain,
how many were cancelled, and how many a guest declined. **Vistrial keeps only those counts.** No event
titles, descriptions, locations, guest names or email addresses are saved. **Vistrial will never:**
create, change or delete events, or email guests.

**What Calendar cannot tell you:** whether a guest actually showed up. An event carries the invitation
reply (accepted, declined, tentative, no reply) and whether it was cancelled, and nothing about attendance
([event fields](https://developers.google.com/workspace/calendar/api/v3/reference/events)). No-shows come
from Calendly (when the host marks them) or from the team's own check-in. Wherever the counts are shown
must say this; the connection card no longer does.

- Scope `calendar.events.owned.readonly`, read through `events.list`
  ([reference](https://developers.google.com/workspace/calendar/api/v3/reference/events/list)). If a
  test shows the owner's main calendar is not fully covered by it, the fallback is
  `calendar.events.readonly` ("View events on all your calendars"); that the narrower scope returns the
  same fields is **not verified** and is the first thing to check with a real test account.
- Limits: 600 requests a minute per user; no charge for standard use
  ([quota](https://developers.google.com/workspace/calendar/api/guides/quota)). Google says charges for
  going over quota are planned; whether they have started is **not verified**. Vistrial reads a few pages
  per refresh.
- No webhooks are used. Vistrial refreshes on a schedule and when the person presses Refresh.

**Your steps:** G1 to G3 above, with your own Google account added as a test user. Nothing else.
**Customer side:** any Google account with a calendar. No plan needed.
**Status:** the first Google connection to be built (third pull request), because it works for test users
with no approval.

**Later option: Microsoft 365 / Outlook.** Same idea through Microsoft Graph: permission
`Calendars.ReadBasic` (no body or attachments) or `Calendars.Read`, neither needs an admin's consent by
default ([permissions](https://learn.microsoft.com/en-us/graph/permissions-reference)), read with
`/me/calendarView` ([reference](https://learn.microsoft.com/en-us/graph/api/user-list-calendarview?view=graph-rest-1.0)).
You would register an app in the Microsoft Entra admin center and complete **publisher verification**,
which needs a Microsoft AI Cloud Partner Program account and is free
([overview](https://learn.microsoft.com/en-us/entra/identity-platform/publisher-verification-overview));
without it, people in other organisations may be unable to approve the app. Not started.

## 6. Calendly

**Vistrial will read:** scheduled events for the connected person (start time, event type name, active
or cancelled) and, per event, whether an invitee was marked **no-show**, rescheduled or cancelled.
**Vistrial keeps only counts** per week and per event type: booked, cancelled, rescheduled, no-show. No
invitee names, email addresses, answers to booking questions or notes are saved. **Vistrial will never:**
book, cancel or reschedule, mark a no-show, or message invitees.

**About no-shows:** the host marks them by hand in Calendly, after the meeting's start time, on any plan
([Calendly help](https://calendly.com/help/how-to-mark-no-shows-for-meetings)). If the team does not mark
them, Calendly has none to report. Wherever the counts are shown must say this. Seeing a mark takes one request per call, so each
read checks the 30 most recent past calls (to stay inside the Free plan's 50 requests a minute); how many
were checked is stored with the counts.

Steps (you):

1. Sign in to Calendly with the **business's** account. Open the profile menu → **Developer** →
   **OAuth apps** → **Create OAuth app**
   ([Calendly: creating an OAuth app](https://developer.calendly.com/docs/authentication/creating-an-oauth-app)).
   If the menu is missing, the older address is `https://developer.calendly.com/login`.
2. Create **two** apps, because each app takes exactly one redirect address and Calendly recommends one
   app per environment:
   - **Vistrial Dev**, environment **Sandbox**, redirect
     `https://calm-spider-678.convex.site/integrations/calendly/callback`
   - **Vistrial**, environment **Production**, redirect
     `https://confident-meerkat-429.convex.site/integrations/calendly/callback`
3. Scopes to select: `users:read` and `scheduled_events:read`
   ([Calendly: scopes](https://developer.calendly.com/docs/authentication/scopes)). A new app has no
   access until scopes are chosen. Do **not** add any `:write` scope.
4. Calendly shows a **client ID**, a **client secret** and a **webhook signing key**. The secret and the
   signing key are shown **once**. Put them in Convex as `CALENDLY_CLIENT_ID`, `CALENDLY_CLIENT_SECRET`
   and `CALENDLY_WEBHOOK_SIGNING_KEY`.

Things to know:

- No review of a public app is mentioned in Calendly's documentation (**not verified**).
- Calendly's sign-in requires PKCE (a one-time proof that the browser that started the sign-in is the one
  finishing it); Vistrial sends it
  ([reference](https://developer.calendly.com/api-docs/calendly-o-auth/o-auth/get-oauth-authorize)).
- Access lasts 2 hours and is renewed automatically; each renewal replaces the renewal token
  ([rotation guide](https://developer.calendly.com/docs/authentication/refresh-token-rotation-guide)).
  Calendly ends the connection if the person changes their login email, password or login method
  ([FAQ](https://developer.calendly.com/docs/getting-started/frequently-asked-questions)); Vistrial then
  shows **Reconnect needed**.
- **Customer side:** the API works "on any subscription plan, including the Free plan" (same FAQ). Limits:
  500 requests a minute on paid plans, 50 on Free
  ([rate limits](https://developer.calendly.com/api-docs/overview/rate-limits)). A person sees their own
  events; an organisation admin or owner is needed to read a whole team's.
- **Webhooks (later, optional).** Calendly can notify Vistrial the moment a call is booked, cancelled or
  marked no-show, on all plans. It would need the extra scope `webhooks:write`, which lets Vistrial create
  and delete its own notification subscription and nothing else. Vistrial starts with scheduled refresh
  and no write scope. The receiver that checks Calendly's signature
  ([signatures](https://developer.calendly.com/api-docs/overview/webhooks/webhook-signatures)) is built
  and waiting; the address would be
  `https://confident-meerkat-429.convex.site/integrations/webhook/calendly/<id Vistrial creates>`.

**Status:** built in the third pull request, behind its three settings.
**Alternatives:** Cal.com and Acuity both have APIs; not researched.

## 7. Fathom

**Vistrial will read:** for calls the person chooses, the transcript (speaker names and what was said,
with times) and Fathom's summary. **Vistrial will not fetch:** audio or video, the invitee list with email
addresses, CRM matches, or share links. **Vistrial will never:** record, join or change a meeting, or
share a recording.

Fathom's API has one permission, `public_api`; there is no read-only one
([Fathom: OAuth](https://developers.fathom.ai/sdks/oauth)).

Steps (you):

1. Sign in to Fathom with the business's account and open
   `https://fathom.video/marketplace_applications/new`
   ([Fathom: OAuth apps](https://developers.fathom.ai/oauth)).
2. Fill in name **Vistrial**, description, logo, and the redirect address
   `https://confident-meerkat-429.convex.site/integrations/fathom/callback`. Fathom allows one production
   redirect address and several development ones
   ([FAQ](https://developers.fathom.ai/faq)); add the dev address as a development one.
3. Submit. Fathom says OAuth apps "are subject to review", reviews usage each quarter and lists an app in
   its marketplace once it has 20 or more users. The review's length and what it checks are **not
   verified**.
4. Put the keys in Convex as `FATHOM_CLIENT_ID` and `FATHOM_CLIENT_SECRET`.

Suggested description for the form:

> Vistrial is a marketing workspace for agencies, consultants and coaches. A workspace owner connects
> Fathom so Vistrial can read the transcript and summary of sales calls they choose, and use what
> prospects actually said as evidence when it explains which offers and ads are working. Vistrial reads
> transcripts and summaries only. It does not download recordings, and it deletes everything it read when
> the owner disconnects.

Things to know:

- **Customer side:** "API access—keys and webhooks—are included on all plans" (Fathom FAQ). A person sees
  calls they recorded and calls shared with them or their team.
- Limits: 60 requests a minute; transcript and summary requests 30 a minute, sometimes less
  ([API overview](https://developers.fathom.ai/api-overview)).
- Fathom can notify Vistrial when a call's notes are ready, signed with a per-subscription secret
  ([webhooks](https://developers.fathom.ai/webhooks)). The receiver that checks that signature is built.
  Whether a connected app (rather than a personal key) may create the subscription is **not verified**.
- Two details could not be confirmed and must be checked with Fathom before building: the sign-in
  address appears only in Fathom's code library, not its written documentation, and the library and the
  documentation give different hosts for the token address.

**Status:** designed, not built. Until then Fathom users can copy a transcript out of Fathom and use
upload or paste.

## 8. Fireflies

**Vistrial will read:** for calls the person chooses, the transcript (speaker names and sentences) and
Fireflies' summary (overview, action items, topics). **Vistrial will not fetch:** audio or video links, or
the attendee list with email addresses. **Vistrial will never:** record, join or change a meeting.

Fireflies has **no sign-in app for other products to register** (**not verified** beyond: its
documentation describes none for its main API). Each customer creates their own API key in Fireflies
(**Integrations → Fireflies API**) and pastes it into Vistrial once
([Fireflies: authorization](https://docs.fireflies.ai/fundamentals/authorization)). Vistrial stores it the
same way as a token: on the server, never shown again.

**Nothing for you to set up.** There are no keys of Vistrial's own. Two things to decide:

- A Fireflies API key is not limited to reading. Fireflies offers no narrower key. The customer should
  know that before pasting it.
- Optional: Fireflies has a Developer Program (reviewed by hand; three months of Business-tier access) and
  a partner listing that asks for a SOC 2 report
  ([developer program](https://docs.fireflies.ai/getting-started/developer-program)). Not needed to build.

Things to know:

- **Customer side**, requests allowed ([limits](https://docs.fireflies.ai/fundamentals/limits)):

  | Fireflies plan | A minute | A day |
  |---|---|---|
  | Free | 30 | 500 |
  | Pro | 60 | 5,000 |
  | Business | 60 per paid seat, pooled | No daily limit |
  | Enterprise | 60 per paid seat, pooled | No daily limit |

  All plans can use the API. Which of a team's calls an ordinary member's key can read is **not
  verified**; reading a whole team's needs an Enterprise "Super Admin".
- Fireflies can notify Vistrial when a call is transcribed. The customer sets that up in Fireflies
  (`https://app.fireflies.ai/integrations/api/webhook`), pasting an address and a signing secret that
  Vistrial shows them once
  ([Fireflies: webhooks v2](https://docs.fireflies.ai/graphql-api/webhooks-v2)). The receiver that checks
  the signature is built. Without it, Vistrial would refresh on a schedule.

**Status:** designed, not built. Until then, upload or paste.

## 9. Upload or paste a transcript (works for every tool)

**Vistrial will keep:** the text the person uploads or pastes, a title, the call's date, and which tool it
came from (the person's own label). It is stored for that workspace only, shown as **Your data**, and can
be cited in that workspace's reports the way results files are. **Vistrial will never:** take audio or
video; the upload refuses anything that is not text.

Where the text comes from, in each tool (checked where a page could be read):

| Tool | How the customer gets the text |
|---|---|
| Fathom, Fireflies | Copy or download the transcript from the call's page |
| Otter | Export as TXT (TXT on the free plan; other formats paid). **Not verified** on a page I could open |
| Granola | Copy from the transcript panel ([exporting](https://docs.granola.ai/help-center/sharing/exporting-notes)) |
| tl;dv | Copy from the transcript tab; needs their Pro plan ([help](https://intercom.help/tldv/en/articles/6122489-how-to-download-transcripts)) |
| Zoom | Download the cloud recording's transcript, a `.vtt` file; needs a paid Zoom plan with cloud recording ([Zoom](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0064927)) |
| Google Meet | The transcript is a Google Doc in the organiser's Drive ([Meet help](https://support.google.com/meet/answer/12849897)); copy the text or download it as plain text |

Accepted: pasted text, and `.txt`, `.vtt`, `.srt` and `.md` files. Timestamps and cue numbers in `.vtt`
and `.srt` files are dropped; the words and speaker names are kept.

**Status:** built in the third pull request. No setup.

---

## Recording consent, and what Vistrial keeps

A call transcript holds the words of people who are not Vistrial's customer: the prospect on the other
end. This section says what Vistrial does, what the customer is responsible for, and what needs a lawyer.
**It is not legal advice.**

### What Vistrial stores

| | Stored | Not stored |
|---|---|---|
| Upload or paste | The transcript text, a title, the call date, the source label | Audio, video |
| Fathom, Fireflies (when built) | Transcript text and the tool's summary, for calls the person chooses | Audio, video, recording links, attendee email addresses, CRM records |
| Google Calendar, Calendly | Weekly counts | Event titles, guest or invitee names and email addresses |

Why no audio or video: nothing Vistrial does needs it, it is the most sensitive form of a call, and a
voice recording can count as biometric data in some places (see the Illinois case below).

A transcript still contains names and whatever people said. The text is passed to Vistrial's AI provider
when an agent reads it, under the same terms as the rest of a workspace.

### How long, and deletion

- A transcript is kept until someone in the workspace deletes it, or the workspace is deleted. This
  matches the rest of the product, which has no automatic deletion schedule.
- **Disconnecting** a note taker or a calendar deletes its token and everything read through it, straight
  away. Uploaded or pasted transcripts are deleted one at a time by an Owner or Manager.
- Deleting a transcript deletes its text, and agents stop using it. A report already written keeps its
  sentence and its quote of 300 characters or less, like any other source.
- **Decision for you:** whether transcripts should delete themselves after a set time (for example 12
  months). It is not built; say if you want it.

### What the customer is responsible for

The customer recorded the call; Vistrial did not. The customer must have told the people on the call, and
have their agreement where the law requires it, **before** the recording. Both note takers say the same
about themselves: Fathom, "It is the recording owner's responsibility to make sure all participants have
given consent" ([Fathom help](https://help.fathom.video/en/articles/294272)); Fireflies says its bot's
chat notice "alone may not meet consent laws"
([Fireflies guide](https://guide.fireflies.ai/articles/9554534786-how-fireflies-joins-and-records-your-meetings-faqs)).

The upload screen asks the person to confirm this each time, in these words (a lawyer should approve
them):

> I recorded this call lawfully. Everyone on it was told it was being recorded and transcribed, and agreed
> where the law requires it. I may share this transcript with Vistrial.

A line customers can put in their booking page or calendar invitation (also for a lawyer to approve):

> This call may be recorded and transcribed, and the transcript analysed with AI tools, to improve our
> service. Tell us before the call if you would rather it was not.

### Needs a lawyer

1. **All-party consent.** United States federal law allows recording when one party consents
   ([18 U.S.C. § 2511(2)(d)](https://www.law.cornell.edu/uscode/text/18/2511)). About eleven states
   generally require everyone's consent: California, Delaware, Florida, Illinois, Maryland, Massachusetts,
   Michigan, Montana, New Hampshire, Pennsylvania and Washington; lists differ, and some states apply it
   only to phone calls or only in person
   ([Reporters Committee guide](https://www.rcfp.org/introduction-to-reporters-recording-guide/)). A call
   between states can fall under the stricter one. Question: is the customer's confirmation above enough
   to place this responsibility on the customer, and what must the Terms of Service say?
2. **Terms of Service.** The terms need the customer's promise that they have the right to share call
   transcripts, and Vistrial's right to remove one. Nothing about transcripts is in the terms today.
3. **Europe and the UK.** Under GDPR the party that decides why and how personal data is used is the
   "controller" and one acting on its instructions is a "processor", and the two need a contract
   ([EDPB guide](https://www.edpb.europa.eu/sme-data-protection-guide/data-controller-data-processor_en),
   [Article 28](https://gdpr-info.eu/art-28-gdpr/)). The usual reading is that the customer is the
   controller of its call transcripts and Vistrial a processor; that reading for this case is **not
   verified**. Questions: does Vistrial need a data processing agreement to offer customers, and does
   passing transcripts to the AI provider need to be listed as a sub-processor? UK specifics were not
   checked.
4. **Sensitive subjects.** Coaches' and consultants' calls can include health, money or family matters.
   Some of that is specially protected in Europe and in several US states. Question: should the product
   warn against uploading such calls, or refuse them?
5. **Lawsuits to know about.** A class action against Otter.ai (Brewer v. Otter.ai, filed August 2025 in
   California) alleges recording without everyone's consent and use of recordings to train AI
   ([NPR](https://www.npr.org/2025/08/15/g-s1-83087/otter-ai-transcription-class-action-lawsuit)). A
   suit against Fireflies in Illinois (reported December 2025) alleges collecting voiceprints without
   consent
   ([report](https://www.dataprivacyandsecurityinsider.com/2025/12/lawsuit-alleges-fireflies-ai-corp-illegally-collects-biometric-data-from-virtual-meetings/)).
   These are allegations; their current status is **not verified**. They are about the recorder, not a
   tool that later reads a transcript, but they show where the risk is: recording without clear notice,
   voice data, and training AI on calls. Vistrial keeps no audio and does not train models on customer
   data; the lawyer should confirm that is the right line to hold and that the policy says it.
6. **Google's rules** on Calendar data and AI, described above, are a contract matter with Google rather
   than law, but the lawyer should see them with the privacy policy.

---

## Settings to add (names only)

On the Convex deployment, dev first. A provider shows **Not set up yet** in Connections until every
setting it needs is present.

| Setting | For | Needed by |
|---|---|---|
| `GOOGLE_OAUTH_CLIENT_ID` | The Google sign-in app's public id | All Google products and Google Calendar |
| `GOOGLE_OAUTH_CLIENT_SECRET` | The Google sign-in app's secret | Same |
| `INTEGRATIONS_CALLBACK_ORIGIN` | Optional. Your own domain for callbacks, once decided | Google verification |
| `CALENDLY_CLIENT_ID` | The Calendly app's public id | Calendly |
| `CALENDLY_CLIENT_SECRET` | The Calendly app's secret | Calendly |
| `CALENDLY_WEBHOOK_SIGNING_KEY` | Checks that a notification came from Calendly | Calendly |
| `FATHOM_CLIENT_ID`, `FATHOM_CLIENT_SECRET` | The Fathom app's keys | Fathom, when built |

Not needed: a Google Ads developer token (retired by Google), any Fireflies key of Vistrial's own, and
anything for upload or paste.

## Cost and limits at a glance

| Provider | Cost to Vistrial | Customer needs | Approval | Wait |
|---|---|---|---|---|
| Google Ads | None published (**not verified**) | A Google Ads account | Explorer, then Basic | Minutes to days |
| Google Analytics 4 | None published (**not verified**) | Viewer on the property | Sensitive-scope verification | Up to 10 days stated; plan for 2 to 4 weeks |
| Search Console | None published (**not verified**) | A verified property | Same | Same |
| Business Profile | None published (**not verified**) | Owner or manager of a verified profile | Access application, and a profile 60+ days old | Not stated |
| Google Calendar | No charge for standard use | A Google account | Sensitive-scope verification; test users before | Same as Analytics |
| Calendly | None | Any plan, Free included | None documented (**not verified**) | Minutes |
| Fathom | None | Any plan | App review | Not stated |
| Fireflies | None | Any plan; Free allows 500 requests a day | None | None |
| Upload or paste | None | A transcript as text | None | None |

Also possible: Convex Pro, only if you choose option A for the redirect address.

## What is built, and where

| Pull request | What it holds |
|---|---|
| 1 (this guide) | `docs/rebuild/integrations-setup.md` |
| 2 | Shared groundwork: one place for connections, sign-in start and return with one-use state and PKCE, tokens kept on the server and renewed, disconnect that deletes tokens and saved reads, a notification receiver that checks signatures, and a Connections section that lists every provider as **Not set up yet** until its settings exist |
| 3 | Upload or paste a transcript; Google Calendar and Calendly reading, behind their settings; proposed privacy policy paragraphs |

Not built in these three: Google Ads, Analytics 4, Search Console, Business Profile, Fathom, Fireflies
(designed, with the steps above), redirect option B, Calendly notifications, Microsoft 365.

## Not verified

Everything below could not be confirmed on an official page on 2026-11-11. Each is also marked where it
appears above.

1. Whether Google labels each scope above sensitive, and that none is restricted (the Cloud console's
   Data Access page shows the label; no documentation page lists it).
2. Whether Google accepts a `convex.site` address as an authorized domain.
3. That Google's sign-in documents PKCE for server-side web apps. Google's published settings list it as
   supported and Vistrial sends it; the written guide for web server apps does not mention it.
4. That `calendar.events.owned.readonly` returns every field `calendar.events.readonly` does.
5. Whether Google requires one exact "Limited Use" sentence in a privacy policy.
6. That Google's Workspace AI rule names Calendar.
7. Whether Google's planned charge for exceeding Calendar quota has started.
8. That the Google Ads, Analytics and Search Console APIs are free; what the Google Ads access form asks.
9. Search Console's 16-month history limit, on a Search Console page.
10. Google Business Profile's review time, and enabling the "Business Profile Performance API" under that
    name; the console names "Google Analytics Admin API" and "Google Search Console API".
11. Whether a public Calendly app needs any review; Calendly's retry behaviour for notifications.
12. Fathom: review length and criteria; the sign-in address in written documentation; which token host is
    right; PKCE; whether a connected app can create notification subscriptions; whether an app in
    development can be used before review.
13. Fireflies: whether any sign-in app option exists for its main API; which team calls an ordinary key can
    read; whether notifications need a paid plan.
14. Otter's export formats (their help page could not be opened); tl;dv's file formats; Zoom AI Companion
    summary export; Google Docs download formats for Meet transcripts.
15. The California statute's own text (confirmed through the Reporters Committee guide only); the status
    of the Otter and Fireflies lawsuits; UK data protection specifics; the controller and processor
    reading as applied to call transcripts.
16. Cal.com, Acuity, Otter, Granola, tl;dv, Zoom and Meet as direct connections: not researched.
