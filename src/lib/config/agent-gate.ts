import type { SupabaseClient } from "@supabase/supabase-js";

import { CONFIG_CONSUMERS, type ConfigConsumer } from "@/lib/config/consumers";
import type { Database } from "@/types/database";

export type AgentConfigGate =
  | { ok: true; version: string; businessDescription: string | null }
  | { ok: false; version: string; reason: string };

/**
 * The configuration check for agents that run in a person's session (the
 * Operator, Ask Vistrial), with that person's own client: no service-role key.
 * The database answers whether the run may go ahead for the sections this
 * agent declares, records a stop if not, and shares only the business
 * description its prompt needs. The person never sees the configuration.
 */
export async function checkAgentConfig(
  db: Pick<SupabaseClient<Database>, "rpc">,
  orgId: string,
  consumer: ConfigConsumer
): Promise<AgentConfigGate> {
  const declared = CONFIG_CONSUMERS[consumer];
  const { data, error } = await db.rpc("config_agent_gate", {
    p_org_id: orgId,
    p_consumer: consumer,
    p_label: declared.label,
    p_sections: [...declared.sections],
  });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) {
    return {
      ok: false,
      version: "unknown",
      reason: `${declared.label} could not read this workspace's configuration, so it did nothing. Try again shortly.`,
    };
  }
  const result = data as { ok?: boolean; version?: string; reason?: string; business_description?: string | null };
  if (result.ok) {
    return { ok: true, version: result.version ?? "unknown", businessDescription: result.business_description ?? null };
  }
  return { ok: false, version: result.version ?? "unknown", reason: result.reason ?? `${declared.label} stopped.` };
}
