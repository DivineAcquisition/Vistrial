import type { ReactNode } from "react";

import { buttonClasses } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";

/**
 * A deliberate door in front of mechanism. Closed by default. Children stay in
 * the document so a form can still submit the fields behind it.
 */
export function AdvancedDoor({
  closedLabel,
  children,
}: {
  closedLabel: string;
  children: ReactNode;
}) {
  return (
    <details className="group">
      <summary
        className={cn(
          buttonClasses({ variant: "secondary", size: "sm" }),
          "w-fit list-none [&::-webkit-details-marker]:hidden"
        )}
      >
        <span className="group-open:hidden">{closedLabel}</span>
        <span className="hidden group-open:inline">Hide this</span>
      </summary>
      <div className="mt-6">{children}</div>
    </details>
  );
}
