"use client";

import { useState, useTransition } from "react";

import { saveProposedFieldMaps } from "@/app/app/settings/integrations/actions";
import type { SettingsSaveResult } from "@/app/app/settings/types";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { mappingSentence, type ProposedMap } from "@/lib/ghl/propose-maps";
import { FACTOR_PLAIN } from "@/lib/vocabulary";
import { cardTitle, errorClass, helperClass } from "@/lib/ui";
import type { ScoreFactor } from "@/lib/scoring/compute";

const FACTOR_OPTIONS: ScoreFactor[] = [
  "timeline",
  "investment_capacity",
  "decision_authority",
  "pain_severity",
];

type Row = ProposedMap & { include: boolean };

/**
 * What the CRM already knows, read back as sentences. Nobody types a field
 * name, a field id, or an answer key here — the list comes from their own
 * account and every row shows one of their own answers as proof.
 */
export function FieldMapping({
  proposed,
  missing,
  alreadyConfigured,
}: {
  proposed: ProposedMap[];
  missing: ScoreFactor[];
  alreadyConfigured: boolean;
}) {
  const [rows, setRows] = useState<Row[]>(
    proposed.map((map) => ({ ...map, include: map.confident }))
  );
  const [result, setResult] = useState<SettingsSaveResult>({ status: "idle" });
  const [pending, startTransition] = useTransition();

  if (rows.length === 0) {
    return (
      <Panel className="p-6">
        <h2 className={cardTitle}>What we read from each lead</h2>
        <p className={helperClass}>
          We looked through the questions on your own form and could not tell which ones ask about
          timing, budget, who decides, or what is going wrong. Add one of those questions to your
          form and reconnect, and this fills itself in.
        </p>
      </Panel>
    );
  }

  return (
    <Panel className="p-6">
      <h2 className={cardTitle}>What we read from each lead</h2>
      <p className={helperClass}>
        {alreadyConfigured
          ? "This is what we read today. Change anything that looks wrong."
          : "We read your own questions and filled this in. Check it and save."}
      </p>

      <ul className="mt-5 space-y-4">
        {rows.map((row, index) => (
          <li key={row.fieldId} className="border-t border-white/[0.06] pt-4 first:border-t-0 first:pt-0">
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-1"
                checked={row.include}
                onChange={(event) =>
                  setRows((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, include: event.target.checked } : item
                    )
                  )
                }
              />
              <span className="min-w-0">
                <span className="block text-sm text-white">{mappingSentence(row)}</span>
                {row.confident ? null : (
                  <span className="mt-1 block text-xs text-dim">
                    We guessed this one from the answers people gave. Worth a look.
                  </span>
                )}
              </span>
            </label>
            <div className="mt-3 ml-7">
              <Select
                density="compact"
                aria-label={`What “${row.fieldName}” tells us`}
                value={row.factor}
                onChange={(event) =>
                  setRows((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index
                        ? { ...item, factor: event.target.value as ScoreFactor }
                        : item
                    )
                  )
                }
              >
                {FACTOR_OPTIONS.map((factor) => (
                  <option key={factor} value={factor}>
                    Use it to judge {FACTOR_PLAIN[factor]}
                  </option>
                ))}
              </Select>
            </div>
          </li>
        ))}
      </ul>

      {missing.length > 0 ? (
        <p className={`${helperClass} mt-5`}>
          Nothing on your form asks about {missing.map((factor) => FACTOR_PLAIN[factor]).join(", ")}.
          Leads still score without it, on less information.
        </p>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="gradient"
          disabled={pending}
          onClick={() => {
            startTransition(async () => {
              setResult(
                await saveProposedFieldMaps(
                  rows
                    .filter((row) => row.include)
                    .map((row) => ({
                      fieldId: row.fieldId,
                      fieldKey: row.fieldKey,
                      factor: row.factor,
                    }))
                )
              );
            });
          }}
        >
          {pending ? "Saving" : "Save this"}
        </Button>
        {result.status === "saved" ? (
          <p className="text-sm text-flag-good">Saved. New leads are read this way from now on.</p>
        ) : null}
        {result.status === "error" ? <p className={errorClass}>{result.error}</p> : null}
      </div>
    </Panel>
  );
}
