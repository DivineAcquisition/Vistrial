import type { ReactNode } from "react";
import Link from "next/link";

import Logo from "@/components/brand/logo";
import { getStaffContext } from "@/lib/auth/staff";
import { btnGhost, btnSizeSm } from "@/lib/ui";

export const dynamic = "force-dynamic";

export default async function OpsLayout({ children }: { children: ReactNode }) {
  const { user } = await getStaffContext();

  return (
    <div className="flex min-h-screen bg-ink-950 text-white">
      <aside className="sticky top-0 hidden h-svh w-56 shrink-0 flex-col border-r border-white/[0.08] bg-ink-900 md:flex">
        <div className="px-4 py-5">
          <Logo className="h-6 w-auto" />
          <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-dim">
            Staff console
          </p>
        </div>
        <nav className="flex-1 px-2">
          <Link href="/ops" className="block rounded-xl px-3 py-2 text-sm text-silver hover:bg-white/[0.04] hover:text-white">
            Clients
          </Link>
          <Link href="/ops/orgs/new" className="block rounded-xl px-3 py-2 text-sm text-silver hover:bg-white/[0.04] hover:text-white">
            New organization
          </Link>
        </nav>
        <div className="border-t border-white/[0.08] p-3 text-xs text-dim">
          <p className="truncate">{user.email}</p>
          <Link href="/auth/signout" className={`${btnGhost} ${btnSizeSm} mt-2 px-0`}>
            Sign out
          </Link>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-5 py-6 sm:px-8 sm:py-8">{children}</main>
    </div>
  );
}
