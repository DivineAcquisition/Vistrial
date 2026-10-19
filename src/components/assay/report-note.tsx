/**
 * The dated note on reports whose numbers moved when Assay replaced the
 * readiness score.
 */
export const ASSAY_REPORT_NOTE =
  "From Oct 19, 2026, scores and tiers come from Assay. Qualified and ready mean Warm or higher (50 and up); Hot means 75 and up. Numbers from before that date used the old readiness score, so they may not match.";

export function AssayReportNote() {
  return <p className="mb-4 text-xs text-dim">{ASSAY_REPORT_NOTE}</p>;
}
