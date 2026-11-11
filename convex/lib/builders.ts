/*
 * The registration casts below are a TypeScript limit, not a validator: Convex's builders cannot
 * infer a spread of caller-supplied validators. Each builder states its exact registered type
 * instead, so the generated `api` keeps every argument and return type.
 */
import type { RegisteredAction, RegisteredMutation, RegisteredQuery, UserIdentity } from "convex/server";
import { v, type ObjectType, type PropertyValidators } from "convex/values";

import type { Doc, Id } from "../_generated/dataModel";
import { action, mutation, query, type ActionCtx, type MutationCtx, type QueryCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { requireGrant, requireIdentity, requireMember, requireStaff } from "./access";
import { notAllowed, notFound } from "./errors";
import { isAdmin, isOwner, roleOf, type Role } from "./roles";

type AnyValidators = Record<string, PropertyValidators[string]>;

/** The arguments a workspace function takes from callers: its own, plus the workspace. */
export type WorkspaceArgs<V extends AnyValidators> = ObjectType<V> & { workspaceId: Id<"workspaces"> };

export type MemberAccess = {
  identity: UserIdentity;
  member: Doc<"members">;
  workspaceId: Id<"workspaces">;
  /** The member's role in the four new words, whatever word their row still holds. */
  role: Role;
};

export type StaffAccess = {
  identity: UserIdentity;
  staff: Doc<"staff">;
};

export function workspaceQuery<V extends AnyValidators, R>(def: {
  args: V;
  handler: (ctx: QueryCtx & MemberAccess, args: ObjectType<V>) => R;
}): RegisteredQuery<"public", WorkspaceArgs<V>, R> {
  return query({
    args: { workspaceId: v.id("workspaces"), ...def.args },
    handler: async (ctx: QueryCtx, args: { workspaceId: Id<"workspaces"> }) => {
      const { workspaceId, ...rest } = args;
      const access = await requireMember(ctx, workspaceId);
      return def.handler({ ...ctx, ...access, role: roleOf(access.member.role) }, rest as ObjectType<V>);
    },
    // The validators still run. This cast stays inside the access layer.
  } as any) as RegisteredQuery<"public", WorkspaceArgs<V>, R>;
}

/** A write any member may make, a Viewer included. Only for a person's own choices: theme, notices, their own row. */
export function selfMutation<V extends AnyValidators, R>(def: {
  args: V;
  handler: (ctx: MutationCtx & MemberAccess, args: ObjectType<V>) => R;
}): RegisteredMutation<"public", WorkspaceArgs<V>, R> {
  return mutation({
    args: { workspaceId: v.id("workspaces"), ...def.args },
    handler: async (ctx: MutationCtx, args: { workspaceId: Id<"workspaces"> }) => {
      const { workspaceId, ...rest } = args;
      const access = await requireMember(ctx, workspaceId);
      return def.handler({ ...ctx, ...access, role: roleOf(access.member.role) }, rest as ObjectType<V>);
    },
  } as any) as RegisteredMutation<"public", WorkspaceArgs<V>, R>;
}

/**
 * A write to the organization. Owners, Admins and Members; a Viewer is read-only, so the refusal lives here
 * and a new mutation cannot forget it.
 */
export function workspaceMutation<V extends AnyValidators, R>(def: {
  args: V;
  handler: (ctx: MutationCtx & MemberAccess, args: ObjectType<V>) => R;
}) {
  return selfMutation({
    args: def.args,
    handler: async (ctx, args) => {
      if (ctx.role === "viewer") notAllowed();
      return def.handler(ctx, args);
    },
  });
}

/** Approving, connecting accounts, people, clients and the organization's settings: Owners and Admins. */
export function adminMutation<V extends AnyValidators, R>(def: {
  args: V;
  handler: (ctx: MutationCtx & MemberAccess, args: ObjectType<V>) => R;
}) {
  return selfMutation({
    args: def.args,
    handler: async (ctx, args) => {
      if (!isAdmin(ctx.role)) notAllowed();
      return def.handler(ctx, args);
    },
  });
}

export function ownerMutation<V extends AnyValidators, R>(def: {
  args: V;
  handler: (ctx: MutationCtx & MemberAccess, args: ObjectType<V>) => R;
}) {
  return selfMutation({
    args: def.args,
    handler: async (ctx, args) => {
      if (!isOwner(ctx.role)) notAllowed();
      return def.handler(ctx, args);
    },
  });
}

/** What Owners and Admins read: people, settings, the ledger. */
export function adminQuery<V extends AnyValidators, R>(def: {
  args: V;
  handler: (ctx: QueryCtx & MemberAccess, args: ObjectType<V>) => R;
}) {
  return workspaceQuery({
    args: def.args,
    handler: async (ctx, args) => {
      if (!isAdmin(ctx.role)) notAllowed();
      return def.handler(ctx, args);
    },
  });
}

/** The name this had while Admins were called Managers. */
export const managerQuery = adminQuery;

export function signedInQuery<V extends AnyValidators, R>(def: {
  args: V;
  handler: (ctx: QueryCtx & { userId: string }, args: ObjectType<V>) => R;
}): RegisteredQuery<"public", ObjectType<V>, R> {
  return query({
    args: def.args,
    handler: async (ctx: QueryCtx, args: ObjectType<V>) => {
      const identity = await requireIdentity(ctx);
      return def.handler({ ...ctx, userId: identity.subject }, args);
    },
  } as any);
}

export function signedInMutation<V extends AnyValidators, R>(def: {
  args: V;
  handler: (ctx: MutationCtx & { userId: string; email: string; name: string }, args: ObjectType<V>) => R;
}): RegisteredMutation<"public", ObjectType<V>, R> {
  return mutation({
    args: def.args,
    handler: async (ctx: MutationCtx, args: ObjectType<V>) => {
      const identity = await requireIdentity(ctx);
      return def.handler(
        {
          ...ctx,
          userId: identity.subject,
          email: identity.email?.trim().toLowerCase() ?? "",
          name: identity.name?.trim() || identity.email?.trim() || "Member",
        },
        args,
      );
    },
  } as any);
}

type ActionAccess = { userId: string; workspaceId: Id<"workspaces">; role: Role };

function actionFor<V extends AnyValidators, R>(
  def: { args: V; handler: (ctx: ActionCtx & ActionAccess, args: ObjectType<V>) => Promise<R> },
  viewerToo: boolean,
): RegisteredAction<"public", WorkspaceArgs<V>, Promise<R>> {
  return action({
    args: { workspaceId: v.id("workspaces"), ...def.args },
    handler: async (ctx: ActionCtx, args: { workspaceId: Id<"workspaces"> }) => {
      const identity = await ctx.auth.getUserIdentity();
      if (!identity) notFound();
      const { workspaceId, ...rest } = args;
      // An action has no database of its own, so membership is read through a query, like everything else it reads.
      const stored: string | null = await ctx.runQuery(internal.access.memberRole, { workspaceId, userId: identity.subject });
      if (!stored) notFound();
      const role = roleOf(stored);
      if (!viewerToo && role === "viewer") notAllowed();
      return def.handler({ ...ctx, userId: identity.subject, workspaceId, role }, rest as ObjectType<V>);
    },
  } as any);
}

/** An action in an organization: its members only, and not a Viewer. Handlers still check for Admin or Owner where they need one. */
export function memberAction<V extends AnyValidators, R>(def: {
  args: V;
  handler: (ctx: ActionCtx & ActionAccess, args: ObjectType<V>) => Promise<R>;
}) {
  return actionFor(def, false);
}

/** An action that only reads or refreshes, so a Viewer may run it too. */
export function viewerAction<V extends AnyValidators, R>(def: {
  args: V;
  handler: (ctx: ActionCtx & ActionAccess, args: ObjectType<V>) => Promise<R>;
}) {
  return actionFor(def, true);
}

export function staffQuery<V extends AnyValidators, R>(def: {
  args: V;
  handler: (ctx: QueryCtx & StaffAccess, args: ObjectType<V>) => R;
}): RegisteredQuery<"public", ObjectType<V>, R> {
  return query({
    args: def.args,
    handler: async (ctx: QueryCtx, args: ObjectType<V>) => {
      const access = await requireStaff(ctx);
      return def.handler({ ...ctx, ...access }, args);
    },
  } as any);
}

export function staffMutation<V extends AnyValidators, R>(def: {
  args: V;
  handler: (ctx: MutationCtx & StaffAccess, args: ObjectType<V>) => R;
}): RegisteredMutation<"public", ObjectType<V>, R> {
  return mutation({
    args: def.args,
    handler: async (ctx: MutationCtx, args: ObjectType<V>) => {
      const access = await requireStaff(ctx);
      return def.handler({ ...ctx, ...access }, args);
    },
  } as any);
}

export async function openGrant(
  ctx: QueryCtx | MutationCtx,
  staffUserId: string,
  workspaceId: Id<"workspaces">,
) {
  return requireGrant(ctx, staffUserId, workspaceId);
}

function sameSecret(given: string, expected: string): boolean {
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i += 1) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

/**
 * Called only by the Vistrial web server, which holds PUBLIC_FORM_SECRET. A caller without the
 * matching secret gets the same "Not found." as a missing function. With no secret set, it is closed.
 */
export function serverMutation<V extends AnyValidators, R>(def: {
  args: V;
  handler: (ctx: MutationCtx, args: ObjectType<V>) => R;
}): RegisteredMutation<"public", ObjectType<V> & { secret: string }, R> {
  return mutation({
    args: { secret: v.string(), ...def.args },
    handler: async (ctx: MutationCtx, args: { secret: string }) => {
      const expected = process.env.PUBLIC_FORM_SECRET?.trim();
      if (!expected || !sameSecret(args.secret, expected)) notFound();
      const rest: Record<string, unknown> = { ...args };
      delete rest.secret;
      return def.handler(ctx, rest as ObjectType<V>);
    },
  } as any);
}
