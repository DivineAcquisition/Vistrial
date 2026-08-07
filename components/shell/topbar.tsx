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
    <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-ink-950/70 backdrop-blur-xl">
      <div className="flex h-16 items-center justify-between gap-3 px-4 sm:h-[72px] sm:px-6">
        <p className="truncate text-sm font-semibold text-white">
          {titleFromPathname(pathname)}
        </p>

        <div className="flex items-center gap-2.5">
          <TonePill tone="brand">Team</TonePill>
          <a
            href="/account"
            className="flex size-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-silver transition-all hover:border-brand-500/50 hover:bg-brand-500 hover:text-ink-950"
            aria-label="Your account"
          >
            <svg
              aria-hidden
              className="size-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.6}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.5 20.25a7.5 7.5 0 0 1 15 0"
              />
            </svg>
          </a>
        </div>
      </div>
    </header>
  );
}
