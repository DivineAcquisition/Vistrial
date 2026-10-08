import Link from "next/link";

import { DataTable } from "@/components/ui/data-table";
import { Notice } from "@/components/ui/states";
import { Panel } from "@/components/ui/panel";
import { SectionHeader } from "@/components/ui/section-header";
import { CALL_QUALITY_MEASURES } from "@/lib/coaching/catalog";
import { helperClass } from "@/lib/ui";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function bool(value: unknown): boolean {
  return value === true;
}

function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function PatternList({ patterns }: { patterns: Record<string, unknown> }) {
  if (!bool(patterns.shown)) {
    return <p className="text-sm text-silver">{str(patterns.plain)}</p>;
  }
  return (
    <ul className="space-y-2 text-sm text-silver">
      {arr(patterns.discovery).map((item) => {
        const row = asRecord(item);
        return <li key={str(row.factor) ?? str(row.plain)}>{str(row.plain)}</li>;
      })}
      {bool(asRecord(patterns.objectionLost).shown) ? (
        <li>{str(asRecord(patterns.objectionLost).plain)}</li>
      ) : null}
      <li>{str(asRecord(patterns.closeByBand).plain)}</li>
    </ul>
  );
}

export function CoachingManagerView({ payload }: { payload: Record<string, unknown> }) {
  const team = asRecord(payload.team);
  const reps = arr(payload.reps);
  const findings = arr(payload.findings);
  const gaming = arr(payload.gaming);
  const brief = asRecord(payload.briefUsage);

  return (
    <div className="space-y-8">
      <Notice tone="info">{str(payload.honesty)}</Notice>
      <Notice tone="warning">{str(payload.structuralNotATarget)}</Notice>

      <Panel className="p-6">
        <SectionHeader
          title="Team patterns"
          hint="Usually more useful than an individual one: they point at the offer, the training, or the script."
        />
        <PatternList patterns={team} />
      </Panel>

      {findings.length > 0 ? (
        <Panel className="p-6">
          <SectionHeader
            title="What closed calls looked like here"
            hint="Feed this into the next coaching conversation. Do not turn it into a script."
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

      <Panel className="p-6">
        <SectionHeader
          title="People to review with"
          hint="Coaching prompts with examples from that person's own calls. Not a rating, and not ordered by close rate."
        />
        {reps.length === 0 ? (
          <p className="text-sm text-dim">
            No one has transcribed calls past the delay window yet, or they have not confirmed they
            were told.
          </p>
        ) : (
          <ul className="space-y-6">
            {reps.map((item) => {
              const row = asRecord(item);
              const patterns = asRecord(row.patterns);
              const workOn = arr(patterns.workOn);
              return (
                <li key={str(row.memberId)} className="border-t border-white/[0.06] pt-4 first:border-t-0 first:pt-0">
                  <p className="font-heading text-sm text-white">{str(row.displayName)}</p>
                  <p className="mt-1 text-sm text-silver">{str(row.coachingPrompt)}</p>
                  {workOn.length > 0 ? (
                    <ul className="mt-2 space-y-1 text-sm text-silver">
                      {workOn.slice(0, 2).map((work, index) => {
                        const w = asRecord(work);
                        const examples = arr(w.exampleCallIds);
                        return (
                          <li key={`${str(row.memberId)}-${index}`}>
                            {str(w.plain)}{" "}
                            {examples.length > 0 ? (
                              <span className="text-dim">
                                Review together:{" "}
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
                              </span>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                  <p className="mt-2 text-xs text-dim">
                    Sample {typeof patterns.sampleN === "number" ? patterns.sampleN : "n"} transcribed
                    calls past the delay.
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Panel className="p-6">
        <SectionHeader
          title="Whether the brief is being used"
          hint="Opened before the call, and whether open objections were addressed. That is the manager's business."
        />
        <p className="text-sm text-silver">{str(brief.plain)}</p>
      </Panel>

      {gaming.length > 0 ? (
        <Notice tone="warning" title="A structural number moved without the outcome">
          <ul className="mt-2 space-y-1">
            {gaming.map((item) => {
              const row = asRecord(item);
              return (
                <li key={`${str(row.memberId)}-${str(row.measureKey)}`}>
                  {str(row.displayName)}: {str(row.statement)}
                </li>
              );
            })}
          </ul>
        </Notice>
      ) : null}

      <p className={helperClass}>
        Every number here is also on that person's coaching page. There is no separate score, and
        there is no leaderboard.
      </p>
      <DataTable
        columns={[
          { key: "label", label: "Measure computed" },
          { key: "where", label: "Where it shows" },
        ]}
        rows={CALL_QUALITY_MEASURES.map((item) => ({
          label: item.label,
          where: item.where,
        }))}
        empty="Nothing is computed."
      />
    </div>
  );
}
