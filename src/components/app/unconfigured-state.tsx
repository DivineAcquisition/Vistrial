import Link from "next/link";

import { EmptyState } from "@/components/ui/empty-state";
import { canManageOrgSettings } from "@/lib/auth/permissions";
import { getAuthContext } from "@/lib/auth/session";
import { btnSecondary, btnSizeSm } from "@/lib/ui";

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
          <Link href="/app/settings/integrations" className={`${btnSecondary} ${btnSizeSm}`}>
            Open integrations
          </Link>
        ) : null
      }
    />
  );
}
