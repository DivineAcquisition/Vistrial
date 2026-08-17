import Logo from "@/components/brand/logo";
import { Backdrop } from "@/components/ui/backdrop";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiCard, KpiGrid } from "@/components/ui/kpi-card";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { APP_NAME, APP_OWNER } from "@/lib/constants";
import { btnPrimary, btnSecondary, btnSizeMd, eyebrow } from "@/lib/ui";

export default function HomePage() {
  return (
    <div className="relative min-h-screen bg-ink-950 text-white antialiased">
      <Backdrop />

      <main className="relative z-10 mx-auto flex min-h-screen w-full max-w-5xl flex-col px-5 py-16 sm:px-8">
        <Logo className="animate-rise h-7 w-auto" />

        <p className={`${eyebrow} animate-rise delay-1 mt-10`}>
          {APP_OWNER}
        </p>
        <h1 className="animate-rise delay-2 mt-5 text-4xl font-semibold tracking-tight sm:text-5xl">
          <span className="text-gradient">{APP_NAME}</span>
        </h1>
        <p className="animate-rise delay-3 mt-4 max-w-xl text-base leading-relaxed text-silver">
          The product is being rebuilt. The hiring-site visual language stays:
          dark-only surfaces, brand action colour, and the same panel, type, and
          tone vocabulary.
        </p>

        <div className="animate-rise delay-4 mt-8 flex flex-wrap gap-3">
          <span className={`${btnPrimary} ${btnSizeMd}`}>Primary action</span>
          <span className={`${btnSecondary} ${btnSizeMd}`}>Secondary</span>
        </div>

        <div className="animate-rise delay-5 mt-12">
          <KpiGrid columns={3}>
            <KpiCard label="Brand" value="#9A88FC" tone="brand" sub="Action colour" />
            <KpiCard label="Ink" value="#07070B" tone="neutral" sub="Page ground" />
            <KpiCard label="Status" value="Ready" tone="good" sub="Style system kept" />
          </KpiGrid>
        </div>

        <Panel className="animate-rise delay-6 mt-6 px-6 py-5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge label="brand" tone="brand" />
            <StatusBadge label="good" tone="good" />
            <StatusBadge label="warning" tone="warning" />
            <StatusBadge label="critical" tone="critical" />
            <StatusBadge label="neutral" tone="neutral" />
          </div>
          <p className="mt-4 text-sm leading-relaxed text-silver">
            Tokens live in <code className="text-brand-300">app/globals.css</code>.
            Recipes live in <code className="text-brand-300">lib/ui.ts</code>.
            Primitives live in <code className="text-brand-300">components/ui</code>.
          </p>
        </Panel>

        <div className="mt-6">
          <EmptyState
            title="Blank canvas"
            detail="Feature code, data, and auth were removed. Rebuild Vistrial on this visual foundation."
          />
        </div>
      </main>
    </div>
  );
}
