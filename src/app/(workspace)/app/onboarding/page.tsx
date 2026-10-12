import { notFound, redirect } from "next/navigation";

import { OnboardingOverview } from "@/app/(workspace)/app/onboarding/overview";
import { getAuthContext } from "@/lib/auth/session";
import { setupHref } from "@/lib/onboarding/customer-steps";
import { loadCustomerView } from "@/lib/onboarding/load";

export const dynamic = "force-dynamic";
export const metadata = { title: "Setup" };

/**
 * The setup overview. Owners (and staff inside the workspace) resume exactly
 * where they stopped; Members see the read-only progress page; Operators have
 * no setup to see.
 */
export default async function OnboardingIndexPage() {
  const ctx = await getAuthContext();
  if (!ctx.isStaff && ctx.workspaceRole === "member") redirect("/app/onboarding/progress");
  if (!ctx.isStaff && ctx.workspaceRole !== "owner") notFound();
  const view = await loadCustomerView(ctx.org.id);
  if (!view) notFound();

  if (!view.welcomeSeen && !ctx.isStaff && (view.phase === "setup" || view.phase === "ready_for_review")) {
    redirect(setupHref("welcome"));
  }
  return <OnboardingOverview view={view} isStaff={ctx.isStaff} />;
}
