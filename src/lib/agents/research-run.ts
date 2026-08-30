import { mayResearch, researchedFactComplete, type CompanyResearchFact } from "@/lib/agents/research";

export type ResearchResult =
  | { ok: true; fact: CompanyResearchFact }
  | { ok: false; kind: "permission"; error: string };

/**
 * Companies only. No personal profiles. If no research provider is
 * configured, this is a permission result — never an empty one, and
 * never a person lookup.
 */
export function researchCompany(input: {
  companyName: string;
  providerConfigured: boolean;
}): ResearchResult {
  if (!mayResearch({ kind: "company" })) {
    return {
      ok: false,
      kind: "permission",
      error: "Research is only for companies, never for a named person.",
    };
  }
  if (!input.companyName.trim()) {
    return { ok: false, kind: "permission", error: "Name the company to look up." };
  }
  if (!input.providerConfigured) {
    return {
      ok: false,
      kind: "permission",
      error: "Company research is not configured for this workspace.",
    };
  }
  return {
    ok: false,
    kind: "permission",
    error: "Company research is not configured for this workspace.",
  };
}

export function researchPerson(name: string): ResearchResult {
  void name;
  return {
    ok: false,
    kind: "permission",
    error: "Research is only for companies, never for a named person.",
  };
}

export { researchedFactComplete };
