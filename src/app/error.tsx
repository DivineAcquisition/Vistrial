"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { logClientRenderError } from "@/lib/errors/log";
import { cardTitle } from "@/lib/ui";

export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const pathname = usePathname();

  useEffect(() => {
    void logClientRenderError({ message: error.message, digest: error.digest, path: pathname });
  }, [error, pathname]);

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
