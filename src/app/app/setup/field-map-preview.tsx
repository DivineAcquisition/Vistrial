"use client";

import { useTransition } from "react";

import { ingestRecentCrmContact } from "@/app/app/setup/actions";
import { Panel } from "@/components/ui/panel";
import { helperClass, labelClass, btnSecondary, btnSizeSm, errorClass } from "@/lib/ui";
import { useState } from "react";

export type MappingPreviewLead = {
  name: string;
  currentScore: number | null;
  answers: Record<string, unknown>;
};

export function FieldMapPreview({
  lead,
  customFieldCount,
}: {
  lead: MappingPreviewLead | null;
  customFieldCount: number;
}) {
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <Panel className="px-6 py-6">
      <h2 className="text-sm font-semibold text-white">Live preview against a real lead</h2>
      <p className={helperClass}>
        Mapping is read from this location&apos;s CRM field list
        {customFieldCount > 0 ? ` (${customFieldCount} fields pulled)` : ""}. The preview uses a
        recently ingested contact, not a typed example.
      </p>
      {lead ? (
        <dl className="mt-4 space-y-3">
          <div>
            <dt className={labelClass}>Lead</dt>
            <dd className="text-sm text-white">{lead.name}</dd>
          </div>
          <div>
            <dt className={labelClass}>Current score</dt>
            <dd className="text-sm text-white">
              {lead.currentScore === null ? "Unscored — mapping is not producing a score yet" : lead.currentScore}
            </dd>
          </div>
          <div>
            <dt className={labelClass}>Application answers</dt>
            <dd className="text-sm text-silver">
              {Object.keys(lead.answers).length === 0
                ? "None. The mapped CRM fields are empty on this contact, or the mapping does not match."
                : Object.entries(lead.answers)
                    .map(([key, value]) => `${key}: ${String(value)}`)
                    .join(" · ")}
            </dd>
          </div>
        </dl>
      ) : (
        <p className="mt-4 text-sm text-silver">
          No real lead has been ingested yet. Pull a recent CRM contact through the same webhook path
          the live product uses.
        </p>
      )}
      <div className="mt-4">
        <button
          type="button"
          className={`${btnSecondary} ${btnSizeSm}`}
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const result = await ingestRecentCrmContact();
              if (result.status === "error") setError(result.error);
              else setStatus(`Ingested ${result.leadName ?? "a contact"}. Refresh to see the mapping.`);
            })
          }
        >
          {pending ? "Pulling…" : "Pull a recent CRM contact"}
        </button>
      </div>
      {error ? <p className={errorClass}>{error}</p> : null}
      {status ? <p className={helperClass}>{status}</p> : null}
    </Panel>
  );
}
