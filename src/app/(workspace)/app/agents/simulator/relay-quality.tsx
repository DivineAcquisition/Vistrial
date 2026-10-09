"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { runRelayQualityAction } from "@/app/(workspace)/app/agents/relay-actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { RelayQualityRow } from "@/lib/relay/quality-rows";

export function RelayQuality({ templates, runs }: { templates: string[]; runs: RelayQualityRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function start(template: string, withModel: boolean) {
    setBusy(`${template}:${withModel}`);
    const result = await runRelayQualityAction(template, withModel);
    setBusy(null);
    if (!result.ok) setMessage(result.error);
    else setMessage(result.data.passed ? `${template}: every check passed.` : `${template}: ${result.data.failed} checks failed. See below.`);
    router.refresh();
  }

  return (
    <Card className="mt-6 space-y-4 p-4">
      <div>
        <h2 className="text-sm font-semibold">Relay quality check</h2>
        <p className="text-sm text-muted-foreground">
          Runs a made-up lead through Relay&apos;s checks with each starting template&apos;s voice and compliance settings: invented prices,
          links, opt-out text, placeholders, instructions hidden in the case file, and money in texts. With drafting, it also writes real
          drafts and checks them. Nothing is sent. Every run is kept.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {templates.map((template) => (
          <span key={template} className="flex gap-1">
            <Button variant="outline" size="sm" disabled={busy != null} onClick={() => start(template, false)}>
              {busy === `${template}:false` ? "Checking…" : `Check ${template}`}
            </Button>
            <Button variant="ghost" size="sm" disabled={busy != null} onClick={() => start(template, true)}>
              {busy === `${template}:true` ? "Drafting…" : "With drafting"}
            </Button>
          </span>
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
                <th className="py-1 pr-3 font-medium">When</th>
                <th className="py-1 pr-3 font-medium">Kind</th>
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
                  <td className="py-1 pr-3">{run.mode === "with_model" ? "With drafting" : "Checks only"}</td>
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
                              {failure.label}: {failure.detail}
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
