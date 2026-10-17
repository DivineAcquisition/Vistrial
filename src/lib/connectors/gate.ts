import "server-only";

import { notFound } from "next/navigation";

import { getAuthContext, type AuthContext } from "@/lib/auth/session";
import { canManageConnections, canViewConnections } from "@/lib/connectors/access";

export async function requireConnectionViewer(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!canViewConnections({ role: ctx.role, isStaff: ctx.isStaff })) notFound();
  return ctx;
}

export function managesConnections(ctx: AuthContext): boolean {
  return canManageConnections({
    role: ctx.role,
    isStaff: ctx.isStaff,
    canManageFlag: ctx.member.canManageConnections,
  });
}
