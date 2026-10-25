"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { logClientRenderError } from "@/lib/errors/log";

export default function LeadsError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const pathname = usePathname();

  useEffect(() => {
    void logClientRenderError({ message: "leads_screen", digest: error.digest, path: pathname });
  }, [error, pathname]);

  const missing = error.message === "Not found.";

  return (
    <div className="mx-auto w-full min-w-0 max-w-lg">
      <Panel className="grid gap-3 p-6">
        <h1 className="font-heading text-xl">{missing ? "Not found." : "This page failed to load."}</h1>
        <p className="text-sm text-muted-foreground">
          {missing ? "That record is not in this workspace." : "Try again. Nothing from the failure is shown here."}
        </p>
        <Button type="button" onClick={() => retry()}>
          Try again
        </Button>
      </Panel>
    </div>
  );
}
