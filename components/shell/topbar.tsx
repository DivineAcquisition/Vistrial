"use client";

import { usePathname } from "next/navigation";

import { TonePill } from "@/components/ui/tone";
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
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-xl">
      <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-6">
        <p className="truncate text-sm font-semibold text-white">
          {titleFromPathname(pathname)}
        </p>

        <div className="flex items-center gap-2">
          <TonePill tone="brand">Team</TonePill>
          <a
            href="/account"
            className="size-8 rounded-full border border-white/10 bg-white/[0.03] transition-colors hover:border-brand-500/40"
            aria-label="Your account"
          />
        </div>
      </div>
    </header>
  );
}
