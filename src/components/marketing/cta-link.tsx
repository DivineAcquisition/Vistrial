import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { bookingHref, type CtaPosition } from "@/lib/marketing/config";
import { NAV } from "@/lib/marketing/copy";
import { cn } from "@/lib/utils";

export function SkipToContent() {
  return (
    <a
      href="#content"
      className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:inline-flex focus:h-10 focus:items-center focus:rounded-full focus:bg-brand-500 focus:px-4 focus:text-sm focus:font-semibold focus:text-ink-950"
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
    <Button variant="gradient" size={size} className={cn(className)} asChild>
      <Link href={bookingHref(position)} data-cta-position={position}>
        {children}
      </Link>
    </Button>
  );
}
