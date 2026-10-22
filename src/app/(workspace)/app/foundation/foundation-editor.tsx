"use client";

import { useState, useTransition } from "react";

import { confirmFoundationAction, draftFoundationAction, saveFoundationField } from "@/app/(workspace)/app/foundation/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  CHANNELS,
  CHOICE_LABEL,
  FIELDS,
  FOUNDATION_SECTIONS,
  SOURCE_LABEL,
  stageKey,
  type BusinessHours,
  type FieldSpec,
  type FieldSource,
  type FieldValue,
  type RoleTargets,
  type Stage,
} from "@/lib/foundation/fields";

export type EditorField = { key: string; value: FieldValue; source: FieldSource; status: "drafted" | "edited" | "confirmed" };

const SELECT_CLASS =
  "h-10 w-full rounded-xl border border-overlay/[0.09] bg-ink-850 px-3 text-sm text-card-foreground outline-none focus-visible:border-brand-500/55 focus-visible:ring-[3px] focus-visible:ring-brand-500/20 sm:h-9";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const TARGET_LABELS: Array<[keyof RoleTargets, string]> = [
  ["calls", "Calls"],
  ["conversations", "Conversations"],
  ["followUps", "Follow-ups"],
  ["booked", "Booked"],
  ["shows", "Shows"],
  ["closes", "Closes"],
];

function money(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export function displayValue(spec: FieldSpec, value: FieldValue): string {
  if (value === null || value === undefined) return "Not set";
  switch (spec.kind) {
    case "choice":
      return CHOICE_LABEL[String(value)] ?? String(value);
    case "money":
      return money(Number(value));
    case "percent":
      return `${value}%`;
    case "number":
    case "text":
      return String(value);
    case "list":
      return (value as string[]).join(", ") || "Not set";
    case "channels":
      return (value as string[]).map((item) => CHOICE_LABEL[item] ?? item).join(", ") || "None";
    case "stages":
      return (value as Stage[]).map((stage) => stage.label).join(", ");
    case "targets": {
      const targets = value as RoleTargets;
      return TARGET_LABELS.filter(([name]) => targets[name] > 0)
        .map(([name, label]) => `${targets[name]} ${label.toLowerCase()}`)
        .join(", ") || "None";
    }
    case "hours": {
      const hours = value as BusinessHours;
      return `${hours.start} to ${hours.end}, ${hours.days.map((day) => DAY_NAMES[day]).join(" ")}`;
    }
  }
}

function FieldForm({ spec, value, onDone }: { spec: FieldSpec; value: FieldValue; onDone: () => void }) {
  const [pending, start] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);
  const inputId = `field-${spec.key.replace(".", "-")}`;

  function submit(next: unknown) {
    setProblem(null);
    start(async () => {
      const result = await saveFoundationField(spec.key, next);
      if (result.ok) onDone();
      else setProblem(result.message);
    });
  }

  function read(form: HTMLFormElement): unknown {
    const data = new FormData(form);
    const text = (name: string) => String(data.get(name) ?? "").trim();
    switch (spec.kind) {
      case "choice":
        return text("value") || null;
      case "text":
        return text("value") || null;
      case "number":
      case "percent":
        return text("value") === "" ? null : Number(text("value"));
      case "money":
        return text("value") === "" ? null : Math.round(Number(text("value").replace(/[$,]/g, "")) * 100);
      case "list":
        return text("value")
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean);
      case "channels":
        return data.getAll("value").map(String);
      case "stages": {
        const previous = new Map(((value as Stage[] | null) ?? []).map((stage) => [stage.label.toLowerCase(), stage.crmStage]));
        return text("value")
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => {
            const [label, ...rest] = line.split(":");
            const name = label.trim();
            return { key: stageKey(name), label: name, meaning: rest.join(":").trim(), crmStage: previous.get(name.toLowerCase()) ?? null };
          });
      }
      case "targets":
        return Object.fromEntries(TARGET_LABELS.map(([name]) => [name, Number(text(name) || 0)]));
      case "hours":
        return { start: text("start"), end: text("end"), days: data.getAll("days").map(Number) };
    }
  }

  let control: React.ReactNode;
  switch (spec.kind) {
    case "choice":
      control = (
        <select id={inputId} name="value" defaultValue={value === null ? "" : String(value)} className={SELECT_CLASS}>
          <option value="">Not set</option>
          {spec.options?.map((option) => (
            <option key={option} value={option}>
              {CHOICE_LABEL[option] ?? option}
            </option>
          ))}
        </select>
      );
      break;
    case "number":
    case "percent":
      control = <Input id={inputId} name="value" type="number" inputMode="numeric" min={spec.min} max={spec.max} defaultValue={value === null ? "" : String(value)} />;
      break;
    case "money":
      control = <Input id={inputId} name="value" inputMode="decimal" placeholder="$" defaultValue={value === null ? "" : String(Number(value) / 100)} />;
      break;
    case "text":
      control = <Input id={inputId} name="value" defaultValue={value === null ? "" : String(value)} />;
      break;
    case "list":
      control = <Textarea id={inputId} name="value" rows={4} defaultValue={((value as string[] | null) ?? []).join("\n")} />;
      break;
    case "stages":
      control = (
        <Textarea
          id={inputId}
          name="value"
          rows={6}
          defaultValue={((value as Stage[] | null) ?? []).map((stage) => (stage.meaning ? `${stage.label}: ${stage.meaning}` : stage.label)).join("\n")}
        />
      );
      break;
    case "channels":
      control = (
        <fieldset className="flex flex-wrap gap-3">
          <legend className="sr-only">{spec.label}</legend>
          {CHANNELS.map((channel) => (
            <label key={channel} className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" name="value" value={channel} defaultChecked={((value as string[] | null) ?? []).includes(channel)} className="size-4" />
              {CHOICE_LABEL[channel]}
            </label>
          ))}
        </fieldset>
      );
      break;
    case "targets": {
      const targets = (value as RoleTargets | null) ?? { calls: 0, conversations: 0, followUps: 0, booked: 0, shows: 0, closes: 0 };
      control = (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {TARGET_LABELS.map(([name, label]) => (
            <label key={name} className="flex flex-col gap-1 text-xs text-muted-foreground">
              {label}
              <Input name={name} type="number" inputMode="numeric" min={0} max={10000} defaultValue={String(targets[name])} />
            </label>
          ))}
        </div>
      );
      break;
    }
    case "hours": {
      const hours = (value as BusinessHours | null) ?? { start: "09:00", end: "18:00", days: [1, 2, 3, 4, 5] };
      control = (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Opens
              <Input name="start" type="time" defaultValue={hours.start} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Closes
              <Input name="end" type="time" defaultValue={hours.end} />
            </label>
          </div>
          <fieldset className="flex flex-wrap gap-3">
            <legend className="sr-only">Days open</legend>
            {DAY_NAMES.map((day, index) => (
              <label key={day} className="flex min-h-11 items-center gap-1.5 text-sm">
                <input type="checkbox" name="days" value={index} defaultChecked={hours.days.includes(index)} className="size-4" />
                {day}
              </label>
            ))}
          </fieldset>
        </div>
      );
      break;
    }
  }

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        submit(read(event.currentTarget));
      }}
    >
      <label htmlFor={inputId} className="sr-only">
        {spec.label}
      </label>
      {spec.help ? <p className="text-xs text-muted-foreground">{spec.help}</p> : null}
      {control}
      {problem ? (
        <p role="alert" className="text-sm text-destructive-foreground">
          {problem}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving" : "Save"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

const STATUS_BADGE: Record<EditorField["status"], { label: string; variant: "outline" | "info" | "success" }> = {
  drafted: { label: "Drafted", variant: "info" },
  edited: { label: "Needs confirming", variant: "outline" },
  confirmed: { label: "Confirmed", variant: "success" },
};

export function FoundationEditor({
  fields,
  canEdit,
  canConfirm,
  version,
}: {
  fields: EditorField[];
  canEdit: boolean;
  canConfirm: boolean;
  version: { version: number; confirmedAt: string; note: string } | null;
}) {
  const byKey = new Map(fields.map((field) => [field.key, field]));
  const [editing, setEditing] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const unconfirmed = fields.some((field) => field.status !== "confirmed") || !version;

  return (
    <div className="flex flex-col gap-4">
      {canEdit ? (
        <Card className="gap-3 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Compass drafts from your CRM, calendar and setup answers. It only fills fields you have not edited.
            </p>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const result = await draftFoundationAction();
                  setMessage(result.message ?? null);
                })
              }
            >
              {pending ? "Drafting" : "Ask Compass to draft"}
            </Button>
          </div>
          {message ? (
            <p role="status" className="text-sm">
              {message}
            </p>
          ) : null}
        </Card>
      ) : null}

      {FOUNDATION_SECTIONS.map((section) => (
        <Card key={section.id} className="gap-3 p-4 sm:p-5" render={<section aria-labelledby={`foundation-${section.id}`} />}>
          <div>
            <h2 id={`foundation-${section.id}`} className="font-heading text-base text-card-foreground">
              {section.title}
            </h2>
            <p className="text-sm text-muted-foreground">{section.description}</p>
          </div>
          <dl className="flex flex-col divide-y divide-border">
            {FIELDS.filter((spec) => spec.section === section.id).map((spec) => {
              const stored = byKey.get(spec.key);
              const badge = stored ? STATUS_BADGE[stored.status] : null;
              return (
                <div key={spec.key} className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <dt className="text-sm font-medium">{spec.label}</dt>
                    <div className="flex items-center gap-2">
                      {stored ? <span className="text-xs text-muted-foreground">{SOURCE_LABEL[stored.source]}</span> : null}
                      {badge ? (
                        <Badge variant={badge.variant} size="sm">
                          {badge.label}
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                  <dd className="text-sm">
                    {editing === spec.key ? (
                      <FieldForm spec={spec} value={stored?.value ?? null} onDone={() => setEditing(null)} />
                    ) : (
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className={stored?.value == null ? "text-muted-foreground" : undefined}>{displayValue(spec, stored?.value ?? null)}</span>
                        {canEdit ? (
                          <Button size="sm" variant="ghost" onClick={() => setEditing(spec.key)} aria-label={`Edit ${spec.label}`}>
                            Edit
                          </Button>
                        ) : null}
                      </div>
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
        </Card>
      ))}

      {canConfirm ? (
        <Card className="gap-3 p-4 sm:p-5" render={<section aria-labelledby="foundation-confirm" />}>
          <h2 id="foundation-confirm" className="font-heading text-base">
            Confirm
          </h2>
          <p className="text-sm text-muted-foreground">
            {unconfirmed
              ? "Agents only use confirmed fields. Confirming saves a new version with your note."
              : `Version ${version?.version} is confirmed and in use.`}
          </p>
          {unconfirmed ? (
            <form
              className="flex flex-col gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                start(async () => {
                  const result = await confirmFoundationAction(note);
                  setMessage(result.message ?? null);
                  if (result.ok) setNote("");
                });
              }}
            >
              <label htmlFor="foundation-note" className="text-sm">
                What changed
              </label>
              <Input id="foundation-note" value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} required />
              <div>
                <Button type="submit" disabled={pending || !note.trim()}>
                  Confirm foundation
                </Button>
              </div>
            </form>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}
