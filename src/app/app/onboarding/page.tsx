import { redirect } from "next/navigation";

import { loadBusinessProfileState, requireProfileAccess } from "@/lib/profile/load";
import { firstIncompleteStage } from "@/lib/profile/stages";

export default async function OnboardingIndexPage() {
  const ctx = await requireProfileAccess();
  const state = await loadBusinessProfileState(ctx.org.id);
  const incomplete = firstIncompleteStage(state.stages);
  redirect(incomplete ? `/app/onboarding/${incomplete}` : "/app/onboarding/report");
}
