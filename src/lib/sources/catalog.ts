import type { SourceKind } from "@/types/database";

export type SourceConnectMode = "oauth" | "api_key" | "webhook" | "ghl_reuse" | "unavailable";

export type SourceCatalogEntry = {
  kind: SourceKind;
  title: string;
  unlocks: string;
  providerLabel: string;
  scopesLine: string;
  connectMode: SourceConnectMode;
};

export const SOURCE_KINDS: SourceKind[] = [
  "meta_ads",
  "google_ads",
  "stripe",
  "commas",
  "calendar",
  "form_platform",
];

export const SOURCE_CATALOG: Record<SourceKind, Omit<SourceCatalogEntry, "connectMode">> = {
  meta_ads: {
    kind: "meta_ads",
    title: "Meta Ads",
    unlocks: "Connect ad spend to see cost per lead, cost per booked call, and cost per client acquired.",
    providerLabel: "Meta",
    scopesLine: "Read-only: ads_read. Vistrial does not write to ad accounts.",
  },
  google_ads: {
    kind: "google_ads",
    title: "Google Ads",
    unlocks: "Connect ad spend to see cost per lead, cost per booked call, and cost per client acquired.",
    providerLabel: "Google",
    scopesLine:
      "Read-only: adwords.readonly. Vistrial will not request the write-capable Google Ads scope.",
  },
  stripe: {
    kind: "stripe",
    title: "Stripe",
    unlocks:
      "Connect the processor to see refunds, chargebacks, and failed payments. A refunded deal is removed from closed-won.",
    providerLabel: "Stripe",
    scopesLine: "Read-only Connect scope. Vistrial writes only to the CRM.",
  },
  commas: {
    kind: "commas",
    title: "Commas",
    unlocks:
      "Connect the processor to see refunds, chargebacks, and failed payments. A refunded deal is removed from closed-won.",
    providerLabel: "Commas",
    scopesLine: "Checkout sessions and webhooks, read-only. Refund write is not requested.",
  },
  calendar: {
    kind: "calendar",
    title: "Calendar",
    unlocks: "Connect the booking calendar to see booked versus available closer hours, and what no-shows cost in idle time.",
    providerLabel: "Calendar",
    scopesLine:
      "Availability and event metadata only. Event titles, descriptions, and attendee details are not read.",
  },
  form_platform: {
    kind: "form_platform",
    title: "Form platform",
    unlocks: "Connect the form platform to see drop-off before the CRM sees a lead, and which question loses people.",
    providerLabel: "Forms",
    scopesLine: "Inbound webhooks only. Vistrial does not write back to the form platform.",
  },
};

export const TERMINAL_CAUSE_FIX: Record<string, string> = {
  never_touched: "Work speed-to-lead. These leads never received a human touch.",
  no_show: "Unused closer time and confirmation, not more lead spend.",
  ghosted_after_one_call: "Follow-up drafts after the first call.",
  objection_unresolved: "The words on this page. A new closer script from the product will not fix this.",
  explicit_no: "Source fit. Buying more of the same leads will not fix it.",
};

export const UNEVENTFUL_FINDING =
  "Nothing in this period needs attention. That is a finding.";
