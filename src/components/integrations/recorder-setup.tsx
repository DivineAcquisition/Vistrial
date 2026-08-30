"use client";

import { useState, useTransition } from "react";

import { setUpRecorder, testRecorder, type RecorderSetup } from "@/app/app/settings/integrations/actions";
import { Button } from "@/components/ui/button";
import { CopyField } from "@/components/ui/copy-field";
import { errorClass, helperClass } from "@/lib/ui";

/**
 * Where the address goes in each product. Written out because a person hunting
 * through a settings menu they have never opened is where this flow is lost.
 */
const WHERE_TO_PASTE: Record<string, string> = {
  fathom: "In Fathom, open Settings, then Integrations, then Webhooks, and add a new webhook.",
  fireflies: "In Fireflies, open Settings, then Developer, and add a webhook there.",
  zoom: "In the Zoom App Marketplace, open your app, then Feature, then Event Subscriptions.",
  ghl: "In your CRM, open Settings, then Integrations, then Webhooks, and add a new one.",
};

export function RecorderSetup({
  source,
  label,
  alreadySetUp,
}: {
  source: string;
  label: string;
  alreadySetUp: boolean;
}) {
  const [setup, setSetup] = useState<RecorderSetup | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="border-t border-white/[0.06] pt-4 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-medium text-white">{label}</p>
        <Button
          type="button"
          variant={alreadySetUp || setup ? "secondary" : "gradient"}
          size="sm"
          disabled={pending}
          onClick={() => {
            startTransition(async () => {
              setTestResult(null);
              setSetup(await setUpRecorder(source));
            });
          }}
        >
          {alreadySetUp || setup ? "Start over" : "Set up recording"}
        </Button>
      </div>

      {setup?.status === "error" ? <p className={`${errorClass} mt-3`}>{setup.error}</p> : null}

      {setup?.status === "ready" ? (
        <div className="mt-4 space-y-4">
          <p className={helperClass}>{WHERE_TO_PASTE[source] ?? "Add a webhook in that product."}</p>
          <CopyField label="1. Paste this as the address" value={setup.url} />
          <CopyField label="2. Paste this as the signing secret" value={setup.signingSecret} />
          <p className={helperClass}>
            Copy these now. The secret is not shown again — press Start over if you lose it.
          </p>
        </div>
      ) : null}

      {alreadySetUp || setup?.status === "ready" ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={pending}
            onClick={() => {
              startTransition(async () => {
                const result = await testRecorder(source);
                setTestResult(
                  result.status === "saved"
                    ? { ok: true, message: "Working. Recordings from this are reaching us." }
                    : { ok: false, message: result.status === "error" ? result.error : "" }
                );
              });
            }}
          >
            {pending ? "Checking" : "Check it works"}
          </Button>
          {testResult ? (
            <p className={testResult.ok ? "text-sm text-flag-good" : errorClass}>
              {testResult.message}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
