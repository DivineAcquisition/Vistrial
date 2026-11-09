import { BASIS_LABEL } from "../../lib/evidence";
import { CHANNEL_WORDS, CHANNELS, type Channel } from "./channels";
import { credit, principle } from "./playbook";
import type { ChecksRecord, OfferAnalysis, OfferContext } from "./shapes";

const OFFER_BASIS_WORDS = { stated: "As you stated it", firstParty: "Your data", insufficient: "Not enough data" } as const;

const METRIC_WORDS: Record<string, string> = {
  bookings: "bookings",
  revenue: "revenue",
  averageOrderValue: "average order value",
  costPerLead: "cost per lead",
  costPerBooking: "cost per booking",
  clickThroughRate: "click-through rate",
  leadToBookingRate: "lead-to-booking rate",
  callVolume: "calls",
  conversionRate: "conversion rate",
  inquiries: "inquiries",
  replyRate: "reply rate",
  bookedCalls: "booked calls",
  closeRate: "close rate",
  referralsPerMonth: "referrals a month",
  repeatPurchaseRate: "repeat purchase rate",
};

function principles(ids: string[]) {
  return ids
    .map(principle)
    .filter((row) => row !== null)
    .map((row) => `${row.name} (${credit(row)})`)
    .join("; ");
}

function basisWords(basis: keyof typeof BASIS_LABEL | null) {
  return basis ? BASIS_LABEL[basis] : "No basis";
}

/** The analysis as plain Markdown for the asset body. Claims and their sources are also saved as evidence rows. */
export function renderAnalysis(analysis: OfferAnalysis, context: OfferContext, checks: ChecksRecord, notes: string[]): string {
  const lines: string[] = [];
  lines.push("# Offer analysis", "", analysis.summary, "");
  if (analysis.offerPosition.text) {
    lines.push("## Offer position", "", analysis.offerPosition.text, "");
    if (analysis.offerPosition.principleIds.length) lines.push(`_Principles: ${principles(analysis.offerPosition.principleIds)}_`, "");
  }
  if (!checks.passed) {
    lines.push("## Needs review", "", "This draft did not pass every completion check:", "");
    for (const row of checks.results.filter((item) => !item.passed)) lines.push(`- **${row.name}.** ${row.detail}`);
    for (const note of notes) lines.push(`- ${note}`);
    lines.push("");
  }
  const offer = analysis.currentOffer;
  lines.push(
    "## Your offer",
    "",
    `- **What you sell:** ${offer.product}`,
    `- **Price:** ${offer.price}`,
    `- **Guarantee:** ${offer.guarantee}`,
    `- **Terms:** ${offer.terms}`,
    `- _${OFFER_BASIS_WORDS[offer.basis]}_`,
    "",
  );
  lines.push("## What competitors lead with", "");
  if (analysis.competitorOffers.length === 0) lines.push("- None could be taken from the approved research.");
  // Grouped by the channel each offer was seen on, from the cited sources' platforms, never the model's word.
  const channelOf = new Map(context.researchSources.map((row) => [row.id, row.channel]));
  const groups = new Map<Channel | "other", string[]>();
  for (const row of analysis.competitorOffers) {
    const terms = [row.price && `price: ${row.price}`, row.guarantee && `guarantee: ${row.guarantee}`].filter(Boolean).join("; ");
    const line = `- **${row.competitor}:** ${row.offer}${terms ? ` (${terms})` : ""} _(${basisWords(row.basis)}, ${row.sourceRefIds.length} source${row.sourceRefIds.length === 1 ? "" : "s"})_`;
    const seen = new Set(row.sourceRefIds.map((id) => channelOf.get(id)).filter((channel): channel is Channel => Boolean(channel)));
    for (const channel of seen.size ? seen : new Set(["other" as const])) groups.set(channel, [...(groups.get(channel) ?? []), line]);
  }
  for (const channel of [...CHANNELS, "other" as const]) {
    const rows = groups.get(channel);
    if (!rows) continue;
    lines.push("", `**${channel === "other" ? "Other" : CHANNEL_WORDS[channel]}**`, "", ...rows);
  }
  lines.push("", "## Gaps and risks", "");
  if (analysis.gapsAndRisks.length === 0) lines.push("- None found.");
  for (const row of analysis.gapsAndRisks) lines.push(`- **${row.kind === "risk" ? "Risk" : "Gap"}:** ${row.statement} _(${basisWords(row.basis)})_`);
  lines.push("", "## Changes to test", "");
  analysis.changes.forEach((row, i) => {
    lines.push(
      `### ${i + 1}. ${row.title}`,
      "",
      `- **Evidence:** ${row.evidence.text} _(${basisWords(row.evidence.basis)}${row.evidence.sourceRefIds.length ? `, ${row.evidence.sourceRefIds.length} source${row.evidence.sourceRefIds.length === 1 ? "" : "s"}` : ""})_`,
      `- **Why it fits this business:** ${row.fit.text}`,
      `- **Channel:** ${row.channel ? CHANNEL_WORDS[row.channel] : "Not stated"}${row.newChannel ? " _(new for this business)_" : ""}`,
      `- **Principle:** ${principles(row.principleIds) || "None named"}`,
      `- **Proposed change:** ${row.proposedChange}`,
      `- **How to tell if it worked:** ${row.validationMethod}${row.metric ? ` _(measure: ${METRIC_WORDS[row.metric]})_` : ""}`,
      "",
    );
  });
  lines.push("## Limits", "");
  if (analysis.limits.length === 0) lines.push("- None reported.");
  for (const row of analysis.limits) lines.push(`- ${row}`);
  lines.push("", "## Built on", "");
  const used = context.reports.filter((row) => analysis.contextUsed.reportIds.includes(row.assetId));
  for (const report of used) lines.push(`- Approved market report: ${report.title} (version ${report.version})`);
  lines.push(context.profile && analysis.contextUsed.profileVersionId ? "- The confirmed business profile." : "- No confirmed business profile.");
  for (const fact of context.facts.filter((row) => analysis.contextUsed.factIds.includes(row.id))) {
    lines.push(`- ${fact.factKey}: ${fact.value} _(${fact.status}, recorded ${new Date(fact.recordedAt).toISOString().slice(0, 10)})_`);
  }
  lines.push("", "_This analysis does not change your offer. A competitor leading with an offer is not evidence that it works. Principles are summarized in our own words and credited to their authors; they guide the shape of a change, not the evidence for it._");
  return lines.join("\n");
}
