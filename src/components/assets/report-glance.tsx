import { Detail, EvidenceLabel, EvidenceLegend, NextStep, StatusChip, VerdictStrip } from "@/components/readable";
import { isEvidenceWord } from "@/lib/readable/evidence";
import type { ReportGlance } from "@/lib/readable/report";

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/**
 * A report's answer, above its full text: the report's own summary with the weakest evidence label among its
 * claims, counts of what it holds, each opportunity as a short card, and an outline of its sections. Every
 * word is read back out of the report; the full text and every claim stay below, unchanged.
 */
export function ReportGlanceView({ glance }: { glance: ReportGlance }) {
  if (!glance.summary && glance.opportunities.length === 0 && glance.byLabel.length === 0) return null;
  const first = glance.opportunities.find((row) => row.action) ?? null;
  return (
    <div className="grid min-w-0 gap-4">
      <VerdictStrip
        text={glance.summary || "This version has no summary paragraph. Its sections are below."}
        label={glance.weakest}
        counts={[
          ...(glance.opportunities.length ? [{ value: String(glance.opportunities.length), words: glance.opportunities.length === 1 ? "opportunity" : "opportunities" }] : []),
          { value: String(glance.claims), words: glance.claims === 1 ? "claim" : "claims" },
          { value: String(glance.sources), words: glance.sources === 1 ? "source cited" : "sources cited" },
        ]}
      >
        {glance.objective ? <p className="text-sm text-muted-foreground">Asked: {glance.objective}</p> : null}
        {glance.byLabel.length > 0 ? (
          <ul className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground" aria-label="Claims by evidence label">
            {[...glance.byLabel].reverse().map((row) => (
              <li key={row.label} className="inline-flex items-center gap-1.5">
                <span className="font-medium text-card-foreground tabular-nums">{row.count}</span>
                <EvidenceLabel label={row.label} />
              </li>
            ))}
          </ul>
        ) : null}
        {glance.missing > 0 ? (
          <p className="flex flex-wrap items-center gap-2 text-sm text-card-foreground">
            <StatusChip tone="bad" label={`${plural(glance.missing, "claim")} with no source`} />
            <a href="#report-claims" className="text-primary underline-offset-2 hover:underline">
              See which
            </a>
          </p>
        ) : null}
        {glance.weakest ? (
          <Detail summary="What the labels mean">
            <EvidenceLegend only={glance.byLabel.map((row) => row.label)} />
            <p className="text-xs text-muted-foreground">The summary carries the weakest label among the report&apos;s claims. A &ldquo;Not enough data&rdquo; line makes no claim, so it is counted here but does not set the summary&apos;s label.</p>
          </Detail>
        ) : null}
      </VerdictStrip>

      {glance.opportunities.length > 0 ? (
        <section className="grid gap-2" aria-label="Opportunities at a glance">
          <h3 className="font-heading text-sm text-card-foreground">Opportunities</h3>
          <ol className="grid gap-2 md:grid-cols-2">
            {glance.opportunities.map((row, index) => (
              <li key={row.title} className="grid content-start gap-1.5 rounded-xl border border-border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span aria-hidden className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    {index + 1}
                  </span>
                  <h4 className="min-w-0 font-heading text-sm text-card-foreground">{row.title}</h4>
                  {row.evidence ? isEvidenceWord(row.evidence) ? <EvidenceLabel label={row.evidence} /> : <StatusChip tone="quiet" label={row.evidence} /> : null}
                </div>
                {row.action ? <p className="text-sm text-card-foreground">{row.action}</p> : null}
                {row.why || row.howToTell ? (
                  <Detail summary="Why, and how to tell if it worked">
                    {row.why ? <p className="text-sm text-muted-foreground">Why it matters here: {row.why}</p> : null}
                    {row.howToTell ? <p className="text-sm text-muted-foreground">How to tell: {row.howToTell}</p> : null}
                  </Detail>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {glance.sections.length > 1 ? (
        <nav aria-label="Sections of the report" className="flex flex-wrap items-center gap-1.5 text-xs print:hidden">
          <span className="text-muted-foreground">In the full report:</span>
          {glance.sections.map((row) => (
            <a key={row.id} href={`#${row.id}`} className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-card-foreground outline-none hover:border-primary focus-visible:ring-2 focus-visible:ring-ring">
              {row.title}
              {row.items > 0 ? <span className="text-muted-foreground tabular-nums">{row.items}</span> : null}
            </a>
          ))}
        </nav>
      ) : null}

      {first ? <NextStep look="inline" className="print:hidden" title={first.action} label={isEvidenceWord(first.evidence) ? first.evidence : null} note={`From opportunity 1 of ${glance.opportunities.length}: ${first.title}`} /> : null}
    </div>
  );
}
