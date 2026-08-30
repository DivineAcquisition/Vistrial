/**
 * Capabilities that exist in the product and must never be agent tools.
 * Tests fail if one is added to any catalog or registry.
 */
export const AGENT_FORBIDDEN_TOOLS = [
  "send_message",
  "dispatch_message",
  "approve_draft",
  "approve_follow_up",
  "retry_follow_up_send",
  "delete",
  "delete_anything",
  "activate_org",
  "change_scoring_config",
  "change_org_settings",
  "manage_members",
  "billing",
  "execute_write",
  "confirm_write",
  "call_endpoint",
  "update_crm_record",
  "generic_write",
  "run_code",
  "modify_automation",
  "modify_workflow",
  "modify_campaign",
  "cancel_booking",
  "research_person",
  "research_individual",
  "lookup_person",
] as const;

export type AgentForbiddenTool = (typeof AGENT_FORBIDDEN_TOOLS)[number];

export function isForbiddenToolName(name: string): boolean {
  const lower = name.toLowerCase();
  if ((AGENT_FORBIDDEN_TOOLS as readonly string[]).includes(name)) return true;
  if (lower.includes("send") && !lower.includes("research")) return true;
  if (lower.includes("approve")) return true;
  if (lower.includes("delete")) return true;
  if (lower.includes("dispatch")) return true;
  return false;
}
