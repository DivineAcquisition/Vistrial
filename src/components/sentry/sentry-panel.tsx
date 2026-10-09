"use client";

import { useState } from "react";

import { acknowledgeSentryAlert, previewSentryAction, setSentryModeAction } from "@/app/(workspace)/app/agents/sentry-actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CLOCK_DEFINITIONS } from "@/lib/sentry/clock";

export function SentryPanel({
  mode,
  counts,
  canControl,
  alerts,
}: {
  mode: "off" | "practice" | "live";
  counts: { watched: number; atRisk: number; missed: number; onTime: number };
  canControl: boolean;
  alerts: Array<{ id: string; title: string; body: string; leadId: string }>;
}) {
  const [preview, setPreview] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const watchFrom = new Date().toISOString();

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
        {canControl ? (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                const result = await previewSentryAction(watchFrom);
                if (!result.ok) setMessage(result.error);
                else setPreview(result.data.wouldAlert);
              }}
            >
              Preview new leads
            </Button>
            <ConfirmDialog
              trigger={<Button size="sm" variant="outline">Practice</Button>}
              title="Watch in practice?"
              description={`Sentry will show clocks for leads created from now on. ${preview == null ? "Preview first to see how many already need a person." : `${preview} of those leads have no human touch yet.`} Nothing is sent.`}
              confirmLabel="Start practice"
              confirmVariant="default"
              onConfirm={async () => {
                const result = await setSentryModeAction({ mode: "practice", watchFrom, confirmed: true });
                if (!result.ok) setMessage(result.error);
              }}
            />
            <ConfirmDialog
              trigger={<Button size="sm">Go live</Button>}
              title="Let Sentry notify the team?"
              description="Only leads from the moment you confirm are watched, so older leads do not all alert at once."
              confirmLabel="Go live"
              confirmVariant="default"
              onConfirm={async () => {
                const result = await setSentryModeAction({ mode: "live", watchFrom, confirmed: true });
                if (!result.ok) setMessage(result.error);
              }}
            />
            {mode !== "off" ? (
              <ConfirmDialog
                trigger={<Button size="sm" variant="outline">Turn off</Button>}
                title="Stop Sentry for this workspace?"
                description="Clocks stay visible. New alerts stop. Turning it back on uses a fresh starting moment."
                confirmLabel="Turn Sentry off"
                onConfirm={async () => {
                  await setSentryModeAction({ mode: "off", watchFrom, confirmed: true });
                }}
              />
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
                  <Button size="sm" variant="outline" onClick={() => acknowledgeSentryAlert({ alertId: alert.id })}>Acknowledge</Button>
                  <Button size="sm" variant="outline" onClick={() => acknowledgeSentryAlert({ alertId: alert.id, snoozeMinutes: 60 })}>Snooze an hour</Button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No open alerts.</p>
        )}
        {message ? <p role="alert" className="text-sm text-destructive">{message}</p> : null}
        {preview != null ? <p className="text-sm text-muted-foreground">{preview} current leads have no human touch. They are not included unless you choose an earlier start.</p> : null}
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
