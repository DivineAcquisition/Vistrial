import Link from "next/link";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { canManageOrgSettings } from "@/lib/auth/permissions";
import { getAuthContext } from "@/lib/auth/session";

export async function UnconfiguredState({
  title,
  detail,
  withIntegrationsLink = false,
}: {
  title: string;
  detail: string;
  withIntegrationsLink?: boolean;
}) {
  const { role, isPlatformAdmin } = await getAuthContext();
  const showLink = withIntegrationsLink && canManageOrgSettings(role, isPlatformAdmin);

  return (
    <EmptyState
      kind="unconfigured"
      title={title}
      detail={detail}
      action={
        showLink ? (
          <Button variant="secondary" size="sm" render={<Link href="/app/settings/integrations" />}>
            Open integrations
          </Button>
        ) : null
      }
    />
  );
}
