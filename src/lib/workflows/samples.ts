import type { CheckContext, WorkflowGraph } from "@/lib/workflows/types";

/**
 * Proposed starting workflows for the Home Services template, with the timings
 * waiting on the Owner's approval before anything is seeded. Until then they are
 * used only by the development preview and the tests, against the labeled fake
 * playbook below. No real workspace reads them.
 */

export type SamplePlaybook = {
  stages: string[];
  snippets: Array<{ id: string; name: string }>;
  talkTracks: Array<{ id: string; name: string }>;
  members: Array<{ id: string; name: string }>;
  roles: string[];
};

export const SAMPLE_PLAYBOOK: SamplePlaybook = {
  stages: ["New", "Contacted", "Quote sent", "Booked", "Won", "Lost"],
  snippets: [
    { id: "sn_quote_nudge", name: "Quote nudge" },
    { id: "sn_reschedule", name: "Reschedule link" },
  ],
  talkTracks: [
    { id: "tt_first_reply", name: "First reply" },
    { id: "tt_follow_up", name: "Second follow-up" },
    { id: "tt_quote_check_in", name: "Quote check-in" },
    { id: "tt_no_show", name: "Missed appointment" },
  ],
  members: [
    { id: "m_sample_owner", name: "Sample owner" },
    { id: "m_sample_closer", name: "Sample closer" },
  ],
  roles: ["owner", "admin", "closer", "setter"],
};

export function sampleCheckContext(): CheckContext {
  return {
    stages: new Set(SAMPLE_PLAYBOOK.stages),
    snippetIds: new Set(SAMPLE_PLAYBOOK.snippets.map((item) => item.id)),
    talkTrackIds: new Set(SAMPLE_PLAYBOOK.talkTracks.map((item) => item.id)),
    memberIds: new Set(SAMPLE_PLAYBOOK.members.map((item) => item.id)),
    roles: new Set(SAMPLE_PLAYBOOK.roles),
    channels: new Set(["text", "email"]),
    routingAvailable: true,
  };
}

export type SampleWorkflow = { id: string; name: string; description: string; graph: WorkflowGraph };

export const NEW_LEAD_RESPONSE: SampleWorkflow = {
  id: "sample-new-lead",
  name: "New lead response",
  description: "Reply fast to every new lead, follow up once, then hand the lead to a person.",
  graph: {
    boxes: [
      { id: "s1", config: { kind: "start", trigger: "new_lead" } },
      { id: "d1", config: { kind: "draft", channel: "text", contentKind: "talk_track", contentRef: "tt_first_reply", windowHours: 4 } },
      { id: "t1", config: { kind: "task", text: "Call this lead. The first text was not approved in time.", dueHours: 2, assignee: { kind: "lead_owner" }, alert: false } },
      { id: "w1", config: { kind: "wait", amount: 1, unit: "days", atTime: "09:00" } },
      { id: "c1", config: { kind: "check", check: "replied_since", yesLabel: "Replied", noLabel: "No reply" } },
      { id: "d2", config: { kind: "draft", channel: "text", contentKind: "talk_track", contentRef: "tt_follow_up", windowHours: 24 } },
      { id: "w2", config: { kind: "wait", amount: 2, unit: "days" } },
      { id: "c2", config: { kind: "check", check: "replied_since", yesLabel: "Replied", noLabel: "No reply" } },
      { id: "t2", config: { kind: "task", text: "Call this lead. Two texts got no reply.", dueHours: 4, assignee: { kind: "lead_owner" }, alert: true } },
      { id: "e1", config: { kind: "end", reason: "replied" } },
      { id: "e2", config: { kind: "end", reason: "stopped" } },
      { id: "n1", config: { kind: "note", text: "Most replies in this industry come within a day, so the follow-up waits one day." } },
    ],
    edges: [
      { id: "e-s1-d1", from: "s1", to: "d1", exit: "next" },
      { id: "e-d1-w1", from: "d1", to: "w1", exit: "next" },
      { id: "e-d1-t1", from: "d1", to: "t1", exit: "expired" },
      { id: "e-t1-w1", from: "t1", to: "w1", exit: "next" },
      { id: "e-w1-c1", from: "w1", to: "c1", exit: "next" },
      { id: "e-c1-e1", from: "c1", to: "e1", exit: "yes" },
      { id: "e-c1-d2", from: "c1", to: "d2", exit: "no" },
      { id: "e-d2-w2", from: "d2", to: "w2", exit: "next" },
      { id: "e-d2-e2", from: "d2", to: "e2", exit: "expired" },
      { id: "e-w2-c2", from: "w2", to: "c2", exit: "next" },
      { id: "e-c2-e1", from: "c2", to: "e1", exit: "yes" },
      { id: "e-c2-t2", from: "c2", to: "t2", exit: "no" },
      { id: "e-t2-e2", from: "t2", to: "e2", exit: "next" },
    ],
  },
};

export const QUOTE_GONE_QUIET: SampleWorkflow = {
  id: "sample-quote-quiet",
  name: "Quote sent, gone quiet",
  description: "Check in after a quote, then send up to three nudges before stopping.",
  graph: {
    boxes: [
      { id: "s1", config: { kind: "start", trigger: "stage_changed", stage: "Quote sent" } },
      { id: "w1", config: { kind: "wait", amount: 2, unit: "days", atTime: "10:00" } },
      { id: "c1", config: { kind: "check", check: "replied_since", yesLabel: "Replied", noLabel: "No reply" } },
      { id: "d1", config: { kind: "draft", channel: "email", contentKind: "talk_track", contentRef: "tt_quote_check_in", windowHours: 24 } },
      { id: "w2", config: { kind: "wait", amount: 3, unit: "days" } },
      { id: "c2", config: { kind: "check", check: "replied_since", yesLabel: "Replied", noLabel: "No reply" } },
      { id: "d2", config: { kind: "draft", channel: "text", contentKind: "snippet", contentRef: "sn_quote_nudge", windowHours: 24 } },
      { id: "e1", config: { kind: "end", reason: "replied" } },
      { id: "e2", config: { kind: "end", reason: "stopped" } },
    ],
    edges: [
      { id: "e-s1-w1", from: "s1", to: "w1", exit: "next" },
      { id: "e-w1-c1", from: "w1", to: "c1", exit: "next" },
      { id: "e-c1-e1", from: "c1", to: "e1", exit: "yes" },
      { id: "e-c1-d1", from: "c1", to: "d1", exit: "no" },
      { id: "e-d1-w2", from: "d1", to: "w2", exit: "next" },
      { id: "e-d1-e2", from: "d1", to: "e2", exit: "expired" },
      { id: "e-w2-c2", from: "w2", to: "c2", exit: "next" },
      { id: "e-c2-e1", from: "c2", to: "e1", exit: "yes" },
      { id: "e-c2-d2", from: "c2", to: "d2", exit: "no" },
      { id: "e-d2-w2", from: "d2", to: "w2", exit: "next", maxPasses: 2 },
      { id: "e-d2-e2", from: "d2", to: "e2", exit: "expired" },
    ],
  },
};

export const NO_SHOW_RECOVERY: SampleWorkflow = {
  id: "sample-no-show",
  name: "No-show recovery",
  description: "When a lead misses an appointment, call first, then text a rebooking offer.",
  graph: {
    boxes: [
      { id: "s1", config: { kind: "start", trigger: "booking", bookingEvent: "missed" } },
      { id: "t1", config: { kind: "task", text: "Call to rebook the missed appointment.", dueHours: 1, assignee: { kind: "lead_owner" }, alert: true } },
      { id: "w1", config: { kind: "wait", amount: 2, unit: "hours" } },
      { id: "c1", config: { kind: "check", check: "booking_state", value: "in_place", yesLabel: "Rebooked", noLabel: "Not rebooked" } },
      { id: "d1", config: { kind: "draft", channel: "text", contentKind: "talk_track", contentRef: "tt_no_show", windowHours: 12 } },
      { id: "w2", config: { kind: "wait", amount: 1, unit: "days", atTime: "09:00" } },
      { id: "c2", config: { kind: "check", check: "booking_state", value: "in_place", yesLabel: "Rebooked", noLabel: "Not rebooked" } },
      { id: "e1", config: { kind: "end", reason: "booked" } },
      { id: "e2", config: { kind: "end", reason: "stopped" } },
    ],
    edges: [
      { id: "e-s1-t1", from: "s1", to: "t1", exit: "next" },
      { id: "e-t1-w1", from: "t1", to: "w1", exit: "next" },
      { id: "e-w1-c1", from: "w1", to: "c1", exit: "next" },
      { id: "e-c1-e1", from: "c1", to: "e1", exit: "yes" },
      { id: "e-c1-d1", from: "c1", to: "d1", exit: "no" },
      { id: "e-d1-w2", from: "d1", to: "w2", exit: "next" },
      { id: "e-d1-e2", from: "d1", to: "e2", exit: "expired" },
      { id: "e-w2-c2", from: "w2", to: "c2", exit: "next" },
      { id: "e-c2-e1", from: "c2", to: "e1", exit: "yes" },
      { id: "e-c2-e2", from: "c2", to: "e2", exit: "no" },
    ],
  },
};

export const SAMPLE_WORKFLOWS: SampleWorkflow[] = [NEW_LEAD_RESPONSE, QUOTE_GONE_QUIET, NO_SHOW_RECOVERY];
