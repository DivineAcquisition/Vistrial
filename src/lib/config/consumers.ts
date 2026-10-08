import { FIELD_BY_KEY } from "@/lib/config/registry";
import type { ConfigIssue, ConfigSection, EffectiveConfig } from "@/lib/config/types";

/**
 * Everything that acts on a workspace's behalf reads configuration through
 * requireConfig, naming itself here with the sections it reads. If one of
 * those sections has a required value missing, or a value that fails its
 * checks, it stops with that reason instead of falling back to a default.
 */
export const CONFIG_CONSUMERS = {
  dispatch: { label: "Sending messages to leads", sections: ["identity", "compliance"] },
  follow_up_drafter: {
    label: "Follow-up drafting",
    sections: ["identity", "tone", "industry", "response", "compliance"],
  },
  approval_queue: { label: "The approval queue", sections: ["identity", "response", "approval", "compliance", "tone"] },
  extraction: { label: "Reading call notes", sections: ["industry", "qualification"] },
  operator: {
    label: "The Operator",
    sections: ["identity", "qualification", "response", "approval", "compliance", "operators"],
  },
  sales_os: { label: "Ask Vistrial", sections: ["identity", "industry", "tone", "approval"] },
  response_clock: { label: "Speed-to-lead alerts", sections: ["identity", "response", "escalation"] },
} as const satisfies Record<string, { label: string; sections: readonly ConfigSection[] }>;

export type ConfigConsumer = keyof typeof CONFIG_CONSUMERS;

/**
 * The problems that stop this consumer. Contact details that only the go-live
 * check needs (who to call about the account) never stop an agent.
 */
export function blockingIssues(config: EffectiveConfig, consumer: ConfigConsumer): ConfigIssue[] {
  const sections: readonly ConfigSection[] = CONFIG_CONSUMERS[consumer].sections;
  return config.issues.filter((issue) => {
    const field = FIELD_BY_KEY[issue.key];
    if (!field || !sections.includes(field.section)) return false;
    if (issue.kind === "missing" && field.workspaceOnly) return false;
    return true;
  });
}

/** One sentence for a run record or alert: what is wrong, and where to fix it. */
export function stopReason(consumer: ConfigConsumer, issues: ConfigIssue[]): string {
  const what = issues
    .slice(0, 3)
    .map((issue) => issue.message)
    .join(" ");
  const more = issues.length > 3 ? ` (${issues.length - 3} more.)` : "";
  return `${CONFIG_CONSUMERS[consumer].label} stopped because this workspace's configuration needs attention: ${what}${more} Fix it under Settings → Configuration.`;
}
