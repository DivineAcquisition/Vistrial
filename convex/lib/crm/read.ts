/**
 * The one door a skill reads a CRM through: `crmFor` finds the CRM connected for an organization or a client
 * and returns a view in the shared model (`types.ts`), whatever CRM it is. It reads only what the sync saved
 * in the `crm*` tables; it never calls a CRM. docs/rebuild/dealmaker.md, section 3.5.
 *
 * Each list is capped, newest first where order matters, so a large account cannot blow up a run.
 */

import type { Doc, Id } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";
import { adapterFor } from "./adapter";
import {
  appointmentStatusOf,
  type CrmActivity,
  type CrmActivityKind,
  type CrmAppointment,
  type CrmCapabilities,
  type CrmContact,
  type CrmDeal,
  type CrmPipeline,
  type CrmProvider,
} from "./types";

/** The most rows one read of each kind returns. The sync keeps at most 2,000 deals and contacts. */
export const READ_LIMITS = { deals: 2000, contacts: 2000, activities: 5000, pipelines: 50 } as const;

type Db = Pick<QueryCtx, "db">;

export type CrmConnectionInfo = {
  id: Id<"crmConnections">;
  provider: CrmProvider;
  label: string;
  accountName: string;
  currency: string;
  timezone: string | null;
  connected: boolean;
  lastReadAt: number | null;
  actingOn: boolean;
  messagingOn: boolean;
  capabilities: CrmCapabilities;
};

export type CrmView = {
  connection: CrmConnectionInfo;
  pipelines(): Promise<CrmPipeline[]>;
  deals(filter?: { open?: boolean; updatedSince?: number; pipelineRef?: string }): Promise<CrmDeal[]>;
  deal(ref: string): Promise<CrmDeal | null>;
  contact(ref: string): Promise<CrmContact | null>;
  contacts(filter?: { addedSince?: number }): Promise<CrmContact[]>;
  activities(filter?: { since?: number; until?: number; dealRef?: string; contactRef?: string }): Promise<CrmActivity[]>;
  appointments(window: { from: number; to: number }): Promise<CrmAppointment[]>;
};

export function dealOf(row: Doc<"crmDeals">): CrmDeal {
  return {
    ref: row.externalId,
    pipelineRef: row.pipelineId,
    stageRef: row.stageId,
    status: row.status,
    value: row.value,
    source: row.source ?? null,
    contactRef: row.contactId ?? null,
    ownerRef: row.assignedTo ?? null,
    createdAt: row.createdAt ?? null,
    updatedAt: row.updatedAt ?? null,
    stageChangedAt: row.lastStageChangeAt ?? null,
    statusChangedAt: row.lastStatusChangeAt ?? null,
  };
}

export function contactOf(row: Doc<"crmContacts">): CrmContact {
  return {
    ref: row.externalId,
    name: row.name ?? null,
    email: row.email ?? null,
    phone: row.phone ?? null,
    source: row.source ?? null,
    tags: row.tags,
    addedAt: row.addedAt ?? null,
    lastActivityAt: row.lastActivityAt ?? null,
  };
}

export function pipelineOf(row: Doc<"crmPipelines">): CrmPipeline {
  return { ref: row.externalId, name: row.name, stages: [...row.stages].sort((a, b) => a.position - b.position).map((stage, order) => ({ ref: stage.id, name: stage.name, order })) };
}

/** A saved activity in the shared model. An appointment is a booked call, read through `appointments`, not here. */
export function activityOf(row: Doc<"crmActivities">): CrmActivity | null {
  if (row.kind === "appointment") return null;
  return {
    ref: row.externalId,
    kind: row.kind as CrmActivityKind,
    direction: row.direction ?? null,
    at: row.at,
    contactRef: row.contactId ?? null,
    dealRef: row.dealId ?? null,
    status: row.status ?? null,
    seconds: row.seconds ?? null,
    fromStageRef: row.fromStage ?? null,
    toStageRef: row.toStage ?? null,
  };
}

export function appointmentOf(row: Doc<"crmActivities">): CrmAppointment | null {
  if (row.kind !== "appointment") return null;
  return { ref: row.externalId, startsAt: row.at, status: appointmentStatusOf(row.status), contactRef: row.contactId ?? null, dealRef: row.dealId ?? null };
}

/** The connection for this organization (no client) or this client, if any CRM with an adapter is connected. */
export async function crmConnectionFor(ctx: Db, scope: { workspaceId: Id<"workspaces">; clientId?: Id<"clients"> }) {
  const row = await ctx.db
    .query("crmConnections")
    .withIndex("by_workspace_client", (q) => q.eq("workspaceId", scope.workspaceId).eq("clientId", scope.clientId))
    .unique();
  return row && adapterFor(row.provider) ? row : null;
}

/** A view of the CRM connected for this organization or client, or null when none is. */
export async function crmFor(ctx: Db, scope: { workspaceId: Id<"workspaces">; clientId?: Id<"clients"> }): Promise<CrmView | null> {
  const row = await crmConnectionFor(ctx, scope);
  if (!row) return null;
  const adapter = adapterFor(row.provider)!;
  const connectionId = row._id;
  const deals = () =>
    ctx.db
      .query("crmDeals")
      .withIndex("by_connection", (q) => q.eq("connectionId", connectionId))
      .take(READ_LIMITS.deals);
  const activityRows = (since: number | undefined, until: number | undefined) =>
    ctx.db
      .query("crmActivities")
      .withIndex("by_connection_at", (q) => {
        const base = q.eq("connectionId", connectionId);
        if (since !== undefined && until !== undefined) return base.gte("at", since).lte("at", until);
        if (since !== undefined) return base.gte("at", since);
        if (until !== undefined) return base.lte("at", until);
        return base;
      })
      .order("desc")
      .take(READ_LIMITS.activities);

  return {
    connection: {
      id: row._id,
      provider: row.provider,
      label: adapter.label,
      accountName: row.accountName,
      currency: row.currency,
      timezone: row.timezone ?? null,
      connected: row.status === "connected",
      lastReadAt: row.lastSyncAt ?? null,
      actingOn: row.actingEnabled === true,
      messagingOn: row.messagingEnabled === true,
      capabilities: adapter.capabilities,
    },
    async pipelines() {
      const rows = await ctx.db
        .query("crmPipelines")
        .withIndex("by_connection", (q) => q.eq("connectionId", connectionId))
        .take(READ_LIMITS.pipelines);
      return rows.map(pipelineOf);
    },
    async deals(filter = {}) {
      return (await deals())
        .map(dealOf)
        .filter((deal) => (filter.open === undefined ? true : filter.open === (deal.status === "open")))
        .filter((deal) => filter.updatedSince === undefined || (deal.updatedAt ?? deal.createdAt ?? 0) >= filter.updatedSince)
        .filter((deal) => filter.pipelineRef === undefined || deal.pipelineRef === filter.pipelineRef);
    },
    async deal(ref) {
      const found = await ctx.db
        .query("crmDeals")
        .withIndex("by_connection", (q) => q.eq("connectionId", connectionId).eq("externalId", ref))
        .unique();
      return found ? dealOf(found) : null;
    },
    async contact(ref) {
      const found = await ctx.db
        .query("crmContacts")
        .withIndex("by_connection", (q) => q.eq("connectionId", connectionId).eq("externalId", ref))
        .unique();
      return found ? contactOf(found) : null;
    },
    async contacts(filter = {}) {
      const rows = await ctx.db
        .query("crmContacts")
        .withIndex("by_connection", (q) => q.eq("connectionId", connectionId))
        .take(READ_LIMITS.contacts);
      return rows.map(contactOf).filter((contact) => filter.addedSince === undefined || (contact.addedAt ?? 0) >= filter.addedSince);
    },
    async activities(filter = {}) {
      return (await activityRows(filter.since, filter.until))
        .map(activityOf)
        .filter((row): row is CrmActivity => row !== null)
        .filter((row) => filter.dealRef === undefined || row.dealRef === filter.dealRef)
        .filter((row) => filter.contactRef === undefined || row.contactRef === filter.contactRef);
    },
    async appointments(window) {
      if (!adapter.capabilities.appointments) return [];
      return (await activityRows(window.from, window.to))
        .map(appointmentOf)
        .filter((row): row is CrmAppointment => row !== null)
        .sort((a, b) => a.startsAt - b.startsAt);
    },
  };
}
