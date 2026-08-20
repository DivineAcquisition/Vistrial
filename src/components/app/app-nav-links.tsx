"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useOrg } from "@/components/app/org-provider";
import { isNavActive, navVisibleTo, PRIMARY_NAV } from "@/lib/navigation";
import { cn } from "@/lib/utils";

export function AppNavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { role } = useOrg();

  return (
    <nav className="flex flex-col gap-0.5">
      {PRIMARY_NAV.filter((item) => navVisibleTo(item, role)).map((item) => {
        const active = isNavActive(pathname, item.match);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "rounded-xl px-3 py-2 text-sm",
              active
                ? "bg-brand-950 text-brand-300"
                : "text-silver hover:bg-white/[0.04] hover:text-white"
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
