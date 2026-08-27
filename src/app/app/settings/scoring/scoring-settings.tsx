"use client";

import { useActionState, useMemo, useState, useTransition } from "react";

import {
  bulkRescoreLeads,
  replaceScoreMaps,
  runGhostDetectorNow,
  updateScoringConfig,
  type MappingPayload,
} from "@/app/app/settings/scoring/actions";
import type { SettingsSaveResult } from "@/app/app/settings/types";
import { Button, SubmitButton } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { CheckboxField } from "@/components/ui/checkbox";
import { HOLDOUT_DEFAULT_PERCENT, HOLDOUT_MAX_PERCENT, HOLDOUT_PLAIN, HOLDOUT_DISABLED_PLAIN } from "@/lib/calibration/constants";
import { overrideLeadScore } from "@/lib/scoring/override";
import { computeReadinessScore, FACTOR_LABELS, SCORE_FACTORS, type ScoreWeights } from "@/lib/scoring/compute";
import { extractFactors, type ScoreFieldMap } from "@/lib/scoring/extract";
import {
  cardTitle,
  errorClass,
  helperClass,
  labelClass,
} from "@/lib/ui";

export type ScoringLeadOption = {
  id: string;
  name: string;
  currentScore: number | null;
  answers: Record<string, unknown>;
};

export type ScoringSettingsProps = {
  config: ScoreWeights & {
    readyThreshold: number;
    speedToLeadMinutes: number;
    ghostDaysSoft: number;
    ghostDaysHard: number;
    holdoutPercent: number;
  };
  maps: ScoreFieldMap[];
  leads: ScoringLeadOption[];
  lastGhostRun: { evaluated: number; changed: number; ranAt: string } | null;
};

const initialSave: SettingsSaveResult = { status: "idle" };

function newId() {
  return crypto.randomUUID();
}

export function ScoringSettings({ config, maps: initialMaps, leads, lastGhostRun }: ScoringSettingsProps) {
  const [configState, saveConfig, configPending] = useActionState(updateScoringConfig, initialSave);
  const [weights, setWeights] = useState<ScoreWeights>({
    timeline: config.timeline,
    investment_capacity: config.investment_capacity,
    decision_authority: config.decision_authority,
    pain_severity: config.pain_severity,
  });
  const [readyThreshold, setReadyThreshold] = useState(config.readyThreshold);
  const [speedToLead, setSpeedToLead] = useState(config.speedToLeadMinutes);
  const [ghostSoft, setGhostSoft] = useState(config.ghostDaysSoft);
  const [ghostHard, setGhostHard] = useState(config.ghostDaysHard);
  const [holdoutEnabled, setHoldoutEnabled] = useState(config.holdoutPercent > 0);
  const [holdoutPercent, setHoldoutPercent] = useState(
    config.holdoutPercent > 0 ? config.holdoutPercent : HOLDOUT_DEFAULT_PERCENT
  );
  const [maps, setMaps] = useState<ScoreFieldMap[]>(initialMaps);
  const [mapStatus, setMapStatus] = useState<SettingsSaveResult>(initialSave);
  const [previewLeadId, setPreviewLeadId] = useState(leads[0]?.id ?? "");
  const [overrideStatus, setOverrideStatus] = useState<string | null>(null);
  const [bulkStatus, setBulkStatus] = useState<string | null>(null);
  const [ghostStatus, setGhostStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const weightTotal =
    weights.timeline +
    weights.investment_capacity +
    weights.decision_authority +
    weights.pain_severity;

  const previewLead = leads.find((lead) => lead.id === previewLeadId) ?? null;
  const pendingScore = useMemo(() => {
    if (!previewLead) return null;
    const extracted = extractFactors(previewLead.answers, maps);
    return computeReadinessScore(extracted.factors, weights);
  }, [previewLead, maps, weights]);

  function updateWeight(factor: keyof ScoreWeights, value: string) {
    const parsed = Number(value);
    setWeights((current) => ({
      ...current,
      [factor]: Number.isInteger(parsed) ? parsed : current[factor],
    }));
  }

  return (
    <div className="space-y-8">
      <Panel className="p-6">
        <p className="text-sm leading-relaxed text-silver">
          These mappings and weights are generic starting points. Tune them to
          this workspace&apos;s application and offer — a $3K coach and a $15K
          consultant should not share a threshold.
        </p>
      </Panel>

      <Panel className="p-6">
        <h2 className={cardTitle}>Weights and thresholds</h2>
        <p className={helperClass}>
          Weights do not auto-balance. The four numbers must add to 100 before
          save. Changing them does not rewrite old score rows.
        </p>
        <form action={saveConfig} className="mt-5 grid gap-4 sm:grid-cols-2">
          {(
            [
              ["timeline", "Timeline"],
              ["investment_capacity", "Investment capacity"],
              ["decision_authority", "Decision authority"],
              ["pain_severity", "Pain severity"],
            ] as const
          ).map(([key, label]) => (
            <Field key={key} label={label} name={`${key}_weight`} htmlFor={`weight-${key}`}>
              <Input
                id={`weight-${key}`}
                name={`${key}_weight`}
                type="number"
                min={0}
                max={100}
                step={1}
                required
                value={weights[key]}
                onChange={(event) => updateWeight(key, event.target.value)}
              />
            </Field>
          ))}

          <p className={`sm:col-span-2 text-sm ${weightTotal === 100 ? "text-silver" : "text-flag-critical"}`}>
            Running total: {weightTotal} / 100
            {weightTotal === 100 ? "" : " — save stays blocked until this is 100."}
          </p>

          <Field
            label="Ready threshold"
            name="ready_threshold"
            help="At or above this total, the lead is on the ready track."
          >
            <Input
              id="ready_threshold"
              name="ready_threshold"
              type="number"
              min={0}
              max={100}
              required
              value={readyThreshold}
              onChange={(event) => setReadyThreshold(Number(event.target.value))}
            />
          </Field>
          <Field label="Speed-to-lead minutes" name="speed_to_lead_minutes">
            <Input
              id="speed_to_lead_minutes"
              name="speed_to_lead_minutes"
              type="number"
              min={1}
              required
              value={speedToLead}
              onChange={(event) => setSpeedToLead(Number(event.target.value))}
            />
          </Field>
          <Field label="Approaching-ghost days" name="ghost_days_soft">
            <Input
              id="ghost_days_soft"
              name="ghost_days_soft"
              type="number"
              min={1}
              required
              value={ghostSoft}
              onChange={(event) => setGhostSoft(Number(event.target.value))}
            />
          </Field>
          <Field label="Ghost days" name="ghost_days_hard">
            <Input
              id="ghost_days_hard"
              name="ghost_days_hard"
              type="number"
              min={1}
              required
              value={ghostHard}
              onChange={(event) => setGhostHard(Number(event.target.value))}
            />
          </Field>

          <div className="sm:col-span-2">
            <CheckboxField
              id="holdout_enabled"
              name="holdout_enabled"
              checked={holdoutEnabled}
              onChange={(event) => setHoldoutEnabled(event.currentTarget.checked)}
              label="Work a random sample regardless of score"
              description={holdoutEnabled ? HOLDOUT_PLAIN : HOLDOUT_DISABLED_PLAIN}
            />
            {holdoutEnabled ? (
              <Field
                label="Holdout percent"
                name="holdout_percent"
                className="mt-3 max-w-xs"
                help={`Default ${HOLDOUT_DEFAULT_PERCENT}%. Cap ${HOLDOUT_MAX_PERCENT}%. These leads are not marked on the queue.`}
              >
                <Input
                  id="holdout_percent"
                  name="holdout_percent"
                  type="number"
                  min={1}
                  max={HOLDOUT_MAX_PERCENT}
                  step={1}
                  required
                  value={holdoutPercent}
                  onChange={(event) => setHoldoutPercent(Number(event.target.value))}
                />
              </Field>
            ) : (
              <input type="hidden" name="holdout_percent" value="0" />
            )}
          </div>

          {configState.status === "error" ? (
            <p className={`${errorClass} sm:col-span-2`}>{configState.error}</p>
          ) : null}
          {configState.status === "saved" ? (
            <p className={`${helperClass} sm:col-span-2`}>Saved. Existing score rows are unchanged.</p>
          ) : null}

          <div className="sm:col-span-2">
            <SubmitButton variant="primary" pending={configPending} loadingLabel="Saving" disabled={configPending || weightTotal !== 100}>
            Save weights and thresholds
          </SubmitButton>
          </div>
        </form>
      </Panel>

      <Panel className="p-6">
        <h2 className={cardTitle}>Preview</h2>
        <p className={helperClass}>
          Pick a real lead and see what the pending weights and mappings would
          score versus the cached score they have today. This is the call-list
          consequence of a threshold change.
        </p>
        {leads.length === 0 ? (
          <p className={`${helperClass} mt-3`}>No leads in this workspace yet.</p>
        ) : (
          <>
            <div className="mt-4 max-w-md">
              <Field label="Lead" name="preview-lead">
                <Select
                  id="preview-lead"
                  value={previewLeadId}
                  onChange={(event) => setPreviewLeadId(event.target.value)}
                >
                {leads.map((lead) => (
                  <option key={lead.id} value={lead.id}>
                    {lead.name}
                  </option>
                ))}
                </Select>
              </Field>
            </div>
            {previewLead && pendingScore ? (
              <dl className="mt-4 grid gap-3 sm:grid-cols-3">
                <div>
                  <dt className={labelClass}>Current cached score</dt>
                  <dd className="text-sm text-card-foreground">
                    {previewLead.currentScore === null ? "Unscored" : previewLead.currentScore}
                  </dd>
                </div>
                <div>
                  <dt className={labelClass}>Pending score</dt>
                  <dd className="text-sm text-card-foreground">
                    {pendingScore.kind === "unscored" ? "Unscored" : pendingScore.total}
                  </dd>
                </div>
                <div>
                  <dt className={labelClass}>Ready track at {readyThreshold}?</dt>
                  <dd className="text-sm text-card-foreground">
                    {pendingScore.kind === "unscored"
                      ? "No — no score"
                      : pendingScore.total >= readyThreshold
                        ? "Yes"
                        : "No, nurture"}
                  </dd>
                </div>
              </dl>
            ) : null}
            {pendingScore ? (
              <p className={`${helperClass} mt-3`}>{pendingScore.explanation}</p>
            ) : null}
          </>
        )}
      </Panel>

      <Panel className="p-6">
        <h2 className={cardTitle}>Application field mapping</h2>
        <p className={helperClass}>
          Each application field maps to one factor. An answer that matches no
          rule leaves that factor unknown — it is never filled in with a
          default.
        </p>
        <div className="mt-5 space-y-6">
          {maps.map((map, mapIndex) => (
            <div key={map.id} className="rounded-2xl border border-white/10 p-4">
              <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                <div>
                  <Field label="Application field" name={`field-${map.id}`}>
                    <Input
                      id={`field-${map.id}`}
                      type="text"
                      value={map.fieldName}
                      onChange={(event) => {
                        const fieldName = event.target.value;
                        setMaps((current) =>
                          current.map((item, index) =>
                            index === mapIndex ? { ...item, fieldName } : item
                          )
                        );
                      }}
                    />
                  </Field>
                </div>
                <div>
                  <Field label="Factor" name={`factor-${map.id}`}>
                    <Select
                      id={`factor-${map.id}`}
                      value={map.factor}
                      onChange={(event) => {
                        const factor = event.target.value as ScoreFieldMap["factor"];
                        setMaps((current) =>
                          current.map((item, index) =>
                            index === mapIndex ? { ...item, factor } : item
                          )
                        );
                      }}
                    >
                    {SCORE_FACTORS.map((factor) => (
                      <option key={factor} value={factor}>
                        {FACTOR_LABELS[factor]}
                      </option>
                    ))}
                    </Select>
                  </Field>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setMaps((current) => current.filter((_, index) => index !== mapIndex))}
                >
                  Remove field
                </Button>
              </div>

              <div className="mt-4 space-y-2">
                {map.rules.map((rule, ruleIndex) => (
                  <div key={rule.id} className="grid gap-2 sm:grid-cols-[120px_1fr_1fr_88px_auto] sm:items-end">
                    <Select
                      
                      value={rule.kind}
                      onChange={(event) => {
                        const kind = event.target.value as "choice" | "range";
                        setMaps((current) =>
                          current.map((item, index) =>
                            index === mapIndex
                              ? {
                                  ...item,
                                  rules: item.rules.map((row, inner) =>
                                    inner === ruleIndex
                                      ? {
                                          ...row,
                                          kind,
                                          answerValue: kind === "choice" ? row.answerValue : null,
                                          rangeMin: kind === "range" ? row.rangeMin : null,
                                          rangeMax: kind === "range" ? row.rangeMax : null,
                                        }
                                      : row
                                  ),
                                }
                              : item
                          )
                        );
                      }}
                    >
                      <option value="choice">Choice</option>
                      <option value="range">Range</option>
                    </Select>
                    {rule.kind === "choice" ? (
                      <Input
                        type="text"
                        placeholder="Answer"
                        value={rule.answerValue ?? ""}
                        onChange={(event) => {
                          const answerValue = event.target.value;
                          setMaps((current) =>
                            current.map((item, index) =>
                              index === mapIndex
                                ? {
                                    ...item,
                                    rules: item.rules.map((row, inner) =>
                                      inner === ruleIndex ? { ...row, answerValue } : row
                                    ),
                                  }
                                : item
                            )
                          );
                        }}
                      />
                    ) : (
                      <>
                        <Input
                          type="number"
                          placeholder="Min"
                          value={rule.rangeMin ?? ""}
                          onChange={(event) => {
                            const rangeMin = event.target.value === "" ? null : Number(event.target.value);
                            setMaps((current) =>
                              current.map((item, index) =>
                                index === mapIndex
                                  ? {
                                      ...item,
                                      rules: item.rules.map((row, inner) =>
                                        inner === ruleIndex ? { ...row, rangeMin } : row
                                      ),
                                    }
                                  : item
                              )
                            );
                          }}
                        />
                        <Input
                          type="number"
                          placeholder="Max"
                          value={rule.rangeMax ?? ""}
                          onChange={(event) => {
                            const rangeMax = event.target.value === "" ? null : Number(event.target.value);
                            setMaps((current) =>
                              current.map((item, index) =>
                                index === mapIndex
                                  ? {
                                      ...item,
                                      rules: item.rules.map((row, inner) =>
                                        inner === ruleIndex ? { ...row, rangeMax } : row
                                      ),
                                    }
                                  : item
                              )
                            );
                          }}
                        />
                      </>
                    )}
                    {rule.kind === "choice" ? <span /> : null}
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      placeholder="Score"
                      value={rule.score}
                      onChange={(event) => {
                        const score = Number(event.target.value);
                        setMaps((current) =>
                          current.map((item, index) =>
                            index === mapIndex
                              ? {
                                  ...item,
                                  rules: item.rules.map((row, inner) =>
                                    inner === ruleIndex ? { ...row, score } : row
                                  ),
                                }
                              : item
                          )
                        );
                      }}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        setMaps((current) =>
                          current.map((item, index) =>
                            index === mapIndex
                              ? { ...item, rules: item.rules.filter((_, inner) => inner !== ruleIndex) }
                              : item
                          )
                        )
                      }
                    >
                      Remove
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    setMaps((current) =>
                      current.map((item, index) =>
                        index === mapIndex
                          ? {
                              ...item,
                              rules: [
                                ...item.rules,
                                {
                                  id: newId(),
                                  kind: "choice",
                                  answerValue: "",
                                  rangeMin: null,
                                  rangeMax: null,
                                  score: 50,
                                },
                              ],
                            }
                          : item
                      )
                    )
                  }
                >
                  Add rule
                </Button>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() =>
              setMaps((current) => [
                ...current,
                {
                  id: newId(),
                  fieldName: "",
                  factor: "timeline",
                  rules: [
                    {
                      id: newId(),
                      kind: "choice",
                      answerValue: "",
                      rangeMin: null,
                      rangeMax: null,
                      score: 50,
                    },
                  ],
                },
              ])
            }
          >
            Add field
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={pending}
            onClick={() => {
              const payload: MappingPayload[] = maps.map((map) => ({
                field_name: map.fieldName,
                factor: map.factor,
                rules: map.rules.map((rule) => ({
                  kind: rule.kind,
                  answer_value: rule.answerValue,
                  range_min: rule.rangeMin,
                  range_max: rule.rangeMax,
                  score: rule.score,
                })),
              }));
              startTransition(async () => {
                const result = await replaceScoreMaps(payload);
                setMapStatus(result);
              });
            }}
          >
            Save mappings
          </Button>
        </div>
        {mapStatus.status === "error" ? <p className={errorClass}>{mapStatus.error}</p> : null}
        {mapStatus.status === "saved" ? <p className={helperClass}>Mappings saved.</p> : null}
      </Panel>

      <Panel className="p-6">
        <h2 className={cardTitle}>Manual override</h2>
        <p className={helperClass}>
          Set factor values, not the total — the same function computes the
          score. Reasoning is required. A later call extraction will re-score
          this lead; an override is not a freeze.
        </p>
        {leads.length === 0 ? (
          <p className={`${helperClass} mt-3`}>No leads to override yet.</p>
        ) : (
          <form
            className="mt-5 space-y-4"
            action={(formData) => {
              startTransition(async () => {
                const result = await overrideLeadScore(formData);
                setOverrideStatus(
                  result.ok
                    ? `Saved. Total is ${result.total}. A later call will re-score.`
                    : result.error
                );
              });
            }}
          >
            <div className="max-w-md">
              <Field label="Lead" name="lead_id" htmlFor="override-lead">
                <Select id="override-lead" name="lead_id" required defaultValue={leads[0]?.id}>
                  {leads.map((lead) => (
                    <option key={lead.id} value={lead.id}>
                      {lead.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {SCORE_FACTORS.map((factor) => (
                <Field key={factor} label={FACTOR_LABELS[factor]} name={factor} htmlFor={`override-${factor}`}>
                  <Input
                    id={`override-${factor}`}
                    name={factor}
                    type="number"
                    min={0}
                    max={100}
                    placeholder="Unknown"
                  />
                </Field>
              ))}
            </div>
            <Field label="Reasoning" name="reasoning" htmlFor="override-reasoning">
              <Textarea
                id="override-reasoning"
                name="reasoning"
                required
                rows={3}
              />
            </Field>
            {overrideStatus ? <p className={helperClass}>{overrideStatus}</p> : null}
            <Button type="submit" variant="primary" size="lg" disabled={pending}>
              Save override
            </Button>
          </form>
        )}
      </Panel>

      <Panel className="p-6">
        <h2 className={cardTitle}>Bulk re-score</h2>
        <p className={helperClass}>
          Writes a new manual score row for every lead that can be scored under
          the saved settings. History is not rewritten. This never runs on save.
        </p>
        <Button
          type="button"
          variant="secondary"
          size="lg"
          className="mt-4"
          disabled={pending}
          onClick={() => {
            startTransition(async () => {
              const result = await bulkRescoreLeads();
              setBulkStatus(
                result.status === "saved"
                  ? `Wrote ${result.count ?? 0} new score row${(result.count ?? 0) === 1 ? "" : "s"}.`
                  : result.status === "error"
                    ? result.error
                    : "Could not re-score."
              );
            });
          }}
        >
          Re-score all leads now
        </Button>
        {bulkStatus ? <p className={helperClass}>{bulkStatus}</p> : null}
      </Panel>

      <Panel className="p-6">
        <h2 className={cardTitle}>Ghost detector</h2>
        <p className={helperClass}>
          Runs on a schedule, not when someone opens a page. Thresholds use this
          workspace&apos;s timezone. You can also run it here to inspect the
          result.
        </p>
        {lastGhostRun ? (
          <p className={`${helperClass} mt-2`}>
            Last run: evaluated {lastGhostRun.evaluated} lead
            {lastGhostRun.evaluated === 1 ? "" : "s"}, changed {lastGhostRun.changed}, at{" "}
            {new Date(lastGhostRun.ranAt).toLocaleString()}.
          </p>
        ) : (
          <p className={`${helperClass} mt-2`}>No run logged yet.</p>
        )}
        <Button
          type="button"
          variant="secondary"
          size="lg"
          className="mt-4"
          disabled={pending}
          onClick={() => {
            startTransition(async () => {
              const result = await runGhostDetectorNow();
              setGhostStatus(
                result.status === "saved"
                  ? `Evaluated ${result.evaluated ?? 0}, changed ${result.changed ?? 0}.`
                  : result.status === "error"
                    ? result.error
                    : "Could not run the ghost detector."
              );
            });
          }}
        >
          Run ghost detector now
        </Button>
        {ghostStatus ? <p className={helperClass}>{ghostStatus}</p> : null}
      </Panel>
    </div>
  );
}
