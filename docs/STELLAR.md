# Stellar (Prompt S0)

This is **not a build prompt**. It is a constraint. Read it before any Stellar
work, and re-read it when a decision is unclear. Later Stellar prompts lose
when they conflict with this file.

Stellar and core Vistrial share a foundation and nothing else. Shared: auth,
workspaces, members and roles, the activity log, the integration framework,
the design system. Everything past that is separate, built separately, and
must not be designed as though it will later merge with core Vistrial's
scoring, transcripts, or drafting. It will not.

---

## Part 1: What Stellar is

Stellar runs the delivery of Divine Acquisition's own service. Where core
Vistrial is a product a client's team uses, Stellar is the system DA's own
people use to install, staff, and prove the Stellar Sales Operations offer
inside a local business.

**In one sentence: Stellar tracks the setter DA placed, the work DA is doing,
and shows the client what they paid for and what they're getting.**

Three things it produces:

- **Setter output.** The DA-placed setter logs calls, bookings, and their
  end-of-day submission, in one place built for that job.
- **Client visibility.** The business that hired DA can see their agreement,
  their payment, their build progress, and their results, without asking
  anyone.
- **DA oversight.** Divine Acquisition can see every placement at once: which
  setters are performing, which clients are at risk, which builds are behind.

Stellar is for **local businesses exclusively**, per the placement model. It
does not serve coaches, agencies, consultants, or SaaS. That is core
Vistrial's territory, at `app.vistrial.io`, and the two are not the same
product wearing different skins.

---

## Part 2: Who opens this, and why

**The setter.** A person DA placed inside a local business. Opens it during
and after their shift. Two questions: **what do I log right now, and what's
my EOD tonight?** They are not a Vistrial operator working a scored queue.
They are logging calls and bookings as they happen and submitting a daily
report.

**The client.** The local business owner who signed with DA. Opens the portal
occasionally, mainly around billing and around wanting to know if this is
working. One question: **am I getting what I paid for?**

**DA staff.** The people running placements. Open it constantly. Question:
**which of my placements need me today?**

That is the entire user base. No scoring, no transcripts, no drafting, no
calibration exists here, because none of that is what this system is for.

---

## Part 3: The three surfaces

### Surface 1 — The Setter's Log

What they see: today's date, a place to log a call or booking as it happens,
and their EOD submission form at the end of the day.

Per entry: who they called or booked, the outcome, and a note. Fast, few
fields, built for entry between calls, not for review.

EOD: a short structured submission at end of shift, whatever DA has defined
as the required fields for accountability: calls made, bookings set, notes on
the day, blockers.

What is not here: a scored queue, a case file, anything from core Vistrial's
object model. If the placement's tools include a CRM or dialer, the setter
works there and logs the outcome here. Stellar does not become a second CRM.

### Surface 2 — The Client Portal

What they see, per workspace:

- **Agreement.** Status and a link to the signed document.
- **Payment.** Current plan, next payment, and BNPL status if financed.
- **Build progress.** Where their install stands, in four or five plain
  milestones a business owner understands. Never their raw project-management
  board.
- **Results.** The Forsight metrics relevant to them: activity their setter
  logged, and outcomes where available.

What they do: check it, forward it if they want, and see it update as work
happens. No configuration, no login complexity, no navigating anything
resembling an operator tool.

### Surface 3 — The DA Console

What DA sees, across every placement: which setters are active, who submitted
an EOD today and who did not, which clients' builds are behind schedule,
which agreements or payments need attention, and portfolio-level Forsight
metrics with DA itself as workspace zero.

This is the "which of my placements need me today" screen. It exists to make
problems visible before a client has to raise them.

---

## Part 4: Forsight

Forsight is the metrics layer inside Stellar, serving both the client
portal's results section and the DA console's portfolio view.

**Workspace model:** DA is workspace zero, fed by the DA Pipeline base and
Meta ad spend. Each client is its own workspace, fed by what the setter logs
in Stellar plus whatever the placement's own tools contribute over time.

**What it shows:** activity logged, outcomes where the placement has them,
and spend where relevant. It does not score readiness, does not extract from
transcripts, and does not draft anything. Forsight reports what happened; it
does not decide what should happen next. That distinction is what keeps it
out of core Vistrial's territory.

---

## Part 5: What comes from where

The client portal cannot invent its own data. Every section sources from a
real system:

| Portal section | Source |
|---|---|
| Agreement | The document platform DA uses for contracts, by status and signed date |
| Payment | The financing platform for BNPL installs, the processor for recurring |
| Build progress | DA's project-management tool, mapped to plain milestones |
| Results | Forsight, from setter logs and the DA Pipeline base |

**The build-progress mapping is the one place this can go wrong.** A client
must never see raw task names from an internal project tool. Map to four or
five milestones in plain language before anything reaches the portal. If DA's
project tool has no clean mapping today, that mapping is a prerequisite for
this surface, not a detail to work out during it.

---

## Part 6: What Stellar shares with core Vistrial, and what it must never inherit

**Shared, deliberately, because rebuilding it twice is waste:**

- Auth and session handling
- The workspace and organization model
- Members, roles, and permissions
- The activity log pattern from Prompt 21
- The integration connection pattern from Prompt 19
- Design tokens and components

**Never inherited, because it does not apply here:**

- The readiness scoring engine
- Transcript ingestion and extraction
- Follow-up drafting
- The agent framework from Prompt 24
- Calibration
- Anything from core Vistrial's lead or case-file object model

If a future Stellar need starts to resemble one of these, that is a sign the
placement's needs have grown into core Vistrial's territory, not a reason to
import core Vistrial's machinery into Stellar. Route that business onto
`app.vistrial.io` instead of building a second version inside Stellar.

---

## Part 7: The rules that keep this simple

- **One workspace per client**, holding their agreement, payment, build, and
  results together. Nothing scattered across systems that only DA can
  reconcile.
- **The setter's screen is for logging, not analysis.** If it starts to need
  sorting, filtering, or scoring, that is core Vistrial's queue, not this.
- **The client portal never shows DA's internal tools.** Not the project
  board, not the pipeline base, not raw setter logs. Everything is mapped to
  something a business owner reads without explanation.
- **DA's console is the only place cross-placement comparison happens.** No
  client sees another client's data, ever, under any workspace configuration.
- **Ready by default.** A new placement should show a working portal from day
  one: agreement and payment populate automatically from the platforms that
  produced them, and build progress starts at its first milestone without
  manual setup.

---

## Part 8: How you know it worked

Sit a setter down at the start of a real shift, no explanation, and ask them
to log their first call and their EOD. Time it, note every hesitation.

Show a real client owner their portal with no walkthrough and ask what they
think their build status is and when their next payment is due. If they
cannot answer both correctly in under a minute, the portal failed.

Open the DA console and ask a DA operator to name, within ten seconds, which
placement needs attention today. If they cannot, the console failed.

---

## What this is not permission to do

- Not permission to build a second core Vistrial inside Stellar. If a Stellar
  need looks like scoring, transcripts, or drafting, that need belongs at
  `app.vistrial.io`.
- Not permission to show a client anything from an internal tool unmapped.
- Not permission to let one client's workspace see another's data.
- Not a redesign of the shared foundation. Auth, workspaces, and design
  system stay as built.

---

## In this repository today

This section is a map, not a build list. Do not treat existing screens as the
S0 surfaces they happen to sit near.

| S0 surface | Closest thing in this repo | Gap |
|---|---|---|
| Setter's Log | `/app/log` | Core outcome logging against leads and the scored queue. Not a Stellar setter log. No EOD. |
| Client Portal | `/portal` | Owner reporting from core Vistrial (close rate, coverage, objections, optional spend sources). No agreement, payment, or mapped build milestones. Results are not Forsight-from-setter-logs. |
| DA Console | `/app/forsight/workspaces` and `/app/ops` | Workspaces is portfolio metrics. Ops is core operator tooling. Neither answers "who missed EOD / whose build is behind / whose payment needs me." |
| Forsight | `pulse.vistrial.io` → `/app/forsight` | Metrics layer exists (Airtable, Meta, GHL, `vistrial_core`). It does not ingest Stellar setter logs. DA is an ordinary workspace, not a special-cased workspace zero in product copy, which matches the current Forsight tenancy model. |

Live Forsight host in this repo is `pulse.vistrial.io`. A later prompt can
rename it. Do not stand up `forsight.vistrial.io` from this file.

Shared foundation already in use: auth, workspaces, members, activity log,
integration connections, design tokens.
