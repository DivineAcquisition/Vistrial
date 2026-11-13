/**
 * The at-a-glance layer for an offer analysis and a growth diagnosis: counts and labels over fields the saved
 * result already has. No scores, and no words that are not already in the result.
 */
import { weakestEvidence, type EvidenceWord } from "./evidence";

export type OfferCompetitor = { competitor: string; gaps: { price: boolean; guarantee: boolean } };
export type OfferGlanceInput = {
  competitors: readonly OfferCompetitor[];
  gapsAndRisks: readonly { kind: string; basisLabel: string | null }[];
  changes: readonly { index: number; basisLabel: string | null }[];
};

/**
 * Counts for an offer analysis. `fieldsBehind` is how many of the two compared fields (price, guarantee) at
 * least one competitor states and the offer does not: the same flag the table highlights. A line with no saved
 * basis counts as an untested hypothesis, so a missing label never makes the summary look stronger.
 */
export function offerGlance(view: OfferGlanceInput) {
  const fields = (["price", "guarantee"] as const).filter((key) => view.competitors.some((row) => row.gaps[key]));
  const labels = [...view.gapsAndRisks, ...view.changes].map((row) => row.basisLabel ?? "Untested hypothesis");
  return {
    competitors: view.competitors.length,
    fieldsBehind: fields,
    gaps: view.gapsAndRisks.filter((row) => row.kind !== "risk").length,
    risks: view.gapsAndRisks.filter((row) => row.kind === "risk").length,
    changes: view.changes.length,
    weakest: weakestEvidence(labels),
  };
}

export type DiagnosisGlanceInput = { hasData: boolean; stage: string; stageFigures: readonly unknown[]; roadmap: readonly { index: number; phase: string; figures: readonly unknown[] }[]; missing: readonly string[] };

/**
 * Labels for a diagnosis, by the same rule the skill saves its evidence with (convex/skills/growthDiagnostics/
 * tools.ts): the stall stage is the business's own data when figures stand behind it and "Not enough data"
 * otherwise; a roadmap step is an inference when it cites figures and "Not enough data" when it cites none.
 */
export function stageLabel(view: Pick<DiagnosisGlanceInput, "hasData" | "stage" | "stageFigures">): EvidenceWord {
  return view.hasData && view.stage !== "unknown" && view.stageFigures.length > 0 ? "Your data" : "Not enough data";
}

export function stepLabel(step: { figures: readonly unknown[] }): EvidenceWord {
  return step.figures.length > 0 ? "Inference" : "Not enough data";
}

const PHASE_ORDER = ["fix", "build", "scale"];

/** The next step of a roadmap: the first, in Fix, Build, Scale order, that nobody has said they will try. */
export function nextRoadmapStep<T extends { index: number; phase: string }>(roadmap: readonly T[], decided: (index: number) => boolean): T | null {
  const ordered = [...roadmap].sort((a, b) => PHASE_ORDER.indexOf(a.phase) - PHASE_ORDER.indexOf(b.phase) || a.index - b.index);
  return ordered.find((row) => !decided(row.index)) ?? null;
}

export function diagnosisGlance<T extends { index: number; phase: string; figures: readonly unknown[] }>(view: Omit<DiagnosisGlanceInput, "roadmap"> & { roadmap: readonly T[] }, decided: (index: number) => boolean) {
  return {
    label: stageLabel(view),
    steps: view.roadmap.length,
    underWay: view.roadmap.filter((row) => decided(row.index)).length,
    thin: view.roadmap.filter((row) => row.figures.length === 0).length,
    missing: view.missing.length,
    next: nextRoadmapStep(view.roadmap, decided),
  };
}
