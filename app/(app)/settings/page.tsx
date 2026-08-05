import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

export default function SettingsPage() {
  return (
    <>
      <PageHeader eyebrow="Ledger" title="Settings" />
      <EmptyState
        title="Settings arrive in a later prompt."
        detail="Agency defaults, notification routing, and Stripe configuration all land once authentication is in place."
      />
    </>
  );
}
