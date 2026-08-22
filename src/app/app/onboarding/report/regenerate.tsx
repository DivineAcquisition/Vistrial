"use client";

import { useActionState } from "react";

import { generateLeakReport, type OnboardingResult } from "@/app/app/onboarding/actions";
import { btnPrimary, btnSizeMd, errorClass } from "@/lib/ui";

const idle: OnboardingResult = { status: "idle" };

export function RegenerateLeakReport({ label }: { label: string }) {
  const [state, action, pending] = useActionState(async () => generateLeakReport(), idle);

  return (
    <form action={action}>
      <button type="submit" className={`${btnPrimary} ${btnSizeMd}`} disabled={pending}>
        {pending ? "Working…" : label}
      </button>
      {state.status === "error" ? <p className={errorClass}>{state.error}</p> : null}
    </form>
  );
}
