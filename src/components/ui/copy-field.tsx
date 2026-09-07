"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { insetChrome } from "@/lib/ui";
import { cn } from "@/lib/utils";

/**
 * A value the user has to move into another product. They copy it; they never
 * type it. The confirmation matters more than it looks — without it people
 * copy twice, or paste the label along with the value.
 */
export function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div>
      <p className="text-xs text-dim">{label}</p>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <code className={cn(insetChrome, "min-w-0 flex-1 rounded-lg px-3 py-2 text-xs break-all text-silver")}>
          {value}
        </code>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => {
            void navigator.clipboard
              .writeText(value)
              .then(() => {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 2000);
              })
              .catch(() => setCopied(false));
          }}
        >
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}
