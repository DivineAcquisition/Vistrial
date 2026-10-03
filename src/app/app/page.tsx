import { redirect } from "next/navigation";

import { getAuthContext } from "@/lib/auth/session";
import { landingPath } from "@/lib/navigation";

export default async function AppIndexPage() {
  const ctx = await getAuthContext();
  redirect(landingPath(ctx.member.surfaceAccess, ctx.role));
}
