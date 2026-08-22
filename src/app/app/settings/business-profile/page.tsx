import Link from "next/link";

import { BenchmarkPanel } from "@/app/app/onboarding/payoffs";
import { ActivationGate } from "@/app/app/settings/business-profile/activation-gate";
import {
  Contradictions,
  ReviewPrompts,
} from "@/app/app/settings/business-profile/living-profile";
import { PageFrame } from "@/components/app/page-frame";
import { DataTable } from "@/components/ui/data-table";
import { DefinitionList, KeyValue } from "@/components/ui/definition-list";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { loadBusinessProfileState, requireProfileAccess } from "@/lib/profile/load";
import { STAGE_META, PROFILE_STAGES } from "@/lib/profile/stages";
import { btnPrimary, btnSecondary, btnSizeMd, btnSizeSm, helperClass } from "@/lib/ui";

export default async function BusinessProfileSettingsPage() {
  const ctx = await requireProfileAccess();
  const state = await loadBusinessProfileState(ctx.org.id);
  const { profile, completeness, activation } = state;

  const backfillRequirement = activation.hard.find((item) => item.key === "backfill_resolved");
  const backfillNeedsFallback =
    backfillRequirement !== undefined &&
    !backfillRequirement.ok &&
    backfillRequirement.detail.includes("unusable");

  const doneStages = new Set(state.stages.filter((row) => row.completedAt).map((row) => row.stage));

  return (
    <PageFrame
      title="Business profile"
      description="How this company sells, in structured form. Scoring, follow-up, reporting and the benchmarks all read it."
      actions={
        <Link href="/app/onboarding" className={`${btnPrimary} ${btnSizeMd}`}>
          {doneStages.size === PROFILE_STAGES.length ? "Review the answers" : "Continue onboarding"}
        </Link>
      }
    >
      <div className="space-y-6">
        <ActivationGate
          activation={activation}
          changes={state.activationChanges}
          activatedByName={state.activatedByName}
          backfillNeedsFallback={backfillNeedsFallback}
        />

        <ReviewPrompts prompts={state.reviewPrompts} />
        <Contradictions contradictions={state.contradictions} />

        <Panel className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-white">What is answered</h2>
              <p className={helperClass}>
                {completeness.answered} of {completeness.total} fields that a running feature reads.
                Below {completeness.usableMin} the features named beside each gap run on defaults
                rather than on you.
              </p>
            </div>
            <StatusBadge
              label={
                completeness.score >= completeness.usableMin ? "Usable" : "Below the usable threshold"
              }
              tone={completeness.score >= completeness.usableMin ? "good" : "warning"}
            />
          </div>

          {completeness.gaps.length > 0 ? (
            <div className="mt-5">
              <DataTable
                columns={[
                  { key: "label", label: "Not answered" },
                  { key: "consumer", label: "What it would improve" },
                  { key: "action", label: "" },
                ]}
                rows={completeness.gaps.map((gap) => ({
                  label: gap.label,
                  consumer: gap.consumer,
                  action: (
                    <Link
                      href={`/app/onboarding/${gap.stage}`}
                      className={`${btnSecondary} ${btnSizeSm}`}
                    >
                      Answer it
                    </Link>
                  ),
                }))}
              />
            </div>
          ) : (
            <p className={helperClass}>Every field a feature reads has an answer.</p>
          )}
        </Panel>

        <Panel className="p-6">
          <h2 className="text-sm font-semibold text-white">Onboarding</h2>
          <div className="mt-4">
            <DataTable
              columns={[
                { key: "stage", label: "Stage" },
                { key: "state", label: "" },
                { key: "action", label: "" },
              ]}
              rows={PROFILE_STAGES.map((stage) => ({
                stage: STAGE_META[stage].title,
                state: doneStages.has(stage) ? (
                  <StatusBadge label="Answered" tone="good" />
                ) : (
                  <StatusBadge label="Not yet" tone="neutral" />
                ),
                action: (
                  <Link href={`/app/onboarding/${stage}`} className={`${btnSecondary} ${btnSizeSm}`}>
                    Open
                  </Link>
                ),
              }))}
            />
          </div>
        </Panel>

        <BenchmarkPanel benchmark={state.benchmark} />

        {state.patternFeedback.length > 0 ? (
          <Panel className="p-6">
            <h2 className="text-sm font-semibold text-white">Drawn from comparable businesses</h2>
            <ul className="mt-3 space-y-3">
              {state.patternFeedback.map((item) => (
                <li key={item.key}>
                  <p className="text-sm text-white">{item.plain}</p>
                  <p className={helperClass}>{item.basis}</p>
                </li>
              ))}
            </ul>
            <p className={helperClass}>Suggestions. Nothing here changed a setting on its own.</p>
          </Panel>
        ) : null}

        <Panel className="p-6">
          <h2 className="text-sm font-semibold text-white">Contribution to anonymized patterns</h2>
          <DefinitionList>
            <KeyValue label="Contributing">
              {profile.aggregateOptOut ? "No, you opted out" : "Yes"}
            </KeyValue>
            <KeyValue label="What it means">
              {profile.aggregateOptOut
                ? "Nothing from this workspace goes into any cross-client figure. You still receive benchmarks."
                : "Aggregated, anonymized medians only. No business is ever identified and no single figure can be recovered from a cohort."}
            </KeyValue>
          </DefinitionList>
          <div className="mt-4">
            <Link href="/app/onboarding/goals" className={`${btnSecondary} ${btnSizeMd}`}>
              Change this
            </Link>
          </div>
        </Panel>

        <Panel className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-white">History</h2>
              <p className={helperClass}>
                Every change is kept with who made it, so a figure cut under an older profile stays
                interpretable. Version {profile.version} is current.
              </p>
            </div>
            {profile.lastReviewedAt ? (
              <StatusBadge
                label={`Reviewed ${new Date(profile.lastReviewedAt).toLocaleDateString()}`}
                tone="neutral"
              />
            ) : null}
          </div>
          <div className="mt-4">
            <DataTable
              columns={[
                { key: "version", label: "Version" },
                { key: "when", label: "Changed" },
                { key: "who", label: "By" },
                { key: "fields", label: "Fields" },
              ]}
              rows={state.versions.slice(0, 25).map((version) => ({
                version: String(version.version),
                when: version.createdAt ? new Date(version.createdAt).toLocaleString() : "—",
                who: version.actorName ?? "—",
                fields: version.changedFields.join(", ") || "—",
              }))}
              empty="Nothing has changed since the profile was created."
            />
          </div>
        </Panel>

        <Panel className="p-6">
          <h2 className="text-sm font-semibold text-white">The Leak Report</h2>
          <p className={helperClass}>
            {state.latestLeakReport
              ? `Last generated ${new Date(state.latestLeakReport.generatedAt).toLocaleString()}.`
              : "Not generated yet."}
          </p>
          <div className="mt-4">
            <Link href="/app/onboarding/report" className={`${btnSecondary} ${btnSizeMd}`}>
              Open the Leak Report
            </Link>
          </div>
        </Panel>
      </div>
    </PageFrame>
  );
}
