import "server-only";

import { getAuthContext } from "@/lib/auth/session";
import { parseCallDetailPayload, parseCallListPayload } from "@/lib/calls/parse";
import { CALL_PAGE_SIZE, type CallDetailPayload, type CallListPayload } from "@/lib/calls/types";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

export async function loadOrgCallList(opts?: {
  cursor?: { at: string; id: string } | null;
  limit?: number;
}): Promise<CallListPayload> {
  const ctx = await getAuthContext();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("load_org_call_list", {
    p_org_id: ctx.org.id,
    p_cursor: (opts?.cursor ?? null) as Json | null,
    p_limit: opts?.limit ?? CALL_PAGE_SIZE,
  });
  if (error) throw new Error(error.message || "Could not load calls.");
  return parseCallListPayload(data);
}

export async function loadOrgCallDetail(callId: string): Promise<CallDetailPayload | null> {
  const ctx = await getAuthContext();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("load_org_call_detail", {
    p_org_id: ctx.org.id,
    p_call_id: callId,
  });
  if (error) throw new Error(error.message || "Could not load that call.");
  if (data == null) return null;
  const parsed = parseCallDetailPayload(data);
  if (!parsed?.extraction) return parsed;
  const { data: verification } = await supabase
    .from("call_extractions")
    .select("verification_status, verification_faults, verification_attempt")
    .eq("id", parsed.extraction.id)
    .eq("org_id", ctx.org.id)
    .maybeSingle();
  if (!verification) return parsed;
  parsed.extraction.verificationStatus =
    verification.verification_status === "passed" || verification.verification_status === "needs_review"
      ? verification.verification_status
      : "unchecked";
  parsed.extraction.verificationFaults = Array.isArray(verification.verification_faults)
    ? (verification.verification_faults as Array<{ code?: unknown; where?: unknown; what?: unknown }>)
        .map((item) => ({
          code: typeof item.code === "string" ? item.code : "",
          where: typeof item.where === "string" ? item.where : "output",
          what: typeof item.what === "string" ? item.what : "",
        }))
        .filter((item) => item.code && item.what)
    : [];
  parsed.extraction.verificationAttempt = verification.verification_attempt ?? 0;
  return parsed;
}
