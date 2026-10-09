"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { runScribeQualityAction } from "@/app/(workspace)/app/agents/actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export type QualityRunRow = {
  id: string;
  template: string;
  createdAt: string;
  passed: boolean;
  model: string | null;
  metrics: { recall?: number; noInvention?: number; grounding?: number; optOutAccuracy?: number; sensitiveAccuracy?: number };
};

const pct = (value: number | undefined) => (value == null ? "–" : `${Math.round(value * 100)}%`);

export function ScribeQuality({ templates, runs }: { templates: string[]; runs: QualityRunRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function start(template: string) {
    setBusy(template);
    const result = await runScribeQualityAction(template);
    setBusy(null);
    setMessage(result.ok ? "Started. Results appear here in a minute or two; refresh to see them." : result.error);
    if (result.ok) setTimeout(() => router.refresh(), 60_000);
  }

  return (
    <Card className="mt-6 space-y-4 p-4">
      <div>
        <h2 className="text-sm font-semibold">Scribe quality check</h2>
        <p className="text-sm text-muted-foreground">
          Reads made-up calls for each starting template and checks that facts are found, nothing is invented, quotes are word for word, and
          opt-outs and sensitive calls are caught.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {templates.map((template) => (
          <Button key={template} variant="outline" size="sm" disabled={busy != null} onClick={() => start(template)}>
            {busy === template ? "Starting…" : `Check ${template}`}
          </Button>
        ))}
      </div>
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
                <th className="py-1 pr-3 font-medium">Found</th>
                <th className="py-1 pr-3 font-medium">Not invented</th>
                <th className="py-1 pr-3 font-medium">Word for word</th>
                <th className="py-1 pr-3 font-medium">Opt-outs</th>
                <th className="py-1 pr-3 font-medium">Sensitive</th>
                <th className="py-1 pr-3 font-medium">Result</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id} className="border-t">
                  <td className="py-1 pr-3">{run.template}</td>
                  <td className="py-1 pr-3">{pct(run.metrics.recall)}</td>
                  <td className="py-1 pr-3">{pct(run.metrics.noInvention)}</td>
                  <td className="py-1 pr-3">{pct(run.metrics.grounding)}</td>
                  <td className="py-1 pr-3">{pct(run.metrics.optOutAccuracy)}</td>
                  <td className="py-1 pr-3">{pct(run.metrics.sensitiveAccuracy)}</td>
                  <td className="py-1 pr-3">{run.passed ? "Meets the bar" : "Below the bar"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </Card>
  );
}
