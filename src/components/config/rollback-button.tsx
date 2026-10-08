"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { rollbackLayer, type ConfigActionResult } from "@/app/app/settings/configuration/actions";
import { Button } from "@/components/ui/button";
import { errorClass, helperClass } from "@/lib/ui";

/** Roll a level back to an earlier version. History keeps every version; this writes a new one. */
export function RollbackButton({ layerId, toVersion }: { layerId: string; toVersion: number }) {
  const router = useRouter();
  const [result, setResult] = useState<ConfigActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <span className="inline-flex flex-col items-end">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const outcome = await rollbackLayer({ layerId, toVersion });
            setResult(outcome);
            if (outcome.ok) router.refresh();
          })
        }
      >
        Roll back to this
      </Button>
      {result && !result.ok ? <span className={errorClass}>{result.error}</span> : null}
      {result && result.ok ? <span className={helperClass}>{result.message}</span> : null}
    </span>
  );
}
