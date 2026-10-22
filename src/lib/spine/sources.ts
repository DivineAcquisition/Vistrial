import type { IdentitySource } from "@/lib/spine/identity";

const BY_CONNECTOR: Record<string, IdentitySource> = {
  gohighlevel: "crm",
  hubspot: "crm",
  salesforce: "crm",
  airtable: "crm",
  google_calendar: "calendar",
  outlook_calendar: "calendar",
  gmail: "gmail",
  outlook: "outlook",
  fathom: "transcript",
  fireflies: "transcript",
  file_upload: "upload",
  spreadsheet: "upload",
  manual: "manual",
  forms: "form",
};

export function identitySourceFor(connectorKey: string): IdentitySource {
  return BY_CONNECTOR[connectorKey] ?? "webhook";
}
