"use client";

import { deferOnboarding } from "@/app/app/onboarding/actions";
import { btnSecondary, btnSizeSm } from "@/lib/ui";

export function FinishLaterButton() {
  return (
    <form action={deferOnboarding}>
      <button type="submit" className={`${btnSecondary} ${btnSizeSm}`}>
        Finish later
      </button>
    </form>
  );
}
