"use client";

import { Loader2Icon } from "lucide-react";
import { useActionState, useMemo, useState } from "react";

import {
  completePasswordResetAction,
  type ResetCompleteState,
} from "@/lib/actions/auth";
import { passwordStrength } from "@/lib/team/password";
import {
  btnPrimary,
  btnSizeMd,
  helperClass,
  inputClass,
  labelClass,
} from "@/lib/ui";

const initial: ResetCompleteState = { error: null };

export function ResetCompleteForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const strength = useMemo(() => passwordStrength(password), [password]);
  const [state, action, pending] = useActionState(
    completePasswordResetAction,
    initial
  );

  return (
    <form action={action} className="mt-6 space-y-4">
      <input type="hidden" name="token" value={token} />
      <div>
        <label className={labelClass} htmlFor="password">
          New password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={12}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
        />
        <p className={helperClass}>
          Strength: {strength.level}
          {strength.hints[0] ? ` — ${strength.hints[0]}` : ""}
        </p>
      </div>
      <div>
        <label className={labelClass} htmlFor="confirm">
          Confirm password
        </label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          required
          minLength={12}
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
            Saving
          </>
        ) : (
          "Update password"
        )}
      </button>
    </form>
  );
}
