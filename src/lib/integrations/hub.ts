import type { SourceCardModel } from "@/lib/sources/catalog";
import type { SourceKind } from "@/types/database";

/**
 * One model behind every tile on the integration hub, so the CRM and the
 * optional sources are read the same way. Connecting is a link out to the
 * provider wherever the provider supports it; the pasted-key sources say so
 * rather than pretending to be one click.
 */
export type HubStatus = "connected" | "attention" | "available" | "unavailable";

export type HubConnect =
  /** A link straight to the provider's own authorize screen. */
  | { mode: "redirect"; href: string }
  /** Connects from credentials this workspace already holds. */
  | { mode: "reuse" }
  | { mode: "api_key" }
  | { mode: "webhook" }
  | { mode: "unavailable" };

export type HubCard = {
  id: string;
  title: string;
  /** What connecting gives the owner. One line, no feature list. */
  summary: string;
  status: HubStatus;
  statusLabel: string;
  accountLabel: string | null;
  lastVerifiedAt: string | null;
  connect: HubConnect;
  /** An address the user pastes into the other product, once connected. */
  webhookUrl: string | null;
  /** Only the CRM. Without it there is no product. */
  required: boolean;
  /** Source kind for the connect/disconnect actions. Null for the CRM. */
  kind: SourceKind | null;
  /** Why this cannot be connected, or what broke. */
  note: string | null;
};

export type CrmHubInput = {
  status: "active" | "broken" | "inactive" | "missing";
  locationName: string | null;
  lastVerifiedAt: string | null;
  oauthConfigured: boolean;
};

export const CRM_HUB_ID = "leadconnector";

export const CRM_SUMMARY =
  "Your CRM. Vistrial reads people, calls, and appointments from it and sends through it.";

export function airtableHubCard(): HubCard {
  return {
    id: "airtable",
    title: "Airtable",
    summary: "Bring people and notes from Airtable into this workspace.",
    status: "unavailable",
    statusLabel: "Coming next",
    accountLabel: null,
    lastVerifiedAt: null,
    connect: { mode: "unavailable" },
    webhookUrl: null,
    required: false,
    kind: null,
    note: "Airtable connecting is next. Connect GoHighLevel today.",
  };
}

const STATUS_LABEL: Record<HubStatus, string> = {
  connected: "Connected",
  attention: "Needs attention",
  available: "Not connected",
  unavailable: "Unavailable",
};

export function statusLabelFor(status: HubStatus): string {
  return STATUS_LABEL[status];
}

export function crmHubCard(input: CrmHubInput): HubCard {
  const status: HubStatus = input.status === "active"
    ? "connected"
    : input.status === "broken"
      ? "attention"
      : input.oauthConfigured
        ? "available"
        : "unavailable";

  return {
    id: CRM_HUB_ID,
    title: "GoHighLevel",
    summary: CRM_SUMMARY,
    status,
    statusLabel: statusLabelFor(status),
    accountLabel: input.locationName,
    lastVerifiedAt: input.lastVerifiedAt,
    connect: input.oauthConfigured
      ? { mode: "redirect", href: "/api/leadconnector/oauth/start" }
      : { mode: "unavailable" },
    webhookUrl: null,
    required: true,
    kind: null,
    note: input.oauthConfigured
      ? input.status === "broken"
        ? "The connection stopped refreshing. Reconnect to resume sending."
        : null
      : "GoHighLevel is not configured on this deployment yet.",
  };
}

export function sourceHubCard(source: SourceCardModel): HubCard {
  const status: HubStatus = source.status === "active"
    ? "connected"
    : source.status === "broken"
      ? "attention"
      : source.connectMode === "unavailable"
        ? "unavailable"
        : "available";

  const connect: HubConnect =
    source.connectMode === "oauth"
      ? { mode: "redirect", href: `/api/sources/oauth/start?kind=${source.kind}` }
      : source.connectMode === "ghl_reuse"
        ? { mode: "reuse" }
        : source.connectMode === "api_key"
          ? { mode: "api_key" }
          : source.connectMode === "webhook"
            ? { mode: "webhook" }
            : { mode: "unavailable" };

  return {
    id: source.kind,
    title: source.title,
    summary: source.unlocks,
    status,
    statusLabel: statusLabelFor(status),
    accountLabel: source.accountLabel,
    lastVerifiedAt: source.lastVerifiedAt,
    connect,
    webhookUrl: source.webhookUrl,
    required: false,
    kind: source.kind,
    note: source.lastError ?? (source.connectMode === "unavailable" ? source.unavailableReason : null),
  };
}

/** Client hub: GoHighLevel and Airtable only. Other sources stay in code, not on this page. */
export function buildHubCards(crm: CrmHubInput, _sources: SourceCardModel[] = []): HubCard[] {
  return [crmHubCard(crm), airtableHubCard()];
}

export function hubSummaryLine(cards: HubCard[]): string {
  const connected = cards.filter((card) => card.status === "connected").length;
  const attention = cards.filter((card) => card.status === "attention").length;
  const connectable = cards.filter((card) => card.status !== "unavailable").length;
  const base = `${connected} of ${connectable} connected`;
  return attention > 0 ? `${base} · ${attention} need attention` : base;
}
