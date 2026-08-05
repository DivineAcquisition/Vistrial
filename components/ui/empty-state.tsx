import type { ReactNode } from "react";

import { Panel } from "@/components/ui/panel";

export function EmptyState({
  title,
  detail,
  action,
}: {
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <Panel className="px-6 py-12 text-center">
      <p className="text-sm font-medium text-neutral-300">{title}</p>
      {detail ? (
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-neutral-500">
          {detail}
        </p>
      ) : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </Panel>
  );
}
