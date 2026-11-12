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

## 4. What is not built in this step

Listed in each pull request. In short: no agent asks for `spend` or `housekeeping` approvals on its own
yet; a client's own connected accounts (step 1, 3.4) are still not connectable from the screen; step 3's
chat panel.
