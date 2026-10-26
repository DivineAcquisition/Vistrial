import type { ReactNode } from "react";
import Link from "next/link";

import { OpenConsentButton } from "@/components/marketing/consent-banner";
import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/lib/constants";
import { FOOTER, NAV } from "@/lib/marketing/content";
import { marketingPageGutter, marketingShell } from "@/lib/marketing/ui";
import { loadTrustPublic } from "@/lib/trust/public";
import { cn } from "@/lib/utils";

const EMAIL_LOGO_PATH = "/brand/vistrial-icon.png";

const footerLinkClass = "text-sm text-muted-foreground transition-colors hover:text-strong";
const footerButton = "h-12! rounded-[8px]! before:rounded-[7px]!";

const productLinks = NAV.links;
const trustLinks = [
  { href: "/security", label: "Security" },
  { href: "/security/subprocessors", label: "Subprocessors" },
  { href: "/security/report", label: "Report a vulnerability" },
] as const;
const legalLinks = [
  { href: "/privacy", label: "Privacy" },
  { href: "/cookies", label: "Cookies" },
  { href: "/terms", label: "Terms" },
  { href: "/privacy/requests", label: "Data requests" },
  { href: "/contact", label: "Contact" },
] as const;

function FooterColumn({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold tracking-[0.14em] text-strong uppercase">{title}</p>
      <ul className="mt-4 grid gap-2.5">{children}</ul>
    </div>
  );
}

export async function SiteFooter() {
  const trust = await loadTrustPublic();

  return (
    <footer className="relative border-t border-border bg-muted">
      <div className={cn(marketingShell, marketingPageGutter, "py-12 sm:py-16")}>
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_0.8fr_0.9fr_0.8fr]">
          <div>
            <Link href="/" className="inline-block rounded-md" aria-label={`${APP_NAME} home`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={EMAIL_LOGO_PATH} alt="" width={40} height={40} className="size-10 rounded-[10px]" />
            </Link>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">{FOOTER.productLine}</p>
            {trust.legalEntity && trust.mailingAddress ? (
              <p className="mt-3 max-w-xs text-xs leading-relaxed text-muted-foreground">
                {trust.legalEntity}. {trust.mailingAddress}
              </p>
            ) : null}
            <div className="mt-6">
              <Button variant="gradient" size="lg" className={footerButton} render={<Link href="/request?from=contact" data-cta-position="contact" />}>
                {NAV.request}
              </Button>
            </div>
          </div>

          <FooterColumn title="Product">
            {productLinks.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className={footerLinkClass}>
                  {link.label}
                </Link>
              </li>
            ))}
          </FooterColumn>

          <FooterColumn title="Trust">
            {trustLinks.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className={footerLinkClass}>
                  {link.label}
                </Link>
              </li>
            ))}
          </FooterColumn>

          <FooterColumn title="Legal">
            {legalLinks.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className={footerLinkClass}>
                  {link.label}
                </Link>
              </li>
            ))}
            <li>
              <OpenConsentButton className={footerLinkClass} />
            </li>
          </FooterColumn>
        </div>

        <div className="mt-12 flex flex-col gap-2 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} {FOOTER.copyright}
          </p>
          <a href={`mailto:${trust.supportEmail}`} className="hover:text-strong">
            {trust.supportEmail}
          </a>
        </div>
      </div>
    </footer>
  );
}
