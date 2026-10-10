"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download } from "lucide-react";

import { requestResultsExport } from "@/app/(workspace)/app/results/actions";
import { Button } from "@/components/ui/button";

export function ExportButton({ params }: { params: Record<string, string> }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="outline"
        size="sm"
        loading={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await requestResultsExport(params);
            setMessage(result.ok ? { tone: "ok", text: result.message } : { tone: "error", text: result.error });
            if (result.ok) router.refresh();
          })
        }
      >
        <Download aria-hidden />
        Export CSV
      </Button>
      {message ? (
        <p role="status" className={message.tone === "ok" ? "text-xs text-muted-foreground" : "text-xs text-destructive"}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
