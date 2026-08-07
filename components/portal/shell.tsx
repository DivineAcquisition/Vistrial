import Link from "next/link";

import Logo from "@/components/brand/logo";
import { PortalSignOutButton } from "@/components/shell/portal-sign-out-button";
import { APP_NAME, APP_OWNER } from "@/lib/constants";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/portal", label: "Dashboard" },
  { href: "/portal/appointments", label: "Appointments" },
  { href: "/portal/billing", label: "Billing" },
  { href: "/portal/definition", label: "Definition" },
] as const;

export function PortalShell({
  children,
  clientName,
  active,
  readOnly = false,
}: {
  children: React.ReactNode;
  clientName: string;
  active: (typeof LINKS)[number]["href"];
  readOnly?: boolean;
}) {
  return (
    <div className="min-h-screen bg-background text-white antialiased">
      <header className="border-b border-border bg-sidebar">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Logo markOnly className="h-5 w-auto" />
            <div>
              <p className="text-sm font-bold tracking-[0.2em] text-brand-500 uppercase">
                {APP_NAME}
              </p>
              <p className="text-xs text-dim">{clientName}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {readOnly ? (
              <span className="rounded-full border border-flag-warning/40 bg-flag-warning/10 px-3 py-1 text-[11px] font-semibold tracking-wide text-flag-warning uppercase">
                Read only
              </span>
            ) : null}
            <PortalSignOutButton />
          </div>
        </div>
        <nav className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-4 pb-3 sm:px-6">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "rounded-full px-4 py-2 text-sm transition-colors",
                active === link.href
                  ? "bg-brand-500/15 text-brand-500"
                  : "text-dim hover:text-silver"
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">{children}</main>

      <footer className="border-t border-border px-4 py-5 sm:px-6">
        <p className="mx-auto max-w-5xl text-xs text-dim">
          {APP_NAME} client portal · {APP_OWNER}
        </p>
      </footer>
    </div>
  );
}
