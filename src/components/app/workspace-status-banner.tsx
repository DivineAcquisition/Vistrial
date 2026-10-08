"use client";

import { useOrg } from "@/components/app/org-provider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { workspaceStatus } from "@/lib/workspaces/status";

/** What a paused, onboarding, or closed workspace means for the work in front of you. */
export function WorkspaceStatusBanner() {
  const { org } = useOrg();
  if (org.status === "active") return null;
  const status = workspaceStatus(org.status);
  const variant = org.status === "closed" ? "error" : org.status === "paused" ? "warning" : "info";
  return (
    <Alert variant={variant} className="mb-6">
      <AlertTitle>{status.label}</AlertTitle>
      <AlertDescription>{status.detail}</AlertDescription>
    </Alert>
  );
}
