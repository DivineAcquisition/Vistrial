"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Clock3, Lock } from "lucide-react";

import {
  approveQueueItem,
  dismissQueueItem,
  retryQueueItem,
  saveQueueItemDrafts,
  type QueueActionResult,
} from "@/app/(workspace)/app/home/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toastManager } from "@/components/ui/toast";
import type { QueueDraft } from "@/lib/home/queue";
import type { QueueItemView } from "@/lib/home/views";
import { errorClass } from "@/lib/ui";

function report(result: QueueActionResult, fallback: string) {
  if (result.ok) {
    toastManager.add({ title: result.message ?? fallback, type: "success" });
  } else {
    toastManager.add({ title: "Not done", description: result.error, type: "error" });
  }
}

const CHANNEL_LABEL: Record<QueueDraft["channel"], string> = {
  sms: "Text",
  email: "Email",
  task: "Task",
};

function EditDialog({
  item,
  open,
  onOpenChange,
}: {
  item: QueueItemView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const editable = item.drafts.filter(
    (draft) => draft.result?.status !== "sent" && draft.result?.status !== "scheduled" && draft.result?.status !== "skipped"
  );
  const [drafts, setDrafts] = useState(() =>
    editable.map((draft) => ({ leadId: draft.leadId, body: draft.body, subject: draft.subject }))
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const update = (leadId: string, patch: Partial<{ body: string; subject: string | null }>) =>
    setDrafts((current) => current.map((draft) => (draft.leadId === leadId ? { ...draft, ...patch } : draft)));

  const submit = (approve: boolean) =>
    startTransition(async () => {
      setError(null);
      const result = await saveQueueItemDrafts({ itemId: item.id, drafts, approve });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      report(result, approve ? "Approved" : "Saved");
      onOpenChange(false);
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{item.title}</DialogTitle>
          <DialogDescription>
            Change anything before it goes out. Nothing sends until you approve.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="space-y-5">
          {editable.map((draft) => {
            const value = drafts.find((entry) => entry.leadId === draft.leadId);
            return (
              <div key={draft.leadId} className="space-y-2">
                <p className="flex items-center gap-2 text-sm font-medium text-card-foreground">
                  {draft.leadName}
                  <Badge variant="outline" size="sm">
                    {CHANNEL_LABEL[draft.channel]}
                  </Badge>
                </p>
                {draft.channel === "email" ? (
                  <Input
                    aria-label={`Subject for ${draft.leadName}`}
                    value={value?.subject ?? ""}
                    onChange={(event) => update(draft.leadId, { subject: event.target.value })}
                    placeholder="Subject"
                  />
                ) : null}
                <Textarea
                  aria-label={`${draft.channel === "task" ? "Task" : "Message"} for ${draft.leadName}`}
                  value={value?.body ?? ""}
                  onChange={(event) => update(draft.leadId, { body: event.target.value })}
                  rows={draft.channel === "email" ? 6 : 3}
                />
              </div>
            );
          })}
          {error ? <p className={errorClass}>{error}</p> : null}
        </DialogPanel>
        <DialogFooter>
          <DialogClose render={<Button variant="ghost" disabled={pending} />}>Cancel</DialogClose>
          <Button variant="secondary" disabled={pending} onClick={() => submit(false)}>
            Save
          </Button>
          <Button variant="primary" loading={pending} loadingLabel="Approving" onClick={() => submit(true)}>
            Save and approve
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

function DismissDialog({
  item,
  open,
  onOpenChange,
}: {
  item: QueueItemView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Dismiss this?</DialogTitle>
          <DialogDescription>Nothing is sent. A reason helps Vistrial learn which drafts are not useful.</DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <Textarea
            aria-label="Reason (optional)"
            placeholder="Optional, e.g. already spoke to them"
            value={reason}
            maxLength={500}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
          />
        </DialogPanel>
        <DialogFooter>
          <DialogClose render={<Button variant="ghost" disabled={pending} />}>Cancel</DialogClose>
          <Button
            variant="secondary"
            loading={pending}
            loadingLabel="Dismissing"
            onClick={() =>
              startTransition(async () => {
                const result = await dismissQueueItem({ itemId: item.id, reason });
                report(result, "Dismissed");
                if (result.ok) onOpenChange(false);
              })
            }
          >
            Dismiss
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

function QueueItem({ item }: { item: QueueItemView }) {
  const [editing, setEditing] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [pending, startTransition] = useTransition();
  const failed = item.status === "failed";
  const running = item.status === "running";

  const approve = () =>
    startTransition(async () => {
      const result = failed ? await retryQueueItem(item.id) : await approveQueueItem(item.id);
      report(result, "Approved");
    });

  return (
    <li>
      <Card className="gap-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" size="sm">
            {item.kindLabel}
          </Badge>
          {item.escalatedAt ? (
            <Badge variant="outline" size="sm" className="text-warning">
              <Clock3 aria-hidden /> Waited too long
            </Badge>
          ) : null}
          {failed ? (
            <Badge variant="outline" size="sm" className="text-destructive">
              <AlertTriangle aria-hidden /> Failed
            </Badge>
          ) : null}
          {running ? (
            <Badge variant="outline" size="sm">
              Running
            </Badge>
          ) : null}
          {item.assignedName ? <span className="text-xs text-muted-foreground">For {item.assignedName}</span> : null}
        </div>
        <div className="min-w-0">
          <h3 className="text-[15px] font-medium text-card-foreground">{item.title}</h3>
          {item.preview ? <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.preview}</p> : null}
          {item.reason ? <p className="mt-1 text-xs text-muted-foreground">{item.reason}</p> : null}
          {failed && item.failureReason ? (
            <p className="mt-2 text-sm text-destructive" role="status">
              {item.failureReason}
            </p>
          ) : null}
        </div>
        {item.canApprove && !running ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" size="sm" loading={pending} loadingLabel="Working" onClick={approve}>
              {failed ? "Retry" : "Approve"}
            </Button>
            <Button variant="secondary" size="sm" disabled={pending} onClick={() => setEditing(true)}>
              Edit
            </Button>
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => setDismissing(true)}>
              Dismiss
            </Button>
          </div>
        ) : !running ? (
          <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Lock className="size-3.5 shrink-0" aria-hidden />
            {item.whoCanApprove}
          </p>
        ) : null}
      </Card>
      {editing ? <EditDialog item={item} open={editing} onOpenChange={setEditing} /> : null}
      {dismissing ? <DismissDialog item={item} open={dismissing} onOpenChange={setDismissing} /> : null}
    </li>
  );
}

export function ApprovalQueueList({ items }: { items: QueueItemView[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => (
        <QueueItem key={item.id} item={item} />
      ))}
    </ul>
  );
}
