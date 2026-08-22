import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Cursor pagination, matching how the lists actually load. It states the range
 * in words as well, so "more" is not the only thing on screen.
 */
export function Pagination({
  shown,
  total,
  onPrevious,
  onNext,
  hasPrevious = false,
  hasNext = false,
  busy = false,
  className,
}: {
  /** How many rows are on screen. */
  shown: number;
  /** How many there are altogether, where that is known. */
  total?: number;
  onPrevious?: () => void;
  onNext?: () => void;
  hasPrevious?: boolean;
  hasNext?: boolean;
  busy?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-3", className)}>
      <p className="text-xs text-dim" aria-live="polite">
        {total === undefined
          ? `${shown} shown`
          : `${shown} of ${total} shown`}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={onPrevious}
          disabled={!hasPrevious || busy}
          aria-label="Previous page"
        >
          <ChevronLeft className="size-4" aria-hidden />
          Previous
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={onNext}
          disabled={!hasNext || busy}
          loading={busy}
          loadingLabel="Loading"
          aria-label="Next page"
        >
          Next
          <ChevronRight className="size-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
