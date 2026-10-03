import "server-only";

import { getAuthContext, getSessionUser } from "@/lib/auth/session";
import { canRunExecutions } from "@/lib/sales-os/executions/gate";
import type { SalesDb } from "@/lib/sales-os/data";
import { createClient } from "@/lib/supabase/server";
import type { OrgRole } from "@/types/database";

/**
 * Who the Sales OS runs as: the signed-in person, through their own
 * cookie-bound Supabase client. Permissions come from their role in this
 * workspace, the same role RLS checks, so the app never thinks someone can do
 * something the database would refuse. There is no service-role path.
 */
export type SalesOsActor = {
  db: SalesDb;
  orgId: string;
  orgName: string;
  memberId: string;
  userId: string;
  personName: string;
  role: OrgRole;
  canSeeMoney: boolean;
  canWriteAssets: boolean;
  canExecute: boolean;
};

export function permissionsFor(role: OrgRole) {
  const manager = role === "owner" || role === "admin";
  return { canSeeMoney: manager, canWriteAssets: manager, canExecute: canRunExecutions(role) };
}

export async function salesOsActor(): Promise<SalesOsActor> {
  const ctx = await getAuthContext();
  const db = await createClient();
  return {
    db,
    orgId: ctx.org.id,
    orgName: ctx.org.name,
    memberId: ctx.member.id,
    userId: ctx.user.id,
    personName: ctx.member.displayName,
    role: ctx.role,
    ...permissionsFor(ctx.role),
  };
}

/** For route handlers, which answer 401 instead of redirecting. */
export async function salesOsActorOrNull(): Promise<SalesOsActor | null> {
  const user = await getSessionUser();
  if (!user) return null;
  return salesOsActor();
}
