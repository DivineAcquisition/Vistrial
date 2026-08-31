import type { ReactNode } from "react";

import { BlurFade } from "@/components/ui/blur-fade";
import { PageHeader } from "@/components/ui/page-header";
import type { Crumb } from "@/components/ui/breadcrumbs";
import type { Tone } from "@/components/ui/tone";
import { pageStack } from "@/lib/ui";

/**
 * The frame every page in the app renders through. Kept as a thin pass-through
 * to `PageHeader` so there is one header in the product, not one per route.
 */
export function PageFrame({
  title,
  description,
  eyebrow,
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
  eyebrow?: string;
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
        eyebrow={eyebrow}
        breadcrumbs={breadcrumbs}
        status={status}
        statusTone={statusTone}
        actions={actions}
        secondaryActions={secondaryActions}
        toolbar={toolbar}
      />
      <BlurFade direction="up" offset={8} delay={0.06} duration={0.45}>
        <div className={pageStack}>{children}</div>
      </BlurFade>
    </>
  );
}
