import { redirect } from "next/navigation";

import { requireOrgSettingsManager } from "@/lib/auth/gates";

export default async function AdvancedIndexPage() {
  await requireOrgSettingsManager();
  redirect("/app/settings/advanced/scoring");
}
