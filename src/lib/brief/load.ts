import "server-only";

import { parseBriefPayload } from "@/lib/brief/parse";
import { suggestedOpeningForBrief } from "@/lib/brief/opening";
import type { BriefPayload } from "@/lib/brief/types";
import { getAuthContext } from "@/lib/auth/session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function loadPrecallBrief(leadId: string): Promise<BriefPayload | null> {
  const ctx = await getAuthContext();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("load_org_precall_brief", {
    p_org_id: ctx.org.id,
    p_lead_id: leadId,
  });
  if (error) throw new Error(error.message || "Could not load that brief.");
  if (data == null) return null;

  const { data: profile } = await supabase
    .from("business_profiles")
    .select("setter_establishes, setter_establishes_other")
    .eq("org_id", ctx.org.id)
    .maybeSingle();

  const parsed = parseBriefPayload(
    data,
    new Date().toISOString(),
    profile?.setter_establishes ?? [],
    profile?.setter_establishes_other ?? null
  );
  const payload: BriefPayload = {
    ...parsed,
    suggestedOpening:
      parsed.cachedOpening && parsed.cachedOpeningKey === parsed.cacheKey ? parsed.cachedOpening : null,
  };
  if (payload.suggestedOpening) return payload;

  try {
    payload.suggestedOpening = await suggestedOpeningForBrief(getSupabaseAdmin(), ctx.org.id, payload);
  } catch {
    payload.suggestedOpening = null;
  }
  return payload;
}
