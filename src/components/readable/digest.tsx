import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { EvidenceLabel } from "./evidence-label";

export type DigestRow = { text: ReactNode; label?: string | null };

/**
 * The same three layers at small size, for a briefing post or a task card: what changed, what it means, what
 * to do. A row with nothing to say is left out; nothing is written to fill it.
 */
export function Digest({ changed, means, todo, className }: { changed?: DigestRow | null; means?: DigestRow | null; todo?: DigestRow | null; className?: string }) {
  const rows = [
    ["What changed", changed],
    ["What it means", means],
    ["What to do", todo],
  ] as const;
  return (
    <dl className={cn("grid gap-x-3 gap-y-1.5 text-sm sm:grid-cols-[6.5rem_minmax(0,1fr)]", className)}>
      {rows.map(([name, row]) =>
        row ? (
          <div key={name} className="contents">
            <dt className="pt-0.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{name}</dt>
            <dd className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-card-foreground">
              <span className="min-w-0">{row.text}</span>
              {row.label ? <EvidenceLabel label={row.label} /> : null}
            </dd>
          </div>
        ) : null,
      )}
    </dl>
  );
}
