/**
 * Entitlement keys for routing and push. No limit is applied until a plan
 * metadata value is set (limit_routing_rules, and the same for the others).
 * Protective rate limits elsewhere stay in force.
 */

export const ENTITLEMENT_KEYS = [
  { key: "routing_rules", label: "Routing rules", metadata: "limit_routing_rules" },
  { key: "routing_pools", label: "Routing pools", metadata: "limit_routing_pools" },
  { key: "push_devices", label: "Push devices per person", metadata: "limit_push_devices" },
] as const;

export type EntitlementKey = (typeof ENTITLEMENT_KEYS)[number]["key"];

/** Null means no cap. A number, including zero, is a cap from plan metadata. */
export function appliedLimit(planLimits: Record<string, number>, key: EntitlementKey): number | null {
  if (Object.prototype.hasOwnProperty.call(planLimits, key)) return planLimits[key] ?? null;
  return null;
}

export function withinEntitlement(used: number, limit: number | null): boolean {
  if (limit == null) return true;
  return used < limit;
}

export type UsageKind = "meaning_search" | "push_send" | "routing_decision";

export const MEANING_SEARCH_HOURLY_LIMIT = 30;
