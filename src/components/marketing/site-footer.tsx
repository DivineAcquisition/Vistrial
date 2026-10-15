import Link from "next/link";

import Logo from "@/components/brand/logo";
import { APP_NAME, CONTACT_EMAIL } from "@/lib/constants";
import { FOOTER, NAV } from "@/lib/marketing/content";
import { marketingPageGutter, marketingShell } from "@/lib/marketing/ui";
import { cn } from "@/lib/utils";

const footerLinkClass = "text-sm text-silver transition-colors hover:text-brand-300";

export function SiteFooter() {
  return (
    <footer className="relative border-t border-white/[0.06]">
      <div className={cn(marketingShell, marketingPageGutter, "py-10 sm:py-12")}>
        <div className="grid gap-8 sm:grid-cols-[1.4fr_1fr]">
          <div>
            <Link href="/" aria-label={`${APP_NAME} home`} className="inline-block">
              <Logo className="h-6 w-auto" />
            </Link>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-silver">{FOOTER.productLine}</p>
          </div>
          <ul className="grid gap-2 sm:justify-items-end">
            {FOOTER.links.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className={footerLinkClass}>
                  {link.label}
                </Link>
              </li>
            ))}
            <li>
              <a href={NAV.signInHref} className={footerLinkClass}>
                {NAV.signIn}
              </a>
            </li>
          </ul>
        </div>
        <p className="mt-8 border-t border-white/[0.05] pt-6 text-xs text-dim">
          © {new Date().getFullYear()} {FOOTER.copyright}.{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-white">
            {CONTACT_EMAIL}
          </a>
        </p>
      </div>
    </footer>
  );
}
