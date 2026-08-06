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
import {
  createCreditAction,
  createPaymentLinkAction,
  refreshPaymentMethodAction,
  resendChargeNoticeAction,
  runCycleJobAction,
} from "@/lib/actions/billing";
import {
  btnPrimary,
  btnSecondary,
  btnSizeSm,
  errorClass,
  helperClass,
  inputClass,
  labelClass,
} from "@/lib/ui";

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

export function ResendNoticeButton({ chargeId }: { chargeId: string }) {
  const router = useRouter();
  const [pending, call] = usePending();

  return (
    <button
      type="button"
      disabled={pending}
      className={`${btnSecondary} ${btnSizeSm}`}
      onClick={() =>
        call(async () => {
          const result = await resendChargeNoticeAction({ charge_id: chargeId });

          if (result.ok) {
            toast.success("Delivered. The twenty-four hours start now.");
          } else {
            toast.error(result.error);
          }

          router.refresh();
        })
      }
    >
      {pending ? <Loader2Icon className="size-4 animate-spin" /> : null}
      Send it again
    </button>
  );
}

/**
 * The job is safe to run at any time and as often as wanted, which is what
 * makes a button for it reasonable rather than dangerous.
 */
export function RunCycleJobButton() {
  const router = useRouter();
  const [pending, call] = usePending();

  return (
    <button
      type="button"
      disabled={pending}
      className={`${btnSecondary} ${btnSizeSm}`}
      onClick={() =>
        call(async () => {
          const result = await runCycleJobAction();

          if (!result.ok) {
            toast.error(result.error);
          } else {
            const { assembled, notified, processed, failed, skipped } = result.data;
            toast.success(
              `Assembled ${assembled}, notified ${notified}, processed ${processed}, failed ${failed}, skipped ${skipped}.`
            );
          }

          router.refresh();
        })
      }
    >
      {pending ? <Loader2Icon className="size-4 animate-spin" /> : null}
      Run the cycle job
    </button>
  );
}

/**
 * Issues the hosted link a client uses to add a card. Nothing sensitive comes
 * back through Vistrial, so the link is the whole of the integration.
 */
export function PaymentLinkButton({
  clientId,
  label = "Send a secure link",
}: {
  clientId: string;
  label?: string;
}) {
  const router = useRouter();
  const [pending, call] = usePending();
  const [link, setLink] = useState<string | null>(null);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={pending}
        className={`${btnPrimary} ${btnSizeSm}`}
        onClick={() =>
          call(async () => {
            const result = await createPaymentLinkAction({ client_id: clientId });

            if (!result.ok) {
              toast.error(result.error);
              return;
            }

            setLink(result.data.url);
            await navigator.clipboard.writeText(result.data.url).catch(() => {});
            toast.success("Link copied. Send it to the client; it opens Stripe's own page.");
            router.refresh();
          })
        }
      >
        {pending ? <Loader2Icon className="size-4 animate-spin" /> : null}
        {label}
      </button>

      {link ? (
        <a
          href={link}
          target="_blank"
          rel="noreferrer"
          className="max-w-sm truncate font-mono text-xs text-brand-300 underline"
        >
          {link}
        </a>
      ) : null}
    </div>
  );
}

export function RefreshPaymentMethodButton({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [pending, call] = usePending();

  return (
    <button
      type="button"
      disabled={pending}
      className={`${btnSecondary} ${btnSizeSm}`}
      onClick={() =>
        call(async () => {
          const result = await refreshPaymentMethodAction({ client_id: clientId });

          if (result.ok) {
            toast.success("Payment method read back from Stripe.");
          } else {
            toast.error(result.error);
          }

          router.refresh();
        })
      }
    >
      {pending ? <Loader2Icon className="size-4 animate-spin" /> : null}
      Check the link again
    </button>
  );
}

/**
 * A processed charge never changes, so this is the only way money goes back.
 * The reason is required because a credit without one reads as an error.
 */
export function CreditDialog({
  clientId,
  trigger,
}: {
  clientId: string;
  trigger: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, call] = usePending();

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setError(null);
      setAmount("");
      setReason("");
    }
  };

  const submit = (submitEvent: React.FormEvent) => {
    submitEvent.preventDefault();
    setError(null);

    return call(async () => {
      const result = await createCreditAction({
        client_id: clientId,
        amount,
        reason,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      toast.success("Credit recorded. It comes off their next charge.");
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Credit this client</DialogTitle>
          <DialogDescription>
            A charge that has been processed never changes. A correction is a
            credit, applied against their next charge and visible to both sides.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="mt-2 space-y-3">
          <div>
            <label className={labelClass} htmlFor="credit-amount">
              Amount
            </label>
            <input
              id="credit-amount"
              type="number"
              min="0.01"
              step="0.01"
              required
              className={inputClass}
              value={amount}
              onChange={(changeEvent) => setAmount(changeEvent.target.value)}
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="credit-reason">
              Reason
            </label>
            <textarea
              id="credit-reason"
              rows={4}
              required
              placeholder="Two appointments on the 12 March charge were the same homeowner."
              className={inputClass}
              value={reason}
              onChange={(changeEvent) => setReason(changeEvent.target.value)}
            />
            <p className={helperClass}>
              This appears on the client&rsquo;s billing view as well as ours.
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
                "Record the credit"
              )}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
