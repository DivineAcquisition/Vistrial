"use client";

import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { cardTitle } from "@/lib/ui";

export default function ErrorPage({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <div className="mx-auto max-w-lg px-6 py-16">
      <Panel className="p-8">
        <p className={cardTitle}>This page failed to load</p>
        <p className="mt-3 text-sm leading-relaxed text-silver">
          The request did not complete. Try again — the failure is not permanent, and
          nothing is shown from the crash itself.
        </p>
        <Button type="button" variant="primary" size="lg" className="mt-6" onClick={() => retry()}>
          Try again
        </Button>
      </Panel>
    </div>
  );
}
