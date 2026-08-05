"use client";

import { usePathname } from "next/navigation";

import { NAV_ITEMS } from "@/lib/constants";

function titleFromPathname(pathname: string): string {
  const match = NAV_ITEMS.find((item) => pathname.startsWith(item.href));
  if (match) return match.label;

  const segment = pathname.split("/").filter(Boolean)[0];
  if (!segment) return "";
  return segment.charAt(0).toUpperCase() + segment.slice(1);
}

export function Topbar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-background/85 px-6 backdrop-blur">
      <span className="font-heading text-base font-semibold text-white">
        {titleFromPathname(pathname)}
      </span>
      <div
        aria-hidden
        className="size-8 rounded-full border border-border bg-secondary"
      />
    </header>
  );
}
