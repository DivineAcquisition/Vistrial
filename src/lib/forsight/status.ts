import type { Tone } from "@/components/ui/tone";

import { FORSIGHT_DATASET_LABELS, type ForsightSourceSummary } from "@/lib/forsight/types";

/**
 * How a workspace's source reads on screen. Kept apart from the page so the
 * wording is testable and so "not set up yet" never gets confused with
 * "connected but returning nothing".
 */
export type ForsightConnectionView = {
  label: string;
  tone: Tone;
  detail: string;
};

const SOURCE_LABELS = {
  airtable: "Airtable",
  meta_ads: "Meta Ads",
} as const;

export function connectionView(summary: ForsightSourceSummary): ForsightConnectionView {
  if (!summary.configured) {
    return {
      label: "Not set up yet",
      tone: "warning",
      detail:
        "This workspace does not have a metrics source yet. Divine Acquisition connects it — there is nothing for you to enter here.",
    };
  }

  const sourceLabel = summary.sourceType ? SOURCE_LABELS[summary.sourceType] : "its source";
  const where = summary.label?.trim() ? `${sourceLabel} · ${summary.label.trim()}` : sourceLabel;

  if (!summary.credentialConfigured) {
    return {
      label: "Needs attention",
      tone: "critical",
      detail: `This workspace points at ${where}, but this deployment has no credential for it, so nothing can be read.`,
    };
  }

  if (summary.status === "broken") {
    return {
      label: "Needs attention",
      tone: "critical",
      detail:
        summary.lastError?.trim() ||
        `The last read from ${where} failed. Metrics stay hidden until it works again.`,
    };
  }

  if (summary.status === "inactive") {
    return {
      label: "Paused",
      tone: "neutral",
      detail: `${where} is on file for this workspace but is not being read right now.`,
    };
  }

  return { label: "Connected", tone: "good", detail: `Reading from ${where}.` };
}

/** Plain sentence naming what this workspace's base does not have. */
export function missingDatasetsSentence(summary: ForsightSourceSummary): string | null {
  if (!summary.configured || summary.missingDatasets.length === 0) return null;
  const names = summary.missingDatasets.map((dataset) => FORSIGHT_DATASET_LABELS[dataset]);
  const list =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `This base has no ${list}, so anything counted from ${names.length === 1 ? "it" : "them"} will read as unavailable rather than zero.`;
}
