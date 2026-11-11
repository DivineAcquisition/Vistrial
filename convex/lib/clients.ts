/**
 * Which clients a member may see. Owners and Admins see every client and the organization's own work.
 * A Member or Viewer sees the clients they are assigned to, and the organization's own work unless that
 * was switched off for them. A record with no `clientId` is the organization's own.
 *
 * Every client-scoped function follows the same three rules (docs/rebuild/organizations-and-clients.md, 4.4):
 * get by id → `require(row.clientId)`; list → `pick(rows, scope)`; create → `require(clientId)` before the insert.
 * A client a member may not see answers "Not found.", exactly like a record in another organization.
 */
import { v } from "convex/values";

import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { notFound } from "./errors";
import { isAdmin } from "./roles";

/** The client picker's choice, as list queries take it: missing = everything visible, "own" = the organization itself. */
export const scopeValidator = v.optional(v.union(v.literal("own"), v.id("clients")));
export type ScopeArg = "own" | Id<"clients"> | undefined;

type Scoped = { clientId?: Id<"clients"> };

export type ClientScope = {
  /** Owner or Admin: every client and the organization's own work. */
  all: boolean;
  ownWork: boolean;
  ids: ReadonlySet<Id<"clients">>;
  sees: (clientId: Id<"clients"> | undefined | null) => boolean;
  /** Throws "Not found." when the member may not see this client (or the organization's own work). */
  require: (clientId: Id<"clients"> | undefined | null) => void;
  filter: <T extends Scoped>(rows: T[]) => T[];
  /** `filter`, then the picker's choice. */
  pick: <T extends Scoped>(rows: T[], scope: ScopeArg) => T[];
};

const MAX_ASSIGNED = 1000;

export function scopeOf(all: boolean, ownWork: boolean, ids: ReadonlySet<Id<"clients">>): ClientScope {
  const sees = (clientId: Id<"clients"> | undefined | null) => (all ? true : clientId ? ids.has(clientId) : ownWork);
  const filter = <T extends Scoped>(rows: T[]) => (all ? rows : rows.filter((row) => sees(row.clientId)));
  return {
    all,
    ownWork,
    ids,
    sees,
    require: (clientId) => {
      if (!sees(clientId)) notFound();
    },
    filter,
    pick: (rows, scope) => {
      const visible = filter(rows);
      if (scope === undefined) return visible;
      return visible.filter((row) => (scope === "own" ? row.clientId === undefined : row.clientId === scope));
    },
  };
}

/**
 * The member's scope narrowed to the client picker's choice: one client, or the organization itself.
 * It can only take away. A client the member may not see stays unseen whatever is asked for.
 */
export function narrowScope(base: ClientScope, choice: ScopeArg): ClientScope {
  if (choice === undefined) return base;
  const wanted = choice === "own" ? undefined : choice;
  const narrowed = scopeOf(false, choice === "own" && base.ownWork, choice !== "own" && base.sees(choice) ? new Set([choice]) : new Set());
  return { ...narrowed, sees: (clientId) => (clientId ?? undefined) === wanted && base.sees(clientId), require: (clientId) => {
    if ((clientId ?? undefined) !== wanted || !base.sees(clientId)) notFound();
  } };
}

export async function clientScopeFor(ctx: QueryCtx, member: Doc<"members">): Promise<ClientScope> {
  if (isAdmin(member.role)) return scopeOf(true, true, new Set());
  const rows = await ctx.db
    .query("clientAssignments")
    .withIndex("by_workspace_member", (q) => q.eq("workspaceId", member.workspaceId).eq("memberId", member._id))
    .take(MAX_ASSIGNED);
  return scopeOf(false, member.ownWork !== false, new Set(rows.map((row) => row.clientId)));
}

/** The client an asset is for. Assets made before clients, or by a skill that does not set it, take their run's. */
export async function clientOfAsset(ctx: QueryCtx, asset: Pick<Doc<"assets">, "clientId" | "createdByRun">) {
  if (asset.clientId) return asset.clientId;
  const run = asset.createdByRun ? await ctx.db.get(asset.createdByRun) : null;
  return run?.clientId;
}

/** A client of this organization, active or archived. Anything else is not found. */
export async function clientHere(ctx: QueryCtx, workspaceId: Id<"workspaces">, clientId: Id<"clients">) {
  const client = await ctx.db.get(clientId);
  if (!client || client.workspaceId !== workspaceId) notFound();
  return client;
}

/**
 * Checks a client named when something is made for it: it belongs to this organization, the member may
 * see it, and it is not archived. Returns the field to spread into the new row (nothing for the
 * organization's own work).
 */
export async function clientForNew(
  ctx: QueryCtx & { workspaceId: Id<"workspaces">; clients: ClientScope },
  clientId: Id<"clients"> | undefined | null,
): Promise<{ clientId?: Id<"clients"> }> {
  if (!clientId) {
    ctx.clients.require(undefined);
    return {};
  }
  const client = await clientHere(ctx, ctx.workspaceId, clientId);
  ctx.clients.require(client._id);
  if (client.status === "archived") notFound();
  return { clientId: client._id };
}

/**
 * For helpers that load a record and are called from both member functions and internal ones: when the
 * context belongs to a member (it carries their client scope) the record's client must be one they see.
 * An internal context (an agent run, a cron) has no member and is not limited.
 */
export function requireClientIn(ctx: object, clientId: Id<"clients"> | undefined | null) {
  (ctx as { clients?: ClientScope }).clients?.require(clientId);
}

/** The same for a list: rows the member may not see are dropped; an internal context keeps them all. */
export function visibleIn<T extends Scoped>(ctx: object, rows: T[], scope?: ScopeArg): T[] {
  const clients = (ctx as { clients?: ClientScope }).clients;
  return clients ? clients.pick(rows, scope) : rows;
}
