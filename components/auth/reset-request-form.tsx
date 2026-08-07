"use client";

import { Loader2Icon } from "lucide-react";
import { useActionState } from "react";

import {
  requestPasswordResetAction,
  type ResetRequestState,
} from "@/lib/actions/auth";
import { btnPrimary, btnSizeMd, helperClass, inputClass, labelClass } from "@/lib/ui";

const initial: ResetRequestState = { message: null };

export function ResetRequestForm() {
  const [state, action, pending] = useActionState(
    requestPasswordResetAction,
    initial
  );

  return (
    <form action={action} className="mt-6 space-y-4">
      <div>
        <label className={labelClass} htmlFor="email">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          className={inputClass}
        />
      </div>
      {state.message ? (
        <p className={helperClass} role="status">
          {state.message}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className={`${btnPrimary} ${btnSizeMd} w-full`}
      >
        {pending ? (
          <>
            <Loader2Icon className="size-4 animate-spin" />
            Sending
          </>
        ) : (
          "Send reset link"
        )}
      </button>
    </form>
  );
}
