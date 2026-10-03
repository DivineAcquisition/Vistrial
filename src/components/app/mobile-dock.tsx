"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, ListChecks, Phone } from "lucide-react";

import { useOrg } from "@/components/app/org-provider";
import { lastOpenedLeadHref } from "@/lib/mobile/last-lead";
import { isNavActive } from "@/lib/navigation";
import { cn } from "@/lib/utils";

/**
 * The three jobs that have to work one-handed. Who to call, what happened,
 * who you are about to talk to.
 */
export function MobileDock() {
  const pathname = usePathname();
  const { org, role } = useOrg();
  if (role === "owner") return null;
  const personHref = lastOpenedLeadHref(org.id) ?? "/app/cases";

  const items = [
    { href: "/app/queue", label: "To call", match: "/app/queue", icon: ListChecks, primary: false },
    {
      href: "/app/log",
      label: "What happened",
      match: "/app/log",
      icon: ClipboardList,
      primary: true,
    },
    { href: personHref, label: "Person", match: "/app/cases", icon: Phone, primary: false },
  ] as const;

  return (
    <nav
      aria-label="In the moment"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.08] bg-ink-950/95 px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-md print:hidden md:hidden"
    >
      <ul className="grid grid-cols-3 gap-1">
        {items.map((item) => {
          const active = isNavActive(pathname, item.match);
          const Icon = item.icon;
          return (
            <li key={item.label}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-semibold",
                  item.primary
                    ? "bg-brand-500 text-ink-950"
                    : active
                      ? "text-brand-200"
                      : "text-silver"
                )}
              >
                <Icon className="size-4" aria-hidden />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
