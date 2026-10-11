import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import type { AuthContext } from "@/lib/auth/types";
import { isPlatformRoute } from "@/lib/shell/nav";
import { staffDb } from "@/lib/staff/db";
import type { SessionState } from "@/lib/staff/types";

function pathOnly(value: string | null): string {
  if (!value) return "";
  const cut = value.split("?")[0] ?? "";
  return cut.startsWith("/") ? cut : "";
}

/**
 * Staff working inside a customer workspace need an open session. Platform
 * pages, and Vistrial's own workspace, do not. A lapsed session sends them
 * back to confirm entry, which is logged as a new visit.
 */
export async function guardStaffSession(ctx: AuthContext): Promise<SessionState | null> {
  if (!ctx.isStaff || ctx.org.isPlatformWorkspace) return null;
  const path = pathOnly((await headers()).get("x-vistrial-pathname"));
  if (!path.startsWith("/app") && !path.startsWith("/portal")) return null;
  if (isPlatformRoute(path)) return null;

  const db = await staffDb();
  const { data, error } = await db.rpc("staff_session_touch", { p_org_id: ctx.org.id });
  const state = (error ? { state: "none" } : (data ?? { state: "none" })) as SessionState;
  if (state.state === "active" || state.state === "not_staff") return state.state === "active" ? state : null;
  const next = encodeURIComponent(path);
  redirect(`/app/team/enter?org=${ctx.org.id}&reason=${state.state}&next=${next}`);
}
