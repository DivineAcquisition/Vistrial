"use client";

import { PageFrame } from "@/components/app/page-frame";
import { Panel } from "@/components/ui/panel";
import { btnPrimary, btnSizeMd } from "@/lib/ui";

export default function AppError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <PageFrame
      title="This section failed to load"
      description="The request did not complete. Try again — the failure is not permanent."
    >
      <Panel className="px-6 py-8">
        <p className="text-sm leading-relaxed text-silver">
          Something on this page broke while loading. Your workspace and the rest
          of the app are still there. Retry the request, or open another section
          from the navigation.
        </p>
        <button type="button" onClick={() => retry()} className={`${btnPrimary} ${btnSizeMd} mt-6`}>
          Try again
        </button>
      </Panel>
    </PageFrame>
  );
}
