import { redirect } from "next/navigation";

import {
  getCurrentUser,
  getPortalMembership,
  getTeamMembership,
  homeForPortalSession,
  homeForTeamSession,
} from "@/lib/auth";

// Chooses a home from the live session — must not prerender as /login forever.
export const dynamic = "force-dynamic";

export default async function RootPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const team = await getTeamMembership();
  if (team) {
    const home = await homeForTeamSession();
    redirect(home.startsWith("/login") ? home : home);
  }

  const portal = await getPortalMembership();
  if (portal) {
    const home = await homeForPortalSession();
    redirect(home === "/portal" ? home : "/portal/login?error=closed");
  }

  redirect("/login");
}
