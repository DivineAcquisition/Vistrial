import { BRAND_KIND_WORDS } from "../../lib/brandKits";
import { DIAL_WORDS, type ChecksRecord, type CreativeContext, type CreativeSet } from "./shapes";

/** The creative as plain Markdown for the asset body. Screens draw from the saved record, not from this. */
export function renderCreative(creative: CreativeSet, context: CreativeContext, checks: ChecksRecord, notes: string[]): string {
  const lines: string[] = [];
  const kit = context.kit.content;
  lines.push(`# Ad set for ${kit.name}`, "");
  if (!checks.passed) {
    lines.push("## Needs review", "", ...checks.results.filter((row) => !row.passed).map((row) => `- ${row.name}: ${row.detail}`), ...notes.map((note) => `- ${note}`), "");
  }
  lines.push(creative.summary, "");
  lines.push("## Made for", "", `- Brand: ${kit.name} (${BRAND_KIND_WORDS[context.kit.kind]}, brand kit version ${context.kit.version})`);
  if (context.offer) lines.push(`- Offer: ${context.offer.content.name} (version ${context.offer.version})`);
  if (context.reference) {
    lines.push(`- Reference: ${context.reference.url ? `[${context.reference.title}](${context.reference.url})` : `${context.reference.title} (a file you uploaded; only its breakdown was kept)`}`, `- How close: ${DIAL_WORDS[context.dial].label}. ${DIAL_WORDS[context.dial].keeps}`);
    lines.push("- Only the structure follows the reference. Its wording, footage, faces, voice, music and logos are not reused.");
  }
  lines.push("", "## Brief", "", `- For: ${creative.brief.audience}`, `- Promise: ${creative.brief.promise}`, `- Angle: ${creative.brief.angle}`, `- Tone: ${creative.brief.tone}`, "");
  if (context.reference) {
    lines.push("## Structure followed", "", `- Hook type: ${creative.structure.hookType}`, `- Format: ${creative.structure.format}`, `- Offer type: ${creative.structure.offerType}`, `- Call to action: ${creative.structure.ctaPlacement}`);
    if (creative.structure.beats.length) lines.push(`- Beats: ${creative.structure.beats.join(" → ")}`);
    lines.push("");
  }
  lines.push("## Variations", "");
  for (const row of creative.variations) {
    lines.push(`### ${row.key}: ${row.hookType || "Variation"}`, "", `**Hook:** ${row.hook}`, "", `**Text:** ${row.primaryText}`, "", `**Headline:** ${row.headline}`, "", `**Call to action:** ${row.cta}`, "", `**Image:** ${row.imageDirection}`, "", ...(row.design.visual ? [`**Designed ad:** ${[row.design.eyebrow && `bar "${row.design.eyebrow}"`, row.design.kicker && `line "${row.design.kicker}"`, `visual: ${row.design.visual}`, row.design.labels.length ? `labels: ${row.design.labels.join(", ")}` : "", row.design.subline && `under it "${row.design.subline}"`].filter(Boolean).join("; ")}`, ""] : []), `**Tests (untested hypothesis):** ${row.hypothesis}`, "");
  }
  if (creative.script.beats.length) {
    lines.push("## Video script", "", "| Time | Voiceover | On screen |", "|---|---|---|", ...creative.script.beats.map((beat) => `| ${beat.seconds} | ${beat.voiceover.replace(/\|/g, "/")} | ${beat.onScreen.replace(/\|/g, "/")} |`), "");
  }
  if (creative.captions.length) lines.push("## Captions", "", ...creative.captions.map((caption) => `- ${caption}`), "");
  if (kit.disclaimers.length) lines.push("## Required disclaimers", "", ...kit.disclaimers.map((row) => `- ${row}`), "");
  if (creative.claims.length) lines.push("## Claims and what backs them", "", ...creative.claims.map((claim) => `- ${claim.text} (${claim.support === "offer" ? "from the offer card" : "from a verified fact"})`), "");
  if (creative.limits.length) lines.push("## Limits", "", ...creative.limits.map((row) => `- ${row}`), "");
  lines.push("## Before you publish", "", "- Vistrial does not publish. Check each platform's rule on labelling AI-made content when you upload.", "");
  return lines.join("\n");
}
