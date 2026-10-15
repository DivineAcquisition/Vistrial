import { Menu } from "lucide-react";
import Link from "next/link";

import { MarketingMobileNav, MarketingNav } from "@/components/marketing/marketing-nav";
import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/lib/constants";
import { EMAIL_LOGO_PATH } from "@/lib/email/layout";
import { NAV } from "@/lib/marketing/content";
import { marketingPageGutter, marketingShell } from "@/lib/marketing/ui";
import { cn } from "@/lib/utils";

const navButton = "rounded-[8px]! before:rounded-[7px]!";
const navOutline = "rounded-[8px]! border-[#2a2833]! bg-[#12111a] before:rounded-[7px]! hover:bg-[#1c1a27]";

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
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className={cn(navOutline, "hidden sm:inline-flex")} render={<a href={NAV.signInHref} />}>
            {NAV.signIn}
          </Button>
          {showNav ? (
            <Button variant="gradient" size="sm" className={navButton} render={<Link href="/request?from=nav" data-cta-position="nav" />}>
              {NAV.request}
            </Button>
          ) : null}
          {showNav ? (
            <details className="relative shrink-0 md:hidden">
              <summary className="flex size-10 cursor-pointer list-none items-center justify-center rounded-md border border-[#2a2833] bg-[#12111a] text-white [&::-webkit-details-marker]:hidden">
                <span className="sr-only">{NAV.openMenu}</span>
                <Menu className="size-4" aria-hidden="true" />
              </summary>
              <nav aria-label="On this page" className="absolute right-0 z-50 mt-2 w-60 rounded-lg border border-[#2a2833] bg-[#12111a] p-2 shadow-xl">
                <MarketingMobileNav />
              </nav>
            </details>
          ) : null}
        </div>
      </div>
    </header>
  );
}
