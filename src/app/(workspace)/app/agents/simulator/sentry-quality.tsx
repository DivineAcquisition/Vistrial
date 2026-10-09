"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { runSentryQualityAction } from "@/app/(workspace)/app/agents/actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export type SentryQualityRow = {
  id: string;
  template: string;
  createdAt: string;
  passed: boolean;
  scenarios: number;
  passedCount: number;
  configHash: string | null;
  failures: Array<{ label: string; expected: string; actual: string }>;
};

export function SentryQuality({ templates, runs, canRun }: { templates: string[]; runs: SentryQualityRow[]; canRun: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function start(template: string) {
    setBusy(template);
    const result = await runSentryQualityAction(template);
    setBusy(null);
    if (!result.ok) setMessage(result.error);
    else setMessage(result.data.passed ? `${template}: every scenario passed.` : `${template}: ${result.data.failed} scenarios failed. See below.`);
    router.refresh();
  }

  return (
    <Card className="mt-6 space-y-4 p-4">
      <div>
        <h2 className="text-sm font-semibold">Sentry scenario check</h2>
        <p className="text-sm text-muted-foreground">
          Runs made-up leads through each starting template&apos;s response windows and escalation steps: on time, at risk, missed, automated
          messages, opt-outs, pauses, closures, daylight saving, follow-ups, quiet hours, and who is told. Every run is kept.
        </p>
      </div>
      {canRun ? (
        <div className="flex flex-wrap gap-2">
          {templates.map((template) => (
            <Button key={template} variant="outline" size="sm" disabled={busy != null} onClick={() => start(template)}>
              {busy === template ? "Checking…" : `Check ${template}`}
            </Button>
          ))}
        </div>
      ) : null}
      {message ? (
        <p role="status" className="text-sm text-muted-foreground">
          {message}
        </p>
      ) : null}
      {runs.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-1 pr-3 font-medium">Template</th>
                <th className="py-1 pr-3 font-medium">When</th>
                <th className="py-1 pr-3 font-medium">Passed</th>
                <th className="py-1 pr-3 font-medium">Settings</th>
                <th className="py-1 pr-3 font-medium">Result</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id} className="border-t align-top">
                  <td className="py-1 pr-3">{run.template}</td>
                  <td className="py-1 pr-3">{new Date(run.createdAt).toLocaleString()}</td>
                  <td className="py-1 pr-3">
                    {run.passedCount} of {run.scenarios}
                  </td>
                  <td className="py-1 pr-3 font-mono text-xs">{run.configHash ?? "–"}</td>
                  <td className="py-1 pr-3">
                    {run.passed ? (
                      "All passed"
                    ) : (
                      <details>
                        <summary className="cursor-pointer">{run.failures.length} failed</summary>
                        <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                          {run.failures.map((failure) => (
                            <li key={failure.label}>
                              {failure.label}: expected {failure.expected}, got {failure.actual}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No runs yet.</p>
      )}
    </Card>
  );
}
