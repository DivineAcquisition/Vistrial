"use client";

import {
  CalendarIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PlusIcon,
  RepeatIcon,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  CalendarIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PlusIcon,
  RepeatIcon,
};

/** Lucide stand-in for the calendar's icon slot. Vistrial uses one icon set. */
export function IconPlaceholder({
  lucide,
  className,
}: {
  lucide: string;
  tabler?: string;
  hugeicons?: string;
  phosphor?: string;
  remixicon?: string;
  className?: string;
  "aria-hidden"?: boolean | "true";
}) {
  const Icon = ICONS[lucide] ?? CalendarIcon;
  return <Icon className={className} aria-hidden />;
}
