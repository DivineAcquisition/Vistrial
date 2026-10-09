"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { retryRelayJobAction, setMessagingReadinessAction } from "@/app/(workspace)/app/agents/relay-actions";
import { AgentRequestCard } from "@/components/live/request-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { RelaySectionData } from "@/lib/relay/page";

const READINESS = [
  { item: "sender_number", label: "Sender number is set up in the CRM", key: "senderNumberAt" },
  { item: "sending_domain", label: "Sending domain is set up in the CRM", key: "sendingDomainAt" },
] as const;

export function RelayPanel({ data, isStaff }: { data: RelaySectionData; isStaff: boolean }) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const open = data.open;
  const current = open[Math.min(index, Math.max(open.length - 1, 0))] ?? null;

  function confirm(item: "sender_number" | "sending_domain", on: boolean) {
    start(async () => {
      const result = await setMessagingReadinessAction(item, on);
      setMessage(result.ok ? null : result.error);
      router.refresh();
    });
  }

  function retry(jobId: string) {
    start(async () => {
      const result = await retryRelayJobAction(jobId);
      setMessage(result.ok ? "Put back in line. Relay picks it up within a minute." : result.error);
      router.refresh();
    });
  }

  return (
    <div className="mt-6 space-y-4">
      <Card className="space-y-2 p-4">
        <h2 className="text-sm font-semibold">How messages go out</h2>
        <p className="text-sm text-muted-foreground">
          {data.sendingOn
            ? "Relay drafts. A person approves each one and sends it from the CRM."
            : "Vistrial does not send messages to leads. Relay drafts, a person approves, and that person sends it from your CRM and marks it sent here."}
        </p>
        <ul className="space-y-1 text-sm">
          {READINESS.map((row) => {
            const at = data.readiness[row.key];
            return (
              <li key={row.item} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {row.label}:{" "}
                  <span className={at ? "text-card-foreground" : "text-muted-foreground"}>
                    {at ? `confirmed ${new Date(at).toLocaleDateString()}` : "not confirmed yet"}
                  </span>
                </span>
                {isStaff ? (
                  <Button size="sm" variant="outline" disabled={pending} onClick={() => confirm(row.item, !at)}>
                    {at ? "Clear" : "Confirm"}
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
        {!isStaff ? <p className="text-xs text-muted-foreground">The Vistrial team confirms these with you.</p> : null}
      </Card>

      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">Review drafts</h2>
            <p className="text-sm text-muted-foreground">One at a time, oldest first. Each one is decided on its own.</p>
          </div>
          {open.length ? (
            <div className="flex items-center gap-2 text-sm">
              <Button size="sm" variant="outline" disabled={index === 0} onClick={() => setIndex((value) => Math.max(0, value - 1))}>
                Previous
              </Button>
              <span>
                {Math.min(index, open.length - 1) + 1} of {open.length}
              </span>
              <Button size="sm" variant="outline" disabled={index >= open.length - 1} onClick={() => setIndex((value) => Math.min(open.length - 1, value + 1))}>
                Next
              </Button>
            </div>
          ) : null}
        </div>
        {current ? <AgentRequestCard key={current.id} item={current} /> : <p className="text-sm text-muted-foreground">Nothing is waiting.</p>}
      </Card>

      <Card className="space-y-2 p-4">
        <h2 className="text-sm font-semibold">Last 30 days</h2>
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          <Stat label="Drafted" value={data.usage.drafted} />
          <Stat label="Sent from the CRM" value={data.usage.sent} />
          <Stat label="Approved as written" value={data.usage.approvedAsIs} />
          <Stat label="Edited before approving" value={data.usage.edited} />
          <Stat label="Rejected" value={data.usage.rejected} />
          <Stat label="Expired or withdrawn" value={data.usage.closed} />
        </dl>
        <p className="text-xs text-muted-foreground">
          Edits and rejections teach Relay this workspace&apos;s voice. They are never used for any other workspace. Relay writes at most{" "}
          {data.usage.dailyLimit} drafts a day here.
        </p>
      </Card>

      {data.health ? (
        <Card className="space-y-3 p-4">
          <div>
            <h2 className="text-sm font-semibold">Relay health (Vistrial team)</h2>
            <p className="text-sm text-muted-foreground">
              Last pass: {data.health.lastPassAt ? new Date(data.health.lastPassAt).toLocaleString() : "never"}. {data.health.pending} in line. Estimated
              model cost in the last 30 days: ${(data.usage.costMicros / 1_000_000).toFixed(2)}.
            </p>
          </div>
          <div>
            <h3 className="text-sm font-medium">Could not draft</h3>
            {data.health.dead.length ? (
              <ul className="mt-1 space-y-1 text-sm">
                {data.health.dead.map((job) => (
                  <li key={job.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      <Link className="underline" href={`/app/cases/${job.leadId}`}>
                        Case file
                      </Link>{" "}
                      · {job.trigger === "missed_window" ? "missed window" : "after a call"} · {job.error ?? "unknown"} ·{" "}
                      {new Date(job.at).toLocaleString()}
                    </span>
                    <Button size="sm" variant="outline" disabled={pending} onClick={() => retry(job.id)}>
                      Retry
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">None.</p>
            )}
          </div>
          <div>
            <h3 className="text-sm font-medium">Recently skipped</h3>
            {data.health.skipped.length ? (
              <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
                {data.health.skipped.map((job) => (
                  <li key={job.id}>
                    {job.result ?? "Skipped."} · {new Date(job.at).toLocaleString()}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">None.</p>
            )}
          </div>
        </Card>
      ) : null}
      {message ? (
        <p role="status" className="text-sm text-muted-foreground">
          {message}
        </p>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
