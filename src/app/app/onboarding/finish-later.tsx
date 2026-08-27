"use client";

import { deferOnboarding } from "@/app/app/onboarding/actions";
import { Button } from "@/components/ui/button";

export function FinishLaterButton() {
  return (
    <form action={deferOnboarding}>
      <Button type="submit" variant="secondary" size="sm">
        Finish later
      </Button>
    </form>
  );
}
