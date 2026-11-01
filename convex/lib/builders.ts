/*
 * The registration casts below are a TypeScript limit, not a validator: Convex's builders cannot
 * infer a spread of caller-supplied validators. Each builder states its exact registered type
 * instead, so the generated `api` keeps every argument and return type.
 */
import type { RegisteredAction, RegisteredMutation, RegisteredQuery, UserIdentity } from "convex/server";
import { v, type ObjectType, type PropertyValidators } from "convex/values";

import type { Doc, Id } from "../_generated/dataModel";
import { action, mutation, query, type ActionCtx, type MutationCtx, type QueryCtx } from "../_generated/server";
import { requireGrant, requireIdentity, requireMember, requireStaff } from "./access";
import { notAllowed, notFound } from "./errors";

type AnyValidators = Record<string, PropertyValidators[string]>;

/** The arguments a workspace function takes from callers: its own, plus the workspace. */
export type WorkspaceArgs<V extends AnyValidators> = ObjectType<V> & { workspaceId: Id<"workspaces"> };

export type MemberAccess = {
  identity: UserIdentity;
  member: Doc<"members">;
  workspaceId: Id<"workspaces">;
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
      return def.handler({ ...ctx, ...access }, rest as ObjectType<V>);
    },
    // The validators still run. This cast stays inside the access layer.
  } as any) as RegisteredQuery<"public", WorkspaceArgs<V>, R>;
}

export function workspaceMutation<V extends AnyValidators, R>(def: {
  args: V;
  handler: (ctx: MutationCtx & MemberAccess, args: ObjectType<V>) => R;
}): RegisteredMutation<"public", WorkspaceArgs<V>, R> {
  return mutation({
    args: { workspaceId: v.id("workspaces"), ...def.args },
    handler: async (ctx: MutationCtx, args: { workspaceId: Id<"workspaces"> }) => {
      const { workspaceId, ...rest } = args;
      const access = await requireMember(ctx, workspaceId);
      return def.handler({ ...ctx, ...access }, rest as ObjectType<V>);
    },
  } as any) as RegisteredMutation<"public", WorkspaceArgs<V>, R>;
}

export function ownerMutation<V extends AnyValidators, R>(def: {
  args: V;
  handler: (ctx: MutationCtx & MemberAccess, args: ObjectType<V>) => R;
}) {
  return workspaceMutation({
    args: def.args,
    handler: async (ctx, args) => {
      if (ctx.member.role !== "owner") notAllowed();
      return def.handler(ctx, args);
    },
  });
}

export function managerQuery<V extends AnyValidators, R>(def: {
  args: V;
  handler: (ctx: QueryCtx & MemberAccess, args: ObjectType<V>) => R;
}) {
  return workspaceQuery({
    args: def.args,
    handler: async (ctx, args) => {
      if (ctx.member.role === "rep") notAllowed();
      return def.handler(ctx, args);
    },
  });
}

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

export function memberAction<V extends AnyValidators, R>(def: {
  args: V;
  handler: (
    ctx: ActionCtx & { userId: string; workspaceId: Id<"workspaces"> },
    args: ObjectType<V>,
  ) => Promise<R>;
}): RegisteredAction<"public", WorkspaceArgs<V>, Promise<R>> {
  return action({
    args: { workspaceId: v.id("workspaces"), ...def.args },
    handler: async (ctx: ActionCtx, args: { workspaceId: Id<"workspaces"> }) => {
      const identity = await ctx.auth.getUserIdentity();
      if (!identity) notFound();
      const { workspaceId, ...rest } = args;
      return def.handler({ ...ctx, userId: identity.subject, workspaceId }, rest as ObjectType<V>);
    },
  } as any);
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
