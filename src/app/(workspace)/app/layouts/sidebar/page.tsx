import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { SidebarSamples } from "@/app/(workspace)/app/layouts/sidebar/sidebar-samples";
import { getAuthContext } from "@/lib/auth/session";
import { isSidebarSampleState, SIDEBAR_SAMPLE_STATES } from "@/lib/agents/samples";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sidebar states",
  robots: { index: false, follow: false },
};

/** The agent sidebar in each state and role, from sample data. Platform Admins only. */
export default async function SidebarStatesPage({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  const ctx = await getAuthContext();
  if (!ctx.isPlatformAdmin) notFound();
  const query = await searchParams;
  const state = isSidebarSampleState(query.state) ? query.state : "busy";
  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-2 text-sm text-muted-foreground">
        <h1 className="text-lg font-medium text-card-foreground">The agent sidebar</h1>
        <p>
          Customer roles keep no more than six fixed destinations plus the agent roster. The roster is generated from the registry and the shared
          summary and is not counted. Staff keep their groups; the roster replaces Sales and Compass in the &quot;this workspace&quot; group.
        </p>
        <p>
          Locked and Available agents never appear as rows; they live in the Agent Library. The phone bar keeps five items at most, with the same
          roster full screen behind the Agents tab.
        </p>
      </div>
      <nav aria-label="Sidebar states" className="flex flex-wrap gap-2">
        {SIDEBAR_SAMPLE_STATES.map((item) => (
          <Link
            key={item.id}
            href={`/app/layouts/sidebar?state=${item.id}`}
            aria-current={item.id === state ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 items-center rounded-full border px-3 text-sm",
              item.id === state ? "border-brand-500 bg-brand-500/12 text-brand-200" : "border-border text-muted-foreground hover:text-card-foreground"
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <SidebarSamples state={state} />
    </div>
  );
}
