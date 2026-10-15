import "server-only";

import { notFound } from "next/navigation";

import type { AuthContext } from "@/lib/auth/types";
import { staffDb } from "@/lib/staff/db";

export type AccessLevel = "admin" | "view" | "none";

export async function accessRequestLevel(ctx: AuthContext): Promise<AccessLevel> {
  if (!ctx.isStaff) return "none";
  if (ctx.isPlatformAdmin) return "admin";
  const db = await staffDb();
  const { data } = await db
    .from("platform_staff")
    .select("can_view_access_requests")
    .eq("user_id", ctx.user.id)
    .maybeSingle();
  return data?.can_view_access_requests === true ? "view" : "none";
}

export async function requireAccessRequests(ctx: AuthContext): Promise<Exclude<AccessLevel, "none">> {
  const level = await accessRequestLevel(ctx);
  if (level === "none") notFound();
  return level;
}
