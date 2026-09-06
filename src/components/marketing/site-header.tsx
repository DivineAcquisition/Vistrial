"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import Logo from "@/components/brand/logo";
import { CtaLink } from "@/components/marketing/cta-link";
import { MarketingMobileNav, MarketingNav } from "@/components/marketing/marketing-nav";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerHeader,
  DrawerPanel,
  DrawerPopup,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { APP_NAME } from "@/lib/constants";
import { HERO, NAV } from "@/lib/marketing/copy";
import { marketingPageGutter, marketingShell } from "@/lib/marketing/ui";
import { cn } from "@/lib/utils";

function AnnouncementBar() {
  return (
    <div className="border-b border-white/[0.06] bg-ink-900/90">
      <p className="flex items-center justify-center gap-2 px-4 py-2 text-center text-[11px] font-semibold tracking-[0.16em] text-brand-200 uppercase">
        <span className="relative flex size-1.5">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand-400 opacity-70" />
          <span className="relative inline-flex size-1.5 rounded-full bg-brand-400" />
        </span>
        {HERO.eyebrow}
        <span className="hidden font-medium tracking-normal text-silver normal-case sm:inline">
          · {HERO.underCta}
        </span>
      </p>
    </div>
  );
}

export function SiteHeader({
  action = "cta",
}: {
  action?: "cta" | "none";
}) {
  const onPage = action === "cta";
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="relative sticky top-0 z-50 border-b border-white/[0.06] bg-ink-950/75 backdrop-blur-xl">
      {onPage ? <AnnouncementBar /> : null}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-brand-500/45 to-transparent"
      />
      <div
        className={cn(
          marketingShell,
          marketingPageGutter,
          onPage
            ? "grid h-16 grid-cols-[1fr_auto] items-center gap-4 md:grid-cols-[1fr_auto_1fr]"
            : "flex h-16 items-center justify-between gap-4",
        )}
      >
        <Link
          href="/"
          aria-label={`${APP_NAME} home`}
          className="shrink-0 justify-self-start rounded-sm transition-opacity hover:opacity-80"
        >
          <Logo className="h-5 w-auto sm:h-[22px]" />
        </Link>
        {onPage ? (
          <nav aria-label="Product" className="hidden md:block">
            <MarketingNav onPage />
          </nav>
        ) : null}

        <div className="flex items-center justify-end gap-2">
          {action === "cta" ? (
            <CtaLink position="nav" size="sm" className="rounded-full px-4">
              {NAV.book}
            </CtaLink>
          ) : null}

          {onPage ? (
            <Drawer position="bottom" open={menuOpen} onOpenChange={setMenuOpen}>
              <DrawerTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  iconOnly
                  className="md:hidden"
                  aria-label={NAV.openMenu}
                >
                  <Menu className="size-4" aria-hidden="true" />
                </Button>
              </DrawerTrigger>
              <DrawerPopup className="bg-ink-900 text-white" showCloseButton showBar>
                <DrawerHeader>
                  <DrawerTitle className="text-white">{APP_NAME}</DrawerTitle>
                </DrawerHeader>
                <DrawerPanel className="px-4 pt-0 pb-6">
                  <nav aria-label="Product">
                    <MarketingMobileNav onPage onNavigate={() => setMenuOpen(false)} />
                  </nav>
                  <div className="mt-6">
                    <CtaLink position="nav" className="w-full rounded-full">
                      {NAV.book}
                    </CtaLink>
                  </div>
                </DrawerPanel>
              </DrawerPopup>
            </Drawer>
          ) : null}
        </div>
      </div>
    </header>
  );
}
