# Research chat and workspace connections

Date: 2026-11-08. Decided with the founder in conversation before building.

## Research chat (intake)

New sessions start as a conversation, not a form (`/app/agents/[slug]/sessions/new`).

- **Guided checklist, Claude asks.** Code holds the checklist: goal, what you sell, area, competitors, and where to look. Business memory fills what it can, shown as "from memory" cards. Claude (the classify route, Sonnet) reads each answer and phrases the next question, one at a time, with tap answers. Code checks every update and decides what is still missing. If Claude is unavailable or the cap is reached, the guided questions take over.
- **At most five questions.** Anything still open becomes an "Assumed" line on the plan.
- **Competitors are required.** If the owner does not know any, Vistrial finds the main local ones with a web search and lists them on the plan to keep, remove or add to.
- **Where to look.** Until Vistrial knows where the audience is, it looks at every source it can reach; Claude says which sources it expects to matter for the industry and why. After a session, the thread shows where the material actually showed up and offers to remember it (`audienceChannels`); later sessions start there and the plan can still widen it.
- **Remember with a chip.** After a lasting answer (what you sell, area), Vistrial asks "Remember this for future sessions?". Yes saves it to Business memory as stated by the owner; No keeps it to the session.
- **Plan card, then Start.** Goal, what you sell, area, competitors (with origin), where to look, assumptions, and costs: this conversation against its 25¢ cap, and research up to $3 with 50¢ held back. Nothing researches or spends on research until Start. Start creates the session and opens its thread, which begins with a folded "How this session started".
- **Owner's words are data.** Each message reaches Claude inside the untrusted block (tested).
- Live check on dev with the real model: a London end-of-tenancy question; Claude asked one question, found six real local competitors when told "I don't know any", and planned. 14¢ in all.

Files: `convex/lib/intake.ts` (checklist, pure), `convex/intake.ts` (functions and the step action), `src/components/sessions/intake-chat-view.tsx`, `intake-chat.tsx`; story `/dev/intake-chat?state=new|remember|plan`.

The intake cap is kept as its own figure so the coming prepaid billing (refill or auto-refill with a card on file) can draw from it directly.

## Connections belong to the workspace

- **Workspace → Connections** (`/app/connections`) is the only place to connect, reconnect, choose the ad account, grant agents and disconnect, like a connector directory: your accounts (Meta ads), research sources with their status, and Coming soon (Google Business Profile, Jobber, Google Ads). Meta's management page is `/app/connections/meta`, and Facebook Login returns there.
- **An agent's folder** shows what that agent may use and its status, and for Meta ads the results it sees, with "Manage in Connections". It has no connect, reconnect, change-account or disconnect controls.
- The sidebar's Workspace section holds Connections.
