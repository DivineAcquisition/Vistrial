# Acting inside a customer's accounts, with approval

Date: 2026-11-10. Design, plus an approval surface that runs on a dry-run driver. **No real account access
is built.** Nothing in this document or its code opens a customer's account, holds a session, or stores a
credential. The owner asked for both public reading and logged-in approval from the start; public reading
is built (`page-reader.md`, `landing-page-teardown.md`), and this is the design for the second half, with
the part that can be built safely now.

Facts about vendors and sites were read from their own pages on 2026-11-10. Where a fact could not be
confirmed it says "not verified". Terms change; re-read them before building against any site.

## The short version

1. Use an official API or connector wherever one exists. For most of the sites an agency lives in, one
   does, and those sites' terms forbid a browser agent anyway.
2. A browser is for the few tools with no adequate API and no clause against automation. Today that is a
   short list, and each one is the owner's decision.
3. Where a browser is used: the customer signs in themselves in a hosted browser view, Vistrial never
   sees the password, every change is shown and approved one step at a time, and every step is recorded
   with a screenshot.

## Which sites truly need a browser

| Site | Official API | What its terms say about automation | Decision |
|---|---|---|---|
| Meta (Ads Manager, Business Suite) | Yes: Marketing API. Already connected, read-only | "You may not access or collect data from our Products using automated means (without our prior permission)"; do not "give access to your Facebook account to others" ([terms](https://www.facebook.com/legal/terms)) | **API only.** Never a browser |
| Google Ads | Yes: Google Ads API | Google's terms bar "using automated means to access content … in violation of the machine-readable instructions" ([terms](https://policies.google.com/terms)). Google sign-in resists automated browsers (not verified) | **API only** |
| Google Analytics 4 | Yes: Data and Admin APIs (not verified this session) | Same Google terms | **API only** |
| Google Business Profile | Yes, by approval: needs a profile verified 60+ days ([prerequisites](https://developers.google.com/my-business/content/prereqs)) | Same Google terms | **API only** |
| LinkedIn | Marketing API, by approval (not verified) | Forbids "bots or other unauthorized automated methods" and "sharing log-in credentials or copying cookies" ([user agreement 8.2](https://www.linkedin.com/legal/user-agreement)) | **Never automated.** API or nothing |
| TikTok Ads Manager | Yes: API for Business | Consumer terms forbid "automated scripts to collect information from or otherwise interact with the Services"; business terms not verified | **API only** |
| Shopify | Yes: Admin API | No access "using any robot, spider, scraper, or other automated means" ([terms 1.9](https://www.shopify.com/legal/terms)); API terms bar "automating administrative functions" | **API only** (staff or app grant) |
| HubSpot | Yes (not verified) | No access "other than through our interface"; no automation faster "than a human can reasonably produce" ([acceptable use 4.1](https://legal.hubspot.com/acceptable-use)) | **API only** |
| Stripe | Yes: full API | Customers must prevent unauthorised use of credentials ([services agreement](https://stripe.com/legal/ssa)) | **API only**, restricted key. Never a browser on a payments account |
| Calendly | Yes | Credentials "may not be shared or used by more than one Authorized User" ([customer terms](https://calendly.com/legal/customer-terms-conditions)) | **API only** |
| Webflow | Data API (not verified) | Terms could not be fetched: not verified | **API first.** Do not use a browser until the terms are read |
| HighLevel (GoHighLevel) | API v2 covers contacts and pipelines, not building funnel pages (not verified) | No explicit bot clause found in the first part of its terms; "Platform Accounts are non-transferable" ([terms](https://www.gohighlevel.com/terms-of-service)) | **Candidate for a browser**, for page building only |
| ClickFunnels | API exists, page building not covered (not verified) | Bars "scraping, crawling, downloading, screen-grabbing" and lending "access to your user account" ([terms](https://www.clickfunnels.com/terms)) | **Candidate, moderate risk.** The owner decides |
| WordPress (customer's own site) | REST API for posts and pages | A self-hosted site is the customer's own. WordPress.com: "Don't share or misuse your access credentials" | **API first**; browser for page builders the API cannot reach |

So the honest answer to "which sites need a browser" is: page builders (HighLevel, ClickFunnels, WordPress
page-builder plugins), and nothing else on this list. For everything else the next step is an OAuth
connector like the Meta one, not a browser.

The practical risk of a browser on a site that forbids it is the customer's account being restricted. That
is the customer's loss, not Vistrial's, which is the reason not to do it even when asked.

The same table is in code (`convex/lib/browserAgent/policy.ts`, `SITES`) and shown on the Browser access
page, so the product says the same thing as this document.

## What the agent may do

Every step an agent proposes is one of three kinds. The kind is decided in code from the step's own words,
and the stricter of that and what the driver claims wins, so a driver or a model cannot label a payment as
a read.

| Kind | Examples | What happens |
|---|---|---|
| **Read** | Open a list, read a page's settings, read a report | Done and logged with a screenshot. No approval |
| **Change** | Edit a draft's headline, move a lead to another stage, save a draft | Shown first: what will be clicked or typed, and where, with a screenshot. Nothing happens until an Owner or Manager approves **that one step**. The next change asks again |
| **Restricted** | See the list below | Never part of a task's ordinary flow. Each one needs a separate approval from an **Owner**, who types the word shown |

### What it never does without a separate explicit approval each time

| | Typed word |
|---|---|
| Payments: paying, buying, upgrading, changing a budget or a bid, anything in billing | PAY |
| Passwords and security: passwords, two-factor, API keys, users, roles and permissions | SECURITY |
| Deleting: delete, remove, archive, reset, cancel a plan, close an account | DELETE |
| Sending a message to a person: email, text, reply, comment, broadcast, invite | SEND |
| Publishing: publish, go live, launch, turn on a campaign or automation, schedule a post | PUBLISH |

A Manager can see a restricted step and decline it, but cannot approve it.

### What no approval unlocks

- Typing into a password, card number or verification code field. The customer signs in themselves; the
  agent never handles a secret.
- Leaving the site the session was approved for.
- Opening an address that is not `https`.

A step that hits one of these is recorded as blocked and the task stops.

### Other rules

- A step nobody decides within 24 hours is dropped and its task stops. Silence approves nothing.
- Declining a step stops the task. The agent does not look for another way to the same end.
- 40 steps a task at most.
- What a page says is untrusted, exactly as in the page reader. A page inside an account can contain text
  written by a stranger (a lead's form answer, an email). It is never an instruction. This matters more
  here than anywhere else in the product, because the agent can act.
- Rate: a real driver acts at a person's pace, one step at a time, with a person approving each change.

## How the customer signs in

1. In Browser access (Settings, Data), an **Owner** starts a session for one site.
2. A browser window **hosted by the browser vendor** opens inside Vistrial. The customer types their user
   name and password, and any two-factor code, into the site itself. Vistrial's code is not in that
   exchange: it receives only "signed in" from the vendor.
3. The signed-in browser profile (cookies) is kept **by the vendor**, encrypted, under an id. Vistrial
   stores that id and nothing else. No password, cookie or token is ever written to Vistrial's database,
   logs or model context.
4. Sessions are **per workspace and per site**. One workspace's session can never be used by another.
5. A session **expires after 7 days** and the customer signs in again. The expiry is checked every time
   the session is used, not by a timer that might be late.
6. An Owner can **end a session at any time** from the same page. Every task on it stops at once and a
   step that was waiting can no longer be approved. With a real driver, ending also deletes the vendor's
   stored profile.
7. If the site signs the session out itself, the task stops and the page says "sign in again". The agent
   never tries to log back in.

The dry run models all of this except step 2, which a button stands in for.

## The approval step and the audit trail

Before each step that changes anything, the screen shows:

- **What**: the action and the element, in words ("Click the Save draft button")
- **Typing**: the exact text, when there is any
- **Where**: the page's address
- **Why**: the agent's reason, in a sentence
- a **screenshot** with the element outlined

and two buttons: approve this step, or decline and stop.

Every step, of every kind, is kept in order: what it was, where, what was typed (cut short, and hidden if
it looks like a card number or a key), its kind, whether it was done, declined, blocked or timed out, who
decided and when, and its screenshot. Owners and Managers can read the trail; Reps cannot, because it can
show what was typed into a customer's account. Decisions are also written to the workspace's audit log.

## What is built in this PR

| Piece | Where |
|---|---|
| The rules: kinds of step, the restricted list, the hard stops, the site table | `convex/lib/browserAgent/policy.ts` |
| A dry-run driver: three practice tasks on a made-up CRM. It performs nothing | `convex/lib/browserAgent/driver.ts` |
| Sessions, tasks, the step waiting for approval, the audit trail | `convex/browserAccess.ts`, tables `browserSessions`, `browserTasks`, `browserSteps` |
| The screen | `/app/connections/browser`, linked from Settings, Data. Story: `/dev/browser-access?state=approve` |

The three practice tasks show: reads logged and each change approved one at a time, ending in a publish
that needs the Owner's typed word; a step the driver calls a "read" that sends an email, which the rules
make restricted; and a task that tries to leave the site and is blocked.

Not built: a real driver, a hosted sign-in view, any vendor call, any model deciding steps, any site.

## What a real driver would need

- **A hosted browser with a live view** the customer can sign in through, and a stored profile per
  session. Options below.
- **Something to propose steps.** Anthropic's computer use tool fits: the model looks at a screenshot and
  proposes one action; our code decides whether it may happen. The tool is client-executed ("your
  application runs every call in an environment you control"), so it pairs with a hosted browser rather
  than replacing one. Anthropic's own guidance is to keep login details away from the model and have a
  person confirm consequential actions, which is this design. A screenshot costs roughly 1,000 to 1,800
  input tokens ([computer use docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool)).
- **Where it runs.** A step-by-step session needs a connection that stays open longer than a Convex
  action comfortably does. It likely means a small long-running worker, which is new infrastructure.

### Vendor options

| Vendor | Sign-in hand-off | Where the session lives | Security claims | Cost |
|---|---|---|---|---|
| Browserbase | A live view URL to put in an iframe; interactive by default ([live view](https://docs.browserbase.com/features/session-live-view)) | "Contexts" hold the browser profile, "uniquely encrypted at rest", kept until deleted, so expiry is ours to enforce ([contexts](https://docs.browserbase.com/features/contexts)) | SOC 2 mentioned on its pricing page; details not verified | $0.10 to $0.12 a browser hour. CAPTCHA solving is **on by default** and must be turned off |
| Browserless | A short-lived live URL with no token in it, with a "done" event ([hybrid automation](https://docs.browserless.io/baas/interactive-browser-sessions/hybrid-automation)) | Sessions with a time-to-live: deleted at expiry or on stop. Built-in expiry and revocation | Encryption not verified | About $0.18 to $0.24 an hour (30-second units) |
| Kernel | A live view URL, plus "Managed Auth": a hosted login UI or React component, with re-auth and health checks ([auth](https://www.kernel.sh/docs/auth/overview)) | Profiles; stored secrets "not returned in API responses or added to model context" | SOC 2 listed on all plans | Headful $0.48 an hour |
| Anchor | A live view URL; a manual mode where "the user signs in themselves" | Profiles store cookies, not credentials | SOC 2 Type 2 and ISO 27001 on the $2,000 tier | $0.09 an hour plus $0.01 a session |
| Steel | A debug URL in an iframe, but "anyone with the debug URL can view or interact" | Profiles not verified | HIPAA on its top tier | $0.08 to $0.10 an hour |
| Hyperbrowser | A live URL valid 12 hours; "anyone with the URL can view" | Profiles | Not stated | $0.10 an hour |
| Cloudflare Browser Run | A live view with human hand-off, up to 30 minutes; embedding not documented | Per-customer persistence not verified | Always identifies as a bot, even with a person driving | $0.09 an hour |

**Cost per session.** The browser is the small part: a 15-minute task is 2 to 12 cents of browser time
at these prices. The model is the larger part: at 1,000 to 1,800 input tokens a screenshot, a 30-step task
sends 30,000 to 60,000 tokens of screenshots, and each call also re-sends the history so far. That puts
a task somewhere between tens of cents and a dollar or more of model cost before markup, depending on the
model and how much history is kept. Neither number is measured; no session has been run.

**Which one.** The requirements are: a sign-in view only the customer can reach, an expiry that enforces
itself, deletion on demand, and no evasion features. Browserless fits expiry and deletion best (a session
with a time-to-live, a tokenless short-lived sign-in link). Kernel fits sign-in best (a hosted login UI
built for exactly this) at the highest price. Browserbase is the best documented but leaves expiry to us
and solves CAPTCHAs unless told not to. Steel and Hyperbrowser hand out view links that anyone holding
them can use, which would need gating on our side. I would shortlist Browserless and Kernel and try both
on the practice flow before choosing. This is a recommendation from documentation, not from use.

Cloudflare, chosen for the public page reader, is not the choice here: it always identifies as a bot,
which is right for reading public pages and likely to get a logged-in session challenged.

**A note on honesty.** For public pages Vistrial identifies itself as a bot, always. Inside a customer's
own account the customer is the user and the agent acts for them with their approval, so a normal browser
is appropriate. Even so: no CAPTCHA solving, no stealth mode, no residential proxies. If a site challenges
the session, the task stops and the customer is told.

## Risks that remain

- **A model can be talked into things by a page.** The rules run in code, outside the model, so a page
  cannot talk its way past the restricted list, the hard stops or the approval. It could still get a
  harmless-looking change proposed, which is why every change is shown before it happens.
- **Words are a blunt classifier.** A button called "Finish" that publishes would be treated as an
  ordinary change. Mitigations before any real use: per-site lists of known dangerous controls, and
  treating the last step of a wizard as restricted.
- **Approval fatigue.** One approval per change is safe and tedious. The temptation will be to add
  "approve all". That should be resisted for restricted steps always, and for changes until the audit
  trail shows the agent is reliable on that site.
- **The customer's account is at stake**, on any site whose terms are unclear.

## Open questions for the owner

1. Which site first? My recommendation is HighLevel page building, since that is where the teardown's
   brief would be used and where there is no API for it. Do you agree, and do you accept that HighLevel's
   terms are silent rather than permissive?
2. ClickFunnels forbids lending account access. Leave it out, or ask ClickFunnels for written permission?
3. Should a Manager be able to approve ordinary changes (as built), or should every change be the
   Owner's?
4. Is 7 days the right session length, and 24 hours the right time for a step to wait?
5. Is typing a word (PUBLISH, DELETE…) enough for a restricted step, or do you want a second person to
   approve payments and deletions?
6. Should a customer be told, before their first session, that using an agent on a site may be against
   that site's terms where the terms are unclear, and accept that in writing?
7. Vendor: are you willing to pay Kernel's higher price for a hosted login built for this, or should we
   start with Browserless and build the sign-in step ourselves?
8. A real driver needs a small always-on worker (new infrastructure, a new bill). Is that acceptable, or
   should account access wait until it can run on what exists?
9. For the sites marked "API only": which connector should come next after Meta? Google Ads is the
   obvious one, and since September 2026 its access is per Cloud project rather than developer token.
10. How long should the audit trail and its screenshots be kept? They can show customer data.
