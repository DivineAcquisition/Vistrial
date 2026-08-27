"use client";

import { useMemo, useState, type ReactNode } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Input, InputGroup } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { Select } from "@/components/ui/select";
import type { Tone } from "@/components/ui/tone";
import type { Choice } from "@/lib/profile/vocabulary";
import type { DefaultSource, ProfileDefault, ProfileDefaults } from "@/lib/profile/types";
import { helperClass, labelClass } from "@/lib/ui";

const SOURCE_LABEL: Record<DefaultSource, string> = {
  saved: "Your answer",
  derived: "From your CRM",
  prior: "From similar businesses",
  fallback: "Our starting point",
};

const SOURCE_TONE: Record<DefaultSource, Tone> = {
  saved: "good",
  derived: "brand",
  prior: "brand",
  fallback: "neutral",
};

function entry(defaults: ProfileDefaults, field: string): ProfileDefault {
  return defaults[field] ?? { value: null, source: "fallback", basis: "" };
}

export function FieldShell({
  field,
  defaults,
  label,
  htmlFor,
  children,
}: {
  field: string;
  defaults: ProfileDefaults;
  label: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  const meta = entry(defaults, field);
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <label className={`${labelClass} mb-0`} htmlFor={htmlFor}>
          {label}
        </label>
        <StatusBadge label={SOURCE_LABEL[meta.source]} tone={SOURCE_TONE[meta.source]} />
      </div>
      {children}
      {meta.basis ? <p className={helperClass}>{meta.basis}</p> : null}
    </div>
  );
}

export function TextField(props: {
  field: string;
  name: string;
  label: string;
  defaults: ProfileDefaults;
  placeholder?: string;
}) {
  const meta = entry(props.defaults, props.field);
  return (
    <FieldShell field={props.field} defaults={props.defaults} label={props.label} htmlFor={props.name}>
      <Input
        id={props.name}
        name={props.name}
        type="text"
        placeholder={props.placeholder}
        defaultValue={typeof meta.value === "string" ? meta.value : ""}
      />
    </FieldShell>
  );
}

export function NumberField(props: {
  field: string;
  name: string;
  label: string;
  defaults: ProfileDefaults;
  min?: number;
  max?: number;
  step?: string;
  suffix?: string;
  /** Stored in cents, entered in whole currency units. */
  money?: boolean;
}) {
  const meta = entry(props.defaults, props.field);
  const raw = typeof meta.value === "number" ? meta.value : null;
  const shown = raw === null ? "" : props.money ? String(raw / 100) : String(raw);
  return (
    <FieldShell field={props.field} defaults={props.defaults} label={props.label} htmlFor={props.name}>
      {/* The unit sits inside the field rather than floating beside it, so a
          currency and a percentage are read as part of the value. */}
      <InputGroup
        id={props.name}
        name={props.name}
        type="number"
        inputMode="decimal"
        min={props.min}
        max={props.max}
        step={props.step ?? (props.money ? "0.01" : "1")}
        defaultValue={shown}
        placeholder={props.money ? "0.00" : "0"}
        prefix={props.money ? "$" : undefined}
        suffix={props.suffix}
      />
    </FieldShell>
  );
}

export function ChoiceField<T extends string>(props: {
  field: string;
  name: string;
  label: string;
  defaults: ProfileDefaults;
  choices: Array<Choice<T>>;
  allowEmpty?: boolean;
}) {
  const meta = entry(props.defaults, props.field);
  const current = typeof meta.value === "string" ? meta.value : "";
  const hint = props.choices.find((choice) => choice.value === current)?.hint;
  return (
    <FieldShell field={props.field} defaults={props.defaults} label={props.label} htmlFor={props.name}>
      <Select id={props.name} name={props.name} defaultValue={current}>
        {props.allowEmpty ? <option value="">Not answered</option> : null}
        {props.choices.map((choice) => (
          <option key={choice.value} value={choice.value}>
            {choice.label}
          </option>
        ))}
      </Select>
      {hint ? <p className={helperClass}>{hint}</p> : null}
    </FieldShell>
  );
}

export function MultiChoiceField<T extends string>(props: {
  field: string;
  name: string;
  label: string;
  defaults: ProfileDefaults;
  choices: Array<Choice<T> & { factor?: string | null }>;
  /** Rendered beside each option, e.g. a monthly spend box per channel. */
  extra?: (value: T) => ReactNode;
}) {
  const meta = entry(props.defaults, props.field);
  const selected = useMemo(
    () => new Set(Array.isArray(meta.value) ? (meta.value as string[]) : []),
    [meta.value]
  );
  return (
    <FieldShell field={props.field} defaults={props.defaults} label={props.label}>
      <div className="grid gap-2 sm:grid-cols-2">
        {props.choices.map((choice) => (
          <div key={choice.value} className="flex items-center gap-3">
            <label className="flex flex-1 items-center gap-2 text-sm text-white">
              <Checkbox
                name={props.name}
                value={choice.value}
                defaultChecked={selected.has(choice.value)}
              />
              <span>
                {choice.label}
                {choice.factor ? <span className="text-dim"> · {choice.factor}</span> : null}
              </span>
            </label>
            {props.extra ? props.extra(choice.value) : null}
          </div>
        ))}
      </div>
    </FieldShell>
  );
}

export function LinesField(props: {
  field: string;
  name: string;
  label: string;
  defaults: ProfileDefaults;
  placeholder?: string;
  rows?: number;
}) {
  const meta = entry(props.defaults, props.field);
  const value = Array.isArray(meta.value) ? (meta.value as string[]).join("\n") : "";
  return (
    <FieldShell field={props.field} defaults={props.defaults} label={props.label} htmlFor={props.name}>
      <Textarea
        id={props.name}
        name={props.name}
        rows={props.rows ?? 4}
        
        placeholder={props.placeholder}
        defaultValue={value}
      />
    </FieldShell>
  );
}

export type RowColumn = {
  key: string;
  label: string;
  kind: "text" | "number" | "select";
  choices?: Array<{ value: string; label: string }>;
  placeholder?: string;
  allowEmpty?: boolean;
};

/**
 * A select with no empty option shows its first choice, so a row the client
 * never touched has to start holding that value. Left blank, the row looks
 * answered on screen and arrives at the server empty.
 */
function blankFor(column: RowColumn): string {
  if (column.kind === "select" && !column.allowEmpty) {
    return column.choices?.[0]?.value ?? "";
  }
  return "";
}

/**
 * One repeatable-row editor, reused for application fields, scoring bands,
 * pipeline stages and objections. Rows serialise into a hidden input so the
 * server action reads them out of ordinary form data.
 */
export function RepeatableRows(props: {
  field: string;
  name: string;
  label: string;
  defaults: ProfileDefaults;
  columns: RowColumn[];
  addLabel: string;
  emptyLabel: string;
  max?: number;
}) {
  const meta = entry(props.defaults, props.field);
  const initial = Array.isArray(meta.value)
    ? (meta.value as Array<Record<string, unknown>>).map((row) => {
        const next: Record<string, string> = {};
        for (const column of props.columns) {
          const raw = row[column.key];
          next[column.key] =
            raw === null || raw === undefined || raw === "" ? blankFor(column) : String(raw);
        }
        return next;
      })
    : [];
  const [rows, setRows] = useState<Array<Record<string, string>>>(initial);
  const max = props.max ?? 12;

  const update = (index: number, key: string, value: string) => {
    setRows((current) =>
      current.map((row, i) => (i === index ? { ...row, [key]: value } : row))
    );
  };

  return (
    <FieldShell field={props.field} defaults={props.defaults} label={props.label}>
      <input type="hidden" name={props.name} value={JSON.stringify(rows)} readOnly />
      {rows.length === 0 ? <p className={helperClass}>{props.emptyLabel}</p> : null}
      <div className="flex flex-col gap-3">
        {rows.map((row, index) => (
          <div key={index} className="flex flex-wrap items-end gap-3">
            {props.columns.map((column) => (
              <div key={column.key} className="min-w-[9rem] flex-1">
                <span className={labelClass}>{column.label}</span>
                {column.kind === "select" ? (
                  <Select
                    value={row[column.key] ?? ""}
                    onChange={(event) => update(index, column.key, event.target.value)}
                  >
                    {column.allowEmpty ? <option value="">Not set</option> : null}
                    {(column.choices ?? []).map((choice) => (
                      <option key={choice.value} value={choice.value}>
                        {choice.label}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Input
                    type={column.kind === "number" ? "number" : "text"}
                    placeholder={column.placeholder}
                    value={row[column.key] ?? ""}
                    onChange={(event) => update(index, column.key, event.target.value)}
                  />
                )}
              </div>
            ))}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
            >
              Remove
            </Button>
          </div>
        ))}
      </div>
      {rows.length < max ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="mt-3"
          onClick={() =>
            setRows((current) => [
              ...current,
              Object.fromEntries(props.columns.map((column) => [column.key, blankFor(column)])),
            ])
          }
        >
          {props.addLabel}
        </Button>
      ) : null}
    </FieldShell>
  );
}

export function MoneyPerChannel(props: { channel: string; defaults: ProfileDefaults }) {
  const spend = entry(props.defaults, "channel_spend_cents").value;
  const map = spend && typeof spend === "object" ? (spend as Record<string, number>) : {};
  const current = map[props.channel];
  return (
    <Input
      name={`spend_${props.channel}`}
      type="number"
      min={0}
      step="1"
      placeholder="spend / mo"
      defaultValue={current === undefined ? "" : String(current / 100)}
      className="w-28"
      aria-label={`Monthly spend on ${props.channel}`}
    />
  );
}
