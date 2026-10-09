"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type ReactNode } from "react";

import { addLeadNoteAction, savePlanAction, setDoNotContactAction } from "@/app/(workspace)/app/cases/experience-actions";
import { logQueueOutcome } from "@/app/(workspace)/app/queue/actions";
import { HandoffPipeline } from "@/components/live/handoff-pipeline";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { LiveRun, WaitingItem } from "@/lib/live/model";
import type { PendingFollowUpItem } from "@/lib/follow-up/types";
import { cn } from "@/lib/utils";

const QUEUE_KEY = "vistrial:pending-touches";

type PendingTouch = {
  clientEventId: string;
  leadId: string;
  channel: "call" | "sms" | "email";
  outcome: "connected" | "no_answer" | "replied";
  note: string;
  clientLoggedAt: string;
};

export function CaseRecord({
  leadId,
  leadName,
  optedOut,
  doNotContact,
  doNotContactReason,
  mergedInto,
  paused,
  partial,
  windowMinutes,
  timezone,
  firstHumanTouchAt,
  optedInAt,
  drafts,
  pipelineRuns,
  pipelineWaiting,
  canClear,
  canWrite,
  staff,
  notes,
  timeline,
  files,
  activity,
  overview,
}: {
  leadId: string;
  leadName: string;
  optedOut: boolean;
  doNotContact: boolean;
  doNotContactReason: string | null;
  mergedInto: string | null;
  paused: boolean;
  partial: boolean;
  windowMinutes: number;
  timezone: string;
  firstHumanTouchAt: string | null;
  optedInAt: string;
  drafts: PendingFollowUpItem[];
  pipelineRuns: LiveRun[];
  pipelineWaiting: WaitingItem[];
  canClear: boolean;
  canWrite: boolean;
  staff: boolean;
  notes: Array<{ id: string; body: string; visibility: string; createdAt: string }>;
  timeline: ReactNode;
  files: ReactNode;
  activity: ReactNode;
  overview: ReactNode;
}) {
  const stopped = optedOut || doNotContact;
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="min-w-0 space-y-4">
        {paused ? (
          <p className="rounded-md border border-border bg-muted p-3 text-sm">This workspace is paused. You can read the case file. Agents are not working.</p>
        ) : null}
        {stopped ? (
          <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/8 p-3 text-sm">
            {doNotContact ? "Marked do not contact." : "This lead opted out."} No automated or drafted outreach will be produced.
            {doNotContactReason ? ` ${doNotContactReason}` : ""}
          </p>
        ) : null}
        {partial ? (
          <p className="rounded-md border border-warning/30 bg-warning/8 p-3 text-sm">Some of this case file still needs a person to look at it.</p>
        ) : null}
        {mergedInto ? (
          <p className="text-sm">
            This lead was merged. <Link className="underline" href={`/app/cases/${mergedInto}`}>Open the lead that was kept.</Link>
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {canWrite ? <LogTouch leadId={leadId} /> : null}
          {canWrite ? <NoteForm leadId={leadId} staff={staff} /> : null}
          {stopped && canClear ? (
            <ClearStop leadId={leadId} />
          ) : !stopped && canWrite ? (
            <ConfirmDialog
              trigger={<Button size="sm" variant="outline">Mark do not contact</Button>}
              title={`Stop outreach to ${leadName}?`}
              description="Pending drafts are withdrawn. Agents see this immediately. Clearing it later needs an owner and a reason."
              confirmLabel="Mark do not contact"
              onConfirm={async () => {
                await setDoNotContactAction({ leadId, on: true });
              }}
            />
          ) : null}
          {canClear ? <Button size="sm" variant="outline" render={<Link href={`/app/cases/${leadId}/print`} />}>Print</Button> : null}
        </div>
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTab value="overview">Overview</TabsTab>
            <TabsTab value="timeline">Timeline</TabsTab>
            <TabsTab value="files">Transcripts and files</TabsTab>
            <TabsTab value="activity">Activity</TabsTab>
          </TabsList>
          <TabsPanel value="overview" className="space-y-4">
            {canWrite ? <PlanActions leadId={leadId} /> : null}
            {notes.length ? (
              <Card className="space-y-2 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Notes</p>
                {notes.map((note) => (
                  <p key={note.id} className="text-sm">
                    {note.body} {note.visibility === "internal" ? <span className="text-xs text-muted-foreground">(internal)</span> : null}
                  </p>
                ))}
              </Card>
            ) : null}
            {overview}
          </TabsPanel>
          <TabsPanel value="timeline">{timeline}</TabsPanel>
          <TabsPanel value="files">{files}</TabsPanel>
          <TabsPanel value="activity">{activity}</TabsPanel>
        </Tabs>
      </div>
      <aside className="space-y-4 lg:sticky lg:top-4">
        <HandoffPipeline leadId={leadId} initialRuns={pipelineRuns} initialWaiting={pipelineWaiting} />
        <Card className="space-y-2 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Response clock</p>
          <p className="text-sm">First touch within {windowMinutes} minutes. Times use {timezone}.</p>
          <p className="text-xs text-muted-foreground">
            A call, text, or email from a person counts. {firstHumanTouchAt ? `First human touch recorded.` : `No human touch yet. Arrived ${optedInAt.slice(0, 16).replace("T", " ")}.`}
          </p>
        </Card>
        <Card className="space-y-2 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Drafts</p>
          {drafts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No drafts yet. When Relay writes a follow-up, it waits here for approval.</p>
          ) : (
            <ul className="space-y-1">
              {drafts.map((draft) => (
                <li key={draft.id}>
                  <Link className="text-sm underline underline-offset-2" href={`/app/follow-ups/${draft.id}`}>
                    {draft.channel === "sms" ? "Text" : "Email"} draft waiting
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </aside>
    </div>
  );
}

function PlanActions({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [pending, start] = useTransition();
  const run = (input: Parameters<typeof savePlanAction>[0]) =>
    start(async () => {
      const result = await savePlanAction(input);
      if (result.ok) {
        setBody("");
        router.refresh();
      }
    });
  return (
    <Card className="space-y-2 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Next action</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={pending} onClick={() => run({ leadId, status: "done" })}>Mark done</Button>
        <Button size="sm" variant="outline" disabled={pending} onClick={() => run({ leadId, status: "snoozed", snoozedUntil: new Date(Date.now() + 86_400_000).toISOString() })}>Snooze a day</Button>
      </div>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          run({ leadId, body });
        }}
      >
        <Input value={body} onChange={(event) => setBody(event.target.value)} placeholder="Replace with your own next step" aria-label="Your next step" />
        <Button type="submit" size="sm" disabled={!body.trim() || pending}>Save</Button>
      </form>
    </Card>
  );
}

function NoteForm({ leadId, staff }: { leadId: string; staff: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState<"shared" | "internal">(staff ? "internal" : "shared");
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <Button size="sm" variant="outline" onClick={() => setOpen((value) => !value)}>Add a note</Button>
      {open ? (
        <form
          className="mt-2 space-y-2"
          onSubmit={async (event) => {
            event.preventDefault();
            const result = await addLeadNoteAction({ leadId, body, visibility });
            if (!result.ok) setError(result.error);
            else {
              setBody("");
              setOpen(false);
              router.refresh();
            }
          }}
        >
          <Textarea value={body} onChange={(event) => setBody(event.target.value)} aria-label="Note" rows={3} />
          <label className="flex items-center gap-2 text-xs">
            Who can see this
            <select value={visibility} onChange={(event) => setVisibility(event.target.value as "shared" | "internal")} className="rounded-md border border-border bg-background px-2 py-1">
              <option value="shared">Shared with this workspace</option>
              {staff ? <option value="internal">Internal, Vistrial team only</option> : null}
            </select>
          </label>
          <Button type="submit" size="sm">Save note</Button>
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        </form>
      ) : null}
    </div>
  );
}

function ClearStop({ leadId }: { leadId: string }) {
  const [reason, setReason] = useState("");
  return (
    <ConfirmDialog
      trigger={<Button size="sm" variant="outline">Clear do not contact</Button>}
      title="Allow outreach again?"
      description="Say why. This is recorded."
      confirmLabel="Clear do not contact"
      confirmVariant="default"
      onConfirm={async () => {
        await setDoNotContactAction({ leadId, on: false, reason });
      }}
    >
      <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why this can be contacted again" aria-label="Reason" />
    </ConfirmDialog>
  );
}

function LogTouch({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [channel, setChannel] = useState<PendingTouch["channel"]>("call");
  const [outcome, setOutcome] = useState<PendingTouch["outcome"]>("connected");
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    const pending = readQueue().filter((item) => item.leadId === leadId);
    if (pending.length === 0) return;
    void flush(leadId).then((left) => {
      if (left === 0) router.refresh();
    });
  }, [leadId, router]);

  return (
    <div>
      <Button size="sm" onClick={() => setOpen((value) => !value)}>Log a touch</Button>
      {open ? (
        <form
          className={cn("mt-2 space-y-2 rounded-md border border-border p-3")}
          onSubmit={async (event) => {
            event.preventDefault();
            const item: PendingTouch = {
              clientEventId: crypto.randomUUID(),
              leadId,
              channel,
              outcome,
              note,
              clientLoggedAt: new Date().toISOString(),
            };
            writeQueue([...readQueue(), item]);
            setStatus("Saved on this phone. Sending…");
            const left = await flush(leadId);
            setStatus(left === 0 ? "Logged." : "Saved on this phone. It will send when the connection is back.");
            if (left === 0) {
              setNote("");
              setOpen(false);
              router.refresh();
            }
          }}
        >
          <div className="flex flex-wrap gap-2">
            <select aria-label="Channel" value={channel} onChange={(event) => setChannel(event.target.value as PendingTouch["channel"])} className="rounded-md border border-border bg-background px-2 py-1 text-sm">
              <option value="call">Call</option>
              <option value="sms">Text</option>
              <option value="email">Email</option>
            </select>
            <select aria-label="Outcome" value={outcome} onChange={(event) => setOutcome(event.target.value as PendingTouch["outcome"])} className="rounded-md border border-border bg-background px-2 py-1 text-sm">
              <option value="connected">Connected</option>
              <option value="no_answer">No answer</option>
              <option value="replied">Replied</option>
            </select>
          </div>
          <Input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Short summary" aria-label="Summary" maxLength={280} />
          <Button type="submit" size="sm">Save touch</Button>
          {status ? <p role="status" className="text-xs text-muted-foreground">{status}</p> : null}
        </form>
      ) : null}
    </div>
  );
}

function readQueue(): PendingTouch[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]") as PendingTouch[];
  } catch {
    return [];
  }
}

function writeQueue(items: PendingTouch[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
}

async function flush(leadId: string): Promise<number> {
  const pending = readQueue();
  const left: PendingTouch[] = [];
  for (const item of pending) {
    if (item.leadId !== leadId) {
      left.push(item);
      continue;
    }
    try {
      const result = await logQueueOutcome({
        leadId: item.leadId,
        channel: item.channel,
        direction: "outbound",
        outcome: item.outcome,
        note: item.note,
        clientEventId: item.clientEventId,
        clientLoggedAt: item.clientLoggedAt,
        clientSurface: "mobile",
        queuedOffline: true,
      });
      if (!result.ok) left.push(item);
    } catch {
      left.push(item);
    }
  }
  writeQueue(left);
  return left.filter((item) => item.leadId === leadId).length;
}
