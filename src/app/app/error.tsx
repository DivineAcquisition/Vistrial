"use client";

import { PageFrame } from "@/components/app/page-frame";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";

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
      <Panel className="p-8">
        <p className="text-sm leading-relaxed text-silver">
          Something on this page broke while loading. Your workspace and the rest
          of the app are still there. Retry the request, or open another section
          from the navigation.
        </p>
        <Button type="button" variant="primary" size="lg" className="mt-6" onClick={() => retry()}>
          Try again
        </Button>
      </Panel>
    </PageFrame>
  );
}
