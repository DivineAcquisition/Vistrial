import { DataTable } from "@/components/ui/data-table";
import { KpiCard, KpiGrid } from "@/components/ui/kpi-card";
import { Notice } from "@/components/ui/states";
import { Panel } from "@/components/ui/panel";
import { SectionHeader } from "@/components/ui/section-header";
import { bandLabel } from "@/lib/calibration/compute";
import { FACTOR_LABELS, type ScoreFactor } from "@/lib/scoring/compute";
import { FOLLOW_UP_BRANCH_LABELS } from "@/lib/follow-up/labels";
import type { FollowUpBranch } from "@/lib/follow-up/types";
import { formatCount, formatPct, formatSample } from "@/lib/reporting/format";
import { helperClass } from "@/lib/ui";
import { SuggestionActions, VoiceConfirmActions } from "@/app/app/reporting/calibration/suggestion-actions";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function bool(value: unknown): boolean {
  return value === true;
}

function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function rateOf(value: unknown) {
  const row = asRecord(value);
  return {
    k: num(row.k) ?? 0,
    n: num(row.n) ?? 0,
    pct: num(row.pct),
    tooSmall: bool(row.too_small),
    sample: str(row.sample_label) ?? formatSample(num(row.k) ?? 0, num(row.n) ?? 0),
  };
}

function HoldoutBanner({ holdout }: { holdout: Record<string, unknown> }) {
  const enabled = bool(holdout.enabled);
  const tooSmall = bool(holdout.too_small);
  const plain = str(holdout.plain) ?? "";
  if (!enabled || tooSmall) {
    return (
      <Notice tone="warning" className="mb-6">
        {plain} The all-leads curve below is not validation.
      </Notice>
    );
  }
  return (
    <Notice tone="info" className="mb-6">
      {plain}
    </Notice>
  );
}

function CurveTable({
  title,
  hint,
  curve,
  biased,
}: {
  title: string;
  hint: string;
  curve: Record<string, unknown>;
  biased: boolean;
}) {
  const rows = arr(curve.rows);
  const breaks = arr(curve.breaks);
  return (
    <Panel className="p-6">
      <SectionHeader title={title} hint={hint} />
      {biased ? (
        <p className={`mb-3 ${helperClass}`}>
          Biased by who got called first. Shown so you can see the distortion, not as proof the
          score works.
        </p>
      ) : null}
      <DataTable
        caption={title}
        columns={[
          { key: "band", label: "Score" },
          { key: "n", label: "Resolved leads", align: "right" },
          { key: "closed", label: "Closed", align: "right" },
          { key: "rate", label: "Close rate", align: "right" },
        ]}
        rows={rows.map((row) => {
          const item = asRecord(row);
          const rate = rateOf(item.close_rate);
          return {
            band: bandLabel(str(item.band_key) ?? ""),
            n: formatCount(num(item.n) ?? rate.n),
            closed: formatCount(rate.k),
            rate: formatPct(rate.pct, rate.tooSmall),
          };
        })}
        empty="No mature resolved leads in these bands yet."
      />
      {breaks.length > 0 ? (
        <ul className={`mt-4 space-y-1 ${helperClass}`}>
          {breaks.map((item) => {
            const rec = asRecord(item);
            return <li key={`${str(rec.kind)}-${str(rec.from_key)}-${str(rec.to_key)}`}>{str(rec.plain)}</li>;
          })}
        </ul>
      ) : bool(curve.monotonic) ? (
        <p className={`mt-4 ${helperClass}`}>Each shown band closed at least as well as the one below it.</p>
      ) : (
        <p className={`mt-4 ${helperClass}`}>Not enough bands above the sample floor to read a curve.</p>
      )}
    </Panel>
  );
}

function FactorTable({ title, payload }: { title: string; payload: Record<string, unknown> }) {
  const rows = arr(payload.rows);
  return (
    <Panel className="p-6">
      <SectionHeader
        title={title}
        hint="How strongly each factor, on its own, differs between closed and lost leads. Association, not a reason the factor caused the close."
      />
      <DataTable
        caption={title}
        columns={[
          { key: "factor", label: "Factor" },
          { key: "n", label: "n", align: "right" },
          { key: "closed", label: "Avg when closed", align: "right" },
          { key: "lost", label: "Avg when lost", align: "right" },
          { key: "delta", label: "Gap", align: "right" },
          { key: "reading", label: "Reading" },
        ]}
        rows={rows.map((row) => {
          const item = asRecord(row);
          const factor = str(item.factor) as ScoreFactor | null;
          return {
            factor: factor && factor in FACTOR_LABELS ? FACTOR_LABELS[factor] : factor,
            n: bool(item.too_small) ? `${formatCount(num(item.n) ?? 0)} — too few` : formatCount(num(item.n) ?? 0),
            closed: num(item.avg_closed) == null ? "—" : String(num(item.avg_closed)),
            lost: num(item.avg_lost) == null ? "—" : String(num(item.avg_lost)),
            delta: num(item.delta) == null ? "—" : String(num(item.delta)),
            reading: str(item.plain) ?? "",
          };
        })}
        empty="No factor readings on mature resolved leads yet."
      />
    </Panel>
  );
}

export function CalibrationReportView({
  payload,
  preview,
  isPlatformAdmin = false,
}: {
  payload: Record<string, unknown>;
  preview: Record<string, unknown> | null;
  isPlatformAdmin?: boolean;
}) {
  const holdout = asRecord(payload.holdout);
  const weights = asRecord(payload.current_weights);
  const threshold = asRecord(payload.threshold);
  const extraction = asRecord(payload.extraction);
  const drafts = asRecord(payload.drafts);
  const cross = asRecord(payload.cross_client);
  const suggestions = arr(payload.suggestions);
  const voice = arr(payload.voice_suggestions);
  const well = bool(payload.well_calibrated);
  const holdoutTooSmall = bool(holdout.too_small) || !bool(holdout.enabled);
  const under = asRecord(drafts.underperforming_branch);
  const outcome = asRecord(drafts.follow_up_outcome);
  const pendingWeights = suggestions
    .map((row) => asRecord(row))
    .find((row) => str(row.status) === "pending" && str(row.kind) === "weights");
  const withheld = suggestions
    .map((row) => asRecord(row))
    .find((row) => str(row.status) === "withheld" && str(row.kind) === "weights");
  const steepest = threshold.steepest ? asRecord(threshold.steepest) : {};
  const correctionFields = arr(extraction.correction_by_field);
  const auditFields = arr(extraction.sample_audit_by_field);
  const modelFields = arr(extraction.correction_by_model_field);
  const editRows = arr(drafts.median_edit_distance_by_branch);
  const approvalRows = arr(drafts.approval_by_branch);
  const qualityRows = arr(drafts.quality_failures_by_branch);
  const replyRows = arr(drafts.reply_by_branch_position);
  const unmatched = arr(extraction.unmatched_by_status);
  const fail = asRecord(extraction.extraction_failure);
  const failRate = rateOf(fail.rate);
  const unmatchedRate = rateOf(extraction.unmatched_rate);
  const moves = preview ? arr(preview.threshold_moves) : [];

  return (
    <div className="space-y-8">
      <HoldoutBanner holdout={holdout} />
      <p className={helperClass}>{str(payload.honesty)}</p>
      {well ? (
        <Notice tone="success">{str(payload.working_plain)}</Notice>
      ) : null}

      <KpiGrid columns={4}>
        <KpiCard label="Holdout share" value={`${num(holdout.percent) ?? 0}%`} />
        <KpiCard
          label="Holdout resolved"
          value={formatCount(num(holdout.mature_resolved_n) ?? 0)}
          sub={`Need ${formatCount(num(payload.min_n) ?? 20)} before the holdout curve is validation`}
        />
        <KpiCard label="Mature resolved" value={formatCount(num(payload.mature_resolved_n) ?? 0)} />
        <KpiCard label="Ready line today" value={String(num(weights.ready_threshold) ?? "—")} />
      </KpiGrid>

      <CurveTable
        title="Holdout close rate by score"
        hint="Leads drawn at random at intake, then resolved after the sales cycle. This is the unbiased picture."
        curve={asRecord(payload.holdout_curve)}
        biased={holdoutTooSmall}
      />
      <CurveTable
        title="All resolved leads by score"
        hint={str(payload.all_leads_caveat) ?? ""}
        curve={asRecord(payload.all_leads_curve)}
        biased
      />

      <FactorTable title="Which factors actually separate closes" payload={asRecord(payload.factor_validity_holdout)} />
      {holdoutTooSmall ? (
        <FactorTable title="Factors on all resolved leads (biased)" payload={asRecord(payload.factor_validity_all)} />
      ) : null}

      <Panel className="p-6">
        <SectionHeader
          title="Where the ready line sits"
          hint="Moving it changes who gets called today. That is a decision, not an automatic optimization."
        />
        <p className="text-sm text-silver">{str(threshold.consequence)}</p>
        {num(steepest.suggested_threshold) != null ? (
          <p className={`mt-2 ${helperClass}`}>
            Steepest step-up on the curve is at {num(steepest.suggested_threshold)}, from{" "}
            {bandLabel(str(steepest.from_key) ?? "")} to {bandLabel(str(steepest.to_key) ?? "")}.
          </p>
        ) : null}
      </Panel>

      <Panel className="p-6">
        <SectionHeader
          title="Suggested changes"
          hint="Nothing here writes itself. A well-lined-up score gets no weight suggestion."
        />
        {well ? (
          <p className="text-sm text-silver">{str(payload.working_plain)}</p>
        ) : pendingWeights ? (
          <>
            <p className="text-sm text-silver">{str(pendingWeights.evidence_sentence)}</p>
            <p className={`mt-2 ${helperClass}`}>
              Sample: {formatCount(num(pendingWeights.sample_n) ?? 0)} holdout resolved leads.
            </p>
            {str(asRecord(asRecord(pendingWeights.payload).historical).plain) ? (
              <p className={`mt-2 ${helperClass}`}>
                {str(asRecord(asRecord(pendingWeights.payload).historical).plain)}
              </p>
            ) : null}
            {preview ? <p className={`mt-2 ${helperClass}`}>{str(preview.plain)}</p> : null}
            {moves.length > 0 ? (
              <div className="mt-4">
                <DataTable
                  caption="Open leads that would cross the ready line"
                  columns={[
                    { key: "name", label: "Lead" },
                    { key: "now", label: "Score now", align: "right" },
                    { key: "next", label: "Score after", align: "right" },
                    { key: "dir", label: "Move" },
                  ]}
                  rows={moves.map((row) => {
                    const item = asRecord(row);
                    return {
                      name: str(item.name) ?? "Unnamed lead",
                      now: num(item.current_score) == null ? "—" : String(num(item.current_score)),
                      next: num(item.proposed_score) == null ? "—" : String(num(item.proposed_score)),
                      dir: str(item.direction) === "onto_ready" ? "Onto ready" : "Off ready",
                    };
                  })}
                  empty="No open lead would cross the ready line."
                />
              </div>
            ) : null}
            <SuggestionActions
              suggestionId={str(pendingWeights.id) ?? ""}
              evidence={str(pendingWeights.evidence_sentence) ?? ""}
              previewPlain={str(preview?.plain ?? null)}
            />
          </>
        ) : withheld ? (
          <p className="text-sm text-silver">{str(withheld.evidence_sentence)}</p>
        ) : (
          <p className="text-sm text-silver">No weight change is on the table.</p>
        )}
      </Panel>

      <Panel className="p-6">
        <SectionHeader
          title="How well we read recordings"
          hint="Per field, never as one accuracy number. Correction rate is errors someone noticed. The sample audit is a random check against the recording."
        />
        <KpiGrid columns={3}>
          <KpiCard
            label="Recordings we could not match"
            value={formatPct(unmatchedRate.pct, unmatchedRate.tooSmall)}
            sub={unmatchedRate.sample}
          />
          <KpiCard
            label="Could not read"
            value={formatPct(failRate.pct, failRate.tooSmall)}
            sub={failRate.sample}
          />
          <KpiCard label="Calls read" value={formatCount(num(asRecord(correctionFields[0]).extractions) ?? 0)} />
        </KpiGrid>
        <div className="mt-4">
          <DataTable
            caption="Correction rate by field"
            columns={[
              { key: "field", label: "Field" },
              { key: "n", label: "Corrections", align: "right" },
              { key: "rate", label: "Rate", align: "right" },
            ]}
            rows={correctionFields.map((row) => {
              const item = asRecord(row);
              const rate = rateOf(item.rate);
              return {
                field: (str(item.field_name) ?? "").replaceAll("_", " "),
                n: formatCount(num(item.corrections) ?? rate.k),
                rate: formatPct(rate.pct, rate.tooSmall),
              };
            })}
            empty="No call notes yet."
          />
        </div>
        <div className="mt-4">
          <DataTable
            caption="Sample audit by field"
            columns={[
              { key: "field", label: "Field" },
              { key: "n", label: "Audited", align: "right" },
              { key: "rate", label: "Found in transcript", align: "right" },
            ]}
            rows={auditFields.map((row) => {
              const item = asRecord(row);
              const rate = rateOf(item.rate);
              return {
                field: (str(item.field_name) ?? "").replaceAll("_", " "),
                n: formatCount(num(item.n) ?? rate.n),
                rate: formatPct(rate.pct, rate.tooSmall),
              };
            })}
            empty="The sample audit has not run yet."
          />
        </div>
        {isPlatformAdmin ? (
        <div className="mt-4">
          <DataTable
            caption="Corrections by model version and field"
            columns={[
              { key: "model", label: "Model" },
              { key: "field", label: "Field" },
              { key: "rate", label: "Correction rate", align: "right" },
              { key: "sample", label: "Sample", align: "right" },
            ]}
            rows={modelFields.map((row) => {
              const item = asRecord(row);
              const rate = rateOf(item.rate);
              return {
                model: str(item.model_version) ?? "unknown",
                field: (str(item.field_name) ?? "").replaceAll("_", " "),
                rate: formatPct(rate.pct, rate.tooSmall),
                sample: rate.sample,
              };
            })}
            empty="No model-version trend yet."
          />
        </div>
        ) : null}
        {unmatched.length > 0 ? (
          <div className="mt-4">
            <DataTable
              caption="Unmatched transcripts by status"
              columns={[
                { key: "status", label: "Status" },
                { key: "n", label: "n", align: "right" },
              ]}
              rows={unmatched.map((row) => {
                const item = asRecord(row);
                return { status: str(item.status) ?? "", n: formatCount(num(item.n) ?? 0) };
              })}
              empty="None."
            />
          </div>
        ) : null}
        <p className={`mt-4 ${helperClass}`}>{str(extraction.plain)}</p>
      </Panel>

      <Panel className="p-6">
        <SectionHeader
          title="Follow-up by branch"
          hint="A branch that is always rewritten is a branch whose generation is wrong."
        />
        <div className="grid gap-6 lg:grid-cols-2">
          <DataTable
            caption="Median edit distance"
            columns={[
              { key: "branch", label: "Branch" },
              { key: "median", label: "Median edit distance", align: "right" },
              { key: "n", label: "n", align: "right" },
            ]}
            rows={editRows.map((row) => {
              const item = asRecord(row);
              const branch = str(item.branch) as FollowUpBranch | null;
              return {
                branch: branch && branch in FOLLOW_UP_BRANCH_LABELS ? FOLLOW_UP_BRANCH_LABELS[branch] : branch,
                median: num(item.median_edit_distance) == null ? "—" : String(Math.round(num(item.median_edit_distance) ?? 0)),
                n: formatCount(num(item.n) ?? 0),
              };
            })}
            empty="No drafts yet."
          />
          <DataTable
            caption="Approval versus rejection"
            columns={[
              { key: "branch", label: "Branch" },
              { key: "approved", label: "Approved", align: "right" },
              { key: "rejected", label: "Rejected", align: "right" },
            ]}
            rows={approvalRows.map((row) => {
              const item = asRecord(row);
              const branch = str(item.branch) as FollowUpBranch | null;
              const approved = rateOf(item.approval_rate);
              const rejected = rateOf(item.rejection_rate);
              return {
                branch: branch && branch in FOLLOW_UP_BRANCH_LABELS ? FOLLOW_UP_BRANCH_LABELS[branch] : branch,
                approved: formatPct(approved.pct, approved.tooSmall),
                rejected: formatPct(rejected.pct, rejected.tooSmall),
              };
            })}
            empty="No drafts yet."
          />
        </div>
        <div className="mt-4">
          <DataTable
            caption="Reply rate by branch and sequence position"
            columns={[
              { key: "branch", label: "Branch" },
              { key: "pos", label: "Position", align: "right" },
              { key: "rate", label: "Reply rate", align: "right" },
              { key: "sample", label: "Sample", align: "right" },
            ]}
            rows={replyRows.map((row) => {
              const item = asRecord(row);
              const branch = str(item.branch) as FollowUpBranch | null;
              const rate = rateOf(item.reply_rate);
              return {
                branch: branch && branch in FOLLOW_UP_BRANCH_LABELS ? FOLLOW_UP_BRANCH_LABELS[branch] : branch,
                pos: formatCount(num(item.sequence_position) ?? 0),
                rate: formatPct(rate.pct, rate.tooSmall),
                sample: rate.sample,
              };
            })}
            empty="No sent follow-ups yet."
          />
        </div>
        <div className="mt-4">
          <DataTable
            caption="Quality-check failures"
            columns={[
              { key: "branch", label: "Branch" },
              { key: "type", label: "Failure", align: "right" },
              { key: "n", label: "n", align: "right" },
            ]}
            rows={qualityRows.map((row) => {
              const item = asRecord(row);
              const branch = str(item.branch) as FollowUpBranch | null;
              return {
                branch: branch && branch in FOLLOW_UP_BRANCH_LABELS ? FOLLOW_UP_BRANCH_LABELS[branch] : branch,
                type: (str(item.failure_type) ?? "").replaceAll("_", " "),
                n: formatCount(num(item.n) ?? 0),
              };
            })}
            empty="No quality-check failures recorded."
          />
        </div>
        <p className={`mt-4 text-sm text-silver`}>{str(outcome.plain)}</p>
        {str(under.recommendation) ? (
          <p className={`mt-3 text-sm text-silver`}>{str(under.recommendation)}</p>
        ) : str(under.plain) ? (
          <p className={`mt-3 ${helperClass}`}>{str(under.plain)}</p>
        ) : null}
      </Panel>

      <Panel className="p-6">
        <SectionHeader
          title="Voice profile"
          hint="Consistent edits can become a profile update. A person still has to confirm. Nothing applies itself."
        />
        {voice.length === 0 ? (
          <p className={helperClass}>No pending voice-profile suggestions.</p>
        ) : (
          <ul className="space-y-4">
            {voice.map((row) => {
              const item = asRecord(row);
              const evidence = asRecord(item.evidence);
              return (
                <li key={str(item.id) ?? JSON.stringify(item)}>
                  <p className="text-sm text-silver">
                    {str(item.kind) === "drop_phrase"
                      ? `Operators keep dropping “${str(item.phrase)}”.`
                      : str(item.kind) === "shorter"
                        ? "Operators keep shortening the draft."
                        : "Operators keep dropping formal phrasing."}{" "}
                    {str(evidence.text)}
                  </p>
                  {str(item.id) ? <VoiceConfirmActions id={str(item.id) as string} /> : null}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Panel className="p-6">
        <SectionHeader
          title="Similar businesses"
          hint={str(cross.plain) ?? undefined}
        />
        {bool(cross.opted_out) ? (
          <p className={helperClass}>
            This workspace does not contribute to the aggregate. It can still read the same context
            everyone else sees.
          </p>
        ) : null}
        {str(cross.contrast) ? <p className={`mb-3 ${helperClass}`}>{str(cross.contrast)}</p> : null}
        <DataTable
          caption="Aggregate context from similar businesses"
          columns={[
            { key: "metric", label: "Figure" },
            { key: "value", label: "Median", align: "right" },
            { key: "orgs", label: "Businesses", align: "right" },
            { key: "n", label: "Sample", align: "right" },
          ]}
          rows={arr(cross.rows).map((row) => {
            const item = asRecord(row);
            return {
              metric: (str(item.metric) ?? "").replaceAll("_", " "),
              value: num(item.median_value) == null ? "—" : String(num(item.median_value)),
              orgs: formatCount(num(item.org_count) ?? 0),
              n: formatCount(num(item.sample_n) ?? 0),
            };
          })}
          empty={`Nothing to show until at least ${formatCount(num(cross.min_orgs) ?? 5)} similar businesses clear the sample floor.`}
        />
      </Panel>
    </div>
  );
}
