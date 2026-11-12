"use client";

import { useState } from "react";

import { ChatLibraryView } from "@/components/chat/chat-library";
import type { LibraryRow } from "@/components/chat/side-panel";

import type { Id, TableNames } from "../../../../convex/_generated/dataModel";
import { Step2Frame } from "../step2/frame";

const NOW = Date.UTC(2026, 10, 12, 15);
const DAY = 24 * 60 * 60 * 1000;
const id = <T extends TableNames>(value: string) => value as Id<T>;
const row = (key: string, title: string, extra: Partial<LibraryRow>): LibraryRow => ({ id: id<"intakes">(key), route: "growth-diagnostics", title, status: "chatting", createdAt: NOW, updatedAt: NOW, mine: true, client: null, page: null, context: null, result: null, ...extra });
const running = { state: "running" as const, tab: "research" as const, path: "/work/research/p6", title: null, assetStatus: null, runId: id<"agentRuns">("r6") };

const ROWS: LibraryRow[] = [
  row("i7", "Why did Aster's booked calls stop turning into clients?", { client: "Aster Coaching", page: "Tasks" }),
  row("i6", "What do fractional CFO firms charge agencies?", { client: "Ledgerline CFO", route: "market-intelligence", status: "started", result: running, page: "Home", mine: false, updatedAt: NOW - DAY }),
  row("i5", "Is our growth retainer priced right?", { route: "offer-intelligence", status: "ready", page: "Briefing", updatedAt: NOW - 2 * DAY }),
  row("i4", "I want more clients", { route: null, page: "Home", mine: false, updatedAt: NOW - 3 * DAY }),
  row("i3", "Which membership plans do dental groups near Harbor offer?", { client: "Harbor Dental Group", route: "market-intelligence", status: "started", result: { ...running, state: "done", title: "Market report: dental membership plans", assetStatus: "approved" }, updatedAt: NOW - 6 * DAY }),
  row("i2", "Find where Dana's enquiries stall", { client: "Dana Reyes", status: "abandoned", updatedAt: NOW - 9 * DAY }),
];

/** Library > Chats with an agency's chats in it. */
export function ChatsStory({ state, theme }: { state: string; theme: string }) {
  const [mine, setMine] = useState(state === "mine");
  const [closed, setClosed] = useState(state === "closed");
  const viewer = state === "viewer";
  const rows = state === "empty" ? [] : ROWS.filter((item) => (!mine || item.mine) && (closed || item.status !== "abandoned"));
  return (
    <Step2Frame theme={theme} role={viewer ? "viewer" : "owner"} path="/app/chats" state={state === "empty" ? "empty" : "busy"}>
      <ChatLibraryView rows={rows} more={false} mine={mine} closed={closed} onMine={setMine} onClosed={setClosed} canStart={!viewer} onNew={() => undefined} />
    </Step2Frame>
  );
}
