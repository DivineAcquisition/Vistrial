# Tasks, Briefing and Home (step 2)

Step 2 of 3 of the multi-organization rebuild. Step 1 is `organizations-and-clients.md`; its section 8 drew
the shapes used here. This document says what was built, what the owner decided, and what is still the
owner's to decide. Step 3 (the side chat panel and Library > Chats) is not built here.

## 1. The owner's decisions

Quoted words are the owner's, from the discovery interview.

- **Sidebar.** Organization selector, the client picker under it, then Attract | Convert | Keep ("move the
  3 tabs under org selection"). Main items: Home, Tasks, Briefing. "Move ops intelligence under convert
  tab." "Move memory to settings." Chat is not a tab under every agent: "only research contains its own
  chat"; Library > Chats is step 3.
- **Home.** "What needs you, then what moved", with "the chat box ... there with the other stuff below": a
  chat box, Needs you, Since you were last here, In motion, Clients.
- **Tasks.** A status board: Proposed, Approved, Running, Needs you, Done, Result. Every card shows expected
  return, credit cost and evidence, ranked by expected return inside each column. Agents do the work, people
  approve. A person's own task is a note to self. Vistrial proposes a weekly plan, plus a proposal when
  something real changes.
- **Briefing** (the owner's name for it): approvals, a weekly growth report, finished work, alerts, drafts
  to review, and industry trends that "the user will need to enable or disable within settings".
- **Approval is needed for**: anything that goes public; spending above a limit; changes inside connected
  accounts; housekeeping; and "tasks the agents are trying to execute but need approval for".
- **Roles.** Owner and Admin approve. A Member works with agents and tasks but cannot approve. A Viewer
  reads. People see only the clients they are assigned to.

### 1.1 Answers of 2026-11-12

To three questions put in the part 6 pull request (#263). The owner's words are quoted.

1. **May an expected return be an Inference range from market sources?** "market source is fine". Built in
   part 7: section 4.1.
2. **Should switching off the weekly plan also stop proposals made when something changes?** "no dont stop
   on change proposal just the weekly plan". That is how it was built; nothing changed.
3. **Trend posts: which sources, and how often?** "both and monthly will be the cadence": trade press and
   public social posts, once a month. Section 5.

Later the same day, to the questions in parts 7 and 8 (#265, #266): "two social posts alone is fine, keep
the rest (article would be fine has well)", so a trend post may rest on social posts alone, and reading
full articles is welcome but not required; it is not built. On how an Inference ranks: "go base off your
judgement thats optimal for the app", so it stays ranked by its low end. The caps (an Inference no larger
than the monthly goal; 360 credits a month for trends): "yes". And on Home: "we need to center the chat box
in home screen it cant be touching the top of the app".

## 2. Defaults chosen where the owner has not answered

Each can be changed; they are listed again in the pull requests.

1. **The spending limit is one amount per organization**, in credits, set by an Owner or Admin in Settings.
   Not set means no limit of this kind: the agent caps alone apply, exactly as before this step.
2. **What the limit is compared with** is the most a piece of work can use: the skill's run cap, priced in
   credits. A run has no tighter estimate before it starts.
3. **An Owner or Admin starting work above the limit is their own decision**; nothing waits. Anyone else is
   refused with a sentence that says what to do, until an Owner or Admin approves a task for that work.
   **One approval covers one run**, and lapses after seven days unused.
4. **Expected return is a range in one measure, with its basis** ("Inference" or "Your data"), or "Not
   enough data" with no numbers. Never one confident figure. Wording that claims a result is refused.
5. **Ranking** inside a column is by the middle of the range per month; tasks with not enough data come
   after every task that has a range; then the cheaper; then the newer. Ranges in different measures are
   compared by their numbers, so the proposer states every return in the organization's one goal measure.
6. **The weekly plan is on unless switched off; industry trend posts are off until switched on.** Both use
   credits, show what they used, and have a cap.
7. **Notes to self** can be kept by anyone, a Viewer included, and stay usable in an archived organization,
   because only their author ever reads them.

## 3. Data

All additive. Tables: `agentTasks`, `personalNotes`, `approvals`, `briefingItems`, `memberVisits`. Fields on
`workspaceSettings`: `spendApprovalCredits?`, `weeklyPlan?`, `trendPosts?`. Every table with a client is on
the client guard's list (`lib/clientGuard.ts`), so a Member or Viewer never reads another client's rows, and
every function goes through the builders.

### 3.1 One approvals model

`approvals` holds one row per decision: what (`subjectTable`, `subjectId`), which kind, who asked, who
decided and when. `lib/approvals.ts` is the rule: `needsApproval`, `mayDecide`, the limit.

Asset review and connected-account steps keep their own rows and rules. They were reconciled, not replaced:

| Thing decided | Its own rule (unchanged) | How it joins the queue |
|---|---|---|
| A draft report or asset | Every claim must still have a source (`approveAsset`) | Queued when its run finishes, or when a person adds a version. Kind `publish`. |
| A step in a connected account | A restricted step is the Owner's, with a typed word (`decideStep`) | Queued when the step is proposed. Kind `accountChange`; `ownerOnly` for a restricted one. |
| An agent task | Starts the agent's conversation, or records the decision to try a change (`approveTask`) | Queued when proposed. Kind `task`. |

`approvals.decide` is the one door for the Briefing, the Tasks board and Home. The asset page and the
connected-account page still call their own functions; all of them end in `recordDecision`, so a decision
is written once whichever door was used, and an asset approved with nothing waiting (a draft from before
this step) still leaves its record. Each decision is also in the audit log (`approval.approved.publish`).

Kinds `spend` and `housekeeping` exist in the model and the rule. Nothing asks for them yet: spending is
approved as part of a task, and no agent archives chats or deletes drafts today.

### 3.2 Tasks

A task is either **work for an agent** (`work`: the words the agent is asked, and the skill) or **a change
the organization makes itself** (`try`: an item of a report). `proposedBy` is an agent or a person.

- Approving work starts the agent's conversation through the same code as the chat box
  (`agentChat.startConversation`). The agent asks what it needs and shows its plan and budget first.
- Approving a change records the decision through the same code as "We'll try this"
  (`decisions.planOpportunity`, `planAssetItem`). **The Result column is only ever that decision's recorded
  outcome**, with the measured change between the figures at approval and at the check-in.
- Stored statuses: `proposed`, `approved`, `running`, `needsYou`, `done`, `declined`. The allowed moves are
  one table (`TRANSITIONS`). The column shown is read from what the task is linked to (`taskState`), so the
  board cannot drift from the run, draft or decision it describes.

## 4. The proposer

`convex/skills/taskProposer` is a skill on the existing runtime, under its own caps (`SKILL_CAPS`:
30 cents of cost a run, 120 a day, which is 90 and 360 credits at the default markup). `convex/planner.ts`
decides when it runs.

**It never invents a task.** Its candidates are read in code: items of the organization's own *approved*
reports that nobody has decided on yet (a research report's opportunities, an offer analysis's changes, a
diagnosis's roadmap steps, a page teardown's suggestions). The model is asked once to choose among them and
say why. With no candidates, no model is called.

**Code settles what the model said** (`settlePicks`):

- a pick that is not a candidate is dropped; a candidate is proposed once, ever (a skipped task is not
  proposed again);
- a reason that claims a result is replaced by the report's own words;
- numbers must be a real range and rest on something, by the rules of 4.1. Anything else says "Not enough
  data".

Each proposal is a change the organization makes itself, so approving it records the decision in the
outcome loop and its Result is measured at the check-in (30 days by default).

### 4.1 What an expected return may rest on

Every range is stated in the organization's one goal measure, a month, so ranges compare fairly.

| Basis | When | What it must cite | Its ceiling |
|---|---|---|---|
| **Your data** | The same organization or client has a results figure of its own | That figure | No more than the figure reads today |
| **Inference** | Only where there is no such figure | At least one market source that the report itself cited **for this very item** | No more a month than the owner's goal, when their words name a number; and wide: the high end at least 1.5 times the low end |
| **Not enough data** | Everything else | Nothing | No numbers |

- **Your data wins.** Where a figure of its own exists, a market source cannot stand in for it, and the two
  are never mixed: a "Your data" card lists figures, an "Inference" card lists sources.
- **What the model is given for an inference**: for each candidate, the sources its report cited for it
  (title, publisher, the date it was published or read, the saved excerpt of 300 characters or less, and
  what the source cannot show), inside the untrusted block, plus the report's own uncertainty for the item
  and the ceiling.
- **What code checks** (`settlePicks`): each cited id is a saved source of this organization, belongs to
  the report's own project (so to the same organization or client), and is on the candidate's own list; the
  range has two ends, low below high; it is wide enough; it is within the goal. With no number in the goal
  there is nothing to size an inference against, so the card says "Not enough data". The claim-wording
  check still runs on the reason, and a source title that reads as a promise is not repeated on the card.
- **The card** says "An estimate, not a measurement" under an Inference range and links each source.
- **Only research reports' opportunities carry cited sources today.** Items of offer analyses, diagnoses
  and page teardowns have none per item, so they get "Your data" or "Not enough data".
- **Ranking** (`returnScore`, `rankTasks`): a "Your data" range counts for its middle; an Inference range
  counts for its low end only, so an estimate must clear a measured range with its cautious end to rank
  above it; at the same size "Your data" comes first; "Not enough data" is last.
- **The Result column is unchanged**: only what was measured at a check-in.

**When it runs.**

- *Weekly*: one run per organization per week (UTC, from Monday), where the weekly plan is on. Up to five
  proposals, and the growth report in the Briefing. The report's facts (what finished, what was measured,
  the figures, check-ins due, what was proposed, what the run used) are written in code from the
  organization's records; only its opening sentences are the model's, and only if they claim nothing.
- *On change*: when a report is approved, a check-in is recorded, or results drop. Up to two proposals, at
  most three such runs a day per organization, and no report.

A run is started in the name of the organization's Owner, because a run needs an active member; the
organization's pause, the agent being off, an empty balance and the day's cap each simply mean no plan.

**Not built**: the proposer does not propose *agent work* (new research, a diagnosis); it only surfaces
changes already written in approved reports. People propose agent work from the board.

## 5. Industry trend posts

Built in part 8, behind the switch (off by default). The owner's answer of 2026-11-12: "both and monthly
will be the cadence", so trade press and public social posts both count, once a month.

**The run.** `convex/skills/industryTrends` is a skill on the existing runtime with its own cap
(`SKILL_CAPS["industry-trends"]`: 120 cents of cost a run and a day, which is 360 credits a month at the
default markup). Settings shows that number beside the switch before it is switched on. `planner.monthly`
(checked every six hours) starts one run per organization per month where the switch is on; a month already
read is not read again, whatever came of it.

1. *Read* (code): whose industries to search for. The organization itself, from its confirmed profile, and
   up to three business clients that have an industry written down. With nothing to search for, no model
   is called.
2. *Search* (one model step): Claude's web search tool, four searches at most.
3. *Write* (one model step): at most one post per industry, from the dated sources only.
4. *Save* (code): `settlePosts` decides what stands, and each post that does is written to the Briefing
   for the organization or for the client it is about.

**What a post may rest on**, decided in code:

- only links the search itself returned, each with a date of its own, no older than 45 days;
- at least two, from different sites (subdomains and a platform's short links count as one site);
- trade press and public social posts both count, and two social posts on different platforms are enough
  (the owner, 2026-11-12: "two social posts alone is fine"). Such a post says it rests on social posts
  alone, with no publication behind them;
- words that report what was said. A promise is refused by the same check that guards tasks, and links
  written into the words are removed: the only links on a post are its sources.

Every post ends, in code, with how many sources reported it and between which dates, that it is not a
forecast, and that no task was created from it. The first post of the month carries what the reading used
in credits. When nothing stands, one post says why and what was used, so credits are never spent silently.

**Untrusted content.** The organization's own description and everything the search returned reach the
model only inside `wrapUntrusted` blocks. The skill declares three tools: its own read, web search, and
its own save. It creates no task, asks for no approval and changes nothing but its posts.

**A change from the first design: Vistrial opens no page for a trend post.** The design proposed reading
up to six pages with the page reader. The page reader is built around a teardown job a person plans and
pays for page by page, and a short post that links its sources does not need full pages. So the run keeps
only what the search returned (link, title, date, cited line). There is nothing for robots rules, rate
limits or sign-in to apply to, because Vistrial fetches nothing itself.

**Social posts: what can and cannot be read today.** Vistrial does not search inside any social platform
for trends. A social post counts only when the web search itself returned it, with a date.

| Platform | For trend posts today |
|---|---|
| YouTube, TikTok, Instagram, LinkedIn, X, Facebook, Reddit, Threads | Recognised as social posts when web search returns a public link to one. Only the link, title and date are used; the post or video itself is not opened, watched or transcribed. |
| TikTok, Instagram | No search exists in Vistrial for either (research only accepts pasted links), so they appear only if web search happens to index a post. Expect few or none. |
| YouTube | Research can search YouTube when a key is set, but the trend run does not use that search. |
| Meta Ad Library | Not used for trends. |
| Private, logged-in or paywalled content | Never. |

**Not yet verified with a real web read.** Every test uses scripted search results. The first real run must
check: (1) that search results carry a date (`page_age`) often enough for two dated sources to be common;
(2) what a run costs against the 120 cent cap; (3) that the dates search reports are the publication dates;
(4) the quality of what is written. If dates are rare, most months will post "No industry trend to report".

## 6. What is not built in this step

Listed in each pull request. In short: no agent asks for `spend` or `housekeeping` approvals on its own
yet; a client's own connected accounts (step 1, 3.4) are still not connectable from the screen; step 3's
chat panel.
