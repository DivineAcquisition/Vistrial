import type { ReactNode } from "react";

import { SkipToContent } from "@/components/marketing/cta-link";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";

export { CtaLink } from "@/components/marketing/cta-link";

function MarketingBackdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[720px]"
      style={{
        background:
          "radial-gradient(ellipse 90% 70% at 50% -8%, rgba(154,136,252,0.5) 0%, rgba(102,80,216,0.16) 36%, transparent 70%)",
      }}
    />
  );
}

export function MarketingShell({
  children,
  headerAction = "cta",
}: {
  children: ReactNode;
  headerAction?: "cta" | "none";
}) {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#07070b] text-white antialiased">
      <SkipToContent />
      <MarketingBackdrop />
      <div className="relative z-10">
        <SiteHeader action={headerAction} />
        <main id="content">{children}</main>
        <SiteFooter />
      </div>
    </div>
  );
}
