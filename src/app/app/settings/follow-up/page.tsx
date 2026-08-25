import { redirect } from "next/navigation";

import { requireOrgSettingsManager } from "@/lib/auth/gates";

export default async function FollowUpSettingsRedirectPage() {
  await requireOrgSettingsManager();
  redirect("/app/settings/advanced/follow-up");
}
