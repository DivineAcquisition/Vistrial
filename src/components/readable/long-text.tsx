"use client";

import { useId, useState } from "react";

import { isLong } from "@/lib/readable/post";
import { cn } from "@/lib/utils";

const CLAMP = { 2: "line-clamp-2", 3: "line-clamp-3", 4: "line-clamp-4" } as const;

/**
 * Text that folds when it is long. The whole text is always in the page (a screen reader and find-in-page reach
 * all of it); folding only clips what is drawn, and the button says whether it is open. Short text is left alone.
 */
export function LongText({ text, lines = 3, limit, more = "Read all of it", className }: { text: string; lines?: 2 | 3 | 4; limit?: number; more?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const long = isLong(text, limit);
  return (
    <div className="grid gap-1">
      <p id={id} className={cn("break-words whitespace-pre-line", className, long && !open && CLAMP[lines])}>
        {text}
      </p>
      {long ? (
        <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((value) => !value)} className="w-fit rounded text-xs text-primary underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring">
          {open ? "Show less" : more}
        </button>
      ) : null}
    </div>
  );
}
