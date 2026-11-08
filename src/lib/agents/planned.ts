import type { EmptyPreview } from "@/components/ui/empty-state";

/**
 * What each planned agent will do, shown on its folder while it is coming soon. Integrations name logos in
 * public/brand/platforms. These are plans, not promises of dates.
 */
export type PlannedAgent = {
  tint: string;
  capabilities: { title: string; detail: string; preview: EmptyPreview }[];
  integrations: { id: string | null; label: string }[];
};

export const PLANNED_AGENTS: Record<string, PlannedAgent> = {
  "campaign-execution": {
    tint: "#ec4899",
    capabilities: [
      { title: "Launches approved campaigns", detail: "Runs only what you approved, through your own ad accounts.", preview: "cards" },
      { title: "Watches spend daily", detail: "Pauses anything that drifts past the caps you set.", preview: "rows" },
      { title: "Reports what worked", detail: "Cost per lead and per job, cited to your own results.", preview: "facts" },
    ],
    integrations: [
      { id: "meta", label: "Meta ads" },
      { id: "google-ads", label: "Google Ads" },
      { id: "google-analytics", label: "Google Analytics" },
    ],
  },
  "sales-conversion": {
    tint: "#f59e0b",
    capabilities: [
      { title: "Follows up every lead", detail: "Drafts the next message for each lead, for you to approve.", preview: "rows" },
      { title: "Books calls", detail: "Offers times from your calendar and confirms them.", preview: "cards" },
      { title: "Keeps the pipeline honest", detail: "Flags stalled deals and what would move them.", preview: "facts" },
    ],
    integrations: [
      { id: "gohighlevel", label: "HighLevel" },
      { id: "hubspot", label: "HubSpot" },
      { id: "google-calendar", label: "Google Calendar" },
      { id: "outlook", label: "Outlook" },
    ],
  },
  activation: {
    tint: "#10b981",
    capabilities: [
      { title: "Welcomes new customers", detail: "A first-week plan for each new customer.", preview: "cards" },
      { title: "Tracks first results", detail: "Shows who reached their first result and who is stuck.", preview: "rows" },
      { title: "Nudges at the right time", detail: "Suggests the next step when someone stalls.", preview: "facts" },
    ],
    integrations: [
      { id: "gohighlevel", label: "HighLevel" },
      { id: "google-calendar", label: "Google Calendar" },
      { id: "google-drive", label: "Google Drive" },
    ],
  },
  retention: {
    tint: "#06b6d4",
    capabilities: [
      { title: "Spots risk early", detail: "Quiet accounts, late payments and unhappy calls.", preview: "rows" },
      { title: "Suggests a play", detail: "What to say and when, for you to approve.", preview: "cards" },
      { title: "Learns from calls", detail: "Reads call notes for what customers are telling you.", preview: "facts" },
    ],
    integrations: [
      { id: "fathom", label: "Fathom" },
      { id: "fireflies", label: "Fireflies" },
      { id: "hubspot", label: "HubSpot" },
    ],
  },
  expansion: {
    tint: "#8b5cf6",
    capabilities: [
      { title: "Finds upgrades", detail: "Customers ready for more, and the offer that fits.", preview: "cards" },
      { title: "Asks for referrals", detail: "At the moment a customer is happiest.", preview: "rows" },
      { title: "Collects reviews", detail: "Turns good results into public proof.", preview: "facts" },
    ],
    integrations: [
      { id: "gohighlevel", label: "HighLevel" },
      { id: "salesforce", label: "Salesforce" },
      { id: "linkedin", label: "LinkedIn" },
    ],
  },
  "operations-intelligence": {
    tint: "#3b82f6",
    capabilities: [
      { title: "A weekly read of the business", detail: "Jobs, revenue and capacity in one page.", preview: "facts" },
      { title: "Flags what needs attention", detail: "Late jobs, rising costs and gaps in the schedule.", preview: "rows" },
      { title: "Answers questions", detail: "Ask about any number and see where it came from.", preview: "cards" },
    ],
    integrations: [
      { id: "airtable", label: "Airtable" },
      { id: "google-drive", label: "Google Drive" },
      { id: "google-analytics", label: "Google Analytics" },
    ],
  },
};

export const PLANNED_FALLBACK: PlannedAgent = {
  tint: "#9a88fc",
  capabilities: [
    { title: "Learns your business", detail: "Starts from what Vistrial already knows.", preview: "facts" },
    { title: "Works in sessions", detail: "You ask, it works, you review.", preview: "cards" },
    { title: "Shows its sources", detail: "Every claim cites where it came from.", preview: "rows" },
  ],
  integrations: [{ id: null, label: "Web" }],
};
