"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { reprocessCallsAction } from "@/app/(workspace)/app/cases/scribe-actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Owners and staff: have Scribe read recent calls again with the current settings. */
export function ScribeReprocess() {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [days, setDays] = useState(30);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  async function run() {
    const result = await reprocessCallsAction({ days, reason, confirmed: true });
    if (!result.ok) {
      setMessage({ tone: "error", text: result.error });
      return;
    }
    setMessage({ tone: "ok", text: `Scribe will read ${result.data.queued} call${result.data.queued === 1 ? "" : "s"} again. You can watch it here.` });
    setReason("");
    router.refresh();
  }

  return (
    <Card className="mt-6 space-y-3 p-4">
      <div>
        <h2 className="text-sm font-semibold">Read calls again</h2>
        <p className="text-sm text-muted-foreground">
          After you change case-file facts or score bands, Scribe can re-read recent calls. Up to 25 calls at a time, a few times a day.
          Fields a person edited or locked stay as they are.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
        <div className="space-y-1">
          <Label htmlFor="scribe-reprocess-reason">Why</Label>
          <Input
            id="scribe-reprocess-reason"
            value={reason}
            maxLength={500}
            placeholder="We added a new case-file fact"
            onChange={(event) => setReason(event.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="scribe-reprocess-days">Last how many days</Label>
          <Input
            id="scribe-reprocess-days"
            type="number"
            min={1}
            max={90}
            value={days}
            onChange={(event) => setDays(Number(event.target.value) || 30)}
          />
        </div>
      </div>
      <ConfirmDialog
        trigger={
          <Button variant="outline" disabled={reason.trim().length < 3}>
            Read calls again
          </Button>
        }
        title="Read recent calls again?"
        description={`Scribe will re-read up to 25 calls from the last ${days} days with the current settings and update each case file. Nothing is sent to any lead.`}
        confirmLabel="Read calls again"
        confirmVariant="default"
        onConfirm={run}
      />
      {message ? (
        <p role={message.tone === "error" ? "alert" : "status"} className={message.tone === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
          {message.text}
        </p>
      ) : null}
    </Card>
  );
}
