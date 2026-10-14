import "server-only";

import type { CompassActor } from "@/lib/compass/actor";
import type { HelpArticle } from "@/lib/compass/help-search";
import type { CompassOutcome } from "@/lib/compass/types";

/**
 * What a question cost and how it went, without any of its words. These rows
 * feed limits, the Platform Admin usage and quality views, and the person's
 * own "used this month" line.
 */

export type LimitCheck =
  | { allowed: true; near: string | null; limits: CompassLimits }
  | { allowed: false; scope: "person_minute" | "person_day" | "workspace_day" | "workspace_month"; limits: CompassLimits };

export type CompassLimits = {
  person_per_minute: number;
  person_per_day: number;
  workspace_per_day: number;
  workspace_per_month: number;
  max_question_chars: number;
  max_turns: number;
  warn_at_percent: number;
  drafts_per_person_per_day: number;
};

export const DEFAULT_LIMITS: CompassLimits = {
  person_per_minute: 10,
  person_per_day: 100,
  workspace_per_day: 500,
  workspace_per_month: 8000,
  max_question_chars: 2000,
  max_turns: 40,
  warn_at_percent: 80,
  drafts_per_person_per_day: 10,
};

export async function consumeQuestion(actor: CompassActor): Promise<LimitCheck> {
  const { data, error } = await actor.db.rpc("compass_consume", { p_org_id: actor.orgId });
  if (error || !data) return { allowed: false, scope: "person_minute", limits: DEFAULT_LIMITS };
  const result = data as { allowed: boolean; scope?: string; near?: string | null; limits?: CompassLimits };
  const limits = { ...DEFAULT_LIMITS, ...(result.limits ?? {}) };
  if (result.allowed) return { allowed: true, near: result.near ?? null, limits };
  return { allowed: false, scope: (result.scope as Exclude<LimitCheck, { allowed: true }>["scope"]) ?? "person_minute", limits };
}

export function limitMessage(scope: Exclude<LimitCheck, { allowed: true }>["scope"]): string {
  switch (scope) {
    case "person_minute":
      return "That's a lot of questions in a minute. Give it a moment, then ask again.";
    case "person_day":
      return "You've reached today's limit for Compass questions. It resets tomorrow. If you need more, ask your team from Help.";
    case "workspace_day":
      return "This workspace has reached today's limit for Compass questions. It resets tomorrow. Your Owner can ask the team for more from Help.";
    case "workspace_month":
      return "This workspace has reached this month's limit for Compass questions. Your Owner can ask the team for more from Help.";
  }
}

export function nearMessage(near: string | null): string | null {
  if (near === "workspace_month") return "This workspace is close to this month's Compass limit.";
  if (near === "workspace_day") return "This workspace is close to today's Compass limit.";
  if (near === "person_day") return "You're close to today's Compass limit.";
  return null;
}

export async function recordUsage(
  actor: CompassActor,
  row: {
    conversationId: string | null;
    messageId: string | null;
    origin: "page" | "panel";
    route: "fast" | "reasoning" | "help" | "refused" | "none";
    model: string | null;
    inputTokens?: number;
    outputTokens?: number;
    cacheReadTokens?: number;
    costMicros?: number;
    lookups: string[];
    durationMs: number;
    firstOutputMs: number | null;
    outcome: CompassOutcome;
    errorCode?: string | null;
  }
): Promise<void> {
  const { error } = await actor.db.from("compass_usage").insert({
    org_id: actor.orgId,
    user_id: actor.userId,
    member_id: actor.memberId,
    staff: actor.isStaff,
    conversation_id: row.conversationId,
    message_id: row.messageId,
    origin: row.origin,
    route: row.route,
    model: row.model,
    input_tokens: Math.max(0, Math.round(row.inputTokens ?? 0)),
    output_tokens: Math.max(0, Math.round(row.outputTokens ?? 0)),
    cache_read_tokens: Math.max(0, Math.round(row.cacheReadTokens ?? 0)),
    cost_micros: Math.max(0, Math.round(row.costMicros ?? 0)),
    lookups: row.lookups.length,
    lookup_names: row.lookups.slice(0, 20),
    duration_ms: Math.max(0, Math.round(row.durationMs)),
    first_output_ms: row.firstOutputMs === null ? null : Math.max(0, Math.round(row.firstOutputMs)),
    outcome: row.outcome,
    error_code: row.errorCode?.slice(0, 80) ?? null,
  });
  if (error) console.error("[compass] usage not recorded", error.message);
}

export async function loadHelpArticles(actor: Pick<CompassActor, "db">): Promise<HelpArticle[]> {
  const { data } = await actor.db
    .from("help_articles")
    .select("slug, topic, question, body, link_label, link_href")
    .eq("published", true)
    .order("sort")
    .limit(500);
  return ((data ?? []) as Array<{ slug: string; topic: string; question: string; body: string; link_label: string | null; link_href: string | null }>).map((row) => ({
    slug: row.slug,
    topic: row.topic,
    question: row.question,
    body: row.body,
    linkLabel: row.link_label,
    linkHref: row.link_href,
  }));
}
