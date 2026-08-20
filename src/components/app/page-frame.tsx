import type { ReactNode } from "react";
import Link from "next/link";

import { PageHeader } from "@/components/ui/page-header";

export function PageFrame({
  title,
  description,
  actions,
  breadcrumbs,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  breadcrumbs?: Array<{ href: string; label: string }>;
  children: ReactNode;
}) {
  return (
    <>
      {breadcrumbs && breadcrumbs.length > 0 ? (
        <nav aria-label="Breadcrumb" className="mb-4 text-sm text-dim">
          <ol className="flex flex-wrap items-center gap-2">
            {breadcrumbs.map((crumb, index) => {
              const last = index === breadcrumbs.length - 1;
              return (
                <li key={`${crumb.href}-${crumb.label}`} className="flex items-center gap-2">
                  {index > 0 ? <span aria-hidden="true">/</span> : null}
                  {last ? (
                    <span className="text-silver">{crumb.label}</span>
                  ) : (
                    <Link href={crumb.href} className="text-brand-300 hover:text-white">
                      {crumb.label}
                    </Link>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
      ) : null}
      <PageHeader title={title} description={description} actions={actions} />
      {children}
    </>
  );
}
