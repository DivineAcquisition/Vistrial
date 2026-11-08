/**
 * The live activity feed for a research run, built from the run's own steps and the sources it kept.
 * Plain words only: what the agent did, in the order it did it. Never model names or page text.
 */

import { PLATFORM_LABEL } from "./words";

export type ActivityTone = "good" | "warning" | "critical" | "neutral" | "brand";

/** Icon names map to lucide icons in the component, so this file stays free of React. */
export type ActivityIcon =
  | "memory"
  | "question"
  | "brief"
  | "search"
  | "collect"
  | "read"
  | "count"
  | "target"
  | "write"
  | "check"
  | "revise"
  | "save"
  | "skip"
  | "failed"
  | "links"
  | "work";

export type ActivityStep = {
  phase?: string | null;
  status: string;
  kind: string;
  resultCode: string;
  webSearches?: number;
  webFetches?: number;
  /** When the step finished. Missing on story fixtures. */
  at?: number;
};

export type ActivitySource = { id: string; platform: string; title: string; publisher?: string | null; origin?: string };

export type ActivityItem = {
  key: string;
  icon: ActivityIcon;
  title: string;
  detail: string | null;
  tone: ActivityTone;
  at: number | null;
  /** Sources this item found, for the tiles under it. */
  sources?: ActivitySource[];
};

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

/** "12 YouTube, 8 Web, 2 TikTok", largest first. */
export function platformMix(sources: ActivitySource[]) {
  const counts = new Map<string, number>();
  for (const row of sources) counts.set(row.platform, (counts.get(row.platform) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([platform, n]) => `${n} ${PLATFORM_LABEL[platform] ?? platform}`)
    .join(", ");
}

function stepWords(step: ActivityStep): Omit<ActivityItem, "key" | "at"> {
  if (step.status === "failed") return { icon: "failed", title: "This step failed", detail: "The run stopped here. Every step has the details.", tone: "critical" };
  switch (step.phase) {
    case "context":
      return step.resultCode === "missing_context"
        ? { icon: "memory", title: "Read your business memory", detail: "Something it needs to know is missing.", tone: "warning" }
        : { icon: "memory", title: "Read your business memory", detail: "Profile and business facts loaded for this assignment.", tone: "good" };
    case "ask":
      return { icon: "question", title: "Asked you one question", detail: "Nothing runs or spends while it waits for the answer.", tone: "warning" };
    case "brief":
      return { icon: "brief", title: "Wrote the task brief", detail: "The questions to answer and the searches to run, before any research.", tone: "neutral" };
    case "research": {
      const searches = step.webSearches ?? 0;
      const fetches = step.webFetches ?? 0;
      return {
        icon: "search",
        title: "Searched the web",
        detail: searches || fetches ? `${plural(searches, "search", "searches")}, ${plural(fetches, "page")} read.` : "Looked for competitors, offers and ads.",
        tone: "neutral",
      };
    }
    case "collect":
      return { icon: "collect", title: "Collected sources", detail: "From each source it is allowed to use, with the link to the original.", tone: "neutral" };
    case "classify":
      return { icon: "read", title: "Read each source", detail: "Noted the hook, offer and call to action, apart from what it infers.", tone: "neutral" };
    case "applyClassification":
      return { icon: "read", title: "Filed what each source shows", detail: null, tone: "neutral" };
    case "compute":
      return { icon: "count", title: "Counted patterns across sources", detail: "Counts come from code, not from the model.", tone: "neutral" };
    case "prioritize":
      return { icon: "target", title: "Picked the opportunities for your business", detail: null, tone: "neutral" };
    case "write":
      return { icon: "write", title: "Wrote the report", detail: "Every claim points to its sources.", tone: "neutral" };
    case "check":
    case "recheck":
      return step.resultCode === "passed"
        ? { icon: "check", title: step.phase === "recheck" ? "Checked again: all eight rules passed" : "Checked the report: all eight rules passed", detail: null, tone: "good" }
        : { icon: "check", title: step.phase === "recheck" ? "Checked again: some rules still fail" : "Checked the report: some rules failed", detail: "It fixes the report once if the budget allows.", tone: "warning" };
    case "revise":
      return step.kind === "note"
        ? { icon: "skip", title: "Skipped the revision", detail: "The budget held back could not cover it.", tone: "warning" }
        : { icon: "revise", title: "Revised the report once", detail: "The first version is kept.", tone: "neutral" };
    case "save":
      return step.resultCode === "needs_review"
        ? { icon: "save", title: "Saved the report for your review", detail: "Some checks did not pass. It says which, and why.", tone: "warning" }
        : { icon: "save", title: "Saved the report", detail: "Ready for you to review and approve.", tone: "good" };
    default:
      return step.kind === "note" && step.resultCode === "over_budget"
        ? { icon: "skip", title: "Skipped a step to stay within budget", detail: null, tone: "warning" }
        : { icon: "work", title: "Worked on the assignment", detail: null, tone: "neutral" };
  }
}

/** What the agent is doing right now, from the last step it finished. */
export function nowWords(steps: ActivityStep[], status: string | null): string | null {
  if (status === "waiting") return "Waiting for your answer";
  if (status === "needsInput") return "Waiting for your answer";
  if (status !== "running" && status !== "queued") return null;
  const last = steps.at(-1);
  if (!last) return "Reading your business memory";
  switch (last.phase) {
    case "context":
    case "ask":
      return "Writing the task brief";
    case "brief":
      return "Searching the web";
    case "research":
      return "Collecting sources";
    case "collect":
      return "Reading each source";
    case "classify":
    case "applyClassification":
      return "Counting patterns across sources";
    case "compute":
      return "Picking the opportunities";
    case "prioritize":
      return "Writing the report";
    case "write":
    case "revise":
      return "Checking the report";
    case "check":
      return last.resultCode === "passed" ? "Saving the report" : "Revising the report";
    case "recheck":
      return "Saving the report";
    default:
      return "Working";
  }
}

/**
 * The feed, oldest first. Sources the person supplied come first; sources the agent found sit under the
 * collect step that kept them. The tiles show at most `tiles` sources per item.
 */
export function activityFeed(steps: ActivityStep[], sources: ActivitySource[], tiles = 6): ActivityItem[] {
  const supplied = sources.filter((row) => row.origin === "supplied");
  const found = sources.filter((row) => row.origin !== "supplied");
  const items: ActivityItem[] = [];
  if (supplied.length > 0) {
    items.push({ key: "supplied", icon: "links", title: `You gave ${plural(supplied.length, "link")}`, detail: platformMix(supplied), tone: "neutral", at: null, sources: supplied.slice(0, tiles) });
  }
  let foundPlaced = false;
  steps.forEach((step, index) => {
    items.push({ key: `step-${index}`, at: step.at ?? null, ...stepWords(step) });
    if (step.phase === "collect" && !foundPlaced && found.length > 0) {
      foundPlaced = true;
      items.push({
        key: "found",
        icon: "collect",
        title: `Kept ${plural(found.length, "source")}`,
        detail: platformMix(found),
        tone: "good",
        at: step.at ?? null,
        sources: found.slice(0, tiles),
      });
    }
  });
  return items;
}

/** Totals for the counters. */
export function activityTotals(steps: ActivityStep[]) {
  let searches = 0;
  let pages = 0;
  for (const step of steps) {
    searches += step.webSearches ?? 0;
    pages += step.webFetches ?? 0;
  }
  return { searches, pages, steps: steps.length };
}

/** "4:05" from milliseconds. */
export function clock(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
}
