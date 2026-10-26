# Vistrial rebuild v2: three agents, built one at a time

This replaces the six-agent plan in the first brief. The workspace, roles, isolation, approval gate, Convex backend, and look and feel from the first brief still stand. Where this document and the first brief disagree, this one wins.

## 1. What changed and why

The six agents (Compass, Scribe, Assay, Relay, Sentry, Helm) were role-shaped and generic. The new plan is organized by the customer lifecycle and by what each agent produces.

**Rule for every agent:** define it by the concrete thing it hands back and what it needs as input. An agent with no tangible output does not ship.

## 2. Areas, agents, and skills

Three areas. One agent per area to start. Each agent has skills. A skill becomes its own agent only when it proves it needs to be separate.

| Area | Agent | Skills, in build order | What each hands back |
|---|---|---|---|
| **Sales** | Sales Agent | 1. Ad research 2. Ad copy 3. Creative 4. Content ideation | A research report. Copy sets. Creative briefs. A content calendar. |
| **Retention** | Retention Agent | Onboarding and activation. Health and risk. Save and win-back plays. Expansion and referrals. Retention design for how the product works. | Plans, signals, and plays. Details set after the Sales Agent ships. |
| **Operations** | Operations Agent | Approvals queue and briefings. Reporting. Tasks and follow-through. Integrations and data cleanup. | Daily briefing, reports, task lists. Details set later. |

**Build order:** the shared runtime first, then the Sales Agent skill by skill, then Retention, then Operations. One agent at a time.

## 3. Decisions made

| Area | Decision |
|---|---|
| Structure | Three areas, one agent each, with skills inside. |
| First agent | Sales Agent. First skill is the ad research report. |
| What it hands back | Ready-to-use assets for a person to approve and publish. Nothing is posted on its own. |
| Research sources | The customer's own ad results, a swipe file the person builds, web search and public pages, and public ad library pages. |
| Library collection | Built by us, in public pages only, with no login and no evasion. Behind a swappable interface. Off until an Owner accepts the risk in writing. |
| Business profile | Offer, price, and audience. Brand voice and examples. Past ads and results. Competitors and market. |
| Agent model | Claude, through a model-router layer so models can be swapped or mixed later. |
| Builder model | Grok builds the code. It is not the model inside the product. |
| Stack | Convex backend, Next.js on Vercel, Clerk for sign-in. |

## 4. How "the best ads" is defined

Public data does not show an ad's results. We use honest proxies and label them as proxies:

- how long an ad has been running,
- how many variations an advertiser has made of it,
- repeated iteration on the same idea,
- engagement or performance bands only where a source publishes them.

Nothing in a report may say an ad "earned" or "converted" a number unless the customer's own account data says so. Patterns are shown only above a minimum sample size, and below it the report says "Not enough data."

**Originality rule:** the agent creates original work inspired by what works. It never produces a near-copy of another advertiser's ad. Reports keep only short excerpts of ad text, with the source named.

## 5. What this changes in Steps 1 to 3

**Step 1 (workspace, roles, shell), patch notes for Grok:**
- The `agents` table seeds three agents (Sales, Retention, Operations), each with a `skills` list, grouped by area instead of by stage. The rail shows areas, then agents.
- The first sign-in setup path becomes: create the business profile, connect sources, turn on the Sales Agent.
- The Decisions queue becomes the place assets wait for approval. The empty line stays "Nothing is waiting."
- Roles, the access layer, the guard test, the staff path, and everything else stay as built.

**Step 2 (data spine): paused.** Leads, calls, and conversations are not needed by the Sales Agent. They come back when the Retention or Operations agent needs customer data.

**Step 3 (approval gate): kept, and widened.** A new action tier, `publishes`, covers posting an ad or content to an outside platform. It is locked to approval exactly like messages that reach people. Message-specific checks (consent, quiet hours) apply to messages, and publishing gets its own checks (connection health, approver role, pause, caps). This is built when we add publishing, after the first four skills.

## 6. New build order

1. **Step 1:** workspace, roles, and shell, with the patch notes above.
2. **Step 4:** the shared agent runtime and the business profile.
3. **Step 5:** Sales Agent skill 1, the ad research report, with the swipe file and public library collectors.
4. **Step 6:** Sales Agent skill 2, ad copy.
5. **Step 7:** skill 3, creative briefs, then skill 4, content ideation.
6. **Step 8:** connect the customer's own ad accounts through the official marketing APIs, and publishing through the gate.
7. **Step 9 onward:** Retention Agent, then Operations Agent, one skill at a time.

Each step is reviewed on a real or seeded account before the next starts.

## 7. Open decisions

1. Roles in the new product: keep Owner, Manager, and Rep, or simplify to Owner and Member? Reps matter less now that the first agents are about acquisition.
2. Which ad platforms first for the customer's own results: Meta, TikTok, Google, or LinkedIn?
3. Where should generated images and video come from, and should that be added at skill 3 or later?
4. The Retention Agent needs product and customer data. Which sources will customers connect first (billing, product usage, CRM, support)?
