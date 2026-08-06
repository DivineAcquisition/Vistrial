"use client";

import { Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { ReasonDialog } from "@/components/appointments/reason-dialog";
import {
  confirmAppointmentsAction,
  raiseDisputeAction,
  recordShowAction,
  rejectAppointmentAction,
  resendConfirmationAction,
  settleDisputeAction,
} from "@/lib/actions/appointments";
import { REJECTION_REASONS } from "@/lib/appointments/status";
import { btnPrimary, btnSecondary, btnSizeSm } from "@/lib/ui";

export function RejectDialog({ id, trigger }: { id: string; trigger: ReactNode }) {
  return (
    <ReasonDialog
      trigger={trigger}
      title="Reject this appointment"
      description="A rejection stays visible to the client, which is worth more than a deletion they cannot see. It can never be billed."
      reasonCodes={REJECTION_REASONS}
      noteLabel="Detail"
      notePlaceholder="The address is 40 miles outside the service area in version 2."
      submitLabel="Reject"
      successMessage="Rejected. The reason is on the record."
      action={({ reasonCode, note }) =>
        rejectAppointmentAction({ id, reason_code: reasonCode, note })
      }
    />
  );
}

/**
 * Clients do not have a login yet, so an admin records the dispute they raised.
 * The history attributes it to the client and names the admin who recorded it.
 */
export function DisputeDialog({ id, trigger }: { id: string; trigger: ReactNode }) {
  return (
    <ReasonDialog
      trigger={trigger}
      title="Record a dispute"
      description="Raising a dispute holds billing immediately. The appointment leaves the pending charge rather than accruing toward it while under discussion."
      reasonCodes={REJECTION_REASONS}
      noteLabel="The client's reason"
      notePlaceholder="Word for word, as the client gave it."
      noteAlwaysRequired
      submitLabel="Hold billing"
      successMessage="Dispute recorded. Billing is held."
      action={({ reasonCode, note }) =>
        raiseDisputeAction({ id, reason_code: reasonCode, reason: note })
      }
    />
  );
}

export function SettleDisputeDialog({
  id,
  outcome,
  trigger,
}: {
  id: string;
  outcome: "upheld" | "resolved";
  trigger: ReactNode;
}) {
  const upheld = outcome === "upheld";

  return (
    <ReasonDialog
      trigger={trigger}
      title={upheld ? "Uphold the dispute" : "Resolve in Divine Acquisition's favour"}
      description={
        upheld
          ? "The appointment moves to rejected and is never billable."
          : "The appointment returns to confirmed with a fresh review window of the client's configured length."
      }
      noteLabel="Reasoning"
      notePlaceholder={
        upheld
          ? "The lead history shows no human contact within the promised window."
          : "The touch history shows a call 4 minutes after arrival, inside the version 1 criteria."
      }
      noteAlwaysRequired
      submitLabel={upheld ? "Uphold and reject" : "Resolve and reopen the window"}
      successMessage={
        upheld ? "Dispute upheld. The appointment is rejected." : "Dispute resolved."
      }
      action={({ note }) => settleDisputeAction({ id, outcome, reason: note })}
    />
  );
}

function useAction(): [boolean, (run: () => Promise<void>) => Promise<void>] {
  const [pending, setPending] = useState(false);

  const call = async (run: () => Promise<void>) => {
    setPending(true);
    try {
      await run();
    } finally {
      setPending(false);
    }
  };

  return [pending, call];
}

export function ConfirmButton({
  ids,
  label = "Confirm",
  variant = "primary",
}: {
  ids: string[];
  label?: string;
  variant?: "primary" | "secondary";
}) {
  const router = useRouter();
  const [pending, call] = useAction();

  const confirm = () =>
    call(async () => {
      const result = await confirmAppointmentsAction({ ids });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      const { confirmed, skipped } = result.data;
      toast.success(
        confirmed === 1
          ? "Confirmed. The review window is open and the client has been notified."
          : `${confirmed} confirmed. Review windows are open and the clients have been notified.`
      );
      for (const note of new Set(skipped)) toast.warning(note);

      router.refresh();
    });

  return (
    <button
      type="button"
      onClick={confirm}
      disabled={pending || ids.length === 0}
      className={`${variant === "primary" ? btnPrimary : btnSecondary} ${btnSizeSm}`}
    >
      {pending ? <Loader2Icon className="size-4 animate-spin" /> : null}
      {label}
    </button>
  );
}

export function ShowButton({
  id,
  showed,
  label,
}: {
  id: string;
  showed: boolean;
  label: string;
}) {
  const router = useRouter();
  const [pending, call] = useAction();

  const record = () =>
    call(async () => {
      const result = await recordShowAction({ id, showed });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      toast.success(
        result.data.rejected
          ? "Recorded as a no-show. The appointment is rejected and is never billable."
          : "Outcome recorded."
      );
      router.refresh();
    });

  return (
    <button
      type="button"
      onClick={record}
      disabled={pending}
      className={`${btnSecondary} ${btnSizeSm}`}
    >
      {pending ? <Loader2Icon className="size-4 animate-spin" /> : null}
      {label}
    </button>
  );
}

export function ResendNotificationButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, call] = useAction();

  const send = () =>
    call(async () => {
      const result = await resendConfirmationAction({ id });

      if (!result.ok) {
        toast.error(result.error);
      } else {
        toast.success("Notification delivered.");
      }

      router.refresh();
    });

  return (
    <button
      type="button"
      onClick={send}
      disabled={pending}
      className={`${btnSecondary} ${btnSizeSm}`}
    >
      {pending ? <Loader2Icon className="size-4 animate-spin" /> : null}
      Send it again
    </button>
  );
}
