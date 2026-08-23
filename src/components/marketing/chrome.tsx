import type { ReactNode } from "react";

import { SkipToContent } from "@/components/marketing/cta-link";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { Backdrop } from "@/components/ui/backdrop";

export { CtaLink } from "@/components/marketing/cta-link";

export function MarketingShell({
  children,
  headerAction = "book",
}: {
  children: ReactNode;
  headerAction?: "book" | "none";
}) {
  return (
    <div className="relative min-h-screen bg-ink-950 text-white antialiased">
      <SkipToContent />
      <Backdrop />
      <div className="relative z-10">
        <SiteHeader action={headerAction} />
        <main id="content">{children}</main>
        <SiteFooter />
      </div>
    </div>
  );
}
