/** Ceilings while API access is on. They are not plan prices and there is no overage charge. */
export const API_LIMITS = {
  keys: 5,
  dailyRequests: 10_000,
  webhookEndpoints: 5,
  eventsPerMonth: 50_000,
  scheduledReports: 10,
  perKeyPerMinute: 60,
  perWorkspacePerMinute: 300,
} as const;

export const API_SCOPES = [
  "leads:read",
  "touches:read",
  "bookings:read",
  "tasks:read",
  "playbooks:read",
  "metrics:read",
  "transcripts:read",
  "leads:write",
  "touches:write",
  "notes:write",
  "bookings:write",
  "tasks:write",
  "opt_out:write",
] as const;

export type ApiScope = (typeof API_SCOPES)[number];

export const READ_SCOPES: Record<string, ApiScope> = {
  leads: "leads:read",
  touches: "touches:read",
  calls: "touches:read",
  bookings: "bookings:read",
  outcomes: "bookings:read",
  tasks: "tasks:read",
  playbooks: "playbooks:read",
  metrics: "metrics:read",
  notes: "leads:read",
};

export const WRITE_SCOPES: Record<string, ApiScope> = {
  leads: "leads:write",
  touches: "touches:write",
  notes: "notes:write",
  bookings: "bookings:write",
  outcomes: "bookings:write",
  tasks: "tasks:write",
  "opt-outs": "opt_out:write",
};

export function isApiScope(value: string): value is ApiScope {
  return (API_SCOPES as readonly string[]).includes(value);
}
