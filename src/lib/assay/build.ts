import type { AssayActivity, AssayInput, FieldValue, SignalReading, TeamTouch } from "@/lib/assay/compute";
import { APPROVED_INPUTS, approvedInput, checkFieldMap, type ApprovedInputKey, type FieldMapCheck } from "@/lib/assay/inputs";
import type { AssayRules } from "@/lib/assay/rules";
import { isCallSignal, type Confidence, type Tier } from "@/lib/assay/vocabulary";

/**
 * Turns what assay_lead_inputs returns into what the engine reads. Pure.
 * Activity metadata only: directions, channels, and times. The loader never
 * returns message text, call content, or names, and nothing here asks for them.
 */

export type RawTouch = { id: string; at: string; direction: "inbound" | "outbound"; channel: string; type: string };

export type RawCall = {
  id: string;
  createdAt: string;
  scheduledAt: string | null;
  occurredAt: string | null;
  updatedAt: string;
  outcome: "held" | "no_show" | "cancelled" | "rescheduled" | null;
  hasTranscript: boolean;
  extractionPending: boolean;
};

export type RawStatusChange = { id: string; at: string; from: string; to: string };

export type RawLead = {
  id: string;
  status: string;
  createdAt: string;
  closedAt: string | null;
  updatedAt: string;
  source: string | null;
  offerName: string | null;
  hasPhone: boolean;
  hasEmail: boolean;
  emailSuppressed: boolean;
  answers: Record<string, unknown> | null;
  doNotContact: boolean;
  optedOut: boolean;
  isTest: boolean;
  historic: boolean;
  previous: { score: number; tier: Tier; scoredAt: string; inputsHash: string } | null;
  touches: RawTouch[];
  calls: RawCall[];
  statusChanges: RawStatusChange[];
  facts: Record<string, unknown> | null;
  signals: Array<{ callId: string; at: string; signal: string; value: string; confidence: string; passageIds: string[] | null }>;
};

export type RawOrgContext = {
  timezone: string | null;
  status: string | null;
  sources: Record<string, { closed: number; won: number }>;
  closed: number;
  won: number;
  /** Onboarding's application questions mapped onto inputs. Checked like any field map. */
  profileFields?: Array<{ source: string; input: string }>;
};

export type Offer = { name: string; ticketMax: number | null };

export function readOffers(value: unknown): Offer[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((row): row is Record<string, unknown> => !!row && typeof row === "object")
    .map((row) => ({
      name: String(row.name ?? "").trim(),
      ticketMax: Number.isFinite(Number(row.ticket_max)) ? Number(row.ticket_max) : null,
    }))
    .filter((offer) => offer.name);
}

export const CLOSED_STATUSES = new Set(["closed_won", "closed_lost"]);

/** Inputs Assay works out itself; a form field can never set them. */
const COMPUTED_INPUTS = new Set<string>(["contact_complete", "service_offered", "service_value", "lead_source"]);

/** Pipeline order for stage moves. Ghost and no-show are system marks, not moves. */
const STAGE_RANK: Record<string, number> = {
  new: 0,
  working: 1,
  follow_up: 2,
  objection_hold: 2,
  call_booked: 3,
};

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function matchOffer(offerName: string | null, offers: Offer[]): Offer | null {
  if (!offerName) return null;
  const wanted = normalize(offerName);
  if (!wanted) return null;
  return (
    offers.find((offer) => normalize(offer.name) === wanted) ??
    offers.find((offer) => {
      const name = normalize(offer.name);
      return name.length >= 4 && wanted.length >= 4 && (name.includes(wanted) || wanted.includes(name));
    }) ??
    null
  );
}

function coerce(input: ApprovedInputKey, raw: unknown): FieldValue {
  const type = approvedInput(input)?.type ?? "text";
  if (raw === null || raw === undefined) return null;
  if (type === "boolean") {
    if (typeof raw === "boolean") return raw;
    const text = String(raw).trim().toLowerCase();
    if (["yes", "y", "true", "1", "owner", "own", "owns"].includes(text)) return true;
    if (["no", "n", "false", "0", "rent", "renter", "renting"].includes(text)) return false;
    return null;
  }
  if (type === "number") {
    const n = typeof raw === "number" ? raw : Number(String(raw).replace(/[^0-9.\-]/g, ""));
    return Number.isFinite(n) && String(raw).trim() !== "" ? n : null;
  }
  const text = String(raw).trim();
  return text ? text.slice(0, 120) : null;
}

function mappedValue(source: string, lead: RawLead): unknown {
  const answers = lead.answers ?? {};
  if (source === "@answers_present") return Object.keys(answers).length > 0 ? true : null;
  if (source.startsWith("case.")) return (lead.facts ?? {})[source.slice(5)];
  if (source.startsWith("answers.")) return answers[source.slice(8)];
  return answers[source];
}

export type BuiltInput = {
  input: AssayInput;
  contactable: boolean;
  closed: boolean;
  /** The time to score against: now for open leads, the close for closed ones. */
  asOf: string;
  previousTier: Tier | null;
  fieldMap: FieldMapCheck;
};

export function buildAssayInput(lead: RawLead, ctx: { org: RawOrgContext; rules: AssayRules; offers: Offer[]; now: string }): BuiltInput {
  const fields: Partial<Record<ApprovedInputKey, FieldValue>> = {};

  fields.contact_complete = lead.hasPhone || (lead.hasEmail && !lead.emailSuppressed);
  const offer = matchOffer(lead.offerName, ctx.offers);
  if (offer) {
    fields.service_offered = true;
    if (offer.ticketMax !== null) fields.service_value = offer.ticketMax;
  }
  if (lead.source) fields.lead_source = lead.source;

  // Answers saved under an approved input's own key (the CRM field mapping
  // writes them that way). Computed inputs are never taken from a form.
  const answers = lead.answers ?? {};
  for (const input of APPROVED_INPUTS) {
    if (COMPUTED_INPUTS.has(input.key) || !(input.key in answers)) continue;
    const value = coerce(input.key, answers[input.key]);
    if (value !== null) fields[input.key] = value;
  }

  // A workspace's own fields, only where they map onto an approved input.
  const fieldMap = checkFieldMap([...(ctx.org.profileFields ?? []), ...ctx.rules.fieldMap]);
  for (const entry of fieldMap.accepted) {
    const value = coerce(entry.input, mappedValue(entry.source, lead));
    if (value !== null) fields[entry.input] = value;
  }

  const activities: AssayActivity[] = [];
  const teamTouches: TeamTouch[] = [];
  for (const touch of lead.touches) {
    if (touch.direction === "inbound") {
      activities.push({ id: touch.id, event: touch.channel === "call" ? "called_back" : "replied", at: touch.at });
    } else {
      teamTouches.push({ id: touch.id, at: touch.at });
    }
  }

  let held = 0;
  let pending = false;
  const callsWithSignals = new Set(lead.signals.map((signal) => signal.callId));
  for (const call of lead.calls) {
    if (call.scheduledAt) activities.push({ id: `${call.id}:booked`, event: "booked", at: call.createdAt });
    if (call.outcome === "no_show") activities.push({ id: `${call.id}:no_show`, event: "no_show", at: call.scheduledAt ?? call.updatedAt });
    if (call.outcome === "cancelled") activities.push({ id: `${call.id}:canceled`, event: "canceled", at: call.updatedAt });
    if (call.outcome === "rescheduled") activities.push({ id: `${call.id}:rescheduled`, event: "rescheduled_by_lead", at: call.updatedAt });
    if (call.outcome === "held" || (call.occurredAt && call.hasTranscript)) {
      held += 1;
      activities.push({ id: `${call.id}:completed`, event: "meeting_completed", at: call.occurredAt ?? call.scheduledAt ?? call.updatedAt });
      if (call.extractionPending && !callsWithSignals.has(call.id)) pending = true;
    }
  }

  for (const change of lead.statusChanges) {
    if (CLOSED_STATUSES.has(change.from) && !CLOSED_STATUSES.has(change.to)) {
      activities.push({ id: `${change.id}:reopened`, event: "reopened", at: change.at });
      continue;
    }
    const from = STAGE_RANK[change.from];
    const to = STAGE_RANK[change.to];
    if (from === undefined || to === undefined || from === to) continue;
    activities.push({ id: change.id, event: to > from ? "stage_forward" : "stage_back", at: change.at });
  }

  const signals: SignalReading[] = lead.signals
    .filter((row) => isCallSignal(row.signal) && ["high", "medium", "low"].includes(row.confidence))
    .map((row) => ({
      callId: row.callId,
      at: row.at,
      signal: row.signal as SignalReading["signal"],
      value: row.value,
      confidence: row.confidence as Confidence,
      passageIds: row.passageIds ?? [],
    }));

  const sourceKey = lead.source ? lead.source.trim().toLowerCase() : null;
  const sourceStats = sourceKey ? ctx.org.sources[sourceKey] : undefined;

  const closed = CLOSED_STATUSES.has(lead.status);
  const asOf = closed ? (lead.closedAt ?? lead.updatedAt) : ctx.now;

  return {
    input: {
      leadId: lead.id,
      fields,
      activities: activities.sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id)),
      teamTouches: teamTouches.sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id)),
      calls: { held, pending },
      signals,
      source: lead.source
        ? {
            label: lead.source,
            closed: sourceStats?.closed ?? 0,
            won: sourceStats?.won ?? 0,
            overallClosed: ctx.org.closed,
            overallWon: ctx.org.won,
          }
        : null,
    },
    contactable: !lead.doNotContact && !lead.optedOut,
    closed,
    asOf: Date.parse(asOf) > Date.parse(ctx.now) ? ctx.now : new Date(Date.parse(asOf)).toISOString(),
    previousTier: lead.previous?.tier ?? null,
    fieldMap,
  };
}
