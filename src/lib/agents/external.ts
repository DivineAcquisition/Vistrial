import type { ExternalOperationId } from "@/lib/agents/types";

/** External writes attribute to Vistrial, never a person. */
export const EXTERNAL_WRITE_ATTRIBUTION = "Vistrial";

export const ALLOWLISTED_EXTERNAL_WRITES: readonly ExternalOperationId[] = [
  "crm.add_tag",
  "crm.write_note",
  "crm.update_allowlisted_field",
  "crm.move_pipeline_stage",
  "crm.create_task",
  "crm.update_opportunity_value",
  "calendar.create_hold",
];

export function isAllowlistedExternalWrite(kind: string): kind is ExternalOperationId {
  return (ALLOWLISTED_EXTERNAL_WRITES as readonly string[]).includes(kind);
}

export function isReversibleExternalWrite(kind: ExternalOperationId): boolean {
  return (
    kind === "crm.add_tag" ||
    kind === "crm.update_allowlisted_field" ||
    kind === "crm.move_pipeline_stage" ||
    kind === "crm.update_opportunity_value"
  );
}

export function externalWriteApp(kind: ExternalOperationId): "crm" | "calendar" {
  return kind.startsWith("calendar.") ? "calendar" : "crm";
}

/**
 * Adding an external write is a code change. There is no generic
 * "update CRM record" or "call this endpoint" tool.
 */
export function genericWriteToolNames(): readonly string[] {
  return [
    "update_crm_record",
    "call_endpoint",
    "execute_code",
    "run_sql",
    "generic_write",
    "http_request",
  ];
}

export function isForbiddenExternalTarget(kind: string): boolean {
  const lower = kind.toLowerCase();
  return (
    lower.includes("delete") ||
    lower.includes("automation") ||
    lower.includes("workflow") ||
    lower.includes("campaign") ||
    lower.includes("trigger") ||
    lower.includes("billing") ||
    lower.includes("subscription") ||
    lower.includes("permission") ||
    lower.includes("cancel_booking") ||
    lower.includes("modify_booking")
  );
}
