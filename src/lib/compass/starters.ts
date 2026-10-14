import type { CompassAccess } from "@/lib/compass/types";

/**
 * Suggested questions for the empty state. They come from the workspace's
 * template (industry.compass_questions, edited by Platform Admins), filtered
 * by who is asking, then the person's own pinned questions.
 */

export type Starter = { question: string; pinned?: boolean };

type Row = { question?: unknown; audience?: unknown };

function forAudience(audience: unknown, access: CompassAccess): boolean {
  if (audience === "everyone") return true;
  if (audience === "operators") return access === "operator";
  // "managers": owners, members, and staff working inside the workspace.
  return access !== "operator";
}

const FALLBACK: Record<"manager" | "operator", string[]> = {
  manager: [
    "Which hot leads have not been contacted in the last two days?",
    "How did our response time look this week?",
    "What are the most common objections this month?",
  ],
  operator: ["What should I follow up on first today?", "Which of my leads are at risk of missing their response window?"],
};

export function startersFor(access: CompassAccess, configValue: unknown, pins: string[] = [], limit = 5): Starter[] {
  const rows = Array.isArray(configValue) ? (configValue as Row[]) : [];
  const fromTemplate = rows
    .filter((row) => typeof row?.question === "string" && row.question.trim() && forAudience(row.audience, access))
    .map((row) => String(row.question).trim());
  const base = fromTemplate.length ? fromTemplate : FALLBACK[access === "operator" ? "operator" : "manager"];
  const pinned = pins.map((question) => ({ question, pinned: true }));
  const seen = new Set(pinned.map((item) => item.question.toLowerCase()));
  const rest = base.filter((question) => !seen.has(question.toLowerCase())).map((question) => ({ question }));
  return [...pinned, ...rest].slice(0, Math.max(limit, pinned.length));
}
