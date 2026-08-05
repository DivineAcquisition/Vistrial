import type { ReactNode } from "react";

export function SectionHeader({
  title,
  action,
}: {
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-end justify-between border-b border-border pb-2">
      <h1 className="font-heading text-xs font-semibold tracking-[0.2em] text-primary uppercase">
        {title}
      </h1>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
