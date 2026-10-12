"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { confirmEscalationContact, type SetupResult } from "@/app/(workspace)/app/onboarding/setup-actions";
import { Button } from "@/components/ui/button";
import { errorClass, successClass } from "@/lib/ui";

export function ConfirmContactButton({ contactId }: { contactId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<SetupResult | null>(null);
  return (
    <div>
      <Button
        variant="primary"
        loading={pending}
        onClick={() =>
          start(async () => {
            setResult(await confirmEscalationContact(contactId));
            router.refresh();
          })
        }
      >
        I got it
      </Button>
      {result ? (
        <p role={result.ok ? "status" : "alert"} className={result.ok ? successClass : errorClass}>
          {result.ok ? result.message : result.error}
        </p>
      ) : null}
    </div>
  );
}
