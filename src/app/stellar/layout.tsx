import Link from "next/link";

import Logo from "@/components/brand/logo";
import { APP_NAME } from "@/lib/constants";

export const dynamic = "force-dynamic";

/**
 * Chrome shared by all three Stellar surfaces. Deliberately not the
 * operator-app AppShell: Stellar is a distinct product with its own three
 * routes, not a section bolted onto core Vistrial's sidebar.
 */
export default function StellarLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen bg-ink-950 text-card-foreground">
      <header className="sticky top-0 z-20 border-b border-border bg-ink-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
          <span className="flex min-w-0 items-center gap-3">
            <Logo markOnly className="h-8 w-auto" />
            <span className="truncate text-sm text-white">{APP_NAME} Stellar</span>
          </span>
          <Link href="/auth/signout" className="text-sm text-silver hover:text-white">
            Sign out
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
