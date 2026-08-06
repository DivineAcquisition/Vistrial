"use client";

import { Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { SettleDisputeDialog } from "@/components/appointments/decisions";
import {
  attentionResendNoticeAction,
  attentionSendPaymentLinkAction,
  retryFailedChargeAction,
} from "@/lib/actions/attention";
import type { AttentionAction } from "@/lib/attention/types";
import { btnPrimary, btnSecondary, btnSizeSm } from "@/lib/ui";

function usePending(): [boolean, (run: () => Promise<void>) => Promise<void>] {
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

export function AttentionActions({ actions }: { actions: AttentionAction[] }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {actions.map((action, index) => (
        <ActionButton key={`${action.kind}-${index}`} action={action} />
      ))}
    </div>
  );
}

function ActionButton({ action }: { action: AttentionAction }) {
  const router = useRouter();
  const [pending, call] = usePending();

  if (action.kind === "link") {
    return (
      <a href={action.href} className={`${btnSecondary} ${btnSizeSm}`}>
        {action.label}
      </a>
    );
  }

  if (action.kind === "uphold_dispute") {
    return (
      <SettleDisputeDialog
        id={action.appointmentId}
        outcome="upheld"
        trigger={
          <button type="button" className={`${btnSecondary} ${btnSizeSm}`}>
            Uphold
          </button>
        }
      />
    );
  }

  if (action.kind === "resolve_dispute") {
    return (
      <SettleDisputeDialog
        id={action.appointmentId}
        outcome="resolved"
        trigger={
          <button type="button" className={`${btnPrimary} ${btnSizeSm}`}>
            Resolve
          </button>
        }
      />
    );
  }

  if (action.kind === "retry_payment") {
    return (
      <button
        type="button"
        disabled={pending}
        className={`${btnPrimary} ${btnSizeSm}`}
        onClick={() =>
          call(async () => {
            const result = await retryFailedChargeAction({
              charge_id: action.chargeId,
            });
            if (result.ok) toast.success("Payment collected.");
            else toast.error(result.error);
            router.refresh();
          })
        }
      >
        {pending ? <Loader2Icon className="size-4 animate-spin" /> : null}
        Retry now
      </button>
    );
  }

  if (action.kind === "resend_notice") {
    return (
      <button
        type="button"
        disabled={pending}
        className={`${btnPrimary} ${btnSizeSm}`}
        onClick={() =>
          call(async () => {
            const result = await attentionResendNoticeAction({
              charge_id: action.chargeId,
            });
            if (result.ok) toast.success("Notification sent.");
            else toast.error(result.error);
            router.refresh();
          })
        }
      >
        {pending ? <Loader2Icon className="size-4 animate-spin" /> : null}
        Resend notification
      </button>
    );
  }

  if (action.kind === "send_payment_link") {
    return (
      <button
        type="button"
        disabled={pending}
        className={`${btnPrimary} ${btnSizeSm}`}
        onClick={() =>
          call(async () => {
            const result = await attentionSendPaymentLinkAction({
              client_id: action.clientId,
            });
            if (result.ok) {
              toast.success("Payment method link ready.");
              await navigator.clipboard.writeText(result.data.url).catch(() => {
                // Clipboard may be denied; the toast still confirms creation.
              });
            } else {
              toast.error(result.error);
            }
            router.refresh();
          })
        }
      >
        {pending ? <Loader2Icon className="size-4 animate-spin" /> : null}
        Send payment link
      </button>
    );
  }

  return null;
}
