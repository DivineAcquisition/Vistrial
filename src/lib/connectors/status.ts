export const CONNECTION_STATES = [
  "setting_up",
  "importing",
  "live",
  "delayed",
  "needs_attention",
  "needs_reconnecting",
  "paused",
  "disconnected",
] as const;

export type ConnectionState = (typeof CONNECTION_STATES)[number];

export type StatusView = {
  state: ConnectionState;
  label: string;
  sentence: string;
  action: string | null;
  tone: "good" | "warning" | "critical" | "neutral";
};

export function statusView(args: {
  state: ConnectionState;
  tool: string;
  detail?: string | null;
  lastUpdateLabel?: string | null;
  pausedBy?: string | null;
  pausedOn?: string | null;
  testMode?: boolean;
  testModeNote?: string | null;
}): StatusView {
  switch (args.state) {
    case "setting_up":
      return {
        state: args.state,
        label: "Setting up",
        sentence: "Finish setup to start importing.",
        action: "Continue setup",
        tone: "warning",
      };
    case "importing":
      return {
        state: args.state,
        label: "Importing history",
        sentence: args.detail?.trim() || "Importing your history.",
        action: null,
        tone: "neutral",
      };
    case "live":
      return {
        state: args.state,
        label: "Live",
        sentence: args.lastUpdateLabel
          ? `Working normally. Last update ${args.lastUpdateLabel}.`
          : "Working normally.",
        action: "View details",
        tone: "good",
      };
    case "delayed":
      return {
        state: args.state,
        label: "Delayed",
        sentence:
          args.detail?.trim() ||
          `Updates from ${args.tool} are running behind. No action needed.`,
        action: "View details",
        tone: "warning",
      };
    case "needs_attention":
      return {
        state: args.state,
        label: "Needs attention",
        sentence: args.detail?.trim() || `Something in ${args.tool} needs a match before new records show up correctly.`,
        action: "Fix now",
        tone: "warning",
      };
    case "needs_reconnecting":
      return {
        state: args.state,
        label: "Needs reconnecting",
        sentence: args.testMode && args.testModeNote
          ? args.testModeNote
          : `Vistrial lost access to ${args.tool}. Reconnect to keep your data up to date.`,
        action: "Reconnect",
        tone: "critical",
      };
    case "paused":
      return {
        state: args.state,
        label: "Paused",
        sentence: args.pausedBy
          ? `Paused by ${args.pausedBy}${args.pausedOn ? ` on ${args.pausedOn}` : ""}. Nothing is being imported.`
          : "Paused. Nothing is being imported.",
        action: "Resume",
        tone: "neutral",
      };
    case "disconnected":
      return {
        state: args.state,
        label: "Disconnected",
        sentence: args.detail?.trim() || `Vistrial is not receiving data from ${args.tool}.`,
        action: "Connect again",
        tone: "neutral",
      };
  }
}

export function evaluateFreshness(args: {
  state: ConnectionState;
  delayMs: number;
  quietIsOk: boolean;
  lastUpdateAt: number | null;
  lastFullCheckAt: number | null;
  now: number;
  failure: "auth" | "mapping" | null;
}): ConnectionState {
  if (args.failure === "auth") return "needs_reconnecting";
  if (args.failure === "mapping") return "needs_attention";
  if (
    args.state === "disconnected" ||
    args.state === "paused" ||
    args.state === "setting_up" ||
    args.state === "importing" ||
    args.state === "needs_reconnecting" ||
    args.state === "needs_attention"
  ) {
    return args.state;
  }
  if (args.delayMs <= 0) return args.state === "delayed" ? "live" : args.state;
  const stamp = args.quietIsOk ? args.lastFullCheckAt : args.lastUpdateAt ?? args.lastFullCheckAt;
  if (stamp === null) return args.state;
  if (args.now - stamp > args.delayMs) return "delayed";
  return args.state === "delayed" ? "live" : args.state;
}

export function holdBanner(tools: readonly string[]): string | null {
  if (tools.length === 0) return null;
  const names = tools.filter(Boolean);
  if (names.length === 0) return null;
  if (names.length === 1) return `Some data from ${names[0]} may be out of date.`;
  return `Some data from ${names.join(", ")} may be out of date.`;
}
