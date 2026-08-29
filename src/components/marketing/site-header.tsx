"use client";

import { Menu } from "lucide-react";
import Link from "next/link";

import Logo from "@/components/brand/logo";
import { CtaLink } from "@/components/marketing/cta-link";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerHeader,
  DrawerPanel,
  DrawerPopup,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { APP_NAME } from "@/lib/constants";
import { waitlistHref } from "@/lib/marketing/config";
import { HERO, NAV } from "@/lib/marketing/copy";
import {
  marketingNavLink,
  marketingPageGutter,
  marketingShell,
} from "@/lib/marketing/ui";
import { cn } from "@/lib/utils";

function NavLinks({
  onPage,
  className,
}: {
  onPage: boolean;
  className?: string;
}) {
  return (
    <ul className={cn("flex items-center gap-1", className)}>
      {NAV.sections.map((item) => (
        <li key={item.href}>
          <Link
            href={onPage ? item.href : `/${item.href}`}
            className={marketingNavLink}
          >
            {item.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function SiteHeader({
  action = "waitlist",
}: {
  action?: "waitlist" | "none";
}) {
  const onPage = action === "waitlist";

  return (
    <header className="relative sticky top-0 z-50 border-b border-white/[0.06] bg-ink-950/75 backdrop-blur-xl">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-brand-500/45 to-transparent"
      />
      <div
        className={cn(
          marketingShell,
          marketingPageGutter,
          "flex h-16 items-center justify-between gap-4"
        )}
      >
        <div className="flex min-w-0 items-center gap-8">
          <Link
            href="/"
            aria-label={`${APP_NAME} home`}
            className="shrink-0 rounded-sm transition-opacity hover:opacity-80"
          >
            <Logo className="h-5 w-auto sm:h-[22px]" />
          </Link>
          {onPage ? (
            <nav aria-label="Page" className="hidden md:block">
              <NavLinks onPage className="gap-1" />
            </nav>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          {action === "waitlist" ? (
            <CtaLink position="nav" size="sm" className="rounded-full px-4">
              {NAV.waitlist}
            </CtaLink>
          ) : null}

          {onPage ? (
            <Drawer position="bottom">
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
                <DrawerPanel className="px-4 pt-0">
                  <nav aria-label="Page" className="flex flex-col gap-1">
                    {NAV.sections.map((item) => (
                      <DrawerClose key={item.href} asChild>
                        <Link
                          href={item.href}
                          className="flex min-h-11 items-center rounded-xl px-3 text-base font-medium text-silver transition-colors hover:bg-white/[0.04] hover:text-white"
                        >
                          {item.label}
                        </Link>
                      </DrawerClose>
                    ))}
                  </nav>
                  <div className="mt-6 flex flex-col gap-3">
                    <DrawerClose asChild>
                      <Button variant="outline" className="w-full" render={<a href="#case-file" />}>
                        {HERO.secondaryCta}
                      </Button>
                    </DrawerClose>
                    <DrawerClose asChild>
                      <Button
                        variant="gradient"
                        className="w-full rounded-full"
                        render={<a href={waitlistHref("nav")} data-cta-position="nav" />}
                      >
                        {NAV.waitlist}
                      </Button>
                    </DrawerClose>
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
