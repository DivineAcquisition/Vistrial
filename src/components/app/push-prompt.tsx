"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { PushEnable } from "@/components/app/push-enable";
import { Notice } from "@/components/ui/states";
import { helperClass } from "@/lib/ui";

const ELIGIBLE_KEY = "vistrial:push-prompt-eligible";
const DISMISSED_KEY = "vistrial:push-prompt-dismissed";

/**
 * Permission is requested after the operator has seen why it matters, never on
 * first load. Eligibility is set after they log an outcome or open a brief.
 */
export function markPushPromptEligible(): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ELIGIBLE_KEY, "1");
}

export function PushPrompt() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!("Notification" in window) || Notification.permission !== "default") return;
    if (window.localStorage.getItem(DISMISSED_KEY) === "1") return;
    if (window.localStorage.getItem(ELIGIBLE_KEY) !== "1") return;
    setShow(true);
  }, []);

  if (!show) return null;

  return (
    <div className="mb-4 print:hidden">
      <Notice
        tone="info"
        title="Alerts on this phone"
        action={
          <button
            type="button"
            className="text-xs text-silver underline-offset-2 hover:underline"
            onClick={() => {
              window.localStorage.setItem(DISMISSED_KEY, "1");
              setShow(false);
            }}
          >
            Not now
          </button>
        }
      >
        <p className={helperClass}>
          A call starting soon can open the brief on this screen. Speed-to-lead breaches open the
          queue already filtered. If you decline, the app still works. You can enable this later in
          Settings.
        </p>
        <div className="mt-3">
          <PushEnable />
        </div>
        <p className="mt-2 text-xs text-dim">
          <Link href="/app/settings/notifications" className="underline-offset-2 hover:underline">
            Open notification settings
          </Link>
        </p>
      </Notice>
    </div>
  );
}
