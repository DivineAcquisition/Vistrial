import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";

/** One titled block on the Lead Record and the Command center. */
export function RecordSection({
  id,
  title,
  owner,
  action,
  children,
}: {
  id: string;
  title: string;
  /** The agent that keeps this block, shown after the title. */
  owner?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="gap-3 p-4 sm:p-5" render={<section aria-labelledby={id} />}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={id} className="font-heading text-base text-card-foreground">
          {title}
          {owner ? <span className="ml-2 text-xs font-normal text-muted-foreground">{owner}</span> : null}
        </h2>
        {action}
      </div>
      {children}
    </Card>
  );
}

export function EmptyLine({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}
