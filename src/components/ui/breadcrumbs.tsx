"use client";

import Link from "next/link";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { cn } from "@/lib/utils";

export type Crumb = { href: string; label: string };

export function Breadcrumbs({
  items,
  className,
}: {
  items: Crumb[];
  className?: string;
}) {
  if (items.length === 0) return null;

  return (
    <Breadcrumb className={cn("text-sm", className)}>
      <BreadcrumbList>
        {items.map((crumb, index) => {
          const last = index === items.length - 1;
          return (
            <BreadcrumbItem key={`${crumb.href}-${crumb.label}`}>
              {index > 0 ? <BreadcrumbSeparator /> : null}
              {last ? (
                <BreadcrumbPage className="text-silver">{crumb.label}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink
                  render={<Link href={crumb.href} />}
                  className="text-dim hover:text-white"
                >
                  {crumb.label}
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
