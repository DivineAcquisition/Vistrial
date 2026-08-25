"use client";

import Link from "next/link";
import { useActionState } from "react";

import { saveOnboardingStage, type OnboardingResult } from "@/app/app/onboarding/actions";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { buttonClasses, SubmitButton } from "@/components/ui/button";
import {
  errorClass,
  helperClass,
} from "@/lib/ui";

const idle: OnboardingResult = { status: "idle" };

/**
 * The one stage with no fields. Connecting is the whole job, because every
 * question we can answer from the CRM is a question the client never sees.
 */
export function ConnectStage({
  status,
  locationName,
  oauthConfigured,
  flashError,
}: {
  status: string;
  locationName: string | null;
  oauthConfigured: boolean;
  flashError: string | null;
}) {
  const [state, action, pending] = useActionState(saveOnboardingStage, idle);
  const connected = status === "active";

  return (
    <Panel className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <StatusBadge
          label={connected ? (locationName ?? "Connected") : status === "broken" ? "Needs reconnecting" : "Not connected"}
          tone={connected ? "good" : status === "broken" ? "critical" : "neutral"}
        />
      </div>

      <ul className="mt-5 list-disc space-y-1.5 pl-5 text-sm text-silver">
        <li>Your lead volume, your sources and how far your history goes are read, not asked.</li>
        <li>Your real speed to lead is measured from it, which is the number most owners have never seen.</li>
        <li>Message bodies are never pulled. Only metadata: who, when, which channel.</li>
      </ul>

      {flashError ? <p className="mt-4 text-sm text-flag-critical">{flashError}</p> : null}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        {oauthConfigured ? (
          <Link
            href="/api/ghl/oauth/start"
            prefetch={false}
            className={buttonClasses({ variant: connected ? "secondary" : "gradient" })}
          >
            {connected ? "Reconnect GoHighLevel" : "Connect GoHighLevel"}
          </Link>
        ) : (
          <p className={helperClass}>
            The GoHighLevel app is not configured on this deployment, so the connection cannot be
            started from here yet.
          </p>
        )}
        {connected ? (
          <form action={action}>
            <input type="hidden" name="stage" value="connect" />
            <SubmitButton pending={pending}>Continue — see what we found</SubmitButton>
          </form>
        ) : null}
      </div>
      {state.status === "error" ? <p className={errorClass}>{state.error}</p> : null}

      {!connected ? (
        <p className={helperClass}>
          Until this is connected the rest of onboarding runs on our starting points rather than your
          numbers, and the workspace cannot go live.
        </p>
      ) : null}
    </Panel>
  );
}
