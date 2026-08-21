import "server-only";

import { revalidatePath } from "next/cache";

export function revalidateOnboardingPaths() {
  revalidatePath("/app/setup");
  revalidatePath("/app/queue");
  revalidatePath("/app/settings/organization");
  revalidatePath("/app/settings/integrations");
  revalidatePath("/app/settings/scoring");
  revalidatePath("/app/settings/follow-up");
  revalidatePath("/app/settings/members");
  revalidatePath("/ops");
}
