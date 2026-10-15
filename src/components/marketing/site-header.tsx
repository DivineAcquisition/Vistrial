import { Menu } from "lucide-react";
import Link from "next/link";

import Logo from "@/components/brand/logo";
import { MarketingMobileNav, MarketingNav } from "@/components/marketing/marketing-nav";
import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/lib/constants";
import { NAV } from "@/lib/marketing/content";
import { marketingPageGutter, marketingShell } from "@/lib/marketing/ui";
import { cn } from "@/lib/utils";

export function SiteHeader({ action = "cta" }: { action?: "cta" | "none" }) {
  const showNav = action === "cta";

  return (
    <header className="relative sticky top-0 z-50 border-b border-[#2a2833] bg-[#07070b]">
      <div className={cn(marketingShell, marketingPageGutter, "flex h-16 items-center justify-between gap-3")}>
        <Link href="/" aria-label={`${APP_NAME} home`} className="shrink-0 rounded-sm">
          <Logo className="h-5 w-auto sm:h-[22px]" />
        </Link>
        {showNav ? (
          <nav aria-label="On this page" className="hidden md:block">
            <MarketingNav />
          </nav>
        ) : null}
        <div className="flex items-center gap-2">
          <a href={NAV.signInHref} className="hidden text-sm font-medium text-silver hover:text-white sm:inline">
            {NAV.signIn}
          </a>
          {showNav ? (
            <Button variant="gradient" size="sm" className="rounded-[8px]! before:rounded-[7px]!" render={<Link href="/request?from=nav" data-cta-position="nav" />}>
              {NAV.request}
            </Button>
          ) : null}
          {showNav ? (
            <details className="relative md:hidden">
              <summary className="flex size-8 cursor-pointer list-none items-center justify-center rounded-lg text-white [&::-webkit-details-marker]:hidden">
                <span className="sr-only">{NAV.openMenu}</span>
                <Menu className="size-4" aria-hidden="true" />
              </summary>
              <nav aria-label="On this page" className="absolute right-0 z-50 mt-2 w-56 rounded-lg border border-[#2a2833] bg-[#1c1a27] p-3 shadow-xl">
                <MarketingMobileNav />
              </nav>
            </details>
          ) : null}
        </div>
      </div>
    </header>
  );
}
