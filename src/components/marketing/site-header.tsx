"use client";

import { Menu } from "lucide-react";
import Link from "next/link";

import Logo from "@/components/brand/logo";
import { CtaLink } from "@/components/marketing/cta-link";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { APP_NAME } from "@/lib/constants";
import { bookingHref } from "@/lib/marketing/config";
import { AUDIT, HERO, NAV } from "@/lib/marketing/copy";
import { marketingNavLink, marketingPageGutter, marketingShell } from "@/lib/marketing/ui";
import { btnGhost, btnGradient, btnSizeLg, btnSizeMd } from "@/lib/ui";
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
  action = "book",
}: {
  action?: "book" | "none";
}) {
  const onPage = action === "book";

  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-ink-950/75 backdrop-blur-xl">
      <div
        className={cn(
          marketingShell,
          marketingPageGutter,
          "flex h-16 items-center justify-between gap-4 sm:h-[72px]"
        )}
      >
        <div className="flex min-w-0 items-center gap-8">
          <Link
            href="/"
            aria-label={`${APP_NAME} home`}
            className="shrink-0 rounded-sm transition-opacity hover:opacity-80"
          >
            <Logo className="h-[22px] w-auto sm:h-[28px]" />
          </Link>
          {onPage ? (
            <nav aria-label="Page" className="hidden md:block">
              <NavLinks onPage className="gap-1" />
            </nav>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          {onPage ? (
            <a href="#case-file" className={cn(btnGhost, btnSizeMd, "hidden lg:inline-flex")}>
              {HERO.secondaryCta}
            </a>
          ) : null}
          {action === "book" ? (
            <CtaLink position="nav" size="sm">
              <span className="sm:hidden">{AUDIT.cta}</span>
              <span className="hidden sm:inline">{HERO.primaryCta}</span>
            </CtaLink>
          ) : null}

          {onPage ? (
            <Sheet>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  iconOnly
                  className="md:hidden"
                  aria-label={NAV.openMenu}
                >
                  <Menu className="size-4" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="bg-ink-900">
                <SheetHeader>
                  <SheetTitle className="text-white">{APP_NAME}</SheetTitle>
                </SheetHeader>
                <nav aria-label="Page" className="flex flex-col gap-1 px-4">
                  {NAV.sections.map((item) => (
                    <SheetClose key={item.href} asChild>
                      <Link
                        href={item.href}
                        className="flex min-h-11 items-center rounded-xl px-3 text-base font-medium text-silver transition-colors hover:bg-white/[0.04] hover:text-white"
                      >
                        {item.label}
                      </Link>
                    </SheetClose>
                  ))}
                </nav>
                <div className="mt-6 flex flex-col gap-3 px-4">
                  <SheetClose asChild>
                    <a href="#case-file" className={cn(btnGhost, btnSizeMd, "justify-center")}>
                      {HERO.secondaryCta}
                    </a>
                  </SheetClose>
                  <SheetClose asChild>
                    <a
                      href={bookingHref("nav")}
                      data-cta-position="nav"
                      className={cn(btnGradient, btnSizeLg, "w-full")}
                    >
                      {HERO.primaryCta}
                    </a>
                  </SheetClose>
                </div>
              </SheetContent>
            </Sheet>
          ) : null}
        </div>
      </div>
    </header>
  );
}
