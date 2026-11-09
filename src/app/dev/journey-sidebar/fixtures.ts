import { CATALOG } from "../../../../convex/catalog";
import type { HomeOverview } from "@/components/home/loop-home";
import type { SearchHit } from "@/components/shell/journey-sidebar";
import type { ShellAgent } from "@/components/shell/shell-context";

/** The catalog as the shell reads it, with Growth Architect on. */
export const STORY_AGENTS: ShellAgent[] = CATALOG.map((row) => ({
  slug: row.slug,
  name: row.name,
  number: row.number,
  department: row.department,
  status: row.status,
  lifecycle: row.lifecycle,
  job: row.job,
  promise: row.promise,
  sort: row.sort,
  skills: row.skills.map((skill) => ({ slug: skill.slug, name: skill.name, handsBack: skill.handsBack, promise: skill.promise, status: skill.status, sort: skill.sort })),
  state: row.status === "live" ? "on" : "off",
}));

export function storyOverview(state: string): HomeOverview {
  const empty = state === "empty";
  return {
    workspaceName: "Bright Nest Cleaning",
    role: state === "rep" ? "rep" : "owner",
    actionable: state !== "rep",
    waiting: empty ? { total: 0, questions: 0, checkIns: 0, approvals: 0 } : { total: 4, questions: 1, checkIns: 1, approvals: 2 },
    loop: empty ? { understand: 20, research: 0, decide: 0, try: 0, measure: 0 } : { understand: 60, research: 1, decide: 2, try: 3, measure: 1 },
    knowledge: {
      items: [
        { key: "profile", label: "Confirmed business profile", done: true, href: "/app/profile" },
        { key: "facts", label: "Business facts", done: !empty, href: "/app/agents/growth-architect/memory" },
        { key: "results", label: "Results file", done: false, href: "/app/connections/results" },
        { key: "meta", label: "Meta ads connected", done: !empty, href: "/app/connections/meta" },
        { key: "outcome", label: "A recorded outcome", done: false, href: "/app" },
      ],
      percent: empty ? 20 : 60,
      next: empty
        ? { key: "facts", label: "Add facts about your business", href: "/app/agents/growth-architect/memory" }
        : { key: "results", label: "Upload a results file", href: "/app/connections/results" },
    },
    agents: empty ? {} : { "growth-architect": { working: 1, waiting: 4 } },
  };
}

export const STORY_HITS: SearchHit[] = [
  { kind: "session", id: "p1", title: "Austin deep cleaning", href: "/app/agents/growth-architect/sessions/p1" },
  { kind: "asset", id: "a1", title: "Austin deep cleaning: market report", href: "/app/assets/a1" },
  { kind: "session", id: "p2", title: "Move-out pricing in Austin", href: "/app/agents/growth-architect/sessions/p2" },
];
