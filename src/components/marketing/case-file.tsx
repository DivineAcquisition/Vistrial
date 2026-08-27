import { AnimatedList } from "@/components/ui/animated-list";
import { Card } from "@/components/ui/card";
import { NumberTicker } from "@/components/ui/number-ticker";
import { Progress } from "@/components/ui/progress";
import { StatusBadge } from "@/components/ui/status-badge";
import { CASE_FILE } from "@/lib/marketing/copy";
import { DEMO_CASE } from "@/lib/marketing/demo-case";
import { captionText, sectionLabel } from "@/lib/ui";
import { cn } from "@/lib/utils";

function SampleMark() {
  return (
    <p className={cn(captionText, "uppercase tracking-[0.14em]")}>{DEMO_CASE.sampleLabel}</p>
  );
}

export function HeroCaseFile() {
  const demo = DEMO_CASE;
  return (
    <div className="bg-ink-900">
      <div className="flex gap-5 border-b border-white/[0.06] px-4 pt-3">
        <span className="border-b-2 border-brand-500 pb-2.5 text-xs font-medium text-white">File</span>
        <span className="pb-2.5 text-xs text-dim">Timeline</span>
        <span className="pb-2.5 text-xs text-dim">Brief</span>
      </div>

      <div className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <SampleMark />
            <p className="mt-1.5 text-base font-semibold text-white">{demo.name}</p>
            <p className="mt-1 text-sm text-silver">
              {demo.email} · {demo.phone}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <StatusBadge label={demo.status} tone="brand" />
              <StatusBadge label={demo.track} tone="good" />
            </div>
          </div>
          <div className="text-right">
            <p className={sectionLabel}>Readiness score</p>
            <p className="mt-1 tabular text-3xl font-semibold text-brand-500">
              <NumberTicker
                value={demo.score.total}
                className="text-brand-500 dark:text-brand-500"
              />
            </p>
            <p className="mt-1 text-xs text-dim">/ 100</p>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {demo.score.factors.map((factor) => (
            <Progress
              key={factor.key}
              label={factor.label}
              value={factor.value}
              valueLabel={String(factor.value)}
              tone={factor.value >= 75 ? "good" : factor.value >= 60 ? "brand" : "warning"}
            />
          ))}
        </div>

        <div className="mt-6 rounded-xl border border-flag-warning/25 bg-flag-warning/[0.08] p-4">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge label={demo.objection.type} tone="warning" />
            <span className="text-xs text-dim">{demo.objection.source}</span>
          </div>
          <p className="mt-2 text-sm text-white">“{demo.objection.verbatim}”</p>
        </div>

        <AnimatedList className="mt-5 items-stretch gap-3 border-t border-white/[0.06] pt-4" delay={800}>
          {demo.touches.slice(0, 3).map((touch) => (
            <div key={`${touch.when}-${touch.channel}`} className="flex items-start justify-between gap-3">
              <p className="text-sm text-white">
                {touch.channel}
                <span className="ml-2 text-dim">
                  {touch.who} · {touch.when}
                </span>
              </p>
            </div>
          ))}
        </AnimatedList>

        <div className="mt-4 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge label={demo.followUp.channel} tone="brand" />
            <StatusBadge label={demo.followUp.status} tone="warning" />
          </div>
          <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-silver">{demo.followUp.body}</p>
        </div>
      </div>
    </div>
  );
}

export function AnnotatedCaseFile() {
  const demo = DEMO_CASE;

  return (
    <div className="space-y-4">
      <CasePart title={CASE_FILE.parts[0].title} body={CASE_FILE.parts[0].body}>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <SampleMark />
            <p className="mt-2 text-base font-semibold text-white">{demo.name}</p>
            <p className="mt-1 text-xs text-silver">
              {demo.source}
              {demo.campaign ? ` · ${demo.campaign}` : ""}
            </p>
          </div>
          <div className="text-right">
            <p className="tabular text-2xl font-semibold text-brand-500">{demo.score.total}</p>
            <p className="mt-1 text-xs text-dim">{demo.score.confidence}</p>
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {demo.score.factors.map((factor) => (
            <Progress
              key={factor.key}
              label={factor.label}
              value={factor.value}
              valueLabel={String(factor.value)}
              tone="brand"
            />
          ))}
        </div>
        <p className="mt-4 text-sm leading-relaxed text-silver">{demo.score.reasoning}</p>
      </CasePart>

      <CasePart title={CASE_FILE.parts[1].title} body={CASE_FILE.parts[1].body}>
        <ol className="space-y-3">
          {demo.touches.map((touch) => (
            <li key={`${touch.when}-${touch.channel}`} className="border-t border-white/[0.05] pt-3 first:border-t-0 first:pt-0">
              <p className="text-sm text-white">
                {touch.channel}
                <span className="ml-2 text-dim">
                  {touch.who} · {touch.when}
                </span>
              </p>
              <p className="mt-1 text-sm text-silver">{touch.detail}</p>
            </li>
          ))}
        </ol>
      </CasePart>

      <CasePart title={CASE_FILE.parts[2].title} body={CASE_FILE.parts[2].body}>
        <p className="text-sm font-medium text-white">{demo.transcript.title}</p>
        <dl className="mt-3 divide-y divide-white/[0.05]">
          <TranscriptRow label="Budget" value={demo.transcript.budget} />
          <TranscriptRow label="Timeline" value={demo.transcript.timeline} />
          <TranscriptRow label="Who else decides" value={demo.transcript.authority} />
        </dl>
      </CasePart>

      <CasePart title={CASE_FILE.parts[3].title} body={CASE_FILE.parts[3].body}>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <StatusBadge label={demo.objection.type} tone="warning" />
          <p className="mt-2 text-sm text-white">“{demo.objection.verbatim}”</p>
          <p className="mt-1 text-xs text-dim">{demo.objection.source}</p>
        </div>
      </CasePart>

      <CasePart title={CASE_FILE.parts[4].title} body={CASE_FILE.parts[4].body}>
        <p className="text-[11px] font-semibold tracking-[0.14em] text-brand-300 uppercase">Who</p>
        <p className="mt-1 text-sm font-semibold text-white">{demo.brief.who}</p>
        <p className="mt-4 text-[11px] font-semibold tracking-[0.14em] text-brand-300 uppercase">
          What the setter established
        </p>
        <p className="mt-1 text-sm text-silver">{demo.brief.setter}</p>
        <p className="mt-4 text-[11px] font-semibold tracking-[0.14em] text-brand-300 uppercase">
          Their words
        </p>
        <p className="mt-1 text-sm text-silver">“{demo.brief.quote}”</p>
      </CasePart>

      <CasePart title={CASE_FILE.parts[5].title} body={CASE_FILE.parts[5].body}>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge label={demo.followUp.channel} tone="brand" />
          <StatusBadge label={demo.followUp.status} tone="warning" />
        </div>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-silver">
          {demo.followUp.body}
        </p>
      </CasePart>
    </div>
  );
}

function CasePart({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="rounded-xl p-4">
      <h3 className="text-base font-semibold text-white">{title}</h3>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-silver">{body}</p>
      <div className="mt-5">{children}</div>
    </Card>
  );
}

function TranscriptRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-baseline sm:gap-4">
      <dt className="w-full shrink-0 text-xs font-medium tracking-[0.1em] text-dim uppercase sm:w-40">
        {label}
      </dt>
      <dd className="min-w-0 flex-1 text-sm text-silver">{value}</dd>
    </div>
  );
}
