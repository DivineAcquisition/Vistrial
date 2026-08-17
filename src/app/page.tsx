import Logo from "@/components/brand/logo";
import { Backdrop } from "@/components/ui/backdrop";
import { KpiCard, KpiGrid } from "@/components/ui/kpi-card";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { APP_NAME, APP_OWNER } from "@/lib/constants";
import { btnPrimary, btnSizeMd, eyebrow } from "@/lib/ui";

export default function Home() {
  return (
    <div className="relative min-h-screen bg-ink-950 text-white">
      <Backdrop />

      <main className="relative z-10 mx-auto flex min-h-screen w-full max-w-lg flex-col items-center justify-center px-5 py-16 sm:px-8">
        <Logo className="animate-rise h-7 w-auto" />

        <p className={`${eyebrow} animate-rise delay-1 mt-10`}>Foundation</p>
        <h1 className="animate-rise delay-2 mt-5 text-4xl font-semibold tracking-tight sm:text-5xl">
          <span className="text-gradient">{APP_NAME}</span>
        </h1>
        <p className="animate-rise delay-3 mt-4 max-w-md text-center text-sm leading-relaxed text-silver">
          Case files for high-ticket sales teams. Know the lead before you dial.
        </p>

        <Panel className="animate-rise delay-4 mt-10 w-full rounded-3xl px-6 py-8 sm:px-8">
          <p className="text-[11px] font-semibold tracking-[0.15em] text-brand-300 uppercase">
            Readiness score
          </p>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="tabular text-5xl font-semibold text-brand-500">
              78
            </span>
            <span className="text-sm text-dim">/ 100</span>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-silver">
            Dark theme, hiring-site surfaces, and Supabase clients are wired.
            Schema and tenancy come next.
          </p>
          <div className="mt-6 flex justify-center">
            <span className={`${btnPrimary} ${btnSizeMd} w-full`}>
              Open case file
            </span>
          </div>
        </Panel>

        <div className="animate-rise delay-5 mt-6 w-full">
          <KpiGrid columns={3}>
            <KpiCard label="Brand" value="#9A88FC" tone="brand" />
            <KpiCard label="Ink" value="#07070B" tone="neutral" />
            <KpiCard label="Score" value="78" tone="good" />
          </KpiGrid>
        </div>

        <div className="animate-rise delay-6 mt-6 flex flex-wrap items-center justify-center gap-2">
          <StatusBadge label="brand" tone="brand" />
          <StatusBadge label="good" tone="good" />
          <StatusBadge label="warning" tone="warning" />
          <StatusBadge label="critical" tone="critical" />
        </div>

        <p className="animate-fade delay-6 mt-8 text-xs text-dim">
          {APP_NAME} · {APP_OWNER}
        </p>
      </main>
    </div>
  );
}
