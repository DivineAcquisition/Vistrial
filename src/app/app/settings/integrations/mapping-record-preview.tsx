"use client";

import { useState, useTransition } from "react";

import { previewMappedContact } from "@/app/app/settings/integrations/actions";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { cardTitle, errorClass, helperClass } from "@/lib/ui";

export function MappingRecordPreview({
  leadName,
  contactId,
}: {
  leadName: string | null;
  contactId: string | null;
}) {
  const [rows, setRows] = useState<Array<{ key: string; value: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Panel className="p-6">
      <h2 className={cardTitle}>Preview against a real record</h2>
      <p className={helperClass}>
        {contactId && leadName
          ? `Pulls ${leadName} live from GoHighLevel and shows the mapped fields. You pick fields from the connected system, never by typing a name.`
          : "Connect GoHighLevel and ingest a contact before a live record can be previewed."}
      </p>
      <div className="mt-4">
        <Button
          type="button"
          loading={pending}
          loadingLabel="Previewing"
          disabled={!contactId}
          onClick={() =>
            startTransition(async () => {
              const result = await previewMappedContact();
              if (result.status === "error") {
                setError(result.error);
                setRows([]);
              } else {
                setError(null);
                setRows(result.fields ?? []);
              }
            })
          }
        >
          Preview live contact
        </Button>
      </div>
      {error ? <p className={`mt-3 ${errorClass}`}>{error}</p> : null}
      {rows.length > 0 ? (
        <dl className="mt-4 grid gap-2 sm:grid-cols-2">
          {rows.map((row) => (
            <div key={row.key}>
              <dt className={helperClass}>{row.key}</dt>
              <dd className="text-sm text-white">{row.value || "—"}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </Panel>
  );
}
