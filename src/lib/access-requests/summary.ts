import {
  BUSINESS_TYPES,
  CALLS_PER_WEEK,
  CRMS,
  CUSTOM_TEAM_SIZES,
  DEAL_VALUES,
  LEAD_SOURCES,
  LEADS_PER_MONTH,
  TEAM_SIZES,
} from "@/lib/access-requests/options";
import type { AccessSubmission } from "@/lib/access-requests/validate";

type Option = { readonly value: string; readonly label: string };

function labelOf(options: readonly Option[], value: string | null): string {
  if (!value) return "";
  return options.find((row) => row.value === value)?.label ?? value;
}

function withOther(label: string, other: string | null): string {
  return other && label === "Other" ? `Other: ${other}` : label;
}

/** Every answer from a request or contact form, labeled the way the team reads it. */
export function submissionFields(value: AccessSubmission): { label: string; value: string }[] {
  const campaign = Object.entries(value.campaign)
    .map(([key, item]) => `${key}=${item}`)
    .join(", ");
  const rows: [string, string][] =
    value.kind === "private_access"
      ? [
          ["Phone", value.phone ?? ""],
          ["Website", value.website ?? ""],
          ["Business type", withOther(labelOf(BUSINESS_TYPES, value.businessType), value.businessTypeOther)],
          ["Team size", labelOf(TEAM_SIZES, value.teamSize)],
          [
            "Where leads live",
            value.leadSources
              .map((item) => withOther(labelOf(LEAD_SOURCES, item), value.leadSourcesOther))
              .join(", "),
          ],
          ["CRM", withOther(labelOf(CRMS, value.crm), value.crmOther)],
          ["Typical deal value", labelOf(DEAL_VALUES, value.dealValue)],
          ["Sales calls per week", labelOf(CALLS_PER_WEEK, value.callsPerWeek)],
          ["New leads per month", labelOf(LEADS_PER_MONTH, value.leadsPerMonth)],
          ["Main problem", value.problem ?? ""],
          ["Heard about us", value.heardAbout ?? ""],
          ["Campaign", campaign],
        ]
      : [
          ["Phone", value.phone ?? ""],
          ["Team size", labelOf(CUSTOM_TEAM_SIZES, value.teamSize)],
          ["What they need", value.need ?? ""],
          ["Campaign", campaign],
        ];
  return rows.filter(([, item]) => item.trim() !== "").map(([label, item]) => ({ label, value: item }));
}
