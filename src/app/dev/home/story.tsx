"use client";

import { useState } from "react";

import { ChatComposer } from "@/components/chat/chat-composer";
import { HomeView, type Dashboard } from "@/components/home/home-view";
import type { ScopeChoice } from "@/components/shell/shell-context";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Step2Frame } from "../step2/frame";

const NOW = Date.UTC(2026, 10, 12, 15);
const HOUR = 3600_000;
const DAY = 24 * HOUR;
const client = (id: string) => id as Id<"clients">;

type Approval = NonNullable<Dashboard["needs"][number]["approval"]>;
const approval = (id: string, input: Partial<Approval> & Pick<Approval, "kind" | "kindLabel" | "summary">, canDecide: boolean): Approval => ({
  id: id as Id<"approvals">,
  credits: null,
  agentSlug: "growth-architect",
  clientId: null,
  status: "waiting",
  requestedAt: NOW,
  decidedAt: null,
  href: null,
  needsReason: false,
  ownerOnly: false,
  confirm: null,
  canDecide,
  ...input,
});

/** Northlight Growth's Home on an ordinary Thursday. */
function dashboard(state: string): Dashboard {
  const viewer = state === "viewer";
  const member = state === "member";
  const decides = !viewer && !member;
  if (state === "empty" || state === "first") {
    return {
      organization: "Northlight Growth",
      canApprove: true,
      canWork: true,
      needs: [],
      since: { at: null, changes: [], figures: state === "first" ? 7 : 0, finished: 0, alerts: 0, outcomes: 0 },
      moving: [],
      own: { needs: 0, moving: 0 },
      clients: state === "first" ? [{ id: "c1", name: "Aster Coaching", type: "business", needs: 0, moving: 0 }] : [],
    };
  }
  const needs: Dashboard["needs"] = [
    { key: "q1", kind: "question", title: "Which of Harbor's three locations should the research start with?", detail: "Dental membership plans near Harbor's locations", client: "Harbor Dental Group", clientId: client("c2"), agentSlug: "growth-architect", at: NOW - 2 * HOUR, href: "/app/runs/r3", approval: null, decisionId: null },
    { key: "a1", kind: "approval", title: "Test a two-call close for Aster's leadership program", detail: "A task an agent wants to run", client: "Aster Coaching", clientId: client("c1"), agentSlug: "growth-architect", at: NOW - 40 * 60_000, href: "/app/tasks", approval: approval("ap1", { kind: "task", kindLabel: "A task an agent wants to run", summary: "Two-call close" }, decides), decisionId: null },
    { key: "a2", kind: "approval", title: "Offer analysis for Northlight's retainer", detail: "Going public", client: null, clientId: null, agentSlug: "growth-architect", at: NOW - 2 * HOUR, href: "/app/assets/a9", approval: approval("ap2", { kind: "publish", kindLabel: "Going public", summary: "Offer analysis", needsReason: true }, decides), decisionId: null },
    { key: "a3", kind: "approval", title: "Research what fractional CFO firms charge agencies", detail: "A task an agent wants to run", client: "Ledgerline CFO", clientId: client("c3"), agentSlug: "growth-architect", at: NOW - 5 * HOUR, href: "/app/tasks", approval: approval("ap3", { kind: "task", kindLabel: "A task an agent wants to run", summary: "CFO pricing", credits: 900 }, decides), decisionId: null },
    { key: "c1", kind: "checkIn", title: "Send a pre-call video before Aster's sales calls.", detail: "Check-in due: say what happened", client: "Aster Coaching", clientId: client("c1"), agentSlug: "growth-architect", at: NOW - DAY, href: "/app/assets/a2", approval: null, decisionId: "d4" as Id<"decisions"> },
  ];
  const shown = member || viewer ? needs.filter((row) => row.clientId === null || row.clientId === client("c1")) : needs;
  return {
    organization: "Northlight Growth",
    canApprove: decides,
    canWork: !viewer,
    needs: shown,
    since: {
      at: NOW - 2 * DAY - 5 * HOUR,
      changes: [
        { label: "Booked calls", client: null, before: 18, after: 22, unit: "calls", percent: 22.2 },
        { label: "Aster bookings: results", client: "Aster Coaching", before: 24, after: 31, unit: "results", percent: 29.2 },
        { label: "Aster bookings: spend", client: "Aster Coaching", before: 2400, after: 2350, unit: "USD", percent: -2.1 },
        ...(member || viewer ? [] : [{ label: "Harbor bookings: results", client: "Harbor Dental Group", before: 64, after: 47, unit: "results", percent: -26.6 }]),
        { label: "Meta ads: spend", client: null, before: 3100, after: 3480, unit: "USD", percent: 12.3 },
      ],
      figures: 11,
      finished: 2,
      alerts: 1,
      outcomes: 1,
    },
    moving: [
      ...(member || viewer ? [] : [{ key: "r1", kind: "run" as const, title: "Dental membership plans near Harbor's three locations", agentSlug: "growth-architect", skillSlug: "market-intelligence", client: "Harbor Dental Group", clientId: client("c2"), since: NOW - 3 * HOUR, until: null, href: "/app/runs/r3" }]),
      { key: "d1", kind: "trying" as const, title: "Lead Dana's page with the outcome, not the method.", agentSlug: null, skillSlug: null, client: "Dana Reyes", clientId: client("c4"), since: NOW - 8 * DAY, until: NOW + 22 * DAY, href: "/app/assets/a7" },
    ],
    own: { needs: 1, moving: 0 },
    clients: [
      { id: "c1", name: "Aster Coaching", type: "business", needs: 2, moving: 0 },
      ...(member || viewer ? [] : [{ id: "c2", name: "Harbor Dental Group", type: "business" as const, needs: 1, moving: 1 }, { id: "c3", name: "Ledgerline CFO", type: "business" as const, needs: 1, moving: 0 }]),
      { id: "c4", name: "Dana Reyes", type: "person", needs: 0, moving: 1 },
    ],
  };
}

/** Home inside the app frame, fed by an agency's sample data. ?state=busy|member|viewer|first|empty. */
export function HomeStory({ state, theme }: { state: string; theme: string }) {
  const [picked, setPicked] = useState<ScopeChoice>("all");
  const role = state === "viewer" || state === "rep" ? "viewer" : state === "member" ? "member" : "owner";
  return (
    <Step2Frame theme={theme} role={role} path="/app" state={state === "empty" || state === "first" ? "empty" : "busy"}>
      <HomeView
        chat={<ChatComposer size="hero" placeholder={role === "viewer" ? "Owners, Admins and Members start sessions." : "Ask in your own words: who are we losing to, which offer to lead with, why enquiries dropped…"} disabled={role === "viewer"} onSubmit={async () => undefined} />}
        data={dashboard(role === "viewer" ? "viewer" : state)}
        agentName={() => "Strategist"}
        decide={async () => undefined}
        recordOutcome={async () => undefined}
        onPickClient={setPicked}
        picked={picked}
      />
    </Step2Frame>
  );
}
