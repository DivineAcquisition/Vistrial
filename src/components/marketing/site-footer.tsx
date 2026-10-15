import Link from "next/link";

import { OpenConsentButton } from "@/components/marketing/consent-banner";
import Logo from "@/components/brand/logo";
import { APP_NAME } from "@/lib/constants";
import { FOOTER, NAV } from "@/lib/marketing/content";
import { marketingPageGutter, marketingShell } from "@/lib/marketing/ui";
import { loadTrustPublic } from "@/lib/trust/public";
import { cn } from "@/lib/utils";

const footerLinkClass = "text-sm text-silver transition-colors hover:text-brand-300";

export async function SiteFooter() {
  const trust = await loadTrustPublic();
  const links: Array<{ href?: string; label: string }> = [
    { href: "/security", label: "Security" },
    { href: "/security/subprocessors", label: "Subprocessors" },
    { href: "/security/report", label: "Report a vulnerability" },
    { href: "/privacy", label: "Privacy" },
    { href: "/cookies", label: "Cookies" },
    { href: "/terms", label: "Terms" },
    { href: "/privacy/requests", label: "Data requests" },
    { href: "/contact", label: "Contact" },
  ];
  return (
    <footer className="relative border-t border-[#2a2833]">
      <div className={cn(marketingShell, marketingPageGutter, "py-10 sm:py-12")}>
        <div className="grid gap-8 sm:grid-cols-[1.4fr_1fr]">
          <div>
            <Link href="/" aria-label={`${APP_NAME} home`} className="inline-block">
              <Logo className="h-6 w-auto" />
            </Link>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-silver">{FOOTER.productLine}</p>
            {trust.legalEntity && trust.mailingAddress ? (
              <p className="mt-3 max-w-xs text-xs leading-relaxed text-dim">
                {trust.legalEntity}. {trust.mailingAddress}
              </p>
            ) : null}
          </div>
          <ul className="grid gap-2 sm:justify-items-end">
            {links.map((link) => (
              <li key={link.label}>
                {link.href ? (
                  <Link href={link.href} className={footerLinkClass}>
                    {link.label}
                  </Link>
                ) : (
                  <span className="text-sm text-dim">{link.label}</span>
                )}
              </li>
            ))}
            <li>
              <a href={NAV.signInHref} className={footerLinkClass}>
                {NAV.signIn}
              </a>
            </li>
          </ul>
        </div>
        <OpenConsentButton />
        <p className="mt-8 border-t border-[#2a2833] pt-6 text-xs text-dim">
          © {new Date().getFullYear()} {FOOTER.copyright}.{" "}
          <a href={`mailto:${trust.supportEmail}`} className="hover:text-white">
            {trust.supportEmail}
          </a>
        </p>
      </div>
    </footer>
  );
}
