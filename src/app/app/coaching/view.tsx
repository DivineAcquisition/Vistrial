import Link from "next/link";

import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/states";
import { Panel } from "@/components/ui/panel";
import { SectionHeader } from "@/components/ui/section-header";
import { CALL_QUALITY_MEASURES, CALL_QUALITY_MEASURE_SURFACES } from "@/lib/coaching/catalog";
import { CALL_QUALITY_HONESTY, STRUCTURAL_NOT_A_TARGET } from "@/lib/coaching/constants";
import { formatCallDuration } from "@/lib/cases/format";
import { helperClass } from "@/lib/ui";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function bool(value: unknown): boolean {
  return value === true;
}

function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function talkLabel(rep: number | null, prospect: number | null, attributed: boolean): string {
  if (!attributed || rep === null || prospect === null) {
    return "Unknown — speakers were not labeled";
  }
  return `${Math.round(rep * 100)}% rep / ${Math.round(prospect * 100)}% prospect. Context, not a target.`;
}

function durationLabel(duration: number | null, typical: number | null): string {
  const call = formatCallDuration(duration);
  if (typical == null) return `${call} (no org typical yet)`;
  return `${call} vs ${formatCallDuration(typical)} typical. Context, not a target.`;
}

function discoveryLabel(row: Record<string, unknown>): string {
  return [
    bool(row.discoveryAuthority) ? "authority explored" : "authority not explored",
    bool(row.discoveryPain) ? "pain explored" : "pain not explored",
    bool(row.discoveryTimeline) ? "timeline explored" : "timeline not explored",
    bool(row.discoveryBudget) ? "investment explored" : "investment not explored",
  ].join(" · ");
}

function nextStepLabel(row: Record<string, unknown>): string {
  const clarity = str(row.commitmentClarity) ?? "none";
  const stated = bool(row.nextStepStated) ? "stated" : "not stated";
  const agreed = bool(row.nextStepAgreed) ? "agreed" : "not agreed";
  return `${clarity} (${stated}, ${agreed})`;
}

function PatternsBlock({
  title,
  hint,
  patterns,
}: {
  title: string;
  hint: string;
  patterns: Record<string, unknown>;
}) {
  const shown = bool(patterns.shown);
  const discovery = arr(patterns.discovery);
  const workOn = arr(patterns.workOn);
  const best = arr(patterns.bestCalls);
  const movement = arr(patterns.movement);
  const closeByBand = asRecord(patterns.closeByBand);
  const lost = asRecord(patterns.objectionLost);
  const closedVsLost = asRecord(patterns.closedVsLost);

  return (
    <Panel className="p-6">
      <SectionHeader title={title} hint={hint} />
      {shown ? (
        <>
          <p className={helperClass}>{str(patterns.plain)}</p>
          <ul className="mt-4 space-y-2 text-sm text-silver">
            {discovery.map((item) => {
              const row = asRecord(item);
              return <li key={str(row.factor) ?? str(row.plain)}>{str(row.plain)}</li>;
            })}
          </ul>
          {bool(lost.shown) ? <p className="mt-3 text-sm text-silver">{str(lost.plain)}</p> : null}
          {bool(closeByBand.shown) ? (
            <div className="mt-4">
              <p className={helperClass}>{str(closeByBand.plain)}</p>
              <DataTable
                className="mt-2"
                columns={[
                  { key: "band", label: "Score band" },
                  { key: "sample", label: "Closed of resolved" },
                ]}
                rows={arr(closeByBand.rows).map((item) => {
                  const row = asRecord(item);
                  const rate = asRecord(row.rate);
                  return {
                    band: str(row.band) ?? "—",
                    sample: bool(rate.too_small)
                      ? "Too few in this band"
                      : (str(rate.sample_label) ?? "—"),
                  };
                })}
                empty="No score band had enough transcribed calls."
              />
            </div>
          ) : (
            <p className="mt-3 text-sm text-dim">{str(closeByBand.plain)}</p>
          )}
          {bool(closedVsLost.shown) ? (
            <p className="mt-3 text-sm text-silver">
              {str(closedVsLost.plain)}
              {str(closedVsLost.leadQualityCaveat) ? ` ${str(closedVsLost.leadQualityCaveat)}` : ""}
            </p>
          ) : (
            <p className="mt-3 text-sm text-dim">{str(closedVsLost.plain)}</p>
          )}
        </>
      ) : (
        <p className="text-sm text-silver">{str(patterns.plain)}</p>
      )}

      {workOn.length > 0 && shown ? (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-white">Things to work on</h3>
          <ul className="mt-2 space-y-3 text-sm text-silver">
            {workOn.slice(0, 2).map((item, index) => {
              const row = asRecord(item);
              const examples = arr(row.exampleCallIds);
              return (
                <li key={`${str(row.kind)}-${index}`}>
                  <p>{str(row.plain)}</p>
                  {examples.length > 0 ? (
                    <p className="mt-1 text-xs text-dim">
                      Examples to review, not a verdict on any one of them:{" "}
                      {examples.map((id, i) => (
                        <span key={String(id)}>
                          {i > 0 ? ", " : ""}
                          <Link
                            href={`/app/calls/${String(id)}`}
                            className="underline-offset-2 hover:underline"
                          >
                            call {i + 1}
                          </Link>
                        </span>
                      ))}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {best.length > 0 ? (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-white">Calls of yours that closed</h3>
          <p className={helperClass}>Most people never listen back to a call they won.</p>
          <ul className="mt-2 space-y-1 text-sm text-silver">
            {best.map((item) => {
              const row = asRecord(item);
              return (
                <li key={str(row.callId)}>
                  <Link
                    href={`/app/calls/${str(row.callId)}`}
                    className="underline-offset-2 hover:underline"
                  >
                    {str(row.leadName) ?? "Call"}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {shown && movement.length > 0 ? (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-white">Movement</h3>
          <p className={helperClass}>Counts by week, not rates. A week with few calls is not a pattern.</p>
          <DataTable
            className="mt-2"
            columns={[
              { key: "week", label: "Week" },
              { key: "calls", label: "Calls" },
              { key: "authority", label: "Authority not explored" },
              { key: "next", label: "Dated next step" },
            ]}
            rows={movement.map((item) => {
              const row = asRecord(item);
              return {
                week: str(row.week) ?? "—",
                calls: String(num(row.callN) ?? 0),
                authority: String(num(row.authoritySkippedN) ?? 0),
                next: String(num(row.specificNextStepN) ?? 0),
              };
            })}
            empty="No weekly movement yet."
          />
        </div>
      ) : null}
    </Panel>
  );
}

export function CoachingView({
  payload,
  query,
  includeTeam,
}: {
  payload: Record<string, unknown>;
  query: string;
  includeTeam: boolean;
}) {
  const acknowledged = bool(payload.acknowledged);
  const patterns = asRecord(payload.patterns);
  const calls = arr(payload.calls);
  const findings = arr(payload.findings);
  const gaming = arr(payload.gaming);
  const team = payload.team && typeof payload.team === "object" ? asRecord(payload.team) : null;
  const catalogOnPage = new Set(Object.keys(CALL_QUALITY_MEASURE_SURFACES));

  if (!acknowledged) {
    return (
      <EmptyState
        kind="permission"
        title="Coaching waits until you have been told."
        detail="Confirm the notice above. Vistrial does not analyze your calls until you have."
      />
    );
  }

  return (
    <div className="space-y-8">
      <Notice tone="info">{CALL_QUALITY_HONESTY}</Notice>
      <Notice tone="warning">{STRUCTURAL_NOT_A_TARGET}</Notice>

      <PatternsBlock
        title="Your patterns"
        hint="Across a meaningful number of calls. A single call is never a judgment."
        patterns={patterns}
      />

      {includeTeam && team ? (
        <PatternsBlock
          title="Team patterns"
          hint="Available, not forced, and not a rank. Other people's recent calls stay private until the delay has passed."
          patterns={team}
        />
      ) : (
        <p className="text-sm text-dim">
          <Link href="/app/coaching?compare=team" className="underline-offset-2 hover:underline">
            Compare with team patterns
          </Link>
          — not a ranking.
        </p>
      )}

      {findings.length > 0 ? (
        <Panel className="p-6">
          <SectionHeader
            title="What closed calls looked like here"
            hint="Descriptive of this business. Not a script, and not a claim that doing the same thing will close the next one."
          />
          <ul className="space-y-3 text-sm text-silver">
            {findings.map((item) => {
              const row = asRecord(item);
              return (
                <li key={str(row.key)}>
                  <p>{str(row.statement)}</p>
                  {str(row.leadQualityCaveat) ? (
                    <p className="mt-1 text-xs text-dim">{str(row.leadQualityCaveat)}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </Panel>
      ) : null}

      {gaming.length > 0 ? (
        <Notice tone="warning" title="A structural number moved without the outcome">
          {gaming.map((item) => {
            const row = asRecord(item);
            return <p key={str(row.measureKey)}>{str(row.statement)}</p>;
          })}
        </Notice>
      ) : null}

      <Panel className="p-6">
        <SectionHeader
          title="Your calls"
          hint="Structural facts about the recording, sitting next to what happened. None of these is a target."
        />
        <form method="get" action="/app/coaching" className="mb-4 flex flex-wrap gap-2">
          <Input
            name="q"
            defaultValue={query}
            placeholder="Search by lead name"
            density="compact"
            aria-label="Search your calls"
          />
          {includeTeam ? <input type="hidden" name="compare" value="team" /> : null}
          <Button type="submit" variant="secondary" size="sm">
            Search
          </Button>
        </form>
        <DataTable
          columns={[
            { key: "lead", label: "Lead" },
            { key: "talk", label: "Talk ratio", hideOnMobile: true },
            { key: "questions", label: "Questions" },
            { key: "monologue", label: "Longest monologue", hideOnMobile: true },
            { key: "duration", label: "Duration", hideOnMobile: true },
            { key: "discovery", label: "Discovery" },
            { key: "next", label: "Next step" },
            { key: "objections", label: "Objections" },
            { key: "openObjections", label: "Brief objections", hideOnMobile: true },
            { key: "brief", label: "Brief opened" },
          ]}
          rows={calls.map((item) => {
            const row = asRecord(item);
            const objections = arr(row.objections)
              .map((obj) => {
                const o = asRecord(obj);
                return `${str(o.type) ?? "objection"}: ${str(o.handling)}`;
              })
              .join("; ");
            return {
              lead: (
                <Link
                  href={`/app/calls/${str(row.callId)}`}
                  className="underline-offset-2 hover:underline"
                >
                  {str(row.leadName) ?? "Call"}
                </Link>
              ),
              talk: talkLabel(
                num(row.talkRatioRep),
                num(row.talkRatioProspect),
                bool(row.speakersAttributed)
              ),
              questions: `${num(row.openQuestionCount) ?? 0} open / ${num(row.closedQuestionCount) ?? 0} closed (${num(row.questionCount) ?? 0})`,
              monologue:
                num(row.longestRepMonologueWords) == null
                  ? "Unknown"
                  : `${num(row.longestRepMonologueWords)} words`,
              duration: durationLabel(num(row.durationSeconds), num(row.typicalDurationSeconds)),
              discovery: discoveryLabel(row),
              next: nextStepLabel(row),
              objections: objections || "None extracted",
              openObjections: `${num(row.openObjectionsAddressedN) ?? 0} of ${num(row.openObjectionsPriorN) ?? 0} addressed`,
              brief: bool(row.briefOpenedBeforeCall) ? "Yes" : "No",
            };
          })}
          empty="No transcribed calls of yours match that search."
        />
      </Panel>

      <Panel className="p-6">
        <SectionHeader
          title="What we compute"
          hint="If it is not on this list, it is not computed. Every item appears on this page."
        />
        <DataTable
          columns={[
            { key: "label", label: "Measure" },
            { key: "surface", label: "Where you see it" },
            { key: "onPage", label: "On this page" },
          ]}
          rows={CALL_QUALITY_MEASURES.map((item) => ({
            label: item.label,
            surface: CALL_QUALITY_MEASURE_SURFACES[item.key],
            onPage: catalogOnPage.has(item.key) ? "Yes" : "Missing",
          }))}
          empty="Nothing is computed."
        />
      </Panel>
    </div>
  );
}
