import { redirect } from "next/navigation";

import { getAuthContext } from "@/lib/auth/session";
import { firstSettingsPath } from "@/lib/navigation";

export default async function SettingsIndexPage() {
  const { role, isPlatformAdmin } = await getAuthContext();
  redirect(firstSettingsPath(role, isPlatformAdmin));
}
