import { redirect } from "next/navigation";

import { requireMembersManager } from "@/lib/auth/gates";

export default async function MembersSettingsRedirectPage() {
  await requireMembersManager();
  redirect("/app/settings/workspace");
}
