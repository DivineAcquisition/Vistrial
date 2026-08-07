"use client";

import { Loader2Icon } from "lucide-react";
import { useActionState, useState } from "react";

import {
  useRecoveryCodeAction,
  verifyMfaAction,
  type ChallengeState,
} from "@/lib/actions/auth";
import {
  btnGhost,
  btnPrimary,
  btnSizeMd,
  btnSizeSm,
  helperClass,
  inputClass,
  labelClass,
} from "@/lib/ui";

const initialState: ChallengeState = { error: null, notice: null };

export function MfaChallengeForm({ next }: { next?: string }) {
  const [mode, setMode] = useState<"authenticator" | "recovery">("authenticator");

  const [codeState, verify, verifying] = useActionState(
    verifyMfaAction,
    initialState
  );
  const [recoveryState, recover, recovering] = useActionState(
    useRecoveryCodeAction,
    initialState
  );

  const authenticator = mode === "authenticator";
  const state = authenticator ? codeState : recoveryState;
  const pending = authenticator ? verifying : recovering;

  return (
    <form
      action={authenticator ? verify : recover}
      className="mt-6 space-y-4"
      key={mode}
    >
      {next ? <input type="hidden" name="next" value={next} /> : null}

      <div>
        <label className={labelClass} htmlFor="code">
          {authenticator ? "Authenticator code" : "Recovery code"}
        </label>
        <input
          id="code"
          name="code"
          inputMode={authenticator ? "numeric" : "text"}
          autoComplete="one-time-code"
          autoFocus
          required
          className={`${inputClass} text-center font-mono tracking-[0.35em]`}
        />
        <p className={helperClass}>
          {authenticator
            ? "Open the authenticator app you paired during setup."
            : "Using a recovery code retires your current authenticator. You will pair a new one straight after."}
        </p>
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
            Checking
          </>
        ) : authenticator ? (
          "Verify and continue"
        ) : (
          "Use recovery code"
        )}
      </button>

      <div className="text-center">
        <button
          type="button"
          className={`${btnGhost} ${btnSizeSm}`}
          onClick={() => setMode(authenticator ? "recovery" : "authenticator")}
        >
          {authenticator
            ? "Lost your authenticator? Use a recovery code"
            : "Back to the authenticator code"}
        </button>
      </div>
    </form>
  );
}
