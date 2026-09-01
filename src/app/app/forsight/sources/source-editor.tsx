"use client";

import { useState, useTransition } from "react";

import { saveSource, testSource } from "@/app/app/forsight/sources/actions";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/states";
import { Panel } from "@/components/ui/panel";
import type { SourceDraft } from "@/lib/forsight/operator";
import type { ForsightSourceType } from "@/lib/forsight/types";
import { inputClass, labelClass, selectClass } from "@/lib/ui";

const TYPES: Array<{ value: ForsightSourceType; label: string; hint: string }> = [
  {
    value: "airtable",
    label: "Airtable base",
    hint: "A base duplicated from our master template. Forsight reads the formula fields.",
  },
  {
    value: "vistrial_core",
    label: "Vistrial core",
    hint: "This workspace's own leads, calls, touches and revenue. Nothing to configure.",
  },
  {
    value: "meta_ads",
    label: "Meta ad account",
    hint: "Ad spend. Without one, cost metrics read as unavailable.",
  },
  {
    value: "ghl",
    label: "LeadConnector",
    hint: "Appointments and message counts, through the OAuth connection already on this workspace.",
  },
];

const TABLES = [
  { key: "leads", label: "Leads" },
  { key: "creatives", label: "Creatives" },
  { key: "weeklySummary", label: "Weekly Summary" },
  { key: "touches", label: "Touches" },
] as const;

type Feedback = { tone: "success" | "critical" | "info"; message: string } | null;

/**
 * The one screen that asks anyone to type a base ID, and only an operator ever
 * sees it. Saving is disabled until the connection has answered, because a
 * source that saves cleanly and fails at the client's first login is the worst
 * version of this feature.
 */
export function SourceEditor({
  workspaces,
}: {
  workspaces: Array<{ id: string; name: string; slug: string }>;
}) {
  const [orgId, setOrgId] = useState(workspaces[0]?.id ?? "");
  const [sourceType, setSourceType] = useState<ForsightSourceType>("airtable");
  const [label, setLabel] = useState("");
  const [baseId, setBaseId] = useState("");
  const [adAccount, setAdAccount] = useState("");
  const [calendarId, setCalendarId] = useState("");
  const [tables, setTables] = useState({
    leads: true,
    creatives: true,
    weeklySummary: true,
    touches: true,
  });

  const [tested, setTested] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [pending, startTransition] = useTransition();

  const draft = (): SourceDraft => ({
    orgId,
    sourceType,
    label,
    airtableBaseId: baseId,
    airtableTables: tables,
    metaAdAccountId: adAccount,
    ghlCalendarId: calendarId,
  });

  // Any edit invalidates the test. Otherwise an operator could test one base
  // and save a different one.
  const change = <T,>(set: (value: T) => void) => (value: T) => {
    set(value);
    setTested(false);
    setFeedback(null);
  };

  const runTest = () =>
    startTransition(async () => {
      const result = await testSource(draft());
      setTested(result.ok);
      setFeedback(
        result.ok
          ? { tone: "success", message: result.detail }
          : { tone: "critical", message: result.error }
      );
    });

  const runSave = () =>
    startTransition(async () => {
      const result = await saveSource(draft());
      setFeedback(
        result.ok
          ? { tone: "success", message: `Saved. ${result.detail}` }
          : { tone: "critical", message: result.error }
      );
      if (!result.ok) setTested(false);
    });

  const selected = TYPES.find((type) => type.value === sourceType);

  return (
    <Panel className="flex max-w-2xl flex-col gap-5 p-6">
      <div>
        <label className={labelClass} htmlFor="forsight-workspace">
          Workspace
        </label>
        <select
          id="forsight-workspace"
          className={selectClass}
          value={orgId}
          onChange={(event) => change(setOrgId)(event.target.value)}
        >
          {workspaces.map((workspace) => (
            <option key={workspace.id} value={workspace.id}>
              {workspace.name} ({workspace.slug})
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelClass} htmlFor="forsight-source-type">
          Source type
        </label>
        <select
          id="forsight-source-type"
          className={selectClass}
          value={sourceType}
          onChange={(event) =>
            change(setSourceType)(event.target.value as ForsightSourceType)
          }
        >
          {TYPES.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
        {selected ? <p className="mt-1.5 text-xs text-dim">{selected.hint}</p> : null}
      </div>

      <div>
        <label className={labelClass} htmlFor="forsight-label">
          Label <span className="text-dim">(optional)</span>
        </label>
        <input
          id="forsight-label"
          className={inputClass}
          value={label}
          onChange={(event) => change(setLabel)(event.target.value)}
          placeholder="What this source is, for an operator reading it later"
        />
      </div>

      {sourceType === "airtable" ? (
        <>
          <div>
            <label className={labelClass} htmlFor="forsight-base-id">
              Airtable base ID
            </label>
            <input
              id="forsight-base-id"
              className={inputClass}
              value={baseId}
              onChange={(event) => change(setBaseId)(event.target.value)}
              placeholder="appXXXXXXXXXXXXXX"
              spellCheck={false}
            />
          </div>
          <fieldset>
            <legend className={labelClass}>Tables this base has</legend>
            <p className="mb-2 text-xs text-dim">
              Unchecked tables read as unavailable rather than empty.
            </p>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {TABLES.map((table) => (
                <label key={table.key} className="flex items-center gap-2 text-sm text-silver">
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--color-brand-500)]"
                    checked={tables[table.key]}
                    onChange={(event) =>
                      change(setTables)({ ...tables, [table.key]: event.target.checked })
                    }
                  />
                  {table.label}
                </label>
              ))}
            </div>
          </fieldset>
        </>
      ) : null}

      {sourceType === "meta_ads" ? (
        <div>
          <label className={labelClass} htmlFor="forsight-ad-account">
            Meta ad account ID
          </label>
          <input
            id="forsight-ad-account"
            className={inputClass}
            value={adAccount}
            onChange={(event) => change(setAdAccount)(event.target.value)}
            placeholder="act_1234567890"
            spellCheck={false}
          />
        </div>
      ) : null}

      {sourceType === "ghl" ? (
        <div>
          <label className={labelClass} htmlFor="forsight-calendar">
            Calendar ID <span className="text-dim">(optional)</span>
          </label>
          <input
            id="forsight-calendar"
            className={inputClass}
            value={calendarId}
            onChange={(event) => change(setCalendarId)(event.target.value)}
            placeholder="Leave blank to read every calendar on the location"
            spellCheck={false}
          />
        </div>
      ) : null}

      {sourceType === "vistrial_core" ? (
        <p className="text-sm text-muted-foreground">
          Nothing to enter. A core source reads this workspace&rsquo;s own data through the same
          row-level security as the rest of the app.
        </p>
      ) : null}

      {feedback ? <Notice tone={feedback.tone}>{feedback.message}</Notice> : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={runTest} loading={pending} disabled={!orgId}>
          Test connection
        </Button>
        <Button variant="primary" onClick={runSave} disabled={!tested || pending}>
          Save source
        </Button>
        {tested ? null : (
          <span className="text-xs text-dim">Test before saving.</span>
        )}
      </div>
    </Panel>
  );
}
