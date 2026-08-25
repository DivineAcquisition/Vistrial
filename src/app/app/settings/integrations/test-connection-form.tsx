"use client";

import { useState, useTransition } from "react";

import { testCrmConnection } from "@/app/app/settings/integrations/actions";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { cardTitle, errorClass, helperClass, successClass } from "@/lib/ui";

export function TestConnectionForm() {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Panel className="p-6">
      <h2 className={cardTitle}>Test the connection now</h2>
      <p className={helperClass}>
        Calls GoHighLevel with the stored token and reads the linked location. A failure here is a
        live problem, not a cached one.
      </p>
      <div className="mt-4">
        <Button
          type="button"
          loading={pending}
          loadingLabel="Testing"
          onClick={() =>
            startTransition(async () => {
              const result = await testCrmConnection();
              if (result.status === "error") {
                setError(result.error);
                setMessage(null);
              } else {
                setError(null);
                setMessage(result.message ?? "Connected.");
              }
            })
          }
        >
          Test GoHighLevel now
        </Button>
      </div>
      {error ? <p className={`mt-3 ${errorClass}`}>{error}</p> : null}
      {message ? <p className={`mt-3 ${successClass}`}>{message}</p> : null}
    </Panel>
  );
}
