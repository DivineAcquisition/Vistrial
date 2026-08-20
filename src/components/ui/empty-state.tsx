import type { ReactNode } from "react";

import { Panel } from "@/components/ui/panel";

export type EmptyKind = "unconfigured" | "empty";

/**
 * Two different absences. "unconfigured" means the system is not connected
 * yet. "empty" means the system is ready and there is genuinely nothing to show.
 */
export function EmptyState({
  kind = "empty",
  title,
  detail,
  action,
}: {
  kind?: EmptyKind;
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <Panel className="px-6 py-12 text-center">
      <p className="text-[11px] font-semibold tracking-[0.14em] text-dim uppercase">
        {kind === "unconfigured" ? "Not connected yet" : "Nothing to show"}
      </p>
      <p className="mt-3 text-sm font-medium text-silver">{title}</p>
      {detail ? (
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-dim">
          {detail}
        </p>
      ) : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </Panel>
  );
}
