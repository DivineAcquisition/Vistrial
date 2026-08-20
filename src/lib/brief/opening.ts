import "server-only";

import { anthropicApiKey, createAnthropicMessage } from "@/lib/extraction/anthropic";
import { openingInputFromBrief } from "@/lib/brief/parse";
import type { BriefPayload } from "@/lib/brief/types";
import { transcriptLog } from "@/lib/transcripts/log";
import type { GhlDb } from "@/lib/ghl/tokens";

const OPENING_SYSTEM =
  "Write one or two sentences a closer may use to open a sales call. No pitch. No transcript. Name the prospect and the one fact that should be confirmed first. If nothing is known, say the closer should ask what brought them in. Return plain text only.";

export async function suggestedOpeningForBrief(
  db: GhlDb,
  orgId: string,
  brief: BriefPayload
): Promise<string | null> {
  const { data: cached } = await db
    .from("brief_openings")
    .select("opening_text")
    .eq("org_id", orgId)
    .eq("lead_id", brief.lead.id)
    .eq("cache_key", brief.cacheKey)
    .maybeSingle();
  if (cached?.opening_text) return cached.opening_text;

  if (!anthropicApiKey()) return null;

  const facts = openingInputFromBrief(brief);
  const result = await createAnthropicMessage({
    system: OPENING_SYSTEM,
    user: JSON.stringify(facts),
    maxTokens: 120,
  });
  const text = result.text.replace(/\s+/g, " ").trim();
  if (!text) return null;

  await db.from("brief_openings").upsert(
    {
      org_id: orgId,
      lead_id: brief.lead.id,
      cache_key: brief.cacheKey,
      opening_text: text,
      model_version: result.model,
    },
    { onConflict: "lead_id,cache_key" }
  );
  transcriptLog("brief.opening.generated", {
    leadId: brief.lead.id,
    model: result.model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  });
  return text;
}
