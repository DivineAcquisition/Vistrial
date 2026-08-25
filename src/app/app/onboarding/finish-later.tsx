"use client";

import { deferOnboarding } from "@/app/app/onboarding/actions";
import { btnGhost, btnSizeSm } from "@/lib/ui";

export function FinishLaterButton() {
  return (
    <form action={deferOnboarding}>
      <button type="submit" className={`${btnGhost} ${btnSizeSm}`}>
        Finish later
      </button>
    </form>
  );
}
