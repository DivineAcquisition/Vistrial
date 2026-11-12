import Link from "next/link";

import { CtaButton } from "@/components/marketing/framework-blocks";
import { APP_NAME } from "@/lib/constants";
import { marketingPageGutter, marketingShell } from "@/lib/marketing/ui";
import { cn } from "@/lib/utils";

/** Same square mark as the email header, sized for a 40px slot at 2x. */
const EMAIL_LOGO_PATH = "/brand/vistrial-icon-96.png";

export function SiteHeader({ action = "cta" }: { action?: "cta" | "none" }) {
  const showNav = action === "cta";

  return (
    <header className={cn("relative sticky top-0 z-50 border-b border-border bg-background", marketingPageGutter)}>
      <div className={cn(marketingShell, "flex h-[4.5rem] items-center justify-between gap-4")}>
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
        {/* One button and no menu: on this page every extra link is an exit. Sign in is in the footer. */}
        {showNav ? <CtaButton position="nav" size="lg" className="shrink-0 px-4! sm:px-6!" /> : null}
      </div>
    </header>
  );
}
