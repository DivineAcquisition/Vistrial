import "server-only";

import { notFound } from "next/navigation";

import { getAuthContext } from "@/lib/auth/session";
import type { AuthContext } from "@/lib/auth/types";
import { salesOsEnabled } from "@/lib/sales-os/flag";

/** Sales OS pages do not exist for workspaces without the switch. */
export async function requireSalesOs(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!(await salesOsEnabled(ctx.org.id))) notFound();
  return ctx;
}
