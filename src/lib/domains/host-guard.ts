import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { safeInternalPath } from "@/lib/auth/paths";
import type { AuthContext } from "@/lib/auth/types";
import { PRODUCTION_ADMIN_ORIGIN, PRODUCTION_APP_ORIGIN } from "@/lib/constants";
import { classifyProductHost } from "@/lib/marketing/hosts";
import { placementFor } from "@/lib/domains/routing";
import { DEFAULT_APP_PATH } from "@/lib/navigation";

/** Send a person to the host their role belongs on, or let them stay. */
export async function enforceHostForPerson(ctx: Pick<AuthContext, "platformRole">): Promise<void> {
  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  const path = safeInternalPath(headerStore.get("x-vistrial-pathname"), DEFAULT_APP_PATH);
  const decision = placementFor({
    product: classifyProductHost(host),
    isStaffPerson: ctx.platformRole !== null,
    path,
  });
  if (decision.action === "to_admin") {
    redirect(`${PRODUCTION_ADMIN_ORIGIN}${decision.path}`);
  }
  if (decision.action === "turn_away") {
    redirect(`${PRODUCTION_APP_ORIGIN}/no-access?reason=staff_area`);
  }
}
