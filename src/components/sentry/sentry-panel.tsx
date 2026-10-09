"use client";

import Link from "next/link";
import { useState } from "react";

import { acknowledgeSentryAlert, previewSentryAction, setSentryModeAction } from "@/app/(workspace)/app/agents/sentry-actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SegmentedRadioGroup } from "@/components/ui/segmented-radio";
import { CLOCK_DEFINITIONS } from "@/lib/sentry/clock";

const STARTS = [
  { value: "now", label: "From now" },
  { value: "day", label: "Last 24 hours" },
  { value: "week", label: "Last 7 days" },
] as const;

type Start = (typeof STARTS)[number]["value"];

function startAt(start: Start): string {
  const back = start === "week" ? 7 * 86_400_000 : start === "day" ? 86_400_000 : 0;
  return new Date(Date.now() - back).toISOString();
}

export type SentryMeasures = {
  firstTouches: number;
  averageMinutes: number | null;
  medianMinutes: number | null;
  withinWindowPercent: number | null;
  gaps: number;
  gapsMetPercent: number | null;
};

export function SentryPanel({
  mode,
  counts,
  canControl,
  alerts,
  status,
  measures,
  liveAllowed,
}: {
  mode: "off" | "practice" | "live";
  counts: { watched: number; atRisk: number; missed: number; onTime: number };
  canControl: boolean;
  alerts: Array<{ id: string; title: string; body: string; leadId: string }>;
  status: { state: "off" | "watching" | "paused" | "stopped"; detail: string };
  measures: SentryMeasures;
  liveAllowed: boolean;
}) {
  const [start, setStart] = useState<Start>("now");
  const [preview, setPreview] = useState<{ start: Start; count: number } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const previewCount = preview?.start === start ? preview.count : null;
  const startLabel = STARTS.find((row) => row.value === start)?.label.toLowerCase() ?? "from now";

  return (
    <div className="mt-6 space-y-4">
      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Response clocks</h2>
            <p className="text-sm text-muted-foreground">
              {mode === "off" ? "Sentry is off for this workspace." : mode === "practice" ? "Practice: clocks show here, and nothing is sent out." : "Live: the team is notified."}
            </p>
          </div>
          <p className="text-sm">
            {counts.watched} watched · {counts.onTime} on time · {counts.atRisk} at risk · {counts.missed} missed
          </p>
        </div>
        {status.state === "stopped" || status.state === "paused" ? (
          <p role="status" className={status.state === "stopped" ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
            {status.detail}
          </p>
        ) : status.state === "watching" ? (
          <p className="text-sm text-muted-foreground">{status.detail}</p>
        ) : null}
        {canControl ? (
          <div className="space-y-2">
            <SegmentedRadioGroup aria-label="Which leads Sentry watches" value={start} onValueChange={(value) => setStart(value as Start)} options={STARTS} size="sm" />
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  const result = await previewSentryAction(startAt(start));
                  if (!result.ok) setMessage(result.error);
                  else setPreview({ start, count: result.data.wouldAlert });
                }}
              >
                Preview
              </Button>
              <ConfirmDialog
                trigger={<Button size="sm" variant="outline">Practice</Button>}
                title="Watch in practice?"
                description={`Sentry will show clocks for leads created ${startLabel}. ${previewCount == null ? "Preview first to see how many already need a person." : `${previewCount} of those leads have no human touch yet.`} Nothing is sent.`}
                confirmLabel="Start practice"
                confirmVariant="default"
                onConfirm={async () => {
                  const result = await setSentryModeAction({ mode: "practice", watchFrom: startAt(start), confirmed: true });
                  setMessage(result.ok ? null : result.error);
                }}
              />
              {liveAllowed ? (
                <ConfirmDialog
                  trigger={<Button size="sm">Go live</Button>}
                  title="Let Sentry notify the team?"
                  description={
                    start === "now"
                      ? "Only leads from the moment you confirm are watched, so older leads do not all alert at once."
                      : `Leads created ${startLabel} are included. ${previewCount == null ? "Preview first to see how many would alert." : `${previewCount} have no human touch yet and may alert together, as one grouped note per person.`}`
                  }
                  confirmLabel="Go live"
                  confirmVariant="default"
                  onConfirm={async () => {
                    const result = await setSentryModeAction({ mode: "live", watchFrom: startAt(start), confirmed: true });
                    setMessage(result.ok ? null : result.error);
                  }}
                />
              ) : (
                <p className="self-center text-sm text-muted-foreground">Sentry stays in practice until onboarding is finished.</p>
              )}
              {mode !== "off" ? (
                <ConfirmDialog
                  trigger={<Button size="sm" variant="outline">Turn off</Button>}
                  title="Stop Sentry for this workspace?"
                  description="Clocks stay visible. New alerts stop. Turning it back on uses a fresh starting moment."
                  confirmLabel="Turn Sentry off"
                  onConfirm={async () => {
                    const result = await setSentryModeAction({ mode: "off", watchFrom: startAt("now"), confirmed: true });
                    setMessage(result.ok ? null : result.error);
                  }}
                />
              ) : null}
            </div>
            {previewCount != null ? (
              <p className="text-sm text-muted-foreground">
                {previewCount} {previewCount === 1 ? "lead" : "leads"} created {startLabel} {previewCount === 1 ? "has" : "have"} no human touch yet.
              </p>
            ) : null}
          </div>
        ) : null}
        {alerts.length ? (
          <ul className="space-y-2">
            {alerts.map((alert) => (
              <li key={alert.id} className="rounded-md border border-border p-2 text-sm">
                <p className="font-medium">{alert.title}</p>
                <p className="text-muted-foreground">{alert.body}</p>
                <div className="mt-2 flex gap-2">
                  <Button size="sm" variant="outline" render={<Link href={`/app/cases/${alert.leadId}`} />}>
                    Open case file
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      const result = await acknowledgeSentryAlert({ alertId: alert.id });
                      setMessage(result.ok ? null : result.error);
                    }}
                  >
                    Acknowledge
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      const result = await acknowledgeSentryAlert({ alertId: alert.id, snoozeMinutes: 60 });
                      setMessage(result.ok ? null : result.error);
                    }}
                  >
                    Snooze an hour
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No open alerts.</p>
        )}
        {message ? <p role="alert" className="text-sm text-destructive">{message}</p> : null}
      </Card>
      <Card className="space-y-2 p-4">
        <h2 className="text-sm font-semibold">Last 30 days</h2>
        {measures.firstTouches === 0 && measures.gaps === 0 ? (
          <p className="text-sm text-muted-foreground">No measurements yet. They start once Sentry has watched a lead to its first touch.</p>
        ) : (
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-muted-foreground">Average to first touch</dt>
              <dd className="font-medium">{minutes(measures.averageMinutes)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Median to first touch</dt>
              <dd className="font-medium">{minutes(measures.medianMinutes)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">First touch within window</dt>
              <dd className="font-medium">{percent(measures.withinWindowPercent)} of {measures.firstTouches}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Follow-ups within cadence</dt>
              <dd className="font-medium">{percent(measures.gapsMetPercent)} of {measures.gaps}</dd>
            </div>
          </dl>
        )}
      </Card>
      <Card className="space-y-2 p-4">
        <h2 className="text-sm font-semibold">What the numbers mean</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {CLOCK_DEFINITIONS.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function minutes(value: number | null): string {
  if (value == null) return "Not enough data";
  if (value < 60) return `${Math.round(value)} min`;
  return `${(value / 60).toFixed(1)} h`;
}

function percent(value: number | null): string {
  return value == null ? "—" : `${Math.round(value)}%`;
}
