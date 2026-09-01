import { CommsSection, SpendTodayCard } from "@/app/app/forsight/live-sources";
import { KpiCard, Trend } from "@/components/ui/kpi-card";
import { GroupedBarChart, LineChart } from "@/components/ui/chart";
import { Notice } from "@/components/ui/states";
import { Panel } from "@/components/ui/panel";
import { SectionHeader } from "@/components/ui/section-header";
import {
  formatMetric,
  formatNumber,
  isNumber,
  movement,
  type MetricFormat,
  type MetricSense,
  type MetricValue,
} from "@/lib/forsight/values";
import type { CommsView } from "@/lib/forsight/dashboard";
import type { SpendToday } from "@/lib/forsight/spend-today";
import type { WeeklyPulse, WeekRow } from "@/lib/forsight/weekly";

/**
 * Four numbers from the newest Weekly Summary row, each against the row before
 * it. The arrow follows the number and the colour follows the meaning, which is
 * why spend gets an arrow and no colour: it went up because someone decided it
 * should, and that is neither good news nor bad.
 */
const HEADLINES: Array<{
  label: string;
  read: (week: WeekRow) => MetricValue;
  format: MetricFormat;
  better: MetricSense;
}> = [
  { label: "Spend", read: (week) => week.spend, format: "currency", better: "neither" },
  {
    label: "Cost per audit held",
    read: (week) => week.costPerAuditHeld,
    format: "currency",
    better: "lower",
  },
  { label: "CAC", read: (week) => week.cac, format: "currency", better: "lower" },
  { label: "ROAS", read: (week) => week.roas, format: "ratio", better: "higher" },
];

const FUNNEL: Array<{
  label: string;
  read: (week: WeekRow) => MetricValue;
  tone: "brand" | "good" | "warning" | "critical";
}> = [
  { label: "Applications", read: (week) => week.applications, tone: "brand" },
  { label: "Qualified", read: (week) => week.qualified, tone: "brand" },
  { label: "Booked", read: (week) => week.booked, tone: "warning" },
  { label: "Held", read: (week) => week.held, tone: "warning" },
  { label: "Closed", read: (week) => week.closed, tone: "good" },
];

function count(value: MetricValue): number {
  return isNumber(value) ? value.value : 0;
}

export function WeeklyPulseScreen({
  pulse,
  live,
}: {
  pulse: WeeklyPulse;
  live: { spendToday: SpendToday; comms: CommsView };
}) {
  const { current, previous, weeks, hasTrend } = pulse;
  if (!current) return null;

  const costTrend = weeks
    .filter((week) => isNumber(week.costPerAuditHeld))
    .map((week) => ({
      label: week.week,
      value: (week.costPerAuditHeld as { value: number }).value,
    }));

  return (
    <>
      <section>
        <SectionHeader title={current.week} hint="The most recent week on record." />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {HEADLINES.map((headline) => {
            const value = headline.read(current);
            const before = previous ? headline.read(previous) : null;
            const change = before
              ? movement(value, before, { format: headline.format, better: headline.better })
              : null;

            return (
              <KpiCard
                key={headline.label}
                label={headline.label}
                value={formatMetric(value, headline.format)}
                sub={
                  previous && before
                    ? `${formatMetric(before, headline.format)} last week`
                    : undefined
                }
                trend={
                  change ? (
                    <Trend
                      direction={change.direction}
                      value={change.amount}
                      comparison="on last week"
                      isGood={change.isGood}
                    />
                  ) : undefined
                }
              />
            );
          })}
        </div>
        <div className="mt-3">
          <SpendTodayCard spend={live.spendToday} />
        </div>
      </section>

      <CommsSection comms={live.comms} />

      {hasTrend ? null : (
        <Notice tone="info" title="One week on record">
          Trends need a second week to compare against. The numbers above are this week&rsquo;s;
          the charts fill in once next week&rsquo;s Weekly Summary row is written.
        </Notice>
      )}

      {hasTrend && costTrend.length > 1 ? (
        <section>
          <SectionHeader
            title="Cost per audit held"
            hint="Every week on record, oldest to newest. Creative fatigue shows up here first."
          />
          <Panel className="p-5">
            <LineChart
              points={costTrend}
              label="Cost per audit held by week"
              format={(value) => formatNumber(value, "currency")}
              tone="brand"
            />
          </Panel>
        </section>
      ) : null}

      {hasTrend ? (
        <section>
          <SectionHeader
            title="The funnel, week by week"
            hint="Where it narrows, and whether that is changing."
          />
          <Panel className="p-5">
            <GroupedBarChart
              label="Funnel counts by week"
              groups={weeks.map((week) => ({
                label: week.week,
                values: FUNNEL.map((stage) => count(stage.read(week))),
              }))}
              series={FUNNEL.map((stage) => ({ label: stage.label, tone: stage.tone }))}
              format={(value) => formatNumber(value, "number")}
            />
          </Panel>
        </section>
      ) : (
        <section>
          <SectionHeader title="The funnel this week" />
          <Panel className="p-5">
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-5">
              {FUNNEL.map((stage) => (
                <div key={stage.label}>
                  <dt className="text-xs tracking-[0.1em] text-dim uppercase">{stage.label}</dt>
                  <dd className="mt-1 text-2xl font-semibold tabular-nums text-white">
                    {formatMetric(stage.read(current), "number")}
                  </dd>
                </div>
              ))}
            </dl>
          </Panel>
        </section>
      )}
    </>
  );
}
