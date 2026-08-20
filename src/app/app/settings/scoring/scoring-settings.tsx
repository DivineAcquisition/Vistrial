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
import { Panel } from "@/components/ui/panel";
import { overrideLeadScore } from "@/lib/scoring/override";
import { computeReadinessScore, FACTOR_LABELS, SCORE_FACTORS, type ScoreWeights } from "@/lib/scoring/compute";
import { extractFactors, type ScoreFieldMap } from "@/lib/scoring/extract";
import {
  btnPrimary,
  btnSecondary,
  btnSizeMd,
  btnSizeSm,
  errorClass,
  helperClass,
  inputClass,
  labelClass,
  selectClass,
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
      <Panel className="px-6 py-5">
        <p className="text-sm leading-relaxed text-silver">
          These mappings and weights are generic starting points. Tune them to
          this workspace&apos;s application and offer — a $3K coach and a $15K
          consultant should not share a threshold.
        </p>
      </Panel>

      <Panel className="px-6 py-6">
        <h2 className="text-sm font-semibold text-white">Weights and thresholds</h2>
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
            <div key={key}>
              <label className={labelClass} htmlFor={`weight-${key}`}>
                {label}
              </label>
              <input
                id={`weight-${key}`}
                name={`${key}_weight`}
                type="number"
                min={0}
                max={100}
                step={1}
                required
                value={weights[key]}
                onChange={(event) => updateWeight(key, event.target.value)}
                className={inputClass}
              />
            </div>
          ))}

          <p className={`sm:col-span-2 text-sm ${weightTotal === 100 ? "text-silver" : "text-flag-critical"}`}>
            Running total: {weightTotal} / 100
            {weightTotal === 100 ? "" : " — save stays blocked until this is 100."}
          </p>

          <div>
            <label className={labelClass} htmlFor="ready_threshold">
              Ready threshold
            </label>
            <input
              id="ready_threshold"
              name="ready_threshold"
              type="number"
              min={0}
              max={100}
              required
              value={readyThreshold}
              onChange={(event) => setReadyThreshold(Number(event.target.value))}
              className={inputClass}
            />
            <p className={helperClass}>At or above this total, the lead is on the ready track.</p>
          </div>
          <div>
            <label className={labelClass} htmlFor="speed_to_lead_minutes">
              Speed-to-lead minutes
            </label>
            <input
              id="speed_to_lead_minutes"
              name="speed_to_lead_minutes"
              type="number"
              min={1}
              required
              value={speedToLead}
              onChange={(event) => setSpeedToLead(Number(event.target.value))}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="ghost_days_soft">
              Approaching-ghost days
            </label>
            <input
              id="ghost_days_soft"
              name="ghost_days_soft"
              type="number"
              min={1}
              required
              value={ghostSoft}
              onChange={(event) => setGhostSoft(Number(event.target.value))}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="ghost_days_hard">
              Ghost days
            </label>
            <input
              id="ghost_days_hard"
              name="ghost_days_hard"
              type="number"
              min={1}
              required
              value={ghostHard}
              onChange={(event) => setGhostHard(Number(event.target.value))}
              className={inputClass}
            />
          </div>

          {configState.status === "error" ? (
            <p className={`${errorClass} sm:col-span-2`}>{configState.error}</p>
          ) : null}
          {configState.status === "saved" ? (
            <p className={`${helperClass} sm:col-span-2`}>Saved. Existing score rows are unchanged.</p>
          ) : null}

          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={configPending || weightTotal !== 100}
              className={`${btnPrimary} ${btnSizeMd}`}
            >
              {configPending ? "Saving…" : "Save weights and thresholds"}
            </button>
          </div>
        </form>
      </Panel>

      <Panel className="px-6 py-6">
        <h2 className="text-sm font-semibold text-white">Preview</h2>
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
              <label className={labelClass} htmlFor="preview-lead">
                Lead
              </label>
              <select
                id="preview-lead"
                className={selectClass}
                value={previewLeadId}
                onChange={(event) => setPreviewLeadId(event.target.value)}
              >
                {leads.map((lead) => (
                  <option key={lead.id} value={lead.id}>
                    {lead.name}
                  </option>
                ))}
              </select>
            </div>
            {previewLead && pendingScore ? (
              <dl className="mt-4 grid gap-3 sm:grid-cols-3">
                <div>
                  <dt className={labelClass}>Current cached score</dt>
                  <dd className="text-sm text-white">
                    {previewLead.currentScore === null ? "Unscored" : previewLead.currentScore}
                  </dd>
                </div>
                <div>
                  <dt className={labelClass}>Pending score</dt>
                  <dd className="text-sm text-white">
                    {pendingScore.kind === "unscored" ? "Unscored" : pendingScore.total}
                  </dd>
                </div>
                <div>
                  <dt className={labelClass}>Ready track at {readyThreshold}?</dt>
                  <dd className="text-sm text-white">
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

      <Panel className="px-6 py-6">
        <h2 className="text-sm font-semibold text-white">Application field mapping</h2>
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
                  <label className={labelClass} htmlFor={`field-${map.id}`}>
                    Application field
                  </label>
                  <input
                    id={`field-${map.id}`}
                    className={inputClass}
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
                </div>
                <div>
                  <label className={labelClass} htmlFor={`factor-${map.id}`}>
                    Factor
                  </label>
                  <select
                    id={`factor-${map.id}`}
                    className={selectClass}
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
                  </select>
                </div>
                <button
                  type="button"
                  className={`${btnSecondary} ${btnSizeSm}`}
                  onClick={() => setMaps((current) => current.filter((_, index) => index !== mapIndex))}
                >
                  Remove field
                </button>
              </div>

              <div className="mt-4 space-y-2">
                {map.rules.map((rule, ruleIndex) => (
                  <div key={rule.id} className="grid gap-2 sm:grid-cols-[120px_1fr_1fr_88px_auto] sm:items-end">
                    <select
                      className={selectClass}
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
                    </select>
                    {rule.kind === "choice" ? (
                      <input
                        className={inputClass}
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
                        <input
                          className={inputClass}
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
                        <input
                          className={inputClass}
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
                    <input
                      className={inputClass}
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
                    <button
                      type="button"
                      className={`${btnSecondary} ${btnSizeSm}`}
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
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className={`${btnSecondary} ${btnSizeSm}`}
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
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className={`${btnSecondary} ${btnSizeSm}`}
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
          </button>
          <button
            type="button"
            className={`${btnPrimary} ${btnSizeSm}`}
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
          </button>
        </div>
        {mapStatus.status === "error" ? <p className={errorClass}>{mapStatus.error}</p> : null}
        {mapStatus.status === "saved" ? <p className={helperClass}>Mappings saved.</p> : null}
      </Panel>

      <Panel className="px-6 py-6">
        <h2 className="text-sm font-semibold text-white">Manual override</h2>
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
              <label className={labelClass} htmlFor="override-lead">
                Lead
              </label>
              <select id="override-lead" name="lead_id" required className={selectClass} defaultValue={leads[0]?.id}>
                {leads.map((lead) => (
                  <option key={lead.id} value={lead.id}>
                    {lead.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {SCORE_FACTORS.map((factor) => (
                <div key={factor}>
                  <label className={labelClass} htmlFor={`override-${factor}`}>
                    {FACTOR_LABELS[factor]}
                  </label>
                  <input
                    id={`override-${factor}`}
                    name={factor}
                    type="number"
                    min={0}
                    max={100}
                    className={inputClass}
                    placeholder="Unknown"
                  />
                </div>
              ))}
            </div>
            <div>
              <label className={labelClass} htmlFor="override-reasoning">
                Reasoning
              </label>
              <textarea
                id="override-reasoning"
                name="reasoning"
                required
                rows={3}
                className={inputClass}
              />
            </div>
            {overrideStatus ? <p className={helperClass}>{overrideStatus}</p> : null}
            <button type="submit" disabled={pending} className={`${btnPrimary} ${btnSizeMd}`}>
              Save override
            </button>
          </form>
        )}
      </Panel>

      <Panel className="px-6 py-6">
        <h2 className="text-sm font-semibold text-white">Bulk re-score</h2>
        <p className={helperClass}>
          Writes a new manual score row for every lead that can be scored under
          the saved settings. History is not rewritten. This never runs on save.
        </p>
        <button
          type="button"
          className={`${btnSecondary} ${btnSizeMd} mt-4`}
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
        </button>
        {bulkStatus ? <p className={helperClass}>{bulkStatus}</p> : null}
      </Panel>

      <Panel className="px-6 py-6">
        <h2 className="text-sm font-semibold text-white">Ghost detector</h2>
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
        <button
          type="button"
          className={`${btnSecondary} ${btnSizeMd} mt-4`}
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
        </button>
        {ghostStatus ? <p className={helperClass}>{ghostStatus}</p> : null}
      </Panel>
    </div>
  );
}
