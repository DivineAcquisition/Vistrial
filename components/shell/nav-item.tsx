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
        "flex w-full items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors",
        isActive
          ? "bg-brand-500/12 text-brand-100 ring-1 ring-brand-500/30 ring-inset"
          : "text-silver hover:bg-white/[0.04] hover:text-white"
      )}
    >
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
