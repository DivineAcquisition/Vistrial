"use client";

import type { ChatDetail } from "@/components/chat/agent-chat";
import { ChatPanelView, type LibraryRow, type PanelChips } from "@/components/chat/side-panel";
import { TaskBoardView, type BoardActions } from "@/components/tasks/task-board";

import type { Id, TableNames } from "../../../../convex/_generated/dataModel";
import { Step2Frame } from "../step2/frame";
import { storyBoard, storyNotes } from "../tasks/fixtures";

const nothing = async () => undefined;
const ACTIONS: BoardActions = { decide: nothing, edit: nothing, propose: nothing, reopen: nothing, markDone: nothing, recordOutcome: nothing, addNote: nothing, setNoteDone: nothing, removeNote: nothing };
const NOW = Date.UTC(2026, 10, 12, 15);
const id = <T extends TableNames>(value: string) => value as Id<T>;

const row = (key: string, title: string, client: string | null, extra: Partial<LibraryRow> = {}): LibraryRow => ({ id: id<"intakes">(key), route: "growth-diagnostics", title, status: "chatting", createdAt: NOW, updatedAt: NOW, mine: true, client, page: "Tasks", context: null, result: null, ...extra });
const CHATS: LibraryRow[] = [
  row("i7", "Why did Aster's booked calls stop turning into clients?", "Aster Coaching"),
  row("i6", "What do fractional CFO firms charge agencies?", "Ledgerline CFO", { route: "market-intelligence", status: "started" }),
  row("i5", "Is our growth retainer priced right?", null, { route: "offer-intelligence", page: "Home", status: "ready" }),
];

const message = (key: string, role: "you" | "agent", text: string, extra: Partial<ChatDetail["messages"][number]> = {}): ChatDetail["messages"][number] => ({ id: id<"intakeMessages">(key), role, kind: role === "you" ? "text" : "question", text, chips: [], data: null, at: NOW, ...extra });

function chatFor(state: string): ChatDetail {
  const base: ChatDetail = {
    id: id<"intakes">("i7"),
    route: "growth-diagnostics",
    checklist: true,
    title: "Why did Aster's booked calls stop turning into clients?",
    status: "chatting",
    mine: true,
    context: { kind: "task", id: "t1", title: "Test a two-call close for Aster's leadership program" },
    page: "Tasks",
    result: null,
    messages: [
      message("m1", "you", "Why did Aster's booked calls stop turning into clients?"),
      message("m2", "agent", "I can see Aster's October results file: 31 booked calls and 4 new clients. Which part should I look at first?", { chips: ["The sales call itself", "Who is booking", "The follow-up after the call"] }),
    ],
  };
  if (state === "ready") {
    return { ...base, status: "ready", messages: [...base.messages.slice(0, 1), message("m2", "agent", "I can see Aster's October results file: 31 booked calls and 4 new clients. Which part should I look at first?"), message("m3", "you", "The sales call itself"), message("m4", "agent", "", { kind: "plan" })] };
  }
  if (state === "started") {
    return { ...base, status: "started", result: { state: "running", tab: "diagnostics", path: "/work/diagnostics/p9", title: null, assetStatus: null, runId: id<"agentRuns">("r9") }, messages: [...base.messages.slice(0, 1), message("m3", "you", "The sales call itself"), message("m5", "agent", "Started. I will post the diagnosis to the Briefing when it is done.", { kind: "note" })] };
  }
  if (state === "asking") {
    return { ...base, route: null, context: null, page: "Briefing", title: "I want more clients", messages: [message("m1", "you", "I want more clients"), message("m2", "agent", "I can do three things with that. Which do you want?", { kind: "route", chips: ["Research my market", "Work on my offer", "Find why I'm not growing"] })] };
  }
  return base;
}

/** The side chat panel beside the Tasks board, as it sits in the app. */
export function ChatPanelStory({ state, theme }: { state: string; theme: string }) {
  const viewer = state === "viewer";
  const isNew = state === "new" || state === "plain" || viewer;
  const chips: PanelChips = state === "plain" ? { page: null, client: null, record: null } : { page: "Tasks", client: "Aster Coaching", record: { label: "About this task:", title: "Test a two-call close for Aster's leadership program" } };
  return (
    <Step2Frame
      theme={theme}
      role={viewer ? "viewer" : "owner"}
      path="/app/tasks"
      right={
        <ChatPanelView
          chats={CHATS}
          chat={isNew ? null : chatFor(state)}
          chatId={isNew ? null : "i7"}
          canSend={!viewer}
          chips={chips}
          onRemovePage={() => undefined}
          onRemoveRecord={() => undefined}
          onSelect={() => undefined}
          onSend={async () => undefined}
          onClose={() => undefined}
          base="/app/agents/growth-architect"
        />
      }
    >
      <TaskBoardView board={storyBoard(viewer ? "viewer" : "busy")} notes={storyNotes("busy")} scopeLabel="your organization itself" actions={ACTIONS} />
    </Step2Frame>
  );
}
