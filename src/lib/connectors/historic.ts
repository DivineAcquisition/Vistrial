export type SideEffect = "alert" | "clock" | "draft" | "task" | "routing";

/**
 * History, replays, duplicates, and catch-up from a pause announce nothing
 * that could start work.
 */
export function sideEffectsFor(args: {
  historic: boolean;
  duplicate: boolean;
  replay: boolean;
  pausedCatchup: boolean;
  occurredBeforeGoLive: boolean;
}): SideEffect[] {
  if (args.historic || args.duplicate || args.replay || args.pausedCatchup || args.occurredBeforeGoLive) return [];
  return ["alert", "clock", "draft", "task", "routing"];
}
