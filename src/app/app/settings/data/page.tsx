import { redirect } from "next/navigation";

import { requireOwner } from "@/lib/auth/gates";

export default async function DataSettingsRedirectPage() {
  await requireOwner();
  redirect("/app/settings/advanced/data");
}
