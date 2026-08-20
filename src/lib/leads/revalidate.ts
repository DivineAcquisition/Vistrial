import { revalidatePath } from "next/cache";

/** Queue and case file both read lead state. A write on either must refresh both. */
export function revalidateLeadSurfaces(leadId?: string) {
  revalidatePath("/app/queue");
  revalidatePath("/app/cases");
  if (leadId) {
    revalidatePath(`/app/cases/${leadId}`);
    revalidatePath(`/app/cases/${leadId}/brief`);
  }
  revalidatePath("/app/calls");
  revalidatePath("/app/settings/scoring");
}
