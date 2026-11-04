/** Plain words for research screens. Labels live here so every screen says the same thing. */

type Tone = "good" | "warning" | "critical" | "neutral";

export const PLATFORM_LABEL: Record<string, string> = {
  web: "Web",
  youtube: "YouTube",
  tiktok: "TikTok",
  instagram: "Instagram",
  metaAdLibrary: "Meta Ad Library",
  customerData: "Your data",
};

export const PLATFORMS = ["web", "youtube", "tiktok", "instagram", "metaAdLibrary"] as const;
export type PlatformSlug = (typeof PLATFORMS)[number];

export const SOURCE_STATE_WORDS: Record<string, { label: string; tone: Tone }> = {
  available: { label: "Worked", tone: "good" },
  partial: { label: "Partly", tone: "warning" },
  unavailable: { label: "Not available", tone: "neutral" },
  awaitingAuthorization: { label: "Waiting for approval", tone: "warning" },
};

export const FACT_STATUS_WORDS: Record<string, { label: string; tone: Tone }> = {
  verified: { label: "Verified", tone: "good" },
  unverified: { label: "Not verified", tone: "warning" },
  disputed: { label: "Disputed", tone: "critical" },
  superseded: { label: "Replaced", tone: "neutral" },
};

export const FACT_SOURCE_WORDS: Record<string, string> = {
  owner: "stated by your team",
  agent: "found by an agent",
  assumption: "an assumption",
  upload: "from an upload",
  feedback: "from feedback",
};

/** The doctrine's five stages, and which skill phases belong to each (doctrine 1.1). */
export const STAGES = [
  { id: "observe", label: "Observe", words: "Reads your context and collects sources.", phases: ["context", "ask", "brief", "research", "collect"] },
  { id: "distinguish", label: "Distinguish", words: "Keeps what sources show apart from what it infers.", phases: ["classify", "applyClassification", "compute"] },
  { id: "prioritize", label: "Prioritize", words: "Picks what matters most for your business.", phases: ["prioritize"] },
  { id: "create", label: "Create", words: "Writes the report.", phases: ["write", "revise"] },
  { id: "validate", label: "Validate", words: "Checks the report against eight rules in code.", phases: ["check", "recheck", "save"] },
] as const;

export const UNCERTAINTY_WORDS: Record<string, { label: string; tone: Tone }> = {
  none: { label: "Backed by sources", tone: "good" },
  hypothesis: { label: "Untested hypothesis", tone: "warning" },
  insufficient: { label: "Not enough data", tone: "neutral" },
};

/** A Convex error as one plain sentence. Server messages are already written for people. */
export function errorWords(error: unknown, fallback: string) {
  if (!(error instanceof Error)) return fallback;
  const line = error.message.replace(/^[\s\S]*?Uncaught Error: /, "").split("\n")[0].trim();
  return line && !line.startsWith("[CONVEX") ? line : fallback;
}

export function shortDate(time: number) {
  return new Date(time).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function money(cents: number) {
  return cents >= 100 ? `$${(cents / 100).toFixed(2)}` : `${Math.round(cents)}¢`;
}
