import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CompassSampleView } from "@/components/compass/sample-view";
import { getAuthContext } from "@/lib/auth/session";
import { COMPASS_SAMPLE_STATES, isCompassSampleState } from "@/lib/compass/samples";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Compass states",
  robots: { index: false, follow: false },
};

const WIDTHS = [
  { id: "phone", label: "Phone", width: "390px" },
  { id: "tablet", label: "Tablet", width: "800px" },
  { id: "desktop", label: "Desktop", width: "100%" },
] as const;

/** Compass in each state, from sample conversations. Platform Admins only. */
export default async function CompassStatesPage({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  const ctx = await getAuthContext();
  if (!ctx.isPlatformAdmin) notFound();
  const query = await searchParams;
  const state = isCompassSampleState(query.state) ? query.state : "answer";

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Compass states" className="flex flex-wrap gap-2">
        {COMPASS_SAMPLE_STATES.map((item) => (
          <Link
            key={item.id}
            href={`/app/layouts/compass?state=${item.id}`}
            aria-current={item.id === state ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 items-center rounded-full border px-3 text-sm",
              item.id === state
                ? "border-brand-500/40 bg-brand-500/12 text-brand-200"
                : "border-border text-muted-foreground hover:text-card-foreground",
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      {WIDTHS.map((item) => (
        <section key={item.id} className="flex flex-col gap-2" aria-label={item.label}>
          <h2 className="text-sm text-muted-foreground">{item.label}</h2>
          <CompassSampleView state={state} width={item.width} />
        </section>
      ))}
    </div>
  );
}
