import { AGENTS, type LiveAgentId } from "@/lib/agents/roster";

/**
 * Staged activation, in the order agents are switched on after go-live is
 * approved. Names come from the roster; the copy here only says what each
 * step means for the customer.
 */

export type ActivationStage = "off" | "watch" | "on" | "drafts_only" | "coming_soon";

export type ActivationRow = { agent: LiveAgentId; stage: ActivationStage; order: number; activated_at?: string | null };

export const ACTIVATION_ORDER: LiveAgentId[] = ["scribe", "sentry", "relay", "compass"];

export const ACTIVATION_STAGE_LABEL: Record<ActivationStage, string> = {
  off: "Off",
  watch: "Watching only",
  on: "On",
  drafts_only: "Drafts only",
  coming_soon: "Coming soon",
};

export function activationStepCopy(agent: LiveAgentId, watchDays: number): { title: string; plain: string } {
  const name = AGENTS[agent].name;
  switch (agent) {
    case "scribe":
      return { title: `${name} switches on`, plain: `${name} starts building and updating case files from your calls. It never contacts a lead.` };
    case "sentry":
      return {
        title: `${name} watches first`,
        plain:
          watchDays > 0
            ? `For the first ${watchDays === 1 ? "day" : `${watchDays} days`}, ${name} only records what it would have flagged, so you can see it working. It tells nobody. Then your team switches its alerts on.`
            : `${name} starts watching response times and alerting your team when a lead waits too long.`,
      };
    case "relay":
      return {
        title: `${name} drafts follow-ups`,
        plain: `${name} writes follow-ups for your approvers. Nothing is sent unless one of them approves it.`,
      };
    case "compass":
      return {
        title: `${name} answers questions`,
        plain: `${name} answers questions about your own workspace from what Vistrial recorded, and shows where each answer came from. It can suggest an action, and nothing happens until you confirm it.`,
      };
    case "assay":
      return {
        title: `${name} is getting ready`,
        plain: `${name} is not scoring leads yet, and it does not start work.`,
      };
  }
}

/** The next step staff can take, or null when every step is done. */
export function nextActivationStep(rows: ActivationRow[]): LiveAgentId | null {
  const sorted = [...rows].sort((a, b) => a.order - b.order);
  return sorted.find((row) => row.stage === "off")?.agent ?? null;
}

export function readActivation(value: unknown): ActivationRow[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => row as Record<string, unknown>)
    .filter((row) => typeof row.agent === "string" && ACTIVATION_ORDER.includes(row.agent as LiveAgentId))
    .map((row) => ({
      agent: row.agent as LiveAgentId,
      stage: (typeof row.stage === "string" ? row.stage : "off") as ActivationStage,
      order: Number(row.order ?? 0),
      activated_at: typeof row.activated_at === "string" ? row.activated_at : null,
    }));
}
