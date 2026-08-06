"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { toneValueClass, type Tone } from "@/components/ui/tone";
import { cn } from "@/lib/utils";

export function NavItem({
  href,
  label,
  icon,
  count,
  countTone,
}: {
  href: string;
  label: string;
  icon: ReactNode;
  /** A figure worth seeing without opening the page, like unresolved events. */
  count?: number;
  countTone?: Tone;
}) {
  const pathname = usePathname();
  const isActive = pathname.startsWith(href);

  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "relative flex w-full items-center justify-between gap-3 px-6 py-2.5 text-sm transition-colors",
        isActive
          ? "bg-accent/40 text-brand-500"
          : "text-dim hover:bg-white/[0.03] hover:text-silver"
      )}
    >
      {isActive ? (
        <span
          aria-hidden
          className="absolute top-0 bottom-0 left-0 w-[2px] bg-brand-500"
        />
      ) : null}

      <span className="flex min-w-0 items-center gap-3">
        {icon}
        <span className="truncate">{label}</span>
      </span>

      {count ? (
        <span
          className={cn(
            "text-xs font-semibold tabular-nums",
            countTone ? toneValueClass(countTone) : "text-dim"
          )}
        >
          {count}
        </span>
      ) : null}
    </Link>
  );
}
