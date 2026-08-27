import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { waitlistHref, type CtaPosition } from "@/lib/marketing/config";
import { NAV } from "@/lib/marketing/copy";

export function SkipToContent() {
  return (
    <a
      href="#content"
      className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:inline-flex focus:h-9 focus:items-center focus:rounded-lg focus:bg-primary focus:px-3.5 focus:text-[13px] focus:font-medium focus:text-primary-foreground"
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
    <Button
      variant="primary"
      size={size}
      className={className}
      render={<Link href={waitlistHref(position)} data-cta-position={position} />}
    >
      {children}
    </Button>
  );
}
