import { redirect } from "next/navigation";

import { requireOrgSettingsManager } from "@/lib/auth/gates";

export default async function OrganizationSettingsRedirectPage() {
  await requireOrgSettingsManager();
  redirect("/app/settings/workspace");
}
