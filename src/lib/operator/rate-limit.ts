import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  OPERATOR_RATE_LIMIT_ORG,
  OPERATOR_RATE_LIMIT_USER,
  OPERATOR_RATE_LIMIT_WINDOW_SECONDS,
} from "@/lib/operator/constants";

export async function consumeOperatorAgentLimits(orgId: string): Promise<
  { allowed: true } | { allowed: false; error: string }
> {
  const db = await createClient();
  const user = await db.rpc("consume_operator_agent_rate_limit", {
    p_org_id: orgId,
    p_scope: "user",
    p_limit: OPERATOR_RATE_LIMIT_USER,
    p_window_seconds: OPERATOR_RATE_LIMIT_WINDOW_SECONDS,
  });
  if (user.error || !user.data || typeof user.data !== "object") {
    return { allowed: false, error: "Could not verify the rate limit. Try again." };
  }
  const userRow = user.data as { allowed?: boolean };
  if (userRow.allowed === false) {
    return {
      allowed: false,
      error: `This workspace allows ${OPERATOR_RATE_LIMIT_USER} operator-agent runs per person per hour. That limit is reached.`,
    };
  }
  const org = await db.rpc("consume_operator_agent_rate_limit", {
    p_org_id: orgId,
    p_scope: "org",
    p_limit: OPERATOR_RATE_LIMIT_ORG,
    p_window_seconds: OPERATOR_RATE_LIMIT_WINDOW_SECONDS,
  });
  if (org.error || !org.data || typeof org.data !== "object") {
    return { allowed: false, error: "Could not verify the rate limit. Try again." };
  }
  const orgRow = org.data as { allowed?: boolean };
  if (orgRow.allowed === false) {
    return {
      allowed: false,
      error: `This workspace allows ${OPERATOR_RATE_LIMIT_ORG} operator-agent runs per hour. That limit is reached.`,
    };
  }
  return { allowed: true };
}
