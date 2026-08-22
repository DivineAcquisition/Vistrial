"use client";

import { useActionState } from "react";

import { generateLeakReport, type OnboardingResult } from "@/app/app/onboarding/actions";
import { SubmitButton } from "@/components/ui/button";
import { errorClass } from "@/lib/ui";

const idle: OnboardingResult = { status: "idle" };

export function RegenerateLeakReport({ label }: { label: string }) {
  const [state, action, pending] = useActionState(async () => generateLeakReport(), idle);

  return (
    <form action={action}>
      <SubmitButton variant="gradient" pending={pending} loadingLabel="Working">
        {label}
      </SubmitButton>
      {state.status === "error" ? <p className={errorClass}>{state.error}</p> : null}
    </form>
  );
}
