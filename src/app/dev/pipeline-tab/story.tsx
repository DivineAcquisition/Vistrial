"use client";

import { PipelineView, type BoardData, type TeamData } from "@/components/work/pipeline-tab";
import { BALL_LABEL, DAY, FIT_LABEL, HEALTH_LABEL, TEMPERATURE_BASIS, TEMPERATURE_LABEL, buildBoard } from "../../../../convex/lib/dealmaker/board";
import { LOW_STAKES, MESSAGE_KINDS, MESSAGE_KIND_LABEL } from "../../../../convex/lib/dealmaker/autonomy";
import { SALES_ROLES, SALES_ROLE_LABEL } from "../../../../convex/lib/dealmaker/roles";
import type { CrmDeal } from "../../../../convex/lib/crm/types";

import { StoryFrame } from "../work-tabs/story-frame";

const noop = async () => undefined;
const NOW = Date.UTC(2026, 10, 14, 15);

/** A coaching agency's pipeline. Sample data. */
function deal(ref: string, stageRef: string, input: Partial<CrmDeal> = {}): CrmDeal {
  return { ref, pipelineRef: "p1", stageRef, status: "open", value: 4500, source: "Referral", contactRef: `c-${ref}`, ownerRef: "crm-milo", createdAt: NOW - 40 * DAY, updatedAt: NOW, stageChangedAt: NOW - 3 * DAY, statusChangedAt: null, ...input };
}
const sms = (ref: string, contactRef: string, direction: "inbound" | "outbound", daysAgo: number) => ({ ref, kind: "sms" as const, direction, at: NOW - daysAgo * DAY, contactRef, dealRef: null, status: null, seconds: null, fromStageRef: null, toStageRef: null });

function board(view: string): BoardData {
  const built = buildBoard({
    now: NOW,
    quietDays: 14,
    currency: "USD",
    pipeline: { ref: "p1", name: "Sales calls", stages: [{ ref: "s1", name: "New lead", order: 0 }, { ref: "s2", name: "Call booked", order: 1 }, { ref: "s3", name: "Proposal sent", order: 2 }] },
    deals: [
      deal("1042", "s1", { source: "Facebook ads", stageChangedAt: NOW - DAY }),
      deal("1038", "s2", { value: 9000 }),
      deal("1031", "s3", { stageChangedAt: NOW - 9 * DAY }),
      deal("1027", "s3", { stageChangedAt: NOW - 24 * DAY, ownerRef: "crm-ada" }),
      deal("1019", "s3", { status: "won", ownerRef: "crm-ada" }),
      deal("1015", "s2", { status: "lost" }),
      deal("1011", "s3", { status: "won" }),
      deal("1008", "s2", { status: "lost", source: "Facebook ads" }),
      deal("1004", "s3", { status: "won", source: "Facebook ads" }),
    ],
    activities: [sms("a", "c-1038", "outbound", 2), sms("b", "c-1038", "inbound", 1), sms("c", "c-1031", "outbound", 9), sms("d", "c-1027", "outbound", 24)],
    appointments: [{ ref: "ap", startsAt: NOW - 2 * DAY, status: "showed", contactRef: "c-1038", dealRef: null }],
    waitingContacts: new Set(["c-1042"]),
    pausedContacts: new Set(),
    facts: [
      { dealRef: "1038", field: "need", value: "Twice the booked consultations by spring", kind: "buyer", author: null, at: NOW - 2 * DAY },
      { dealRef: "1038", field: "budget", value: "Around $5k a month", kind: "rep", author: "Milo", at: NOW - 2 * DAY },
    ],
    commitments: [{ id: "k1", dealRef: "1031", text: "Send the Harbor case study", owner: "m1", due: NOW, done: false }],
  });
  return {
    connected: true,
    crm: { label: "HighLevel", accountName: "Northlight Growth", currency: "USD", lastReadAt: NOW },
    scope: view === "owner" ? "all" : "assigned",
    scopeWhy: view === "owner" ? "You see every deal." : "You see the deals assigned to you in your CRM.",
    quietDays: 14,
    words: { health: HEALTH_LABEL, temperature: TEMPERATURE_LABEL, temperatureBasis: TEMPERATURE_BASIS, ball: BALL_LABEL, fit: FIT_LABEL },
    ...built,
    perRep: view === "owner" ? built.perRep.map((row) => ({ ...row, name: row.ownerRef === "crm-milo" ? "Milo" : row.ownerRef === "crm-ada" ? "Ada" : "Not assigned" })) : null,
    canEdit: true,
  } as unknown as BoardData;
}

const team: TeamData = {
  crmConnected: true,
  members: [
    { id: "m0", name: "Nora", appRole: "owner", salesRole: "lead", crmUserRef: null },
    { id: "m1", name: "Milo", appRole: "member", salesRole: "closer", crmUserRef: "crm-milo" },
    { id: "m2", name: "Ada", appRole: "admin", salesRole: "setter", crmUserRef: "crm-ada" },
  ],
  crmUsers: [{ ref: "crm-milo", deals: 6, label: "Milo" }, { ref: "crm-ada", deals: 3, label: "Ada" }],
  roles: SALES_ROLES.map((id) => ({ id, ...SALES_ROLE_LABEL[id] })),
  kinds: MESSAGE_KINDS.map((id) => ({ id, label: MESSAGE_KIND_LABEL[id], canBeAutomatic: LOW_STAKES.includes(id), automatic: id === "reminder" })),
  paused: [],
  canSetTeam: true,
  canSetAutonomy: true,
} as unknown as TeamData;

export function PipelineTabStory({ view, theme }: { view: string; theme: string }) {
  return (
    <StoryFrame theme={theme} role="owner">
      <PipelineView board={board(view)} team={view === "owner" ? team : null} editor actions={{ completeCommitment: noop, setRole: noop, setAutonomy: noop }} />
    </StoryFrame>
  );
}
