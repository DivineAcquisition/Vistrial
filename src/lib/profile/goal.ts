import type { Enums } from "@/types/database";

export type StatedGoal = {
  metric: Enums<"profile_goal_metric">;
  value: number;
};

/**
 * The reporting headline is framed against the number the owner said would
 * make this worth it, rather than against a metric we picked. Only the clients
 * per month goal can be read off the outcome panel; the others are measured on
 * panels of their own, so we say where to look rather than guess at a figure.
 */
export function goalLine(
  goal: StatedGoal,
  args: { perHundred: number | null; leadsInWindow: number; tooSmall: boolean }
): string {
  switch (goal.metric) {
    case "clients_per_month": {
      if (args.tooSmall || args.perHundred === null) {
        return `You said ${goal.value} clients a month would make this worth it. There are not enough matured leads yet to say where you are against it.`;
      }
      const monthly = Math.round(((args.perHundred / 100) * args.leadsInWindow) * 10) / 10;
      return `You said ${goal.value} clients a month would make this worth it. This window produced ${monthly} from ${args.leadsInWindow} matured leads.`;
    }
    case "revenue_per_month":
      return `You said ${goal.value} a month in revenue would make this worth it. Closed revenue is on the throughput panel; Vistrial counts the closes, not the pricing.`;
    case "close_rate":
      return `You said a ${goal.value}% close rate would make this worth it. The figure above is per hundred leads, which is the same number read differently.`;
    case "speed_to_lead":
      return `You said responding within ${goal.value} minutes would make this worth it. The median is on the coverage panel below.`;
  }
}
