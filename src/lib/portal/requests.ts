export type StatusTone = "good" | "warning" | "neutral";

export const DATA_REQUEST_STATUS: Record<string, { label: string; tone: StatusTone }> = {
  received: { label: "Received", tone: "neutral" },
  in_review: { label: "In review", tone: "warning" },
  approved: { label: "Approved", tone: "warning" },
  in_progress: { label: "In progress", tone: "warning" },
  completed: { label: "Done", tone: "good" },
  declined: { label: "Declined", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export const OPEN_DATA_REQUEST = new Set(["received", "in_review", "approved", "in_progress"]);

export const HELP_STATUS: Record<string, { label: string; tone: StatusTone }> = {
  received: { label: "With your team", tone: "neutral" },
  in_progress: { label: "Being looked at", tone: "warning" },
  answered: { label: "Answered", tone: "good" },
  closed: { label: "Closed", tone: "neutral" },
};

export const HELP_TOPICS = {
  general: "Something else",
  leads: "A lead or case file",
  results: "Numbers on Home or Results",
  connections: "CRM or other connections",
  team: "People and access",
  onboarding: "Getting set up",
  billing: "Billing",
  privacy: "Data and privacy",
} as const;

export type HelpTopic = keyof typeof HELP_TOPICS;

export function isHelpTopic(value: unknown): value is HelpTopic {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(HELP_TOPICS, value);
}
