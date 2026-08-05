"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function NavItem({
  href,
  label,
  icon,
}: {
  href: string;
  label: string;
  icon: ReactNode;
}) {
  const pathname = usePathname();
  const isActive = pathname.startsWith(href);

  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "relative flex w-full items-center gap-3 px-6 py-2.5 text-sm transition-colors",
        isActive
          ? "bg-accent/40 text-primary"
          : "text-dim hover:bg-white/[0.03] hover:text-silver"
      )}
    >
      {isActive ? (
        <span
          aria-hidden
          className="absolute top-0 bottom-0 left-0 w-[2px] bg-primary"
        />
      ) : null}
      {icon}
      {label}
    </Link>
  );
}
