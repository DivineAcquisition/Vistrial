import type { ReactNode } from "react";

import { sectionLabel } from "@/lib/ui";

export function SectionHeader({
  title,
  hint,
  actions,
}: {
  title: string;
  hint?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-3.5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className={sectionLabel}>{title}</h2>
        {hint ? <p className="mt-1 text-xs text-dim">{hint}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
