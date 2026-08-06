"use client";

import { Loader2Icon } from "lucide-react";
import { useActionState } from "react";

import {
  acceptInviteAction,
  type AcceptInviteState,
} from "@/lib/actions/portal";
import { btnPrimary, btnSizeMd, inputClass, labelClass } from "@/lib/ui";

const initial: AcceptInviteState = { error: null };

export function AcceptInviteForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(acceptInviteAction, initial);

  return (
    <form action={formAction} className="mt-6 space-y-4">
      <input type="hidden" name="token" value={token} />

      <div>
        <label className={labelClass} htmlFor="password">
          Choose a password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass} htmlFor="confirm">
          Confirm password
        </label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
          className={inputClass}
        />
      </div>

      {state.error ? (
        <p role="alert" className="text-sm text-flag-critical">
          {state.error}
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
            Creating account
          </>
        ) : (
          "Accept invitation"
        )}
      </button>
    </form>
  );
}
