/**
 * The three Strategist work tabs, as data: which skill each tab is for, which asset kind it hands
 * back, and the next steps it suggests. Suggestions never run anything: each one opens a tab with the chat
 * filled in, and the owner decides.
 */

export const WORK_TABS = ["research", "offers", "diagnostics"] as const;
export type WorkTab = (typeof WORK_TABS)[number];

export const TAB_SKILL: Record<WorkTab, string> = {
  research: "market-intelligence",
  offers: "offer-intelligence",
  diagnostics: "growth-diagnostics",
};

export const SKILL_TAB: Record<string, WorkTab> = {
  "market-intelligence": "research",
  "offer-intelligence": "offers",
  "growth-diagnostics": "diagnostics",
};

export const SKILL_ASSET = {
  "market-intelligence": "marketReport",
  "offer-intelligence": "offerAnalysis",
  "growth-diagnostics": "growthDiagnosis",
} as const;

export type TabSkill = keyof typeof SKILL_ASSET;

export function isTabSkill(slug: string): slug is TabSkill {
  return Object.hasOwn(SKILL_ASSET, slug);
}

/** What the suggestions depend on, read on the server. */
export type TabState = {
  approvedReport: boolean;
  approvedOffer: boolean;
  approvedDiagnosis: boolean;
  /** The business's own results: Meta connected, or a results file ready. */
  ownData: boolean;
  goal: boolean;
};

export type Suggestion = {
  id: string;
  title: string;
  detail: string;
  /** The tab it opens. */
  tab: WorkTab | "connections";
  /** What the chat there is filled in with. Nothing is sent until the owner presses send. */
  prompt?: string;
};

/** The next steps a tab suggests, in order. None of them runs on its own. */
export function suggestionsFor(tab: WorkTab, state: TabState): Suggestion[] {
  const out: Suggestion[] = [];
  const offers: Suggestion = {
    id: "offers-from-report",
    title: "Analyse your offer against this",
    detail: "Sets your offer beside what competitors lead with in your approved research.",
    tab: "offers",
    prompt: "Analyse my offer against my approved market research.",
  };
  const stalls: Suggestion = state.ownData
    ? {
        id: "diagnostics-from-report",
        title: "Find where growth stalls",
        detail: state.goal ? "A diagnosis from your own figures, with a 90-day roadmap toward your goal." : "A diagnosis from your own figures, with a 90-day roadmap.",
        tab: "diagnostics",
        prompt: "Find where my growth stalls.",
      }
    : {
        id: "diagnostics-connect",
        title: "Find where growth stalls",
        detail: "Connect Meta or upload a results file first, so the diagnosis reads your own figures.",
        tab: "connections",
      };
  if (tab === "research") {
    if (state.approvedReport) out.push(offers, stalls);
    else out.push({ id: "research-first", title: "Approve a report to unlock the next steps", detail: "Offers and Diagnostics build on research you have approved.", tab: "research" });
  }
  if (tab === "offers") {
    if (!state.approvedReport) {
      out.push({
        id: "research-for-offers",
        title: "Research your competitors first",
        detail: "An offer analysis builds only on approved market research.",
        tab: "research",
        prompt: "What offers do my competitors lead with?",
      });
    }
    if (state.approvedOffer) out.push(stalls);
    if (state.approvedReport && state.approvedOffer) {
      out.push({ id: "research-refresh", title: "Check the market again", detail: "Fresh research on competitors' offers before your next test.", tab: "research", prompt: "What have my competitors changed in their offers lately?" });
    }
  }
  if (tab === "diagnostics") {
    if (!state.ownData) out.push({ id: "connect-data", title: "Connect your results", detail: "Meta ads or a results file. The diagnosis reads only your own data.", tab: "connections" });
    if (state.approvedDiagnosis) {
      out.push({ id: "offers-from-diagnosis", title: "Test your offer next", detail: "Compare your offer with competitors' before scaling spend.", tab: "offers", prompt: "Analyse my offer before I scale." });
      if (!state.approvedReport) out.push({ id: "research-from-diagnosis", title: "Research your market", detail: "See what competitors lead with, with every source.", tab: "research", prompt: "What are my competitors doing to win customers?" });
    }
  }
  return out;
}
