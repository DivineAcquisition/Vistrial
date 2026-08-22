import type { SupabaseClient } from "@supabase/supabase-js";

import { DISQUALIFIER_PHRASES } from "@/lib/profile/vocabulary";
import type { Database, Enums, Json } from "@/types/database";

type Db = SupabaseClient<Database>;

export type DisqualifierMatch = {
  disqualifier: Enums<"profile_disqualifier">;
  field: string;
  answer: string;
};

function answerStrings(answers: unknown): Array<{ field: string; answer: string }> {
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) return [];
  return Object.entries(answers as Record<string, unknown>).flatMap(([field, value]) =>
    typeof value === "string" && value.trim() ? [{ field, answer: value.trim() }] : []
  );
}

/**
 * Match the application answers against the disqualifiers the owner named.
 * The free-text escape is matched too, because "other" is where the vocabulary
 * did not fit and the client wrote the real thing.
 */
export function matchDisqualifiers(
  answers: unknown,
  configured: Enums<"profile_disqualifier">[],
  other: string | null
): DisqualifierMatch[] {
  const values = answerStrings(answers);
  if (values.length === 0) return [];

  const matches: DisqualifierMatch[] = [];
  for (const disqualifier of configured) {
    const phrases = [...DISQUALIFIER_PHRASES[disqualifier]];
    if (disqualifier === "other" && other) {
      phrases.push(other.toLowerCase());
    }
    if (phrases.length === 0) continue;
    for (const { field, answer } of values) {
      const haystack = answer.toLowerCase();
      if (phrases.some((phrase) => phrase.length >= 3 && haystack.includes(phrase))) {
        matches.push({ disqualifier, field, answer });
        break;
      }
    }
  }
  return matches;
}

export function disqualifierActionText(matches: DisqualifierMatch[]): string {
  const first = matches[0];
  return `Disqualified on intake: "${first.answer}" on ${first.field}. Confirm before booking a call.`;
}

/**
 * Writes the flag operators actually see. It lands as the lead's next action,
 * which the queue row already renders, so a setter reads it before dialling.
 */
export async function flagDisqualifiedLead(
  db: Db,
  args: { orgId: string; leadId: string; answers: Json }
): Promise<DisqualifierMatch[]> {
  const { data: profile } = await db
    .from("business_profiles")
    .select("disqualifiers, disqualifiers_other")
    .eq("org_id", args.orgId)
    .maybeSingle();

  if (!profile || profile.disqualifiers.length === 0) return [];

  const matches = matchDisqualifiers(
    args.answers,
    profile.disqualifiers,
    profile.disqualifiers_other
  );
  if (matches.length === 0) return [];

  const actionText = disqualifierActionText(matches);
  const { data: existing } = await db
    .from("next_actions")
    .select("id")
    .eq("org_id", args.orgId)
    .eq("lead_id", args.leadId)
    .eq("action_text", actionText)
    .is("completed_at", null)
    .maybeSingle();
  if (existing) return matches;

  await db.from("next_actions").insert({
    org_id: args.orgId,
    lead_id: args.leadId,
    action_text: actionText,
    created_by: "system",
  });

  return matches;
}
