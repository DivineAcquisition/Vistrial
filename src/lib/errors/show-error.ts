"use client";

import { toastManager } from "@/components/ui/toast";
import { describeError, type ShownError } from "@/lib/errors/user-error";

/** Set once by <ErrorNavigator /> so a pop-up's button can move within the app without a full reload. */
let navigate: ((href: string) => void) | null = null;
export function setErrorNavigator(next: ((href: string) => void) | null) {
  navigate = next;
}

const TITLES: Record<ShownError["code"], string> = {
  out_of_credits: "Out of credits",
  not_allowed: "Not allowed",
  not_found: "Not found",
  limit: "Over a limit",
  invalid: "Check this",
  unexpected: "Something went wrong",
};

/**
 * Shows a failure as a pop-up and returns its words, so a screen can also keep them beside the control.
 * Out of credits offers the way to Billing.
 */
export function showError(problem: unknown, fallback = "That did not work. Try again in a moment."): string {
  const shown = describeError(problem, fallback);
  toastManager.add({
    type: "error",
    title: TITLES[shown.code],
    description: shown.message,
    timeout: shown.code === "out_of_credits" ? 0 : 6000,
    ...(shown.code === "out_of_credits"
      ? { actionProps: { children: "Add credits", onClick: () => navigate?.("/app/billing") } }
      : {}),
  });
  return shown.message;
}
