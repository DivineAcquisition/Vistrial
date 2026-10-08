import { redirect } from "next/navigation";

import { loadBusinessProfileState, requireProfileAccess } from "@/lib/profile/load";
import { firstIncompleteStage } from "@/lib/profile/stages";
import { salesOsActor } from "@/lib/sales-os/session";
import { salesOsConfigured } from "@/lib/sales-os/settings";

export default async function OnboardingIndexPage() {
  const ctx = await requireProfileAccess();
  const state = await loadBusinessProfileState(ctx.org.id);
  const incomplete = firstIncompleteStage(state.stages);
  if (incomplete) redirect(`/app/onboarding/${incomplete}`);
  if (!(await salesOsConfigured(await salesOsActor()))) redirect("/app/onboarding/vistrial");
  redirect("/app/onboarding/report");
}
