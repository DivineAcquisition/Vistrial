/**
 * What a pre-call brief knows, worked out in code from the CRM's own rows, this lead's linked calls, what a
 * person typed and the Playbook. Pure: the same rows always give the same record, and a test can read every
 * case. No model sees a fact this file did not make. docs/rebuild/dealmaker.md, sections 0.8 and 4.3.
 */

import type { CrmActivity, CrmAppointment, CrmContact, CrmDeal } from "../../lib/crm/types";
import { money } from "../pipelineForensics/compute";
import { BRIEF_LIMITS, NOT_ENOUGH_DATA, type BriefRecord, type BriefSource, type Fact, type PlaybookRef } from "./shapes";

const DAY = 86_400_000;

export type BriefInput = {
  briefingId: string;
  projectId: string;
  leadName: string;
  crm: { label: string; accountName: string; currency: string; timezone: string | null } | null;
  contact: CrmContact | null;
  deal: CrmDeal | null;
  /** The deal's pipeline and stage, by name. */
  stage: { pipeline: string; stage: string } | null;
  /** The booked call this brief is for. */
  call: CrmAppointment | null;
  /** This lead's activity, newest first. */
  activities: CrmActivity[];
  /** This lead's other booked calls in the window. */
  appointments: CrmAppointment[];
  /** This lead's calls shared with Dealmaker, newest first. */
  transcripts: { id: string; title: string; callDate: string | null; text: string }[];
  handoff: { text: string; by: string } | null;
  about: { text: string; by: string } | null;
  playbook: { id: string; folder: string; kind: string; title: string; body: string; basis: string; heard?: number }[];
  /** The lead's business site, as a person gave it, else the domain of a work email. */
  site: { url: string; domain: string; from: "given" | "email" } | null;
  now: number;
};

/** A date and time in the CRM's time zone when it has one, else UTC, which the words then say. */
export function when(at: number, timezone: string | null) {
  try {
    const words = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: timezone ?? "UTC" }).format(at);
    return timezone ? words : `${words} UTC`;
  } catch {
    return new Date(at).toISOString().slice(0, 16).replace("T", " ") + " UTC";
  }
}

export function day(at: number, timezone: string | null) {
  try {
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: timezone ?? "UTC" }).format(at);
  } catch {
    return new Date(at).toISOString().slice(0, 10);
  }
}

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

const STATUS_WORDS: Record<string, string> = { booked: "booked", confirmed: "confirmed", showed: "showed", noShow: "no-show", cancelled: "cancelled", unknown: "status unknown" };

const TOUCH_WORDS: Record<string, string> = { call: "a call", sms: "a text", email: "an email", chat: "a chat message", social: "a social message", meeting: "a meeting", stage_change: "a stage move", status_change: "a status change" };

/** The Playbook items a brief may draw on, offer first: what is sold, then what leads push back on, then what to ask. */
const PLAYBOOK_ORDER: Record<string, number> = { package: 0, price: 1, guarantee: 2, proof: 3, objection: 4, question: 5, qualification: 6, buyer: 7 };

function playbookRefs(items: BriefInput["playbook"]): PlaybookRef[] {
  return items
    .filter((row) => Object.hasOwn(PLAYBOOK_ORDER, row.kind))
    // Objections most heard on the business's calls first.
    .sort((a, b) => PLAYBOOK_ORDER[a.kind] - PLAYBOOK_ORDER[b.kind] || (b.heard ?? 0) - (a.heard ?? 0))
    .slice(0, BRIEF_LIMITS.playbookItems)
    .map((row, i) => ({ id: `p${i + 1}`, folder: row.folder, kind: row.kind, title: row.title, body: row.body.slice(0, 600), basis: row.basis, ...(row.heard ? { heard: row.heard } : {}) }));
}

function cut(value: string, max: number) {
  return value.length > max ? { text: value.slice(0, max), cut: true } : { text: value, cut: false };
}

export function computeBrief(input: BriefInput): BriefRecord {
  const tz = input.crm?.timezone ?? null;
  const currency = input.crm?.currency ?? "USD";
  const facts: Fact[] = [];
  const add = (group: Fact["group"], label: string, display: string, kind: Fact["kind"] = "recorded", formula?: string) =>
    facts.push({ id: `F${facts.length + 1}`, group, label, display, kind, ...(formula ? { formula } : {}) });
  const missing: string[] = [];

  // Who: as the CRM records it.
  if (input.call) add("who", "Booked call", `${when(input.call.startsAt, tz)} (${STATUS_WORDS[input.call.status] ?? "status unknown"})`);
  if (input.contact?.source) add("who", "Lead source", input.contact.source);
  if (input.contact?.addedAt) {
    add("who", "Added to the CRM", day(input.contact.addedAt, tz));
    add("soFar", "Days since the lead was added", String(Math.max(0, Math.floor((input.now - input.contact.addedAt) / DAY))), "measured", "today minus the day the lead was added");
  }
  if (input.deal && input.stage) {
    add("who", "Deal stage", `${input.stage.stage} (${input.stage.pipeline})`);
    if (input.deal.status !== "open") add("who", "Deal status", input.deal.status);
    if (input.deal.value > 0) add("who", "Deal value", money(input.deal.value, currency));
    if (input.deal.stageChangedAt) add("soFar", "Days in this stage", String(Math.max(0, Math.floor((input.now - input.deal.stageChangedAt) / DAY))), "measured", "today minus the last stage change");
  }

  // So far: counts and dates of what happened, never the words of a message (no adapter keeps them).
  if (input.crm) {
    const count = (kind: string) => input.activities.filter((row) => row.kind === kind).length;
    const calls = count("call");
    const texts = count("sms");
    const emails = count("email");
    const other = count("chat") + count("social");
    add("soFar", "Touches recorded", [plural(calls, "call"), plural(texts, "text"), plural(emails, "email"), ...(other ? [plural(other, "message")] : [])].join(", "));
    const touch = input.activities.find((row) => row.kind !== "stage_change" && row.kind !== "status_change");
    if (touch) add("soFar", "Last touch", `${TOUCH_WORDS[touch.kind] ?? "a touch"}${touch.direction ? ` (${touch.direction})` : ""} on ${day(touch.at, tz)}`);
    const before = input.appointments.filter((row) => row.ref !== input.call?.ref);
    if (before.length) {
      const noShows = before.filter((row) => row.status === "noShow").length;
      const cancelled = before.filter((row) => row.status === "cancelled").length;
      const showed = before.filter((row) => row.status === "showed").length;
      add("soFar", "Other booked calls", [plural(before.length, "call"), ...(showed ? [`${showed} showed`] : []), ...(noShows ? [`${noShows} no-show${noShows === 1 ? "" : "s"}`] : []), ...(cancelled ? [`${cancelled} cancelled or moved`] : [])].join(", "));
    }
  }

  // What the brief may quote: this lead's calls (the buyer's words), the setter's hand-off and a note about the lead.
  const sources: BriefSource[] = [];
  input.transcripts.slice(0, BRIEF_LIMITS.calls).forEach((row, i) => {
    const part = cut(row.text, BRIEF_LIMITS.callChars);
    sources.push({ id: `c${i + 1}`, type: "call", ref: row.id, label: `${row.title}${row.callDate ? ` (${row.callDate})` : ""}`, ...part });
    if (part.cut) missing.push(`The call "${row.title}" is long, so only its first part was read.`);
  });
  if (input.handoff) sources.push({ id: "h1", type: "handoff", label: `Hand-off from ${input.handoff.by}`, by: input.handoff.by, ...cut(input.handoff.text, BRIEF_LIMITS.noteChars) });
  if (input.about) sources.push({ id: "n1", type: "about", label: `Note from ${input.about.by}`, by: input.about.by, ...cut(input.about.text, BRIEF_LIMITS.noteChars) });

  const playbook = playbookRefs(input.playbook);
  const offer = playbook.some((row) => row.folder === "offer");

  if (!input.crm) missing.push(`${NOT_ENOUGH_DATA}: no CRM is connected here, so the brief rests on what you typed and any call linked to this lead.`);
  else if (!input.contact) missing.push(`${NOT_ENOUGH_DATA}: Vistrial has not read this lead from your CRM, so there is no history.`);
  if (!input.transcripts.length) missing.push("No earlier call with this lead is linked and shared with Dealmaker, so nothing is quoted from one.");
  if (!offer) missing.push("The Playbook's Offer folder is empty, so the brief names no package.");
  if (!input.site) missing.push("No website for the lead's business is known (none was given and their email is not a work address), so the brief has no public read.");

  const firstCall = !sources.some((row) => row.type === "call" || row.type === "handoff");
  return {
    briefingId: input.briefingId,
    projectId: input.projectId,
    leadName: input.leadName,
    crm: input.crm,
    call: input.call ? { ref: input.call.ref, startsAt: input.call.startsAt, status: input.call.status } : null,
    facts,
    sources,
    playbook,
    firstCall,
    needsModel: sources.length > 0 || offer,
    missing,
    site: input.site,
    refs: {},
  };
}
