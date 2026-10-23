import { Menu } from "lucide-react";
import Link from "next/link";

import { MarketingMobileNav, MarketingNav } from "@/components/marketing/marketing-nav";
import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/lib/constants";
import { NAV } from "@/lib/marketing/content";
import { marketingPageGutter, marketingShell } from "@/lib/marketing/ui";
import { cn } from "@/lib/utils";

const EMAIL_LOGO_PATH = "/brand/vistrial-icon.png";

const navButton = "h-12! rounded-[8px]! before:rounded-[7px]!";

export function SiteHeader({ action = "cta" }: { action?: "cta" | "none" }) {
  const showNav = action === "cta";

  return (
    <header className="relative sticky top-0 z-50 border-b border-[#2a2833] bg-[#07070b]">
      <div className={cn(marketingShell, marketingPageGutter, "flex h-[4.5rem] items-center justify-between gap-4")}>
        <Link href="/" className="shrink-0 rounded-md" aria-label={`${APP_NAME} home`}>
          {/* Same square mark as the email header. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={EMAIL_LOGO_PATH}
            alt=""
            width={40}
            height={40}
            className="size-10 rounded-[10px]"
          />
        </Link>
        {showNav ? (
          <nav aria-label="On this page" className="hidden md:block">
            <MarketingNav />
          </nav>
        ) : null}
        {showNav ? (
          <details className="relative shrink-0">
            <summary className="flex size-10 cursor-pointer list-none items-center justify-center rounded-md border border-[#2a2833] bg-[#12111a] text-white [&::-webkit-details-marker]:hidden">
              <span className="sr-only">{NAV.openMenu}</span>
              <Menu className="size-4" aria-hidden="true" />
            </summary>
            <div className="absolute right-0 z-50 mt-2 w-64 rounded-lg border border-[#2a2833] bg-[#12111a] p-3 shadow-xl">
              <Button variant="gradient" size="lg" className={cn(navButton, "w-full")} render={<Link href="/request?from=nav" data-cta-position="nav" />}>
                {NAV.request}
              </Button>
              <nav aria-label="On this page" className="mt-2 md:hidden">
                <MarketingMobileNav />
              </nav>
            </div>
          </details>
        ) : null}
      </div>
    </header>
  );
}
