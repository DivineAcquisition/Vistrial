import { UnconfiguredState } from "@/components/app/unconfigured-state";
import { EmptyState } from "@/components/ui/empty-state";
import { loadCrmSurfaceState } from "@/lib/workspace-state";

export async function CrmListPlaceholder({
  missing,
  broken,
  empty,
}: {
  missing: { title: string; detail: string };
  broken: { title: string; detail: string };
  empty: { title: string; detail: string };
}) {
  const crm = await loadCrmSurfaceState();

  if (crm.status === "broken") {
    return (
      <UnconfiguredState
        withIntegrationsLink
        title={broken.title}
        detail={broken.detail}
      />
    );
  }

  if (crm.status === "active") {
    return <EmptyState kind="empty" title={empty.title} detail={empty.detail} />;
  }

  return (
    <UnconfiguredState
      withIntegrationsLink
      title={missing.title}
      detail={missing.detail}
    />
  );
}
