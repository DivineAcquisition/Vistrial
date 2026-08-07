import Link from "next/link";

import Logo from "@/components/brand/logo";
import { PortalSignOutButton } from "@/components/shell/portal-sign-out-button";
import { Backdrop } from "@/components/ui/backdrop";
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
    <div className="relative min-h-screen bg-ink-950 text-white antialiased">
      <Backdrop />

      <div className="relative z-10 flex min-h-screen flex-col">
        <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-ink-950/70 backdrop-blur-xl">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-6">
            <div className="flex items-center gap-3">
              <Link href="/portal" aria-label={`${APP_NAME} portal home`}>
                <Logo className="h-[22px] w-auto transition-opacity hover:opacity-80 sm:h-[26px]" />
              </Link>
              <span
                aria-hidden
                className="hidden h-6 w-px bg-white/10 sm:block"
              />
              <p className="hidden text-sm text-silver sm:block">{clientName}</p>
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

          <nav className="mx-auto flex max-w-5xl gap-1.5 overflow-x-auto px-5 pb-3 sm:px-6">
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active === link.href ? "page" : undefined}
                className={cn(
                  "shrink-0 rounded-xl px-3.5 py-2 text-sm font-medium whitespace-nowrap transition-colors",
                  active === link.href
                    ? "bg-brand-500/12 text-brand-100 ring-1 ring-brand-500/30 ring-inset"
                    : "text-silver hover:bg-white/[0.04] hover:text-white"
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-8 sm:px-6">
          {children}
        </main>

        <footer className="hairline-glow relative border-t border-white/[0.06]">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-5 py-8 sm:px-6">
            <div className="flex items-center gap-3">
              <Logo markOnly className="h-6 w-auto opacity-70" />
              <div>
                <p className="text-sm font-medium text-white">
                  {APP_NAME} client portal
                </p>
                <p className="text-xs text-dim">{APP_OWNER}</p>
              </div>
            </div>
            <p className="text-xs text-dim">{clientName}</p>
          </div>
        </footer>
      </div>
    </div>
  );
}
