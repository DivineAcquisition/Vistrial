/**
 * The five evidence labels a person sees (the words are set on the server, in convex/lib/evidence.ts), in
 * order from weakest to strongest. A summary line carries the weakest label of what it summarises, so a
 * verdict resting on one inference never reads as observed.
 */
export const EVIDENCE_ORDER = ["Not enough data", "Untested hypothesis", "Inference", "Observed", "Your data"] as const;
export type EvidenceWord = (typeof EVIDENCE_ORDER)[number];

/** What each label means, in one line. Shown under the label on hover, focus and in the legend. */
export const EVIDENCE_MEANING: Record<EvidenceWord, string> = {
  "Not enough data": "There is too little to say anything. No claim is made.",
  "Untested hypothesis": "An idea with no source behind it yet. Try it and measure.",
  Inference: "A reading of the sources. It cites them, but it is a judgement.",
  Observed: "Seen or counted directly in a source that was read.",
  "Your data": "From your own connected results or files.",
};

export function isEvidenceWord(label: string): label is EvidenceWord {
  return (EVIDENCE_ORDER as readonly string[]).includes(label);
}

/** The weakest of the labels given. Null when there are none. An unknown label counts as an inference. */
export function weakestEvidence(labels: readonly string[]): EvidenceWord | null {
  let weakest: number | null = null;
  for (const label of labels) {
    const at = isEvidenceWord(label) ? EVIDENCE_ORDER.indexOf(label) : EVIDENCE_ORDER.indexOf("Inference");
    if (weakest === null || at < weakest) weakest = at;
  }
  return weakest === null ? null : EVIDENCE_ORDER[weakest];
}

/**
 * The weakest label among lines that make a claim. A "Not enough data" line makes none (it only says what is
 * missing), so it does not drag a summary of real findings down to "Not enough data"; it is still counted and
 * shown beside the summary. When every line is "Not enough data", so is the summary.
 */
export function weakestClaim(labels: readonly string[]): EvidenceWord | null {
  const claims = labels.filter((label) => label !== "Not enough data");
  return weakestEvidence(claims.length > 0 ? claims : labels);
}

/** How many of each label, in weakest-first order, leaving out labels with none. For "3 observed, 2 inferences". */
export function evidenceCounts(labels: readonly string[]): { label: EvidenceWord; count: number }[] {
  return EVIDENCE_ORDER.map((label) => ({ label, count: labels.filter((row) => (isEvidenceWord(row) ? row : "Inference") === label).length })).filter((row) => row.count > 0);
}
