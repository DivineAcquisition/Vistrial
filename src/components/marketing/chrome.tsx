import type { ReactNode } from "react";

import { SkipToContent } from "@/components/marketing/cta-link";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";

export { CtaLink } from "@/components/marketing/cta-link";

function MarketingBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div
        className="absolute -top-[42%] left-1/2 h-[480px] w-[820px] -translate-x-1/2"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(154,136,252,0.14) 0%, transparent 68%)",
          filter: "blur(72px)",
        }}
      />
    </div>
  );
}

export function MarketingShell({
  children,
  headerAction = "waitlist",
}: {
  children: ReactNode;
  headerAction?: "waitlist" | "none";
}) {
  return (
    <div className="relative min-h-screen bg-ink-950 text-white antialiased">
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
