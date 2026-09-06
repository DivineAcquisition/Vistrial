import type { ReactNode } from "react";

import { Button, type ButtonSize } from "@/components/ui/button";
import { type CtaPosition } from "@/lib/marketing/config";
import { NAV } from "@/lib/marketing/copy";
import { cn } from "@/lib/utils";

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
  size?: ButtonSize;
}) {
  return (
    <Button
      variant="gradient"
      size={size}
      className={cn("rounded-full", className)}
      render={<a href="#waitlist" data-cta-position={position} />}
    >
      {children}
    </Button>
  );
}
