"use client";

import { useState, useTransition } from "react";

import { acknowledgeCallCoaching } from "@/app/app/coaching/actions";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/states";
import { COACHING_DISCLOSURE } from "@/lib/coaching/constants";
import { errorClass, helperClass } from "@/lib/ui";

export function CoachingDisclosureNotice({ needed }: { needed: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!needed) return null;

  return (
    <div className="mb-4 print:hidden">
      <Notice tone="info" title="Your calls are transcribed">
        <p className={helperClass}>{COACHING_DISCLOSURE}</p>
        {error ? <p className={errorClass}>{error}</p> : null}
        <Button
          type="button"
          variant="primary"
          size="xl"
          className="mt-3 inline-flex"
          disabled={pending}
          onClick={() => {
            start(async () => {
              const result = await acknowledgeCallCoaching();
              if (!result.ok) setError(result.error);
            });
          }}
        >
          I understand
        </Button>
      </Notice>
    </div>
  );
}
