"use client";

import Link from "next/link";

import { NAV } from "@/lib/marketing/content";
import { marketingNavLink } from "@/lib/marketing/ui";

export function MarketingNav() {
  return (
    <ul className="flex items-center gap-0.5 rounded-lg border border-[#2a2833] bg-[#12111a] p-1">
      {NAV.links.map((link) => (
        <li key={link.href}>
          <Link href={link.href} className={`${marketingNavLink} hover:bg-[#1c1a27]`}>
            {link.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function MarketingMobileNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <ul className="grid gap-1">
      {NAV.links.map((link) => (
        <li key={link.href}>
          <Link href={link.href} className={`${marketingNavLink} block py-2`} onClick={onNavigate}>
            {link.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}
