import {
  BUSINESS_TYPES,
  AD_SPEND,
  CHANNELS,
  CLIENT_COUNTS,
  CUSTOM_TEAM_SIZES,
  FIGURES,
  FIRST_WANTS,
  OFFER_PRICES,
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
          ["Works for", labelOf(CLIENT_COUNTS, value.clientCount)],
          ["Where customers come from", value.channels.map((item) => withOther(labelOf(CHANNELS, item), value.channelsOther)).join(", ")],
          ["Monthly ad spend", labelOf(AD_SPEND, value.adSpend)],
          ["Price of main offer", labelOf(OFFER_PRICES, value.offerPrice)],
          ["Wants first", labelOf(FIRST_WANTS, value.firstWant)],
          ["Figures they could share", labelOf(FIGURES, value.figures)],
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
