import Link from "next/link";

import { Panel } from "@/components/ui/panel";
import { formatRelative } from "@/lib/format";
import type { FirstWeekHealth } from "@/lib/onboarding/types";
import { coverageLabel } from "@/lib/onboarding/week-parse";
import { helperClass } from "@/lib/ui";

export function FirstWeekPanel({ health, now }: { health: FirstWeekHealth; now: string }) {
  if (!health.activatedAt) return null;
  const unmatchedAge =
    health.unmatchedTranscripts.oldestReceivedAt
      ? formatRelative(health.unmatchedTranscripts.oldestReceivedAt, now)
      : null;

  return (
    <Panel className="mb-8 px-6 py-6">
      <h2 className="text-sm font-semibold text-white">First week</h2>
      <p className={helperClass}>
        Facts for the person accountable for this workspace. Not a score. Not a streak.
      </p>
      {health.zeroIngestWarning ? (
        <p className="mt-4 text-sm font-semibold text-flag-critical">
          No leads have arrived since activation, and it has been more than twenty-four hours.
          Ingestion is broken. Everything looks calm while nothing arrives.
        </p>
      ) : (
        <p className="mt-4 text-sm text-silver">
          {health.leadsIngested} lead{health.leadsIngested === 1 ? "" : "s"} ingested since activation.
        </p>
      )}
      <dl className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-dim">Human touch</dt>
          <dd className="mt-1 text-sm text-white">{coverageLabel(health.touchCoverage)} leads received a human touch</dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-dim">Outcome logging</dt>
          <dd className="mt-1 text-sm text-white">
            {coverageLabel(health.outcomeLoggingRate)} held-call leads have an outcome logged
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-dim">Drafts</dt>
          <dd className="mt-1 text-sm text-white">
            {health.drafts.approved} approved, {health.drafts.rejected} rejected
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-dim">Unmatched transcripts</dt>
          <dd className="mt-1 text-sm text-white">
            {health.unmatchedTranscripts.count}
            {unmatchedAge ? ` · oldest ${unmatchedAge}` : ""}
          </dd>
        </div>
      </dl>
      {health.bypass ? (
        <p className="mt-4 text-sm text-flag-warning">{health.bypass}</p>
      ) : null}
    </Panel>
  );
}

export function SetupNeededBanner() {
  return (
    <Panel className="mb-8 border-flag-warning/40 px-6 py-5">
      <p className="text-sm font-semibold text-flag-warning">This workspace is not live yet</p>
      <p className="mt-2 text-sm text-silver">
        Configuration is sequenced because the dependencies are real. Finish setup before treating
        the queue as production.
      </p>
      <Link href="/app/setup" className="mt-3 inline-block text-sm text-brand-300">
        Continue setup
      </Link>
    </Panel>
  );
}
