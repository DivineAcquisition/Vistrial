"use client";

import { Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { requiresNote, type RejectionReason } from "@/lib/appointments/status";
import {
  btnPrimary,
  btnSecondary,
  btnSizeSm,
  errorClass,
  helperClass,
  inputClass,
  labelClass,
  selectClass,
} from "@/lib/ui";

export type ReasonResult = { ok: true } | { ok: false; error: string };

/**
 * Every decision that changes an appointment's status is taken through this
 * dialog, because every one of them needs a reason that survives the click. The
 * text is what a client is shown months later, so it is captured once, here.
 */
export function ReasonDialog({
  trigger,
  title,
  description,
  reasonCodes,
  noteLabel,
  notePlaceholder,
  noteAlwaysRequired = false,
  submitLabel,
  successMessage,
  action,
}: {
  trigger: ReactNode;
  title: string;
  description: string;
  /** Offer a short list to classify the decision, alongside the free text. */
  reasonCodes?: RejectionReason[];
  noteLabel: string;
  notePlaceholder?: string;
  noteAlwaysRequired?: boolean;
  submitLabel: string;
  successMessage: string;
  action: (values: { reasonCode: string | null; note: string }) => Promise<ReasonResult>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reasonCode, setReasonCode] = useState(reasonCodes?.[0]?.code ?? "");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const noteRequired =
    noteAlwaysRequired || (reasonCodes !== undefined && requiresNote(reasonCode));

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setError(null);
      setNote("");
      setReasonCode(reasonCodes?.[0]?.code ?? "");
    }
  };

  const submit = async (submitEvent: React.FormEvent) => {
    submitEvent.preventDefault();
    setError(null);
    setPending(true);

    const result = await action({
      reasonCode: reasonCodes ? reasonCode : null,
      note: note.trim(),
    });

    setPending(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    toast.success(successMessage);
    setOpen(false);
    router.refresh();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="mt-2 space-y-3">
          {reasonCodes ? (
            <div>
              <label className={labelClass} htmlFor="reason-code">
                Reason
              </label>
              <select
                id="reason-code"
                className={selectClass}
                value={reasonCode}
                onChange={(changeEvent) => setReasonCode(changeEvent.target.value)}
              >
                {reasonCodes.map((reason) => (
                  <option key={reason.code} value={reason.code}>
                    {reason.label}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div>
            <label className={labelClass} htmlFor="reason-note">
              {noteLabel}
              {noteRequired ? "" : " (optional)"}
            </label>
            <textarea
              id="reason-note"
              rows={4}
              required={noteRequired}
              placeholder={notePlaceholder}
              className={inputClass}
              value={note}
              onChange={(changeEvent) => setNote(changeEvent.target.value)}
            />
            <p className={helperClass}>
              This is kept permanently and is what the client is shown if they ask.
            </p>
          </div>

          {error ? (
            <p role="alert" className={errorClass}>
              {error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className={`${btnSecondary} ${btnSizeSm}`}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className={`${btnPrimary} ${btnSizeSm}`}
            >
              {pending ? (
                <>
                  <Loader2Icon className="size-4 animate-spin" />
                  Saving
                </>
              ) : (
                submitLabel
              )}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
