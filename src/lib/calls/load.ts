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
  return parseCallDetailPayload(data);
}
