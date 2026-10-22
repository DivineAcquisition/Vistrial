"use client";

import { useState, useTransition } from "react";

import type { StaffResult } from "@/app/(workspace)/app/team/staff-actions";
import { saveArea, saveRegistryEntry, setWorkspaceAgent } from "@/app/(workspace)/app/team/agents/registry/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AGENT_PREREQUISITES } from "@/lib/agents/roster";
import { errorClass, helperClass } from "@/lib/ui";

export type EditableEntry = {
  id: string;
  area_id: string | null;
  name: string;
  sublabel: string;
  description: string;
  long_description: string;
  promise: string;
  availability: string;
  beta_org_ids: string[];
  included_plans: string[];
  locked_reason: string;
  prerequisites: string[];
  autonomy: { automatic: string[]; suggests: string[]; never: string[] };
  sort: number;
  version: number;
};

/** Customer-facing words. Changes to these are shown for review before publishing. */
const REVIEWED: Array<keyof EditableEntry> = ["description", "long_description", "promise", "autonomy"];

function lines(text: string): string[] {
  return text.split("\n").map((line) => line.trim()).filter(Boolean);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

export function EntryEditor({ entry, areas, plans }: { entry: EditableEntry; areas: Array<{ id: string; name: string }>; plans: string[] }) {
  const [draft, setDraft] = useState(entry);
  const [note, setNote] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [result, setResult] = useState<StaffResult | null>(null);
  const [pending, start] = useTransition();
  const textChanged = REVIEWED.filter((key) => JSON.stringify(draft[key]) !== JSON.stringify(entry[key]));
  const set = <K extends keyof EditableEntry>(key: K, value: EditableEntry[K]) => setDraft((current) => ({ ...current, [key]: value }));

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        start(async () =>
          setResult(
            await saveRegistryEntry(
              draft.id,
              {
                area_id: draft.area_id ?? "",
                name: draft.name,
                sublabel: draft.sublabel,
                description: draft.description,
                long_description: draft.long_description,
                promise: draft.promise,
                availability: draft.availability,
                beta_org_ids: draft.beta_org_ids,
                included_plans: draft.included_plans,
                locked_reason: draft.locked_reason,
                prerequisites: draft.prerequisites,
                autonomy: draft.autonomy,
                sort: draft.sort,
              },
              note,
            ),
          ),
        );
      }}
    >
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Name">
          <Input value={draft.name} onChange={(e) => set("name", e.target.value)} maxLength={40} />
        </Field>
        <Field label="Role line">
          <Input value={draft.sublabel} onChange={(e) => set("sublabel", e.target.value)} maxLength={60} />
        </Field>
        <Field label="Area">
          <select
            value={draft.area_id ?? ""}
            onChange={(e) => set("area_id", e.target.value || null)}
            className="h-9 w-full rounded-lg border border-input bg-transparent px-2 text-sm"
          >
            <option value="">Across areas</option>
            {areas.map((area) => (
              <option key={area.id} value={area.id}>
                {area.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Availability">
          <select value={draft.availability} onChange={(e) => set("availability", e.target.value)} className="h-9 w-full rounded-lg border border-input bg-transparent px-2 text-sm">
            <option value="available">Available</option>
            <option value="beta">Beta (named workspaces)</option>
            <option value="coming_soon">Coming soon</option>
          </select>
        </Field>
        <Field label="Order">
          <Input type="number" value={draft.sort} onChange={(e) => set("sort", Number(e.target.value))} />
        </Field>
        <Field label="Beta workspaces (ids, one per line)">
          <Textarea value={draft.beta_org_ids.join("\n")} onChange={(e) => set("beta_org_ids", lines(e.target.value))} rows={2} />
        </Field>
      </div>
      <Field label="One sentence">
        <Input value={draft.description} onChange={(e) => set("description", e.target.value)} maxLength={200} />
      </Field>
      <Field label="Longer description">
        <Textarea value={draft.long_description} onChange={(e) => set("long_description", e.target.value)} rows={3} maxLength={1000} />
      </Field>
      <Field label="What it never does">
        <Input value={draft.promise} onChange={(e) => set("promise", e.target.value)} maxLength={300} />
      </Field>
      <div className="grid gap-3 md:grid-cols-3">
        {(["automatic", "suggests", "never"] as const).map((key) => (
          <Field key={key} label={key === "automatic" ? "On its own (one per line)" : key === "suggests" ? "Only suggests (one per line)" : "Never without approval (one per line)"}>
            <Textarea
              value={draft.autonomy[key].join("\n")}
              onChange={(e) => set("autonomy", { ...draft.autonomy, [key]: lines(e.target.value) })}
              rows={3}
            />
          </Field>
        ))}
      </div>
      <fieldset className="space-y-2">
        <legend className="text-xs text-muted-foreground">Plans that include it</legend>
        <div className="flex flex-wrap gap-4">
          {plans.map((plan) => (
            <label key={plan} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={draft.included_plans.includes(plan)}
                onCheckedChange={(on) =>
                  set("included_plans", on ? [...draft.included_plans, plan] : draft.included_plans.filter((item) => item !== plan))
                }
              />
              {plan}
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="Reason shown when locked">
        <Input value={draft.locked_reason} onChange={(e) => set("locked_reason", e.target.value)} maxLength={300} />
      </Field>
      <fieldset className="space-y-2">
        <legend className="text-xs text-muted-foreground">Needs before it can run</legend>
        <div className="flex flex-wrap gap-4">
          {AGENT_PREREQUISITES.map((key) => (
            <label key={key} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={draft.prerequisites.includes(key)}
                onCheckedChange={(on) => set("prerequisites", on ? [...draft.prerequisites, key] : draft.prerequisites.filter((item) => item !== key))}
              />
              {key === "crm_connected" ? "A connected CRM" : "A call source"}
            </label>
          ))}
        </div>
      </fieldset>
      {textChanged.length ? (
        <div className="space-y-2 rounded-lg border border-warning/40 p-3 text-sm">
          <p className="font-medium text-warning">Customers rely on these words. Check them before publishing.</p>
          {textChanged.map((key) => (
            <div key={key} className="grid gap-1 md:grid-cols-2">
              <p className="text-muted-foreground line-through">{JSON.stringify(entry[key])}</p>
              <p className="text-card-foreground">{JSON.stringify(draft[key])}</p>
            </div>
          ))}
          <label className="flex items-center gap-2">
            <Checkbox checked={reviewed} onCheckedChange={(on) => setReviewed(on === true)} />
            I read the new words and they match what the agent really does.
          </label>
        </div>
      ) : null}
      <Field label="What changed and why (kept with this version)">
        <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} required />
      </Field>
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={pending || !note.trim() || (textChanged.length > 0 && !reviewed)}>
          Publish version {entry.version + 1}
        </Button>
        {result && !result.ok ? <span className={errorClass}>{result.error}</span> : null}
        {result && result.ok ? <span className={helperClass}>{result.message}</span> : null}
      </div>
    </form>
  );
}

export function AreaEditor({
  area,
}: {
  area: { id: string; name: string; description: string; availability: string; sort: number; workLabel: string; workHref: string; version: number } | null;
}) {
  const [id, setId] = useState(area?.id ?? "");
  const [name, setName] = useState(area?.name ?? "");
  const [description, setDescription] = useState(area?.description ?? "");
  const [availability, setAvailability] = useState(area?.availability ?? "coming_soon");
  const [sort, setSort] = useState(area?.sort ?? 100);
  const [workLabel, setWorkLabel] = useState(area?.workLabel ?? "");
  const [workHref, setWorkHref] = useState(area?.workHref ?? "");
  const [note, setNote] = useState("");
  const [result, setResult] = useState<StaffResult | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="grid gap-3 md:grid-cols-3"
      onSubmit={(event) => {
        event.preventDefault();
        start(async () =>
          setResult(
            await saveArea(
              id,
              {
                name,
                description,
                availability,
                sort,
                work_page: workLabel && workHref ? { label: workLabel, href: workHref, roles: ["owner", "operator", "service_team", "platform_admin"] } : null,
              },
              note,
            ),
          ),
        );
      }}
    >
      {area ? null : (
        <Field label="Id">
          <Input value={id} onChange={(e) => setId(e.target.value)} maxLength={40} required />
        </Field>
      )}
      <Field label="Name">
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required />
      </Field>
      <Field label="Availability">
        <select value={availability} onChange={(e) => setAvailability(e.target.value)} className="h-9 w-full rounded-lg border border-input bg-transparent px-2 text-sm">
          <option value="available">Available</option>
          <option value="coming_soon">Coming soon</option>
        </select>
      </Field>
      <Field label="Order">
        <Input type="number" value={sort} onChange={(e) => setSort(Number(e.target.value))} />
      </Field>
      <Field label="Description">
        <Input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} />
      </Field>
      <Field label="Work page label">
        <Input value={workLabel} onChange={(e) => setWorkLabel(e.target.value)} maxLength={40} />
      </Field>
      <Field label="Work page address">
        <Input value={workHref} onChange={(e) => setWorkHref(e.target.value)} placeholder="/app/cases" />
      </Field>
      <Field label="What changed and why">
        <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} required />
      </Field>
      <div className="flex items-end gap-3">
        <Button type="submit" size="sm" disabled={pending || !note.trim() || !id}>
          {area ? `Publish version ${area.version + 1}` : "Create area"}
        </Button>
        {result && !result.ok ? <span className={errorClass}>{result.error}</span> : null}
        {result && result.ok ? <span className={helperClass}>{result.message}</span> : null}
      </div>
    </form>
  );
}

/** One cell of the enablement matrix: enable (waits for the Owner), disable, lock or unlock. */
export function MatrixActions({ orgId, agentId, stage, locked }: { orgId: string; agentId: string; stage: string | null; locked: boolean }) {
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<StaffResult | null>(null);
  const [pending, start] = useTransition();
  const on = stage === null || stage === "on" || stage === "watch" || stage === "drafts_only";
  const run = (change: "enable" | "disable" | "lock" | "unlock") => start(async () => setResult(await setWorkspaceAgent(orgId, agentId, change, reason)));
  return (
    <div className="flex flex-wrap items-center gap-2">
      {on ? (
        <Button size="xs" variant="outline" disabled={pending} onClick={() => run("disable")}>
          Turn off
        </Button>
      ) : stage === "pending" ? (
        <span className={helperClass}>Waiting for the Owner</span>
      ) : (
        <Button size="xs" variant="outline" disabled={pending || locked} onClick={() => run("enable")}>
          Turn on
        </Button>
      )}
      <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason to lock or unlock" className="h-8 w-48" maxLength={300} />
      <Button size="xs" variant="ghost" disabled={pending || !reason.trim()} onClick={() => run(locked ? "unlock" : "lock")}>
        {locked ? "Unlock" : "Lock"}
      </Button>
      {result && !result.ok ? <span className={errorClass}>{result.error}</span> : null}
      {result && result.ok ? <span className={helperClass}>{result.message}</span> : null}
    </div>
  );
}
