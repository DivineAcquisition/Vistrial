"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  generateWorkspaceReport,
  sendWorkspaceReport,
} from "@/app/app/forsight/reports/actions";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/states";

export function ReportActions({
  orgId,
  periodStart,
  version,
  hasReport,
}: {
  orgId: string;
  periodStart: string;
  version: number | null;
  hasReport: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ tone: "success" | "critical"; message: string } | null>(
    null
  );

  return (
    <div className="flex flex-col items-end gap-3">
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          variant={hasReport ? "outline" : "primary"}
          size="sm"
          loading={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await generateWorkspaceReport({ orgId, periodStart });
              setFeedback(
                result.ok
                  ? { tone: "success", message: result.detail }
                  : { tone: "critical", message: result.error }
              );
              if (result.ok) router.refresh();
            })
          }
        >
          {hasReport ? "Generate again" : "Generate this report"}
        </Button>
        {hasReport && version ? (
          <Button
            variant="primary"
            size="sm"
            loading={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await sendWorkspaceReport({ orgId, periodStart, version });
                setFeedback(
                  result.ok
                    ? { tone: "success", message: result.detail }
                    : { tone: "critical", message: result.error }
                );
                if (result.ok) router.refresh();
              })
            }
          >
            Send to client
          </Button>
        ) : null}
      </div>
      {feedback ? (
        <Notice tone={feedback.tone === "success" ? "success" : "critical"}>{feedback.message}</Notice>
      ) : null}
    </div>
  );
}
