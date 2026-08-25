import { redirect } from "next/navigation";

import { requireOrgSettingsManager } from "@/lib/auth/gates";

export default async function IntegrationsSettingsRedirectPage({
  searchParams,
}: {
  searchParams: Promise<{ ghl_error?: string; connected?: string; select_location?: string }>;
}) {
  await requireOrgSettingsManager();
  const params = await searchParams;
  if (params.select_location === "1" || params.connected === "1" || params.ghl_error) {
    const q = new URLSearchParams();
    if (params.select_location) q.set("select_location", params.select_location);
    if (params.connected) q.set("connected", params.connected);
    if (params.ghl_error) q.set("ghl_error", params.ghl_error);
    redirect(`/app/settings/workspace?${q.toString()}`);
  }
  redirect("/app/settings/advanced/integrations");
}
