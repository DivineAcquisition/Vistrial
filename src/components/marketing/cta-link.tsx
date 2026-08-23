import Link from "next/link";
import type { ReactNode } from "react";

import { waitlistHref, type CtaPosition } from "@/lib/marketing/config";
import { NAV } from "@/lib/marketing/copy";
import { marketingBtnPrimary, marketingBtnPrimarySm } from "@/lib/marketing/ui";
import { cn } from "@/lib/utils";

export function SkipToContent() {
  return (
    <a
      href="#content"
      className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:inline-flex focus:h-9 focus:items-center focus:rounded-lg focus:bg-brand-500 focus:px-3.5 focus:text-[13px] focus:font-medium focus:text-ink-950"
    >
      {NAV.skipToContent}
    </a>
  );
}

export function CtaLink({
  position,
  children,
  className,
  size = "lg",
}: {
  position: CtaPosition;
  children: ReactNode;
  className?: string;
  size?: "sm" | "lg";
}) {
  return (
    <Link
      href={waitlistHref(position)}
      data-cta-position={position}
      className={cn(size === "sm" ? marketingBtnPrimarySm : marketingBtnPrimary, className)}
    >
      {children}
    </Link>
  );
}
