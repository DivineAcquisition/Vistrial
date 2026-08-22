import type { ReactNode } from "react";

import { PageHeader } from "@/components/ui/page-header";
import type { Crumb } from "@/components/ui/breadcrumbs";
import type { Tone } from "@/components/ui/tone";

/**
 * The frame every page in the app renders through. Kept as a thin pass-through
 * to `PageHeader` so there is one header in the product, not one per route.
 */
export function PageFrame({
  title,
  description,
  actions,
  secondaryActions,
  breadcrumbs,
  status,
  statusTone,
  toolbar,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  secondaryActions?: ReactNode;
  breadcrumbs?: Crumb[];
  status?: string;
  statusTone?: Tone;
  toolbar?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <PageHeader
        title={title}
        description={description}
        breadcrumbs={breadcrumbs}
        status={status}
        statusTone={statusTone}
        actions={actions}
        secondaryActions={secondaryActions}
        toolbar={toolbar}
      />
      {children}
    </>
  );
}
