import Link from "next/link";

import { DataTable } from "@/components/ui/data-table";
import { DefinitionList, KeyValue } from "@/components/ui/definition-list";
import { KpiCard, KpiGrid } from "@/components/ui/kpi-card";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { asArray, asRecord, bool, num, parseBenchmark, str } from "@/lib/profile/parse";
import { formatMinutes } from "@/lib/profile/leak";
import type { Benchmark } from "@/lib/profile/types";
import { previewVoiceDraft } from "@/lib/profile/preview-draft";
import { STAGE_META, nextStage, type ProfileStage } from "@/lib/profile/stages";
import {
  BENCHMARK_LOWER_IS_BETTER,
  BENCHMARK_METRIC_LABELS,
  BENCHMARK_METRIC_UNITS,
  labelFor,
  OBJECTION_TYPES,
} from "@/lib/profile/vocabulary";
import { btnPrimary, btnSecondary, btnSizeMd, helperClass } from "@/lib/ui";

function Empty({ children }: { children: React.ReactNode }) {
  return <p className={helperClass}>{children}</p>;
}

export function BenchmarkPanel({ benchmark }: { benchmark: Benchmark }) {
  if (!benchmark.shown) {
    return (
      <Panel className="px-6 py-6">
        <h3 className="text-sm font-semibold text-white">Against comparable businesses</h3>
        <Empty>{benchmark.plain ?? "No benchmark is shown yet."}</Empty>
      </Panel>
    );
  }
  const rows = benchmark.rows.map((row) => {
    const unit = BENCHMARK_METRIC_UNITS[row.metric];
    const lowerBetter = BENCHMARK_LOWER_IS_BETTER[row.metric];
    const ahead =
      row.ownValue !== null && (lowerBetter ? row.ownValue < row.cohortMedian : row.ownValue > row.cohortMedian);
    return {
      metric: BENCHMARK_METRIC_LABELS[row.metric],
      you: row.ownValue === null ? "Not measurable yet" : `${row.ownValue}${unit}`,
      cohort: `${row.cohortMedian}${unit}`,
      standing:
        row.ownValue === null ? (
          <span className="text-dim">—</span>
        ) : (
          <StatusBadge label={ahead ? "Ahead" : "Behind"} tone={ahead ? "good" : "warning"} />
        ),
    };
  });

  return (
    <Panel className="px-6 py-6">
      <h3 className="text-sm font-semibold text-white">Against comparable businesses</h3>
      <div className="mt-4">
        <DataTable
          columns={[
            { key: "metric", label: "Metric" },
            { key: "you", label: "You" },
            { key: "cohort", label: "Comparable businesses" },
            { key: "standing", label: "" },
          ]}
          rows={rows}
        />
      </div>
      <p className={helperClass}>{benchmark.basis}</p>
    </Panel>
  );
}

function ConnectPayoff({ payoff }: { payoff: Record<string, unknown> }) {
  const connection = asRecord(payoff.connection);
  const found = num(payoff.contacts_found) ?? 0;
  const from = str(payoff.history_from);
  const to = str(payoff.history_to);
  const sources = asArray(payoff.sources);

  if (str(connection.status) !== "active") {
    return (
      <Panel className="px-6 py-6">
        <h3 className="text-sm font-semibold text-white">Nothing to show yet</h3>
        <Empty>Connect the CRM and this fills in with what we found in your history.</Empty>
      </Panel>
    );
  }

  return (
    <Panel className="px-6 py-6">
      <h3 className="text-sm font-semibold text-white">What we found</h3>
      <div className="mt-4">
        <KpiGrid columns={3}>
          <KpiCard label="Contacts in history" value={found.toLocaleString()} />
          <KpiCard
            label="History reaches back to"
            value={from ? new Date(from).toLocaleDateString() : "—"}
            sub={to ? `through ${new Date(to).toLocaleDateString()}` : undefined}
          />
          <KpiCard
            label="Backfill"
            value={str(payoff.backfill_grade) ?? str(payoff.backfill_status) ?? "starting"}
            sub={str(payoff.backfill_phase) ?? undefined}
          />
        </KpiGrid>
      </div>
      {sources.length > 0 ? (
        <div className="mt-5">
          <DataTable
            columns={[
              { key: "source", label: "Source" },
              { key: "n", label: "Contacts" },
            ]}
            rows={sources.map((item) => {
              const row = asRecord(item);
              return { source: str(row.source) ?? "unattributed", n: (num(row.n) ?? 0).toLocaleString() };
            })}
          />
        </div>
      ) : (
        <Empty>
          The backfill is still running. Everything below still works; the numbers fill in as it finishes.
        </Empty>
      )}
    </Panel>
  );
}

function BusinessPayoff({ payoff }: { payoff: Record<string, unknown> }) {
  const capacity = asRecord(payoff.capacity);
  const feedback = asArray(payoff.pattern_feedback);
  return (
    <>
      <BenchmarkPanel benchmark={parseBenchmark(payoff.benchmark)} />
      <Panel className="px-6 py-6">
        <h3 className="text-sm font-semibold text-white">What your month has to carry</h3>
        <div className="mt-4">
        <KpiGrid columns={3}>
            <KpiCard label="Leads a month" value={(num(capacity.volume) ?? 0).toLocaleString()} />
            <KpiCard label="People who can work them" value={String(num(capacity.workers) ?? 0)} />
            <KpiCard
              label="Leads each"
              value={num(capacity.leads_per_worker) === null ? "—" : String(num(capacity.leads_per_worker))}
            />
          </KpiGrid>
        </div>
        {str(capacity.coverage_gap) ? (
          <p className="mt-4 text-sm text-flag-warning">{str(capacity.coverage_gap)}</p>
        ) : null}
      </Panel>
      {feedback.length > 0 ? (
        <Panel className="px-6 py-6">
          <h3 className="text-sm font-semibold text-white">Worth a look</h3>
          <ul className="mt-3 space-y-3">
            {feedback.map((item, index) => {
              const row = asRecord(item);
              return (
                <li key={str(row.key) ?? index}>
                  <p className="text-sm text-white">{str(row.plain)}</p>
                  <p className={helperClass}>{str(row.basis)}</p>
                </li>
              );
            })}
          </ul>
          <p className={helperClass}>These are suggestions. Nothing here changed a setting.</p>
        </Panel>
      ) : null}
    </>
  );
}

function FunnelPayoff({ payoff }: { payoff: Record<string, unknown> }) {
  const median = num(payoff.speed_median_minutes);
  const intent = num(payoff.intent_minutes);
  const sources = asArray(payoff.sources);
  const undeclared = sources.filter((item) => !bool(asRecord(item).declared));

  return (
    <>
      <Panel className="px-6 py-6">
        <h3 className="text-sm font-semibold text-white">Your real speed to lead</h3>
        {bool(payoff.speed_too_small) || median === null ? (
          <Empty>
            Only {num(payoff.speed_sample_n) ?? 0} contacts in your history were ever touched, which is
            too few to put a median on. The queue will measure it live from day one.
          </Empty>
        ) : (
          <div className="mt-4">
        <KpiGrid columns={2}>
              <KpiCard label="You intend" value={formatMinutes(intent)} />
              <KpiCard
                label="Your history says"
                value={formatMinutes(median)}
                tone={intent !== null && median > intent * 2 ? "critical" : "neutral"}
              />
            </KpiGrid>
          </div>
        )}
        <p className={helperClass}>
          Measured from your CRM contacts: opt-in to the first human touch. Most owners are surprised by
          this number.
        </p>
      </Panel>

      <Panel className="px-6 py-6">
        <h3 className="text-sm font-semibold text-white">Where your leads actually come from</h3>
        <div className="mt-4">
          <DataTable
            columns={[
              { key: "source", label: "Source in your CRM" },
              { key: "n", label: "Contacts" },
              { key: "declared", label: "On your profile" },
            ]}
            rows={sources.map((item) => {
              const row = asRecord(item);
              return {
                source: str(row.source) ?? "unattributed",
                n: (num(row.n) ?? 0).toLocaleString(),
                declared: bool(row.declared) ? (
                  <StatusBadge label="Declared" tone="good" />
                ) : (
                  <StatusBadge label="Not declared" tone="warning" />
                ),
              };
            })}
            empty="No sources have arrived from the CRM yet."
          />
        </div>
        {undeclared.length > 0 ? (
          <p className={helperClass}>
            {undeclared.length} source{undeclared.length === 1 ? "" : "s"} are producing leads that you
            did not list. Reporting can count them but cannot label them.
          </p>
        ) : null}
      </Panel>
    </>
  );
}

function QualificationPayoff({ payoff }: { payoff: Record<string, unknown> }) {
  const weights = asRecord(payoff.weights);
  const top = asArray(payoff.top_leads);
  return (
    <>
      <Panel className="px-6 py-6">
        <h3 className="text-sm font-semibold text-white">How your real leads score under this</h3>
        <div className="mt-4">
        <KpiGrid columns={3}>
            <KpiCard label="Leads scored" value={String(num(payoff.scored_leads) ?? 0)} sub={`of ${num(payoff.total_leads) ?? 0}`} />
            <KpiCard label="Ready today" value={String(num(payoff.ready_today) ?? 0)} tone="good" />
            <KpiCard label="Ready threshold" value={String(num(payoff.ready_threshold) ?? 0)} />
          </KpiGrid>
        </div>
        <DefinitionList>
          <KeyValue label="Timeline">{num(weights.timeline) ?? 0}</KeyValue>
          <KeyValue label="Investment capacity">{num(weights.investment_capacity) ?? 0}</KeyValue>
          <KeyValue label="Decision authority">{num(weights.decision_authority) ?? 0}</KeyValue>
          <KeyValue label="Pain severity">{num(weights.pain_severity) ?? 0}</KeyValue>
        </DefinitionList>
      </Panel>
      <Panel className="px-6 py-6">
        <h3 className="text-sm font-semibold text-white">Your highest scoring leads right now</h3>
        <div className="mt-4">
          <DataTable
            columns={[
              { key: "name", label: "Lead" },
              { key: "score", label: "Score" },
              { key: "ready", label: "" },
            ]}
            rows={top.map((item) => {
              const row = asRecord(item);
              return {
                name: str(row.name) ?? "Unnamed lead",
                score: String(num(row.score) ?? "—"),
                ready: bool(row.ready) ? <StatusBadge label="Ready" tone="good" /> : null,
              };
            })}
            empty="No lead has been scored yet. Map a field the CRM already sends and this fills in."
          />
        </div>
      </Panel>
    </>
  );
}

function ProcessPayoff({ payoff }: { payoff: Record<string, unknown> }) {
  const median = num(payoff.speed_median_minutes);
  const window = num(payoff.window_minutes);
  const branches = asArray(payoff.branches);
  return (
    <>
      <Panel className="px-6 py-6">
        <h3 className="text-sm font-semibold text-white">The gap you just set the alarm against</h3>
        <div className="mt-4">
        <KpiGrid columns={3}>
            <KpiCard label="Alarm fires at" value={formatMinutes(window)} />
            <KpiCard
              label="Your history says"
              value={median === null ? "Not measurable" : formatMinutes(median)}
            />
            <KpiCard
              label="In alarm right now"
              value={String(num(payoff.in_alarm_now) ?? 0)}
              tone={(num(payoff.in_alarm_now) ?? 0) > 0 ? "critical" : "good"}
            />
          </KpiGrid>
        </div>
      </Panel>
      <Panel className="px-6 py-6">
        <h3 className="text-sm font-semibold text-white">What Vistrial will and will not send</h3>
        <div className="mt-4">
          <DataTable
            columns={[
              { key: "branch", label: "Situation" },
              { key: "state", label: "" },
              { key: "channel", label: "Channel" },
            ]}
            rows={branches.map((item) => {
              const row = asRecord(item);
              return {
                branch: str(row.branch) ?? "",
                state: bool(row.enabled) ? (
                  <StatusBadge label="Vistrial drafts" tone="good" />
                ) : (
                  <StatusBadge label="Left to your CRM" tone="neutral" />
                ),
                channel: str(row.channel) ?? "",
              };
            })}
          />
        </div>
        <p className={helperClass}>
          Anything left to your CRM stays off here, so a prospect never gets the same nudge twice.
        </p>
      </Panel>
    </>
  );
}

function ObjectionsPayoff({ payoff }: { payoff: Record<string, unknown> }) {
  const vocabulary = asArray(payoff.vocabulary);
  return (
    <Panel className="px-6 py-6">
      <h3 className="text-sm font-semibold text-white">Your objection taxonomy, seeded</h3>
      <div className="mt-4">
        <DataTable
          columns={[
            { key: "type", label: "Type" },
            { key: "phrasing", label: "How your prospects say it" },
            { key: "response", label: "What you say back" },
          ]}
          rows={vocabulary.map((item) => {
            const row = asRecord(item);
            return {
              type: labelFor(OBJECTION_TYPES, str(row.type)),
              phrasing: str(row.phrasing) ?? "",
              response: str(row.response) ?? "—",
            };
          })}
          empty="Nothing seeded yet."
        />
      </div>
      <p className={helperClass}>
        Extraction now has your prospects&apos; wording to match against before a single transcript has
        arrived. {num(payoff.extracted_so_far) ?? 0} objections have been pulled from calls so far.
      </p>
    </Panel>
  );
}

async function VoicePayoff({ orgId, payoff }: { orgId: string; payoff: Record<string, unknown> }) {
  const preview = await previewVoiceDraft(orgId);
  return (
    <Panel className="px-6 py-6">
      <h3 className="text-sm font-semibold text-white">A real draft, in your voice</h3>
      {preview.kind === "draft" ? (
        <>
          <p className={helperClass}>
            For {preview.leadName}, over {preview.channel === "sms" ? "text" : "email"}.
          </p>
          {preview.subject ? (
            <p className="mt-4 text-sm font-medium text-white">{preview.subject}</p>
          ) : null}
          <p className="mt-2 whitespace-pre-wrap text-sm text-silver">{preview.body}</p>
          <p className={helperClass}>{preview.basis}</p>
        </>
      ) : preview.kind === "no_call" ? (
        <>
          <p className={helperClass}>{preview.basis}</p>
          <DefinitionList>
            <KeyValue label="Examples on file">{preview.exampleCount}</KeyValue>
            <KeyValue label="Formality">{str(payoff.formality) ?? "not set"}</KeyValue>
            <KeyValue label="Channel">{str(payoff.default_channel) ?? "not set"}</KeyValue>
            <KeyValue label="First lead it will run on">{preview.leadName ?? "none yet"}</KeyValue>
          </DefinitionList>
        </>
      ) : (
        <p className={helperClass}>{preview.reason}</p>
      )}
    </Panel>
  );
}

function GoalsPayoff({ payoff }: { payoff: Record<string, unknown> }) {
  const completeness = asRecord(payoff.completeness);
  const latest = asRecord(payoff.latest_leak_report);
  return (
    <Panel className="px-6 py-6">
      <h3 className="text-sm font-semibold text-white">Your Leak Report is ready</h3>
      <p className={helperClass}>
        Real numbers from your own history, framed against what you just told us you intend. It is
        yours to forward.
      </p>
      <DefinitionList>
        <KeyValue label="Profile answered">
          {num(completeness.answered) ?? 0} of {num(completeness.total) ?? 0} fields a feature reads
        </KeyValue>
        <KeyValue label="Contributing to anonymized patterns">
          {bool(payoff.aggregate_opt_out) ? "No, you opted out" : "Yes"}
        </KeyValue>
        {str(latest.generated_at) ? (
          <KeyValue label="Last generated">
            {new Date(str(latest.generated_at) as string).toLocaleString()}
          </KeyValue>
        ) : null}
      </DefinitionList>
      <div className="mt-5">
        <Link href="/app/onboarding/report" className={`${btnPrimary} ${btnSizeMd}`}>
          Open the Leak Report
        </Link>
      </div>
    </Panel>
  );
}

export async function StagePayoff({
  orgId,
  stage,
  payoff,
}: {
  orgId: string;
  stage: ProfileStage;
  payoff: Record<string, unknown>;
}) {
  const after = nextStage(stage);
  const body =
    stage === "connect" ? (
      <ConnectPayoff payoff={payoff} />
    ) : stage === "business" ? (
      <BusinessPayoff payoff={payoff} />
    ) : stage === "funnel" ? (
      <FunnelPayoff payoff={payoff} />
    ) : stage === "qualification" ? (
      <QualificationPayoff payoff={payoff} />
    ) : stage === "process" ? (
      <ProcessPayoff payoff={payoff} />
    ) : stage === "objections" ? (
      <ObjectionsPayoff payoff={payoff} />
    ) : stage === "voice" ? (
      <VoicePayoff orgId={orgId} payoff={payoff} />
    ) : (
      <GoalsPayoff payoff={payoff} />
    );

  return (
    <div className="space-y-6">
      {body}
      <div className="flex flex-wrap items-center gap-3">
        {after ? (
          <Link href={`/app/onboarding/${after}`} className={`${btnPrimary} ${btnSizeMd}`}>
            Next: {STAGE_META[after].title.toLowerCase()}
          </Link>
        ) : (
          <Link href="/app/settings/business-profile" className={`${btnPrimary} ${btnSizeMd}`}>
            Review the whole profile
          </Link>
        )}
        <Link href={`/app/onboarding/${stage}`} className={`${btnSecondary} ${btnSizeMd}`}>
          Change my answers
        </Link>
      </div>
    </div>
  );
}
