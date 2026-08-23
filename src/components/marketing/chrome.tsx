import Link from "next/link";
import type { ReactNode } from "react";

import Logo from "@/components/brand/logo";
import { Backdrop } from "@/components/ui/backdrop";
import { AUDIT, FOOTER, HERO, NAV } from "@/lib/marketing/copy";
import { bookingHref, type CtaPosition } from "@/lib/marketing/config";
import { APP_NAME, APP_OWNER, CONTACT_EMAIL } from "@/lib/constants";
import { btnGradient, btnSizeLg, btnSizeSm } from "@/lib/ui";

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
  const sizes = {
    sm: btnSizeSm,
    lg: btnSizeLg,
  };
  return (
    <Link
      href={bookingHref(position)}
      data-cta-position={position}
      className={`${btnGradient} ${sizes[size]} ${className ?? ""}`}
    >
      {children}
    </Link>
  );
}

export function SiteHeader({
  action = "book",
}: {
  action?: "book" | "none";
}) {
  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-ink-950/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5 sm:h-[72px] sm:px-6">
        <Link
          href="/"
          aria-label={`${APP_NAME} home`}
          className="shrink-0 transition-opacity hover:opacity-80"
        >
          <Logo className="h-[22px] w-auto sm:h-[28px]" />
        </Link>
        {action === "book" ? (
          <CtaLink position="nav" size="sm">
            <span className="sm:hidden">{AUDIT.cta}</span>
            <span className="hidden sm:inline">{HERO.primaryCta}</span>
          </CtaLink>
        ) : null}
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="hairline-glow relative border-t border-white/[0.06]">
      <div className="mx-auto max-w-6xl px-5 py-10 sm:px-6 sm:py-12">
        <div className="flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-medium text-white">{APP_NAME}</p>
            <p className="mt-1 text-xs text-dim">{FOOTER.productLine}</p>
          </div>
          <nav aria-label="Legal" className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <Link
              href="/privacy"
              className="text-xs font-medium text-silver transition-colors hover:text-brand-300"
            >
              Privacy
            </Link>
            <Link
              href="/terms"
              className="text-xs font-medium text-silver transition-colors hover:text-brand-300"
            >
              Terms
            </Link>
            <Link
              href="/contact"
              className="text-xs font-medium text-silver transition-colors hover:text-brand-300"
            >
              Contact
            </Link>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="text-xs font-medium text-silver transition-colors hover:text-brand-300"
            >
              {CONTACT_EMAIL}
            </a>
          </nav>
        </div>
        <p className="mt-8 border-t border-white/[0.05] pt-6 text-xs text-dim">
          © {APP_OWNER}. All rights reserved.
        </p>
      </div>
    </footer>
  );
}

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
