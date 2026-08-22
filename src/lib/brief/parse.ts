import { createHash } from "node:crypto";

import { formatAnswer } from "@/lib/cases/format";
import type { BriefPayload } from "@/lib/brief/types";
import { buildSetterFacts } from "@/lib/profile/setter-facts";
import type { ExtractionSignalState } from "@/lib/transcripts/types";
import type { Enums, Json } from "@/types/database";

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

const SETTER_FACT_KEYS = [
  "timeline",
  "budget",
  "authority",
  "decision",
  "pain",
  "timeline_signal",
  "budget_signal",
  "decision_process",
];

export function briefCacheKey(raw: Record<string, unknown>): string {
  const material = JSON.stringify({
    scoreId: asRecord(raw.score).id ?? null,
    objections: raw.openObjections,
    lastCall: asRecord(raw.lastCall).id ?? null,
    triage: asRecord(raw.triage).id ?? null,
    inbound: asRecord(raw.lastInbound).at ?? null,
  });
  return createHash("sha256").update(material).digest("hex").slice(0, 24);
}

export function parseBriefPayload(
  raw: unknown,
  now: string,
  setterEstablishes: Enums<"profile_setter_fact">[] = [],
  setterEstablishesOther: string | null = null
): Omit<BriefPayload, "suggestedOpening" | "cacheKey"> & {
  cacheKey: string;
  cachedOpening: string | null;
  cachedOpeningKey: string | null;
} {
  const row = asRecord(raw);
  const lead = asRecord(row.lead);
  const score = asRecord(row.score);
  const lastCall = asRecord(row.lastCall);
  const triage = asRecord(row.triage);
  const inbound = asRecord(row.lastInbound);
  const cached = asRecord(row.cachedOpening);
  const answers = asRecord(lead.applicationAnswers);
  const optedInAt = asString(lead.optedInAt) ?? now;
  const daysInPipeline = Math.max(0, Math.floor((Date.parse(now) - Date.parse(optedInAt)) / 86400000));

  // The client's own list of what a setter establishes leads, so a closer can
  // see at a glance which of them the setter actually got. Where no list has
  // been given, fall back to whatever the application happened to carry.
  const setterFacts: Array<{ label: string; value: string }> =
    setterEstablishes.length > 0
      ? buildSetterFacts(setterEstablishes, answers, formatAnswer, setterEstablishesOther)
      : SETTER_FACT_KEYS.filter((key) =>
          Object.prototype.hasOwnProperty.call(answers, key)
        ).map((key) => ({ label: key, value: formatAnswer(answers[key]) }));

  if (asString(triage.summary)) {
    setterFacts.push({ label: "Triage call", value: asString(triage.summary)! });
  }
  if (setterFacts.length === 0) {
    const extra = Object.keys(answers).slice(0, 4);
    for (const key of extra) {
      setterFacts.push({ label: key, value: formatAnswer(answers[key]) });
    }
  }

  const objections = Array.isArray(row.openObjections)
    ? row.openObjections
        .map((item) => {
          const objection = asRecord(item);
          const id = asString(objection.id);
          const type = asString(objection.type) as Enums<"objection_type"> | null;
          const verbatim = asString(objection.verbatim);
          if (!id || !type || !verbatim) return null;
          return {
            id,
            type,
            verbatim,
            callId: asString(objection.callId),
            callType: (asString(objection.callType) as Enums<"call_type"> | null) ?? null,
            callOccurredAt: asString(objection.callOccurredAt),
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null)
        .slice(0, 4)
    : [];

  const quotes = Array.isArray(row.quotes)
    ? row.quotes
        .map((item) => {
          const quote = asRecord(item);
          const text = asString(quote.text);
          if (!text) return null;
          return { text, topic: asString(quote.topic) ?? "situation" };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null)
        .slice(0, 3)
    : [];

  return {
    lead: {
      id: asString(lead.id) ?? "",
      name: asString(lead.name) ?? "Unnamed lead",
      source: asString(lead.source),
      campaign: asString(lead.campaign),
      offerName: asString(lead.offerName),
      leadType: (asString(lead.leadType) as Enums<"lead_type"> | null) ?? null,
      status: (asString(lead.status) as Enums<"lead_status"> | null) ?? null,
      optedInAt,
      assignedSetterName: asString(lead.assignedSetterName),
      assignedCloserName: asString(lead.assignedCloserName),
      applicationAnswers: answers,
    },
    score: asString(score.id) && asNumber(score.total) !== null
      ? {
          id: asString(score.id)!,
          total: asNumber(score.total)!,
          timeline: asNumber(score.timeline),
          investmentCapacity: asNumber(score.investmentCapacity),
          decisionAuthority: asNumber(score.decisionAuthority),
          painSeverity: asNumber(score.painSeverity),
          triggeredBy: (asString(score.triggeredBy) as Enums<"score_trigger">) ?? "intake",
        }
      : null,
    setterFacts,
    openObjections: objections,
    lastCall: asString(lastCall.id)
      ? {
          id: asString(lastCall.id)!,
          type: (asString(lastCall.type) as Enums<"call_type">) ?? "triage",
          summary: asString(lastCall.summary),
          nextStepAgreed: asString(lastCall.nextStepAgreed),
          nextStepState: (asString(lastCall.nextStepState) as ExtractionSignalState | null) ?? null,
        }
      : null,
    quotes,
    history: {
      noShowCount: asNumber(row.noShowCount) ?? 0,
      rescheduleCount: asNumber(row.rescheduleCount) ?? 0,
      daysInPipeline,
      lastInboundAt: asString(inbound.at),
      lastInboundChannel: asString(inbound.channel),
    },
    cachedOpening: asString(cached.text),
    cachedOpeningKey: asString(cached.cacheKey),
    cacheKey: briefCacheKey(row),
  };
}

export function openingInputFromBrief(brief: BriefPayload): Record<string, string | number | null> {
  return {
    name: brief.lead.name,
    source: brief.lead.source,
    offer: brief.lead.offerName,
    score: brief.score?.total ?? null,
    track: brief.lead.leadType,
    timeline: brief.score?.timeline ?? null,
    authority: brief.score?.decisionAuthority ?? null,
    lastSummary: brief.lastCall?.summary ?? null,
    nextStep: brief.lastCall?.nextStepAgreed ?? null,
    objectionTypes: brief.openObjections.map((item) => item.type).join(", ") || null,
  };
}

export type { Json };
