import { extractJsonObject } from "@/lib/extraction/parse";
import type { FollowUpChannel } from "@/lib/follow-up/types";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function parseDraftModelOutput(
  raw: string,
  channel: FollowUpChannel
): { body: string; subject: string | null; quotesUsed: string[] } {
  const record = asRecord(extractJsonObject(raw));
  if (!record) throw new Error("invalid_json");
  const body = asString(record.body) ?? asString(record.message);
  if (!body) throw new Error("empty_draft");
  const subject = channel === "email" ? asString(record.subject) : null;
  const quotesRaw = record.quotes_used ?? record.quotesUsed;
  const quotesUsed = Array.isArray(quotesRaw)
    ? quotesRaw.map((item) => asString(item)).filter((item): item is string => Boolean(item))
    : [];
  return { body, subject, quotesUsed };
}
