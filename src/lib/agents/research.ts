export type CompanyResearchFact = {
  companyName: string;
  fact: string;
  source: string;
  foundAt: Date;
};

export function researchTargetKind(target: { kind: "company" | "person" }): "company" | "person" {
  return target.kind;
}

export function mayResearch(target: { kind: "company" | "person" }): boolean {
  return target.kind === "company";
}

export function researchedFactComplete(fact: CompanyResearchFact): boolean {
  return Boolean(fact.companyName && fact.fact && fact.source && fact.foundAt);
}

/** Visual class for researched facts vs what a prospect said. */
export const RESEARCH_VISUAL_CLASS = "research-not-said";
export const PROSPECT_SAID_VISUAL_CLASS = "prospect-said";
