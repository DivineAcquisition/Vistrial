import { CATALOG } from "../../../../convex/catalog";
import type { HomeOverview, SearchHit } from "@/components/shell/journey-sidebar";
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
    nav: empty ? { tasks: 0, briefing: 0 } : { tasks: 3, briefing: 5 },
    workspaceName: "Northlight Growth",
    role: state === "rep" ? "viewer" : "owner",
    actionable: state !== "rep",
    waiting: empty ? { total: 0, questions: 0, checkIns: 0, approvals: 0 } : { total: 4, questions: 1, checkIns: 1, approvals: 2 },
    loop: empty ? { understand: 20, research: 0, decide: 0, try: 0, measure: 0 } : { understand: 60, research: 1, decide: 2, try: 3, measure: 1 },
    knowledge: {
      items: [
        { key: "profile", label: "Confirmed business profile", done: true, href: "/app/profile" },
        { key: "facts", label: "Business facts", done: !empty, href: "/app/settings?section=memory" },
        { key: "results", label: "Results file", done: false, href: "/app/connections/results" },
        { key: "meta", label: "Meta ads connected", done: !empty, href: "/app/connections/meta" },
        { key: "outcome", label: "A recorded outcome", done: false, href: "/app" },
      ],
      percent: empty ? 20 : 60,
      next: empty
        ? { key: "facts", label: "Add facts about your business", href: "/app/settings?section=memory" }
        : { key: "results", label: "Upload a results file", href: "/app/connections/results" },
    },
    agents: empty ? {} : { "growth-architect": { working: 1, waiting: 4 } },
    skills: empty ? {} : { "market-intelligence": { running: 1, review: 1 }, "offer-intelligence": { running: 0, review: 1 } },
  };
}

export const STORY_HITS: SearchHit[] = [
  { kind: "session", id: "p1", title: "Lead-gen retainers for home-service brands", href: "/app/agents/growth-architect/sessions/p1" },
  { kind: "asset", id: "a1", title: "Home-service lead generation: market report", href: "/app/assets/a1" },
  { kind: "session", id: "p2", title: "Paid ads management pricing", href: "/app/agents/growth-architect/sessions/p2" },
];
