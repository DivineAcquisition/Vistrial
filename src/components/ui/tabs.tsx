"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Tabs that are routes.
 *
 * Settings and reporting switch pages rather than panels, so these are links,
 * not a JavaScript tab widget: they deep-link, open in a new tab, and work
 * before hydration.
 */
export type NavTabItem = {
  href: string;
  label: string;
  /** Rendered after the label, for a count or a status dot. */
  badge?: ReactNode;
};

export function NavTabs({
  items,
  activeHref,
  label,
  className,
}: {
  items: NavTabItem[];
  activeHref: string;
  label: string;
  className?: string;
}) {
  return (
    <nav
      aria-label={label}
      className={cn("flex flex-wrap gap-1 border-b border-white/[0.07] pb-px", className)}
    >
      {items.map((item) => {
        const active = activeHref === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm transition-colors",
              active
                ? "border-brand-500 text-white"
                : "border-transparent text-silver hover:border-white/20 hover:text-white"
            )}
          >
            {item.label}
            {item.badge}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * A small set of mutually exclusive choices shown side by side. For switching a
 * view, not for navigating: use `NavTabs` when each option is its own page.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  name,
  className,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  label: string;
  /** Set to also submit the choice with a surrounding form. */
  name?: string;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full border border-white/[0.1] bg-white/[0.03] p-0.5",
        className
      )}
    >
      {name ? <input type="hidden" name={name} value={value} /> : null}
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors",
              active
                ? "bg-brand-500 text-ink-950"
                : "text-silver hover:bg-white/[0.05] hover:text-white"
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
