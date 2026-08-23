import Link from "next/link";

import Logo from "@/components/brand/logo";
import { APP_NAME, APP_OWNER, CONTACT_EMAIL } from "@/lib/constants";
import { FOOTER } from "@/lib/marketing/copy";
import { marketingPageGutter, marketingShell } from "@/lib/marketing/ui";
import { cn } from "@/lib/utils";

const footerLinkClass =
  "text-sm text-silver transition-colors hover:text-brand-300 focus-visible:text-white";

function FooterList({
  heading,
  links,
}: {
  heading: string;
  links: readonly { href: string; label: string }[];
}) {
  return (
    <div>
      <p className="text-[11px] font-semibold tracking-[0.16em] text-dim uppercase">{heading}</p>
      <ul className="mt-4 space-y-2.5">
        {links.map((link) => (
          <li key={link.href}>
            <Link href={link.href} className={footerLinkClass}>
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SiteFooter() {
  return (
    <footer className="relative border-t border-white/[0.06]">
      <div className={cn(marketingShell, marketingPageGutter, "py-10 sm:py-12")}>
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2 lg:col-span-1">
            <Link href="/" aria-label={`${APP_NAME} home`} className="inline-block">
              <Logo className="h-6 w-auto" />
            </Link>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-dim">{FOOTER.productLine}</p>
          </div>
          <FooterList
            heading={FOOTER.product}
            links={[
              { href: "/", label: "Home" },
              { href: "/#waitlist", label: "Waitlist" },
            ]}
          />
          <FooterList
            heading={FOOTER.company}
            links={[{ href: "/contact", label: "Contact" }]}
          />
          <FooterList
            heading={FOOTER.legal}
            links={[
              { href: "/privacy", label: "Privacy" },
              { href: "/terms", label: "Terms" },
              { href: "/disclaimer", label: "Disclaimer" },
            ]}
          />
        </div>
        <div className="mt-8 flex flex-col gap-3 border-t border-white/[0.05] pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-dim">
            © {APP_OWNER}. All rights reserved.
          </p>
          <a href={`mailto:${CONTACT_EMAIL}`} className={cn(footerLinkClass, "text-xs font-medium")}>
            {CONTACT_EMAIL}
          </a>
        </div>
      </div>
    </footer>
  );
}
