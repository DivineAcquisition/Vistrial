/**
 * The accounts onboarding's Connect step offers, and what state each is in. One list, so a new connection
 * (HighLevel, built separately) appears here by being registered as a provider, with no change to onboarding:
 * its card reads "Coming soon" until `convex/lib/integrations/providers.ts` has a provider keyed "highlevel"
 * that is set up on the deployment. Pure, so it is tested without a backend.
 */

export type ConnectKind = "meta" | "oauth" | "upload" | "soon";
export type ConnectState = "connected" | "available" | "notSetUp" | "comingSoon" | "needsReconnect";

export type ConnectCard = {
  key: string;
  name: string;
  /** What Strategist gets from it, in one line. */
  gives: string;
  kind: ConnectKind;
  state: ConnectState;
  /** The account it is connected to, when it is. */
  label: string | null;
  group: "ads" | "calendar" | "results" | "crm";
};

/** The provider key the HighLevel work registers. Its card lights up when that provider exists and is set up. */
export const HIGHLEVEL_KEY = "highlevel";

type ProviderRow = { key: string; readiness: string; connection: { status: string; accountLabel: string } | null };
export type ConnectInputs = {
  meta: { configured: boolean; connected: boolean; label: string | null } | null;
  providers: ProviderRow[];
  uploads: number;
};

const BASE: Omit<ConnectCard, "state" | "label">[] = [
  { key: "meta", name: "Meta ad account", gives: "Your spend, results and the ads that ran, read-only. Research cites them as your own data.", kind: "meta", group: "ads" },
  { key: "google_calendar", name: "Google Calendar", gives: "Booked calls each week and who did not show, as counts only.", kind: "oauth", group: "calendar" },
  { key: "calendly", name: "Calendly", gives: "Booked calls each week and cancellations, as counts only.", kind: "oauth", group: "calendar" },
  { key: "results", name: "Results file", gives: "Past ad or sales results from a spreadsheet you export.", kind: "upload", group: "results" },
  { key: HIGHLEVEL_KEY, name: "HighLevel", gives: "Your pipeline: leads, stages and won deals.", kind: "oauth", group: "crm" },
  { key: "hubspot", name: "HubSpot", gives: "Your pipeline: leads, stages and won deals.", kind: "soon", group: "crm" },
  { key: "salesforce", name: "Salesforce", gives: "Your pipeline: leads, stages and won deals.", kind: "soon", group: "crm" },
];

function oauthState(row: ProviderRow | undefined): { state: ConnectState; label: string | null } {
  if (!row) return { state: "comingSoon", label: null };
  if (row.connection) return { state: row.connection.status === "connected" ? "connected" : "needsReconnect", label: row.connection.accountLabel };
  if (row.readiness === "ready") return { state: "available", label: null };
  if (row.readiness === "not_built") return { state: "comingSoon", label: null };
  return { state: "notSetUp", label: null };
}

export function connectCards(inputs: ConnectInputs): ConnectCard[] {
  return BASE.map((card) => {
    if (card.kind === "soon") return { ...card, state: "comingSoon", label: null };
    if (card.kind === "meta") {
      const meta = inputs.meta;
      if (meta?.connected) return { ...card, state: "connected", label: meta.label };
      return { ...card, state: meta?.configured ? "available" : "notSetUp", label: null };
    }
    if (card.kind === "upload") return { ...card, state: inputs.uploads > 0 ? "connected" : "available", label: inputs.uploads > 0 ? `${inputs.uploads} file${inputs.uploads === 1 ? "" : "s"}` : null };
    return { ...card, ...oauthState(inputs.providers.find((row) => row.key === card.key)) };
  });
}

export const STATE_WORDS: Record<ConnectState, string> = {
  connected: "Connected",
  available: "Not connected",
  notSetUp: "Not available on this account yet",
  comingSoon: "Coming soon",
  needsReconnect: "Needs reconnecting",
};
