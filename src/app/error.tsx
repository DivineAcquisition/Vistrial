"use client";

import { Panel } from "@/components/ui/panel";
import { btnPrimary, btnSizeMd } from "@/lib/ui";

export default function ErrorPage({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <div className="mx-auto max-w-lg px-6 py-16">
      <Panel className="p-8">
        <p className="text-sm font-semibold text-white">This page failed to load</p>
        <p className="mt-3 text-sm leading-relaxed text-silver">
          The request did not complete. Try again — the failure is not permanent, and
          nothing is shown from the crash itself.
        </p>
        <button type="button" onClick={() => retry()} className={`${btnPrimary} ${btnSizeMd} mt-6`}>
          Try again
        </button>
      </Panel>
    </div>
  );
}
