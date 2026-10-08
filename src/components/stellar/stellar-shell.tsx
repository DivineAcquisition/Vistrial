"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ApplicationShell } from "@/components/app/application-shell";
import { shellChrome, type ShellNavGroup, type ShellNavItem } from "@/lib/shell/nav";

export function StellarShell({
  children,
  groups,
  phone,
  more,
  homeHref,
  businessName,
  roleLabel,
  accountName,
  cue,
  version,
}: {
  children: React.ReactNode;
  groups: ShellNavGroup[];
  phone: ShellNavItem[];
  more: ShellNavItem[];
  homeHref: string;
  businessName: string;
  roleLabel: string;
  accountName: string;
  cue?: boolean;
  version: string;
}) {
  const pathname = usePathname();
  const chrome = shellChrome(pathname);
  return (
    <ApplicationShell
      groups={groups}
      phone={phone}
      more={more}
      homeHref={homeHref}
      title={chrome.title}
      crumbs={chrome.crumbs}
      version={version}
      leading={
        <p className="max-w-[7rem] truncate text-sm text-muted-foreground sm:max-w-[16rem]" title={businessName}>
          {businessName}
        </p>
      }
      renderAccount={(placement) => (
        <div className={placement === "header" ? "text-right" : "px-2 py-2"}>
          {placement === "sidebar" ? (
            <p className="truncate text-sm text-card-foreground" title={accountName}>
              {accountName}
            </p>
          ) : null}
          <p className="truncate text-[11px] text-dim">{roleLabel}</p>
          <Link href="/auth/signout" className="mt-1 block truncate text-sm text-muted-foreground hover:text-card-foreground">
            Sign out
          </Link>
        </div>
      )}
      cue={
        cue ? (
          <div className="print:hidden">
            <div aria-hidden className="h-0.5 bg-brand-500" />
            <div
              role="note"
              className="flex min-w-0 items-center gap-2 border-b border-brand-500/30 bg-brand-500/10 px-4 py-1.5 text-xs text-card-foreground sm:px-6"
            >
              <span className="shrink-0 font-medium text-brand-300">Service Team</span>
              <span aria-hidden>·</span>
              <span className="truncate" title={businessName}>
                Working inside <span className="font-medium">{businessName}</span>
              </span>
            </div>
          </div>
        ) : null
      }
    >
      {children}
    </ApplicationShell>
  );
}
