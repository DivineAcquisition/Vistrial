# Onboarding and the first package

Date: 2026-11-13. Status: design, for the owner to read before the build PRs merge.

The owner's words: a "NEW KEY mechanic & function and must be executed with precision and detail";
"nothing standard, must be unique to the business". Three parts:

1. **Brand moves to Settings and is captured automatically** from the business's website, for the
   organization and for each Client.
2. **Onboarding is rebuilt** as four steps: Website, Connect, Confirm, Go.
3. **Strategist's first package** runs automatically and free, once per organization: market research, two
   offer ideas (one to win customers, one to keep them), and a teardown of the business's own pages. It
   arrives ready to use, sits first on Home and the Briefing, and the Owner gets an email when the research
   and offer ideas are done.

This document says what each screen shows, what is captured and where it is stored, what the first package
costs us and how that is enforced, what the email says, and what changes for organizations that already
exist. Open questions for the owner are at the end.

---

## 0. Decisions made here (the owner can overrule any of them)

| # | Decision | Why |
|---|---|---|
| D1 | **The organization is created when the website is submitted** (step 1), named from the site, renamed at Confirm. | Connecting Meta, a calendar or uploading a results file all need an organization to hang on. Today it is created at the end of the wizard. |
| D2 | **The site is read with the page reader**, not with the model's own web fetch as `onboarding.readSiteNow` does today. | The page reader already obeys robots.txt, the per-site rate limit, the private-address guard and says it is VistrialBot. The model's fetch tool does none of that in our code, and it cannot give us colours, fonts, the logo file or the list of pages. |
| D3 | **Code finds what code can find; the model only reads words, and every word it returns must quote the site.** | "Do not invent anything not on the site." A colour, a font, a logo, a social link, a booking widget and a price pattern are found in code from the HTML and stylesheets. The model only does what needs reading (tone, offers, who they serve, proof, guarantees), and each item it returns carries an exact quote that code checks against the page text. An item whose quote is not on the page is dropped, not shown. |
| D4 | **Paywall after the first package, not before.** Website → Connect → Confirm → Go → the package runs and is shown in full → the paywall sits under it. | It is the order onboarding has today (free session, then paywall), and the package is the reason to pay. Before paying, only the package, its reports and Settings › Billing open; everything else waits for the plan. |
| D5 | **"Ready to use" means approved only when the run's own checks pass.** A part whose checks still fail after its one revision is shown as "Needs your review", not approved. | The owner chose ready to use, not drafts. Approving work that failed its evidence checks would put an unsupported claim in front of the customer marked as approved. This is the one place the package can arrive as a draft, and it says why. |
| D6 | **The two offer ideas come from Offer Intelligence in a new "first package" mode**, not a new skill. | Offer Intelligence already reads the approved research, the profile, the facts and the business's own results, cites sources and has code checks. The mode adds: exactly two changes, one `acquisition` and one `retention`, built on the captured offers and prices, and it never stops to ask a question (no one is waiting at a chat). |
| D7 | **The page teardown is the Landing Page Teardown skill in a new "own site" mode**: up to 5 of the business's own pages, no competitor search. | The per-page reading against the owner's framework is unchanged. The cross-page write changes: with no competitor pages there are no "patterns others share"; it writes improvements per page and across the funnel. |
| D8 | **The free limit is $15.00 of our cost per organization** (owner's decision; first proposed at $8.00), split per part (section 4.2), enforced in code on top of each skill's own run cap. | Each skill's existing run cap (research $3, offers $1.50, teardown $3) already bounds a run; the package limit makes the total a single, stated number, and a retry can only spend what is left. |
| D9 | **The first read of each site is free: the organization's own and each Client's (owner's decision). Any later re-read uses credits**, at the usual markup, with the most it can cost shown before it starts. | A capture is cheap (section 1.6); free re-reads on demand would be an open tap on our cost. |

---

## 1. Part 1: Brand in Settings, captured from the website

### 1.1 What moves

- The **Brands** tab under Strategist (`src/components/work/brands-tab.tsx`, the `brands` entry built in
  `agentTabs` in `src/lib/shell/journey.ts`) is removed from the sidebar.
- A new Settings section **Brand** (`?section=brand`) holds it:
  - **Your brand**: the organization's own kit, with everything captured from its site.
  - **Client brands**: one per Client, the same layout, filtered by who may see which client (the rules in
    `convex/lib/clients.ts` are unchanged).
- Who sees it: every role. Owners, Admins and Members edit (the existing `requireWork` rule on brand kits);
  Viewers read. Today Members and Viewers see only "You" and "Memory" in Settings; Brand joins those.
- The old address `/app/agents/growth-architect/work/brands` goes to `/app/settings?section=brand`
  through `src/lib/shell/old-links.ts`, so bookmarks and links in old emails still land.

### 1.2 What does not move: the data

Brand kits keep their tables (`brandKits`, `brandKitVersions`), their ids, their versions and their logo
files. **No kit is copied, rewritten or dropped.** Creative Production keeps choosing a kit exactly as it
does now, so every creative made before this change still shows the kit version it used. The client links
made by `clientsMigration` stay as they are.

The only additions to existing tables:

- `brandKitVersions.origin` (optional): `"person"` (missing means this) or `"site"` for a version written
  by a capture, and `captureId` pointing at the capture it came from.
- `offerCardVersions.origin` gains `"site"`: an offer as the site states it.
- `businessFacts.sourceType` gains `"site"`, with `sourceReference` set to the `pageReads` id the fact was
  read from.

All three are additive: older rows read as before.

### 1.3 When a site is read

| Where the link is submitted | What is read for | Who pays |
|---|---|---|
| Onboarding step 1 | The organization | Free (inside the package limit) |
| Settings › Brand › Your brand › "Read my website again" | The organization | Free the first time for an organization that never had a capture (existing organizations), credits after |
| Adding a Client with a website, or adding a website to a Client that had none | That Client | Free the first time (owner's decision); credits after, shown on the form |
| Settings › Brand › a client › "Read the website again" | That Client | Credits, shown before |

A read that cannot be paid for (out of credits) saves the website, says "Not read: out of credits" and
offers the read again from the Client's brand page.

### 1.4 How a site is read

One **site capture** per read, run in the background, with its progress visible (section 2.1). Steps:

1. **Home page.** The home page is read with the page reader (`convex/lib/pageReader/read.ts`): robots.txt,
   the per-site gap, the public-address checks on every hop, VistrialBot as the user agent, no login, no
   challenge solving. A blocked or failed home page ends the capture with the reader's own reason in words
   (`REASON_WORDS`), and the person types what they want on the Confirm step instead.
2. **Choose the other pages, in code.** From the home page's same-site links (header, nav, main, footer),
   up to 7 more pages are chosen by what the link says and where it points, highest first:
   pricing; services or "work with me"; a programme, course, coaching or membership page; booking ("book",
   "schedule", "call", "apply"); free resource or opt-in ("free", "guide", "download", "training",
   "webinar", "masterclass"); results, testimonials or case studies; about; contact. A link to a known
   booking host (Calendly, Cal.com, HighLevel / LeadConnector, Acuity, TidyCal, HubSpot meetings) counts
   as the booking page even though it is off-site: it is recorded, not read. The 8-page job limit and the
   80-pages-a-day organization limit apply as they do to every job.
3. **Read those pages** with the same reader, one at a time, with the site's rate limit between them.
4. **Brand, in code** (new `convex/lib/siteCapture/brand.ts`, from additions to the page extractor):
   - **Logo**: in order, the site's structured data (`Organization.logo` in JSON-LD), an image in the
     header or nav whose alt, class, id or file name says "logo", the `apple-touch-icon`, then the
     `og:image`. The chosen file is downloaded through the same address checks (image types only, 5 MB at
     most) and kept as a **candidate**. It enters the brand kit only when a person ticks "This is our logo
     and we may use it" on Confirm or in Settings, which is the rule brand kits already enforce
     (`logosOwned`).
   - **Colours**: the `theme-color` meta tag; brand-named CSS custom properties (`--primary`, `--brand`,
     `--accent` and the like); and the colours used most on buttons and links, counted from the page's
     inline styles and up to two of the site's own stylesheets (300 KB each, same checks). Greys, near
     white and near black are left out. At most 4 are kept, each labelled with where it was found ("Your
     buttons", "Set as the site's theme colour").
   - **Fonts**: from font links (Google Fonts, Adobe Fonts) and the first `font-family` on headings and on
     body text in those stylesheets. Generic families (`sans-serif`) are not a font.
   - **Social links**: links to the known social hosts, from the header, footer and JSON-LD `sameAs`.
   - **Location**: a postal address in JSON-LD, or a line the page states. Never guessed from a phone code.
5. **Words, by the model** (one call on the platform's "classify" route, the page text wrapped as untrusted
   as every skill does). It returns, each item with the page id and an **exact quote**:
   - **Tone of voice**: a short description and 2 or 3 quotes that show it. Labelled "Vistrial's reading
     of your site", because it is a reading, not a statement.
   - **Offers and prices as stated**: name, price exactly as written, what is included, the guarantee and
     terms if stated. A price must also match a currency pattern found in code on that page.
   - **Who they serve**, **proof** (testimonials, numbers, logos of clients, named results) and
     **guarantees**.
   - The **purpose of each page read** (home, sales, landing, booking, opt-in, pricing, services,
     results, about, contact, other) is decided in code, not by the model: a booking widget makes a
     booking page, a short email form an opt-in page, prices with a button a sales page, otherwise how
     the home page linked to it (`lib/siteCapture/pages.ts`).
   - Code then checks every quote against the page's text (`snapshotText`, compared with spacing and case
     ignored). **An item whose quote is not on its page is dropped**, and the count dropped is kept on the
     capture for us to watch (it is never shown to the customer as a finding).
6. **Save.** Section 1.5 says where each item goes.

Nothing the site says is followed as an instruction. Page text is stored as data and only ever reaches a
model wrapped as untrusted content.

### 1.5 What is captured and where it is stored

A new table **`siteCaptures`**: one row per read, with `workspaceId`, `clientId` (missing for the
organization), `url`, `status` (`queued`, `reading`, `understanding`, `done`, `partial`, `failed`),
`steps` (the progress rows the screen shows), `jobId` (the page read job), `pages` (each read page: its
`pageReads` id, address, purpose and title), `fields` (below), `logoCandidate` (a storage id and where it
came from), `dropped` (items removed for not quoting the site), `costCents`, `free`, `startedBy`,
`createdAt`, `finishedAt`.

Every captured field has the same shape, so every screen can label it the same way:

```
{ value, origin: "site" | "person" | "connected" | "missing",
  sources: [{ readId, url, how: "structured data" | "meta tag" | "stylesheet" | "page text" | "link" , quote? }],
  basis: "stated" | "reading",          // "reading" only for tone of voice and who they serve when inferred
  editedBy?, editedAt? }
```

On screen: "From your site · Pricing page" (with the quote on hover or tap), "Vistrial's reading of your
site", "You set this", "From your Meta account", or **"Not on your site"** for a field nothing supported.

Where each part lands once the person confirms it (onboarding step 3, or "Save" in Settings › Brand):

| Captured | Stored in | Notes |
|---|---|---|
| Business name | `workspaces.name` (organization) / `clients.name` (client) | Only when the person has not typed one |
| Logo | `brandKitVersions.logos` (after "we may use it" is ticked) | Kept as a candidate until then |
| Colours, fonts, tone of voice | A new `brandKitVersions` row with `origin: "site"` | Nothing a person typed is overwritten: a field they set is kept and the site's value is shown beside it |
| Offers and prices | `offerCards` + `offerCardVersions` with `origin: "site"`, one per offer | Offers tab and Offer Intelligence already read these |
| Who they serve, location, guarantees | `businessFacts` (`sourceType: "site"`), and `profileVersions` (audience, geography) for the organization; `clients.business` for a client | Facts start `unverified`; confirming marks them `verified` by that person |
| Proof | `businessFacts` (`proof`) | Each with its quote |
| Pages and funnels found | `siteCaptures.pages`; the organization's latest capture is what the first package reads | Shown in Settings › Brand › "Pages found" |
| Social links | `businessFacts` (`social:<host>`) | |

A correction is a new value with `origin: "person"`: a new kit version, a new offer card version or a new
fact superseding the old one. Nothing is overwritten in place, which is how kits, offers and facts already
work.

### 1.6 What a capture costs us

8 page reads at most (0.1 to 0.5 cents each, `PAGE_COST_CENTS`), a logo and two stylesheets (fractions of
a cent) and one model call over at most 8 pages' text, capped at 40 cents. So **50 cents at most**, usually
far less. When it is charged (D9) the customer pays that times the markup, rounded up, and sees the most it
can cost before it starts. A capture's page job does not charge separately: the capture carries the cost.

---

## 2. Part 2: Onboarding, screen by screen

Only the person creating an organization goes through this. People who join by invitation never do.

Each screen works at 390 and 1280 wide. A step bar at the top: **Website · Connect · Confirm · Go**. Back
is always there; nothing is lost going back.

### 2.1 Step 1: Website

- One field: "Your website", with an example (`yourbusiness.com`). A bare domain is read as `https://`.
- Under it, one line: "We read your site the way a visitor would, and fill in what it says. You check
  everything before anything runs."
- **Submit** creates the organization (D1), named from the domain until the site says otherwise, and
  starts the capture.
- **Live progress**, one row per step, each ticking as the capture reaches it:
  1. Opening your home page
  2. Finding your pages (then a list as they are found: "Pricing", "Book a call", "Free guide", ...)
  3. Reading each page (n of m)
  4. Finding your logo, colours and fonts
  5. Reading your offers, prices and tone of voice
- As each part lands, a preview fills in on the right (below on a phone): the logo candidate, the colour
  swatches, the fonts set in their own face where the font is a Google font, the offers with their prices.
- **Continue** is enabled once the home page is read; the rest keeps filling in while they connect
  accounts. If the site cannot be read, the reader's reason is shown in words and **Continue** is still
  there: they fill in what they want on Confirm.
- A person without a website: "I don't have a website yet" skips to Connect, and Confirm asks for the name,
  what they sell and who for.

### 2.2 Step 2: Connect

Cards, every one optional, with **Skip for now** at the bottom and on each card. Each says, in one line,
what Strategist gets from it.

| Card | State today | What it gives the first package |
|---|---|---|
| Meta ad account (read-only) | Built (`convex/metaAds.ts`) | Spend, results and the ads that ran: research cites them as "Your data" |
| Google Calendar / Calendly | Built (`convex/bookings.ts`) | Booked calls per week, no-shows: the retention idea can use them |
| Results file | Built (`convex/resultUploads.ts`) | Past results from a spreadsheet |
| HighLevel | **Slot** (built in another session, branch `claude/crm-highlevel`) | Pipeline and contacts, once it lands |
| HubSpot | Coming soon | |
| Salesforce | Coming soon | |

- The cards come from one list (`src/lib/onboarding/connect.ts`). The HighLevel card is "Coming soon"
  until a provider with the key `highlevel` exists in `convex/lib/integrations/providers.ts` and is set up
  on the deployment; then it shows **Connect** with no change to onboarding. That is the clean slot: the
  HighLevel work only has to register its provider.
- Connecting sends the person to the provider and back. The return addresses stay as they are; the app
  frame shows the Connect step for an organization still in it, so they land back here, with the card
  showing "Connected".
- A Meta account with several ad accounts asks which one, as the Meta connection already does.

### 2.3 Step 3: Confirm

Everything captured, grouped, each field labelled with where it came from (section 1.5) and editable in
place. Nothing runs until **Looks right** is pressed.

1. **Your business**: name, what you sell, who you serve, where, your role (the one question the site
   cannot answer), and the main goal (the six goals onboarding has today, kept: the research answers it).
2. **Your brand**: logo candidate with the "This is our logo and we may use it" tick, colours (add,
   remove, edit hex), heading and body fonts, tone of voice with its quotes.
3. **Your offers**: each offer with its price as stated and the quote; add one, remove one, correct one.
   "No prices on your site" when none were found.
4. **Pages we found**: each page with its purpose and a tick for whether it goes into the teardown (the
   home page plus the four the code ranks most important are ticked; at most 5).
5. **Proof and guarantees**: each with its quote; remove any.
6. **Connected**: what was connected on step 2, and what was skipped.
7. **Missing**: one list of what the site did not say ("No guarantee stated", "No location stated"), so
   a gap is visible rather than filled.

The service-team access choice that onboarding asks today stays here, unchanged.

**Looks right** writes everything (section 1.5) as confirmed by this person, and moves to Go.

### 2.4 Step 4: Go

- One screen: "Strategist is starting your first package", with the three parts and what each will give:
  1. **Market research** on your market, grounded in what you just confirmed.
  2. **Two offer ideas**, one to win customers and one to keep them, built from your offers and prices.
  3. **A teardown of your own pages** (the ones ticked), with what to change.
- The package starts the moment this screen shows. It costs the customer nothing and says so: "On us. It
  does not use your credits."
- **Go to Home** takes them to Home, where the package is first (section 3.5). Progress keeps going
  whether or not they stay; the Owner is emailed (section 3.6).

### 2.5 Paying (D4)

- Until the plan is paid, the app shows Home with the package and its reports, the paywall card under the
  package, and Settings › Billing. Anything else (another agent, a new run, Tasks) shows the paywall.
- The paywall is today's (`free-session.tsx` › `Paywall`), moved under the package.
- Paying, a credit grant from Vistrial, or billing being off on this deployment unlocks the rest, as
  `unlockOnboarding` does now.

### 2.6 What happens to the current onboarding

| Today | After |
|---|---|
| Wizard: about, business, offer, goal, review | Replaced by Website, Connect, Confirm. Name, role, what you sell, area, audience and goal are asked on Confirm, prefilled from the site |
| `readSite` / `readSiteNow` (model web fetch) | Replaced by the site capture (D2) |
| `finish` (creates the organization) | Split: the organization is made on step 1, the profile and facts are written on Confirm |
| Free research session (`startFree`, one Market Intelligence run) | Replaced by the first package, which includes the research |
| Paywall after the free session | Paywall after the first package |
| `FREE_ATTEMPTS` (one retry) | One retry per part, inside the package limit |

The onboarding table keeps its rows. New stages are added (`website`, `connect`, `confirm`, `package`),
old ones stay valid for rows already in them (section 5).

---

## 3. Part 3: The first package

### 3.1 What runs, in what order

A new table **`firstPackages`**: one per organization (enforced by an index on `workspaceId`), with the
three parts, their runs, their assets, their state, the cost so far, the email state, and `limitCents`.

```
Go ──┬── Research (Market Intelligence, thorough) ── approved ── Offer ideas (Offer Intelligence, first-package mode) ── email
     └── Page teardown (Landing Page Teardown, own-site mode, ≤5 pages)
```

- **Research** and **Teardown** start together. **Offer ideas** start when the research report is saved
  and approved, because they build on it.
- The **email** goes when the offer ideas are saved (or fail). If the teardown is still running, the email
  says it will be in the app shortly.
- All three run as Strategist (`growth-architect`) with `free: true`: no credit check, nothing charged to
  the organization, on the platform's model route. **They are not counted against the organization's own
  day caps either**, so a customer's first day is not used up by our free work (today's free session is
  counted; this changes it).

### 3.2 The cost limit (D8)

**$15.00 of our cost per organization** (the owner's decision; first proposed at $8.00), all parts together:

| Part | Its share | The skill's own run cap today |
|---|---|---|
| Site capture | $0.50 | (new) |
| Market research | $7.00 | $3.00 (`market-intelligence`) |
| Offer ideas | $3.00 | $1.50 (`offer-intelligence`) |
| Page teardown, or the landing page when there is no website | $5.00 | $3.00 (`landing-page-teardown`) |
| **Total** | **$15.00** | |

How it moves: `firstPackage.advance` looks at the package's runs every 20 seconds while any part works,
approves, starts the offer ideas, retries, emails and posts, and stops looking when all three are settled
(or after four hours on one run). Enforced in code: each package run carries a cap of what is left of its share and of the limit (it may be above the skill's usual run cap, never past the platform's $10 run ceiling) (a new optional
`capCentsOverride` on free runs, honoured where caps are checked), so a part can never take what another
needs beyond its share, and a retry spends only what is left. A run that reaches its cap ends the way any
capped run ends today. Typical spend is well under the limit; the limit is the most it can ever be.

Abuse guards: one package per organization, and at most **3 per account** (an account can own several
organizations); a platform-wide daily budget for all free packages, **$400 a day**, after which new
packages wait until the next day with a plain message on Home. Both numbers are constants in one file and
are questions for the owner (section 7).

### 3.3 (a) Market research

- Market Intelligence, unchanged, on a research project built from what was confirmed: the business name,
  what it sells, who it serves, where, the main goal, the competitors the site names, and the business's
  own pages as supplied links. The confirmed facts and profile are what the skill already reads, so the
  capture grounds it without changes to the skill.
- If Meta was connected, the skill's existing first-party step cites the business's own results as "Your
  data".
- The report is saved **approved** when its checks pass (D5), with the audit row
  `asset.approved_first_package` and the approver recorded as "Strategist, first package (Owner's choice)".

### 3.4 (b) Two offer ideas

Offer Intelligence, first-package mode (D6):

- Reads the approved research report from 3.3, the confirmed profile and facts, **the captured offers and
  prices** (`offerCardVersions` with `origin: "site"` or corrected by the person), proof, guarantees, and
  the business's own results if connected.
- Writes **exactly two** changes: one with `focus: "acquisition"` (winning new customers) and one with
  `focus: "retention"` (keeping and growing the ones they have). Each has, as every change already does:
  the change itself, why it fits this business (naming the profile fields, facts and past outcomes it
  uses), the evidence with its basis label (observed, inferred, hypothesis, firstParty, stated), the
  channel, and how to tell if it worked.
- New code check for this mode (`skills/offerIntelligence/firstPackage.ts`): exactly two changes; one
  title starts "Win customers:" and the other "Keep customers:" (the focus is carried in the title, so the
  saved analysis and its existing screens need no new field); each names one of the business's own offers
  as the business names it (so it is built from their offer, not a template); a price quoted in `fit.text`
  matches a stated one exactly. Failing checks get the one revision the skill already allows.
- It never stops to ask: where a fact is missing it records an assumption and says so in `limits`.
- Saved approved when checks pass (D5).

### 3.5 (c) Page teardown

Landing Page Teardown, own-site mode (D7):

- The pages ticked on Confirm: the home page plus up to four more, chosen by the code's ranking (sales,
  landing, booking, opt-in pages before about or contact). At most 5.
- Each page is read against `docs/rebuild/landing-page-framework.md` exactly as today (sections, jobs,
  verdicts, quotes in the page's own words).
- The cross-page write in this mode: no competitor patterns; instead, per page, up to three changes that
  page most needs against the framework, and across the pages, where the funnel loses the visitor between
  them (for example, the opt-in page's button goes to a page with no booking step). The standing limit
  stays: Vistrial reads the page, not its results.
- Reads the chosen pages again (fractions of a cent each, under the same rules). Reusing the capture's
  reads is a later saving, not built.
- Saved approved when checks pass (D5).

### 3.6 Where it is shown

- **Home**: the first thing on Home until the Owner dismisses it, a **First package** panel with the three
  parts. While running, each part shows its live phase in words (the run viewer's existing phase words:
  "Searching for competitors", "Reading page 2 against the framework"...) and a progress bar by steps.
  When done, each part shows its headline (the research answer, the two offer ideas by name, the teardown's
  single biggest change) and **Open**.
- **Briefing**: one post at the top, "Your first package is ready", linking the three reports, plus the
  usual "finished" post per report.
- Members and Viewers who join later see the package on Home too (it is the organization's).

### 3.7 The email

Sent once, to the Owner and the Admins (the owner's decision), through the existing Resend path (`convex/emailReminders.ts`), with an audit
row naming the recipient's user id and never the address.

- **Subject:** "Your first Vistrial package: {business name}".
- **Body:**
  1. The answer: the research report's summary, in at most 60 words.
  2. Top findings: the three highest-ranked findings, one line each, each with its evidence label
     (Observed, Inferred, Your data).
  3. The two offer ideas: the title of each, labelled "To win customers" and "To keep customers", and one
     line on why it fits this business.
  4. **Open the full report** (the research report in the app), and one line on the teardown (ready, or
     coming shortly).
- Words are built in code (`lib/reminderEmail.ts`, `firstPackageEmail`, pure and tested) from the
  structured output the runs saved the reports from. The usual "report ready" email is not sent for package
  reports, so the Owner gets one email, not three.

This is the first email that carries report content. Today's reminder emails carry only a title, on
purpose. It goes to the Owner only, and it is the Owner's own report; the "report ready" notice setting
still switches it off (open question 3).

---

## 4. What changes for organizations that already exist

- **Brands** moves to Settings for everyone; kits, versions, logos and creatives are untouched (1.2).
- **No one is sent back through onboarding.** Organizations marked done stay done.
- Settings › Brand › Your brand offers **"Read my website"** once, free, for an organization that never
  had a capture (D9). Captured values are shown beside what they already have, never over it; they choose
  per field.
- People part-way through the old wizard (stages about to review) when this ships are moved to the new
  step 1 with their website prefilled; what they typed is kept as "You set this" values on Confirm.
- People already in the free session or at the paywall carry on with the old screens until they pay. The
  old screens are removed in a later PR once no row is left in those stages (a query reports it).
- **The first package is not offered to existing organizations** unless the owner says otherwise (open
  question 1).

---

## 5. Data model changes (all additive)

| Table | Change |
|---|---|
| `siteCaptures` | New (1.5) |
| `firstPackages` | New (3.1) |
| `onboarding` | New stages `website`, `connect`, `confirm`, `package`; new optional `captureId`, `packageId`. Old stages stay valid |
| `brandKitVersions` | Optional `origin`, `captureId` |
| `offerCardVersions` | `origin` gains `"site"`; optional `captureId` |
| `businessFacts` | `sourceType` gains `"site"` |
| `agentRuns` | Optional `capCentsOverride` (free runs only), optional `packageId` |
| `teardownRequests` | Optional `mode: "ownSite"` |
| `pageReadJobs` | Optional `captureId` (the capture carries the cost, the job charges nothing) |

---

## 6. How it is built: stacked draft PRs, in merge order

1. **This document.**
2. **Brand to Settings + site capture.** The Brand section, the old link, the capture (page choice, brand
   extraction, the quoted words pass, provenance), Client capture on add, tests on fixture sites, dev
   stories (`src/app/dev/settings-brand`, `src/app/dev/site-capture`), screenshots at 390 and 1280.
3. **Onboarding: Website, Connect, Confirm, Go.** New stages, the Connect list with the HighLevel slot,
   Confirm writing everything as confirmed, the paywall moved after the package, the old-stage handling,
   tests, dev story (`src/app/dev/onboarding`), screenshots.
4. **The first package and the email.** `firstPackages`, the cost limit, the two skill modes, auto-approval
   when checks pass, Home and Briefing, the email, tests, dev stories (`src/app/dev/first-package`),
   screenshots.

5. **No website: the first landing page.** A new skill, Landing Page Build: everything on record about the
   business (confirmed profile and facts, social profiles given on Confirm, stated offers, the approved
   research's claims, a connected Meta account's totals, the offer idea to win customers) becomes one page in
   the framework's eleven sections, every claim citing the item it rests on. The framework's rules are code
   checks (required sections, pains matched one for one, FAQ topics, verb-first buttons, no figure nothing on
   record states, no "proven" claims, a short client part); Results is dropped when nothing on record is
   proof. It is the package's page part when no website was read, runs after the offer ideas, and shows on
   Strategist's Pages tab. New asset kind `landingPage`; `firstPackages.pagePart`.

Sample data in stories and tests: a marketing agency and a business coach (made-up names and sites).

**What the tests cannot show:** no test calls a real model or a real website. Model answers are scripted,
pages are fixtures, Resend is not called. Whether the live model keeps to quoting, how often quotes are
dropped, and real cost per package are unproven until it runs on a deployment. The Cloudflare browser has
never been used with a live key (see `page-reader.md`), so screenshots of a customer's pages are unproven
too.

---

## 7. The owner's decisions (2026-11-13)

The questions this section first asked, with the owner's answers. Where an answer changes something above,
the change is built in the PR named, and the sections above are to be read with it.

1. **Existing organizations:** no first package. New sign-ups only. (As built.)
2. **Limits:** the per-organization limit is **$15.00** of our cost (not $8.00). Shares: research $7.00,
   offer ideas $3.00, the page part (teardown or landing page) $5.00. A package run may use its share even
   where the skill's usual run cap is lower, never past the platform ceiling ($10 a run). Still 3
   packages per account and $400 a day across the platform (so about 26 new packages a day before the
   queue). (#300)
3. **Failed checks:** a part that fails its checks arrives as "Needs your review"; everything that passes
   arrives approved. (As built.)
4. **Email:** the Owner **and the Admins** get the package email. The "Report ready" notice switch still
   turns it off for a person. (#300)
5. **Client site capture:** the **first** read of each client's website is free; later reads use credits,
   with the most they can cost shown first. (#296)
6. **HighLevel:** the slot keys on the provider `highlevel`; the coordinator confirms the key with the
   HighLevel session. HighLevel now reads and writes (writes approved by a person first); the slot is
   unchanged.
7. **No website:** step 1 keeps a clear "I don't have a website yet" choice. Then:
   - Vistrial gathers context from everywhere else it can: connected accounts (Meta, calendar, results
     files, the CRM once connected), the social profiles the person gives on Confirm, the answers on
     Confirm, and the research.
   - In place of the teardown, the first package builds them **a landing page**, on Strategist's **Pages**
     tab: a full layout following `landing-page-framework.md`, all eleven sections in order, copy unique to
     this business, built from the research and the acquisition offer idea. Every claim points at what it
     was built from (a research finding, a stated offer, a fact the person confirmed, a connected
     account's figure).
   - The framework's rules are enforced in code, not asked of the model: **Results is left out when there
     is no real proof**; the page is refused (saved as "Needs your review", never approved) when a
     required section is empty or the pain and solution counts differ; the FAQ must cover price,
     guarantee, who it is for, how long, and what if it doesn't work; the call to action starts with a
     verb.
   - It is written after the offer ideas, because it sells the acquisition idea. If no offer idea was
     written, it sells the offer the person confirmed.
   - Built in a new skill, Landing Page Build (#301, stacked on #300).

Two scope notes from the owner, applied to everything here: the model's name is never shown, and credits
spent are not shown on work screens (a separate Usage page does that). The only credit figure shown is a
budget a person confirms before work starts (a client's paid site read); the first package is free, so it
shows none.
