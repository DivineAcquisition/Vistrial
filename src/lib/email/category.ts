import type { EmailCategory } from "@/lib/email/footer";

const PRODUCT = new Set([
  "speed_to_lead",
  "unassigned_ready",
  "approaching_ghost",
  "pending_draft",
  "call_starting_soon",
  "unmatched_transcript",
  "ingestion_stalled",
  "crm_broken",
  "job_failure",
  "adoption_warning",
  "daily_brief",
  "hourly_summary",
  "test_send",
  "workspace_notice",
  "api_key_notice",
  "webhook_notice",
]);

/** Product notification events map to a footer. Unknown events do not send. */
export function categoryForEvent(eventType: string): EmailCategory | null {
  if (eventType === "billing_issue") return "B";
  if (eventType === "help_reply") return "H";
  if (eventType === "help_request") return "I";
  if (
    eventType === "data_request" ||
    eventType === "export_ready" ||
    eventType === "export_failed" ||
    eventType === "export_expiring" ||
    eventType === "report_ready"
  ) {
    return "G";
  }
  if (eventType === "client_report_review") return "I";
  if (eventType === "onboarding") return "E";
  if (PRODUCT.has(eventType)) return "C";
  return null;
}
