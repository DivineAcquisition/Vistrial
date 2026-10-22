import { sideEffectsFor, type SideEffect } from "@/lib/connectors/historic";
import type { SourcePerson } from "@/lib/spine/identity";

/**
 * The data spine. Every connected source lands here as normalized events;
 * no agent reads a vendor's raw format. Each event keeps its source and the
 * source's own id, so it can be traced back and never imported twice.
 */

export type SpineRecordKind = "person" | "touch" | "call" | "booking" | "deal" | "task" | "document" | "stage_change";

export type SpineEvent = {
  /** The connector that produced it, for example "hubspot" or "google_calendar". */
  source: string;
  /** The vendor's id. With `source` it makes the event idempotent. */
  sourceId: string;
  kind: SpineRecordKind;
  occurredAt: string;
  /** Imported history. It is stored and shown, and starts nothing. */
  historic: boolean;
  person: SourcePerson | null;
  /** Mapped fields only. Text from a connected app is data, never instructions. */
  fields: Record<string, string | number | boolean | null>;
};

export function spineEventKey(event: Pick<SpineEvent, "source" | "sourceId">): string {
  return `${event.source}:${event.sourceId}`;
}

/** History stays silent: nothing historic starts a message, alert, task, clock, or score notification. */
export function spineSideEffects(event: SpineEvent, args: { duplicate: boolean; goLiveAt: string | null }): SideEffect[] {
  return sideEffectsFor({
    historic: event.historic,
    duplicate: args.duplicate,
    replay: false,
    pausedCatchup: false,
    occurredBeforeGoLive: Boolean(args.goLiveAt && Date.parse(event.occurredAt) < Date.parse(args.goLiveAt)),
  });
}

export type ConnectorHealth =
  | { state: "healthy"; lastSyncAt: string }
  | { state: "syncing"; lastSyncAt: string | null; imported: number }
  | { state: "needs_attention"; lastSyncAt: string | null; problem: string; reconnect: boolean }
  | { state: "disconnected" };

export type FieldMapping = {
  /** The vendor field, as the vendor names it. */
  vendorField: string;
  /** The Vistrial field it fills, or null when a person has not mapped it yet. */
  spineField: string | null;
  /** Two vendor fields claim the same Vistrial field. A person decides. */
  conflict: boolean;
};

export type SyncPage = { events: SpineEvent[]; cursor: string | null; done: boolean };

/**
 * One interface every connector implements, native or through an MCP server.
 * Tokens stay on the server, encrypted. Read scopes and write scopes are asked
 * for separately, and write scopes only when the Owner turns on an action that
 * needs them.
 */
export interface Connector {
  key: string;
  label: string;
  /** Minimal scopes to read. */
  readScopes: readonly string[];
  /** Asked for only when an internal write action that needs them is turned on. */
  writeScopes: readonly string[];
  /** The named actions this connector supports (see the action registry). */
  actions: readonly string[];
  connect(args: { orgId: string; redirectUri: string; state: string }): Promise<{ authorizeUrl: string }>;
  /** Quiet, paced, marked historic. */
  importHistory(args: { connectionId: string; cursor: string | null }): Promise<SyncPage>;
  /** Webhooks where the vendor offers them, polling otherwise. Idempotent, with cursors. */
  sync(args: { connectionId: string; cursor: string | null }): Promise<SyncPage>;
  mapFields(args: { connectionId: string }): Promise<FieldMapping[]>;
  health(args: { connectionId: string }): Promise<ConnectorHealth>;
  /** Revokes tokens and stops sync. Imported data stays unless the Owner deletes it. */
  disconnect(args: { connectionId: string }): Promise<void>;
}

/** Vendor fields that two sources map to one Vistrial field, or that nobody mapped, go to a person. */
export function mappingProblems(mappings: FieldMapping[]): { unmapped: string[]; conflicts: string[] } {
  const claimed = new Map<string, string[]>();
  for (const mapping of mappings) {
    if (!mapping.spineField) continue;
    claimed.set(mapping.spineField, [...(claimed.get(mapping.spineField) ?? []), mapping.vendorField]);
  }
  return {
    unmapped: mappings.filter((mapping) => !mapping.spineField).map((mapping) => mapping.vendorField),
    conflicts: [...claimed.entries()].filter(([, fields]) => fields.length > 1).map(([field]) => field),
  };
}
