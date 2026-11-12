# The side chat panel and Library > Chats (step 3)

Step 3 of 3 of the multi-organization rebuild. Steps 1 and 2 are `organizations-and-clients.md` and
`tasks-briefing-home.md`. This says what the owner decided, what was built, and what is not.

## 1. The owner's decisions

Quoted words are the owner's.

- 2026-11-11: "we meet have a tab on the right where users can start a chat on the side", and, as always,
  "i dont want to directly copy ... i want to add our own spin".
- 2026-11-11, who you talk to: one assistant on every page that sees the page you are on, answers, and
  hands work to the right agent, showing which agent and skill it used. You never pick an agent.
- 2026-11-11, chats: "not every agent will have chat. only research contains its own chat. but other chat
  sessions can pull from it through memory. So under Libary There should be Chat tab with a dropdown of all
  the chats created aka every chat session started."
- 2026-11-12, the Chat tab under Growth Architect: "Keep remember thats wwhere users go to start a new
  session and a dropdown ux to view all there previos chats".
- 2026-11-12, how the panel opens: a button; it stays open as you move between pages; a full-height sheet
  on a phone; it takes the place of the Live column while open.
- 2026-11-12, what it is told: the page, the client chosen in the picker, and the record that is open, as
  chips you can remove before sending.

## 2. What was built

**One conversation store.** A chat is an `intakes` row wherever it starts: Home, the panel or the Chat tab.
It appears once in Library > Chats. Nothing is copied.

**What a chat is told** (`convex/lib/chatContext.ts`, `convex/agentChat.ts`):

- `page`: a key from a fixed list, worked out from the address (`src/lib/shell/chat-page.ts`). Never page
  text. An unknown key is ignored.
- `context`: the one record that is open: a report or draft, an offer, a task, a research session. The
  server checks it is this organization's and a client the person may see, or the chat does not start.
- the client: the picker's choice, fixed when the chat starts.

**The panel** (`src/components/chat/side-panel.tsx`): an "Ask Vistrial" button at the top right of every
page. On a wide screen it is a column on the right in place of the Live column; below that it is a
full-height sheet. Open or closed, and which chat is shown, are kept per browser, so it stays as it was
across pages. A dropdown at its top lists the newest chats and "New chat". A chat shows which agent and
skill it was handed to, where it started, what was attached, the messages, and tappable choices.

**It never starts paid work itself.** When the plan is ready the panel links to the full conversation,
where the plan and its cost in credits are shown before Start, exactly as before. Viewers read; Owners,
Admins and Members send.

**Library > Chats**: a Chats row in the sidebar's Library with a dropdown of the newest chats, and a page
(`/app/chats`) listing every chat the person may see, with who it is for, which skill it went to, where it
stands, where it started, and filters for mine and set aside. The client picker narrows it.

**The Chat tab stays**, as the place to start a new session. Its list of conversations is now a
"Previous chats" dropdown above the box, so the conversation has the full width.

**Tasks**: each card has "Ask Vistrial about this", which opens the panel on a new chat about that task.

## 3. What is not built

- **The assistant does not answer directly.** It routes to the three skills that have a chat (Market
  Intelligence, Offer Intelligence, Growth Diagnostics) or asks which. A direct answer needs its own
  model step, cost rule and tests; it is the next piece.
- **"Other chat sessions can pull from it through memory"** is only what already existed: every chat
  reads the organization's confirmed profile and facts. A chat does not read another chat.
- A task or a session attached to a chat is recorded and shown, and named to the research intake; it does
  not yet change what the agent asks. An attached offer or report does, as before.
- Reviewing the plan and pressing Start happen in the full conversation, not inside the panel.
- No model picker and no microphone: the owner did not ask for either.
- Briefing posts, reports and offers have no "Ask Vistrial about this" link yet; a report or session that
  is open is picked up from the address.
