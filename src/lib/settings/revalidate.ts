import { revalidatePath } from "next/cache";

export function revalidateSettings() {
  revalidatePath("/app/settings", "layout");
  revalidatePath("/app/settings/workspace");
  revalidatePath("/app/settings/advanced", "layout");
  revalidatePath("/app/settings/profile");
  revalidatePath("/app/settings/notifications");
  revalidatePath("/app/settings/app");
  revalidatePath("/app/queue");
}
