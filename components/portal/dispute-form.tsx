"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { portalDisputeAction } from "@/lib/actions/portal";
import { btnPrimary, btnSecondary, btnSizeSm, inputClass, labelClass } from "@/lib/ui";

export function PortalDisputeForm({
  appointmentId,
  disabled,
}: {
  appointmentId: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();

  if (disabled) return null;

  if (!open) {
    return (
      <button
        type="button"
        className={`${btnSecondary} ${btnSizeSm}`}
        onClick={() => setOpen(true)}
      >
        Dispute
      </button>
    );
  }

  return (
    <form
      className="space-y-3 rounded-xl border border-border bg-white/[0.02] p-4"
      onSubmit={(event) => {
        event.preventDefault();
        start(async () => {
          const result = await portalDisputeAction({
            id: appointmentId,
            reason,
          });
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          toast.success("Dispute raised. Billing is held on this appointment.");
          setOpen(false);
          setReason("");
        });
      }}
    >
      <label className={labelClass} htmlFor={`dispute-${appointmentId}`}>
        Why does this not meet the definition?
      </label>
      <textarea
        id={`dispute-${appointmentId}`}
        className={inputClass}
        rows={3}
        required
        value={reason}
        onChange={(event) => setReason(event.target.value)}
      />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className={`${btnPrimary} ${btnSizeSm}`}
        >
          {pending ? "Submitting…" : "Raise dispute"}
        </button>
        <button
          type="button"
          className={`${btnSecondary} ${btnSizeSm}`}
          onClick={() => setOpen(false)}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
