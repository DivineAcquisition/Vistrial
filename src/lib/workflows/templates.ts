import { tidy } from "@/lib/workflows/graph";
import type { Box, Edge, PlaybookDocument, Port, Snippet } from "@/lib/workflows/types";

const DEFAULT_FACT = "Using the industry default. I will learn from your results after 20 closed deals.";

function snippet(key: string, channel: "sms" | "email", label: string, body: string): Snippet {
  return { key, channel, label, body };
}

function at(id: string, box: Omit<Box, "id" | "position" | "origin" | "fact"> & { origin?: Box["origin"]; fact?: string | null }): Box {
  return {
    id,
    origin: box.origin ?? "template",
    fact: box.fact === undefined ? DEFAULT_FACT : box.fact,
    position: { x: 0, y: 0 },
    type: box.type,
    title: box.title,
    summary: box.summary,
    config: box.config,
  };
}

function link(source: string, target: string, label: string, port: Port = "next", maxPasses: number | null = null): Edge {
  return { id: `${source}_${port}_${target}`, source, target, label, port, maxPasses };
}

function doc(boxes: Box[], edges: Edge[], snippets: Snippet[]): PlaybookDocument {
  return { graph: tidy({ boxes, edges }), snippets };
}

const SHARED: Snippet[] = [
  snippet("new_lead_day2", "sms", "New lead, day 2", "Short text. One easy next step. No promise you cannot keep."),
  snippet("no_show_now", "sms", "Missed visit", "They missed the appointment. Offer a new time. Do not scold."),
  snippet("no_show_day1", "sms", "Missed visit, next day", "One reminder that you can still find a time."),
  snippet("no_show_day3", "sms", "Missed visit, day 3", "Last note about the missed appointment. Leave the door open."),
  snippet("quiet_now", "sms", "Gone quiet", "The visit happened and then it went quiet. One easy next step."),
  snippet("quiet_day2", "sms", "Gone quiet, day 2", "A second note. One easy next step."),
  snippet("quiet_day5", "sms", "Gone quiet, day 5", "A last note. One easy next step."),
  snippet("objection_now", "sms", "Objection", "They raised a concern. Answer it simply and offer one next step."),
  snippet("objection_day2", "sms", "Objection, day 2", "A second note on the same concern."),
  snippet("objection_day5", "sms", "Objection, day 5", "A last note. Leave the door open."),
  snippet("booked_confirm", "sms", "Booking confirmed", "Confirm the time and what to expect. No extra offer."),
  snippet("won_welcome", "email", "Welcome", "A short welcome after they say yes. What happens next."),
  snippet("reactivate", "sms", "Checking back in", "A single note to someone who has been quiet. One easy next step."),
];

export type SeedWorkflow = {
  key: string;
  name: string;
  description: string;
  /** Which old sequence this replaces. Null when it is a new template. */
  replaces: string | null;
  document: PlaybookDocument;
};

export function seedWorkflows(): SeedWorkflow[] {
  return [
    {
      key: "new_lead",
      name: "New lead response",
      description: "A new lead after go-live. Sentry still owns the first response clock. This sends one follow-up if nobody has heard back.",
      replaces: null,
      document: newLead(),
    },
    {
      key: "no_show",
      name: "No-show recovery",
      description: "A missed appointment. Three texts at the old timings: now, the next day, and day 3. Each one waits for approval.",
      replaces: "no_show",
      document: noShow(),
    },
    {
      key: "gone_quiet",
      name: "Quote sent, gone quiet",
      description: "A visit was held and then it went quiet. Texts now, at day 2, and at day 5, matching the old quiet sequence.",
      replaces: "ghost_risk",
      document: goneQuiet(),
    },
    {
      key: "reactivate",
      name: "Reactivating old leads",
      description: "No activity for 14 days. One text, then it stops. This is the industry default, not a measured timing.",
      replaces: null,
      document: reactivate(),
    },
    {
      key: "objection",
      name: "Objection follow-up",
      description: "The lead is in objection. Texts now, at day 2, and at day 5.",
      replaces: "objection_hold",
      document: objection(),
    },
    {
      key: "booked",
      name: "Booking confirmation",
      description: "A booking was made. One confirmation text, then the lead is handed on.",
      replaces: "follow_up_scheduled",
      document: booked(),
    },
    {
      key: "won",
      name: "Won, welcome",
      description: "The lead is won. One welcome email, then the workflow ends.",
      replaces: "closed",
      document: won(),
    },
  ];
}

/** The four Compass offers first. The rest stay available as drafts so old rules are not dropped. */
export function proposalWorkflows(): SeedWorkflow[] {
  const wanted = new Set(["new_lead", "no_show", "gone_quiet", "reactivate"]);
  return seedWorkflows().filter((item) => wanted.has(item.key));
}

export const RETIRED_SEQUENCES: Array<{ branch: string; handling: string }> = [
  { branch: "no_show", handling: "Became the No-show recovery workflow. Timings kept: now, 24 hours, 72 hours." },
  { branch: "ghost_risk", handling: "Became Quote sent, gone quiet. Timings kept: now, 48 hours, 120 hours." },
  { branch: "objection_hold", handling: "Became Objection follow-up. Timings kept: now, 48 hours, 120 hours." },
  { branch: "follow_up_scheduled", handling: "Became Booking confirmation. One text, then it ends." },
  { branch: "closed", handling: "Became Won, welcome. One email, then it ends. The duplicate closed-won rule uses the same workflow." },
  { branch: "not_interested", handling: "Retired. A lead who is not interested does not get another message." },
];

function newLead(): PlaybookDocument {
  const boxes = [
    at("start", { type: "start", title: "New lead", summary: "A new lead arrives after go-live.", config: { type: "start", entry: { kind: "new_lead" }, source: null, service: null } }),
    at("check_reply", {
      type: "check",
      title: "Did they reply?",
      summary: "Looks at activity only, never the message.",
      config: { type: "check", check: "replied", stage: null, tier: null, field: null, value: null, booking: null, yesLabel: "Replied", noLabel: "No reply" },
    }),
    at("wait_2", { type: "wait", title: "Wait 2 days", summary: "Then Relay drafts a follow-up.", config: { type: "wait", hours: 48, untilHour: 9 } }),
    at("draft", {
      type: "draft",
      title: "Day 2 follow-up",
      summary: "Needs approval.",
      config: { type: "draft", channel: "sms", snippetKey: "new_lead_day2", windowHour: 9, expiry: "exit" },
    }),
    at("end_replied", { type: "end", title: "Handed to a person", summary: "They replied.", config: { type: "end", reason: "replied", handoffKey: null } }),
    at("end_expired", { type: "end", title: "Stopped", summary: "The draft expired without approval.", config: { type: "end", reason: "stopped", handoffKey: null } }),
    at("end_done", { type: "end", title: "Stopped", summary: "No reply after the follow-up.", config: { type: "end", reason: "stopped", handoffKey: null } }),
    at("note", { type: "note", title: "Sentry still watches the first hour", summary: "This workflow does not replace the response clock.", fact: null, config: { type: "note", text: "Sentry still owns the first response clock." } }),
  ];
  const edges = [
    link("start", "check_reply", "Next"),
    link("check_reply", "end_replied", "Replied", "yes"),
    link("check_reply", "wait_2", "No reply", "no"),
    link("wait_2", "draft", "Next"),
    link("draft", "end_done", "Approved"),
    link("draft", "end_expired", "Expired", "expired"),
  ];
  return doc(boxes, edges, SHARED);
}

function chainDrafts(start: Box, drafts: Array<{ id: string; title: string; snippetKey: string; waitHours: number | null }>, channel: "sms" | "email"): PlaybookDocument {
  const boxes: Box[] = [
    start,
    at("end_replied", { type: "end", title: "Handed to a person", summary: "They replied.", config: { type: "end", reason: "replied", handoffKey: null } }),
    at("end_expired", { type: "end", title: "Stopped", summary: "A draft expired.", config: { type: "end", reason: "stopped", handoffKey: null } }),
    at("end_done", { type: "end", title: "Stopped", summary: "The follow-ups are finished.", config: { type: "end", reason: "stopped", handoffKey: null } }),
  ];
  const edges: Edge[] = [];
  let incoming = start.id;
  let port: Port = "next";
  let label = "Next";
  drafts.forEach((step) => {
    let source = incoming;
    let sourcePort = port;
    let sourceLabel = label;
    if (step.waitHours) {
      const waitId = `wait_${step.id}`;
      const days = step.waitHours / 24;
      boxes.push(at(waitId, { type: "wait", title: step.waitHours % 24 === 0 ? `Wait ${days} day${days === 1 ? "" : "s"}` : `Wait ${step.waitHours} hours`, summary: "Then the next draft.", config: { type: "wait", hours: step.waitHours, untilHour: 9 } }));
      edges.push(link(source, waitId, sourceLabel, sourcePort));
      source = waitId;
      sourcePort = "next";
      sourceLabel = "Next";
    }
    boxes.push(at(step.id, { type: "draft", title: step.title, summary: "Needs approval.", config: { type: "draft", channel, snippetKey: step.snippetKey, windowHour: 9, expiry: "exit" } }));
    const checkId = `check_${step.id}`;
    boxes.push(at(checkId, { type: "check", title: "Did they reply?", summary: "Activity only.", config: { type: "check", check: "replied", stage: null, tier: null, field: null, value: null, booking: null, yesLabel: "Replied", noLabel: "No reply" } }));
    edges.push(link(source, step.id, sourceLabel, sourcePort));
    edges.push(link(step.id, checkId, "Approved"));
    edges.push(link(step.id, "end_expired", "Expired", "expired"));
    edges.push(link(checkId, "end_replied", "Replied", "yes"));
    incoming = checkId;
    port = "no";
    label = "No reply";
  });
  edges.push(link(incoming, "end_done", label, port));
  return doc(boxes, edges, SHARED);
}

function noShow(): PlaybookDocument {
  return chainDrafts(
    at("start", { type: "start", title: "Missed appointment", summary: "A booking was missed.", config: { type: "start", entry: { kind: "booking", event: "missed" }, source: null, service: null } }),
    [
      { id: "d0", title: "Text now", snippetKey: "no_show_now", waitHours: null },
      { id: "d1", title: "Next-day text", snippetKey: "no_show_day1", waitHours: 24 },
      { id: "d3", title: "Day 3 text", snippetKey: "no_show_day3", waitHours: 48 },
    ],
    "sms",
  );
}

function goneQuiet(): PlaybookDocument {
  return chainDrafts(
    at("start", { type: "start", title: "Visit held", summary: "A booking was completed.", config: { type: "start", entry: { kind: "booking", event: "completed" }, source: null, service: null } }),
    [
      { id: "d0", title: "Text now", snippetKey: "quiet_now", waitHours: null },
      { id: "d2", title: "Day 2 text", snippetKey: "quiet_day2", waitHours: 48 },
      { id: "d5", title: "Day 5 text", snippetKey: "quiet_day5", waitHours: 72 },
    ],
    "sms",
  );
}

function objection(): PlaybookDocument {
  return chainDrafts(
    at("start", { type: "start", title: "Objection", summary: "The stage changes to objection.", config: { type: "start", entry: { kind: "stage", stage: "objection_hold" }, source: null, service: null } }),
    [
      { id: "d0", title: "Text now", snippetKey: "objection_now", waitHours: null },
      { id: "d2", title: "Day 2 text", snippetKey: "objection_day2", waitHours: 48 },
      { id: "d5", title: "Day 5 text", snippetKey: "objection_day5", waitHours: 72 },
    ],
    "sms",
  );
}

function booked(): PlaybookDocument {
  const boxes = [
    at("start", { type: "start", title: "Booking made", summary: "A booking was made.", config: { type: "start", entry: { kind: "booking", event: "made" }, source: null, service: null } }),
    at("draft", { type: "draft", title: "Confirmation", summary: "Needs approval.", config: { type: "draft", channel: "sms", snippetKey: "booked_confirm", windowHour: 9, expiry: "stop" } }),
    at("end", { type: "end", title: "Booked and handed on", summary: "The visit is on the calendar.", config: { type: "end", reason: "booked", handoffKey: null } }),
  ];
  return doc(boxes, [link("start", "draft", "Next"), link("draft", "end", "Approved")], SHARED);
}

function won(): PlaybookDocument {
  const boxes = [
    at("start", { type: "start", title: "Won", summary: "The stage changes to won.", config: { type: "start", entry: { kind: "stage", stage: "closed_won" }, source: null, service: null } }),
    at("draft", { type: "draft", title: "Welcome email", summary: "Needs approval.", config: { type: "draft", channel: "email", snippetKey: "won_welcome", windowHour: 9, expiry: "stop" } }),
    at("end", { type: "end", title: "Won", summary: "The lead has finished.", config: { type: "end", reason: "won", handoffKey: null } }),
  ];
  return doc(boxes, [link("start", "draft", "Next"), link("draft", "end", "Approved")], SHARED);
}

function reactivate(): PlaybookDocument {
  const boxes = [
    at("start", { type: "start", title: "Quiet for 14 days", summary: "No activity for 14 days.", fact: DEFAULT_FACT, config: { type: "start", entry: { kind: "quiet_days", days: 14 }, source: null, service: null } }),
    at("draft", { type: "draft", title: "One check-in", summary: "Needs approval.", config: { type: "draft", channel: "sms", snippetKey: "reactivate", windowHour: 9, expiry: "stop" } }),
    at("end", { type: "end", title: "Stopped", summary: "One note, then it stops.", config: { type: "end", reason: "stopped", handoffKey: null } }),
  ];
  return doc(boxes, [link("start", "draft", "Next"), link("draft", "end", "Approved")], SHARED);
}

export function industryNote(slug: string | null): string {
  if (slug === "med-spa") return "Med Spa timing uses the shared follow-up rules. Assay treats a hot lead as quiet after 4 days.";
  if (slug === "coaches-consultants") return "Coaches timing uses the shared follow-up rules. Assay treats a hot lead as quiet after 5 days.";
  return "Home Services timing uses the shared follow-up rules. Assay treats a hot lead as quiet after 3 days.";
}
