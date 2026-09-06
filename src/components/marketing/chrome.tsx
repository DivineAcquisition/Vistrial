import type { ReactNode } from "react";

import { SkipToContent } from "@/components/marketing/cta-link";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";

export { CtaLink } from "@/components/marketing/cta-link";

function MarketingBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div
        className="absolute -top-[28%] left-1/2 h-[680px] w-[980px] -translate-x-1/2"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(154,136,252,0.38) 0%, transparent 68%)",
          filter: "blur(72px)",
        }}
      />
      <div
        className="absolute top-[18%] right-[-12%] h-[460px] w-[460px]"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(154,136,252,0.16) 0%, transparent 70%)",
          filter: "blur(64px)",
        }}
      />
      <div
        className="absolute bottom-[-8%] left-[-8%] h-[360px] w-[360px]"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(102,80,216,0.14) 0%, transparent 70%)",
          filter: "blur(70px)",
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.035) 1px, transparent 1px)",
          backgroundSize: "72px 72px",
          maskImage: "radial-gradient(ellipse 85% 55% at 50% -5%, black 20%, transparent 75%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 85% 55% at 50% -5%, black 20%, transparent 75%)",
        }}
      />
    </div>
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
    <div className="relative min-h-screen overflow-x-hidden bg-ink-950 text-white antialiased">
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
