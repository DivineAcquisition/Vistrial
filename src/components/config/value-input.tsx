"use client";

import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { ChoiceOption, ConfigValue, FieldDef, ItemField } from "@/lib/config/types";
import { captionText } from "@/lib/ui";

type Props = {
  field: FieldDef;
  value: ConfigValue | undefined;
  onChange: (value: ConfigValue) => void;
  disabled?: boolean;
};

const DAYS: Array<[string, string]> = [
  ["mon", "Monday"],
  ["tue", "Tuesday"],
  ["wed", "Wednesday"],
  ["thu", "Thursday"],
  ["fri", "Friday"],
  ["sat", "Saturday"],
  ["sun", "Sunday"],
];

const UNIT_MINUTES = { minutes: 1, hours: 60, days: 1440 } as const;

function timeZones(): string[] {
  try {
    return (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
  } catch {
    return [];
  }
}

function MultiChoice({
  options,
  value,
  onChange,
  disabled,
}: {
  options: ChoiceOption[];
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-2">
      {options.map((option) => (
        <label key={option.value} className="flex items-center gap-2 text-sm text-card-foreground">
          <Checkbox
            checked={value.includes(option.value)}
            disabled={disabled}
            onCheckedChange={(on) =>
              onChange(on ? [...value, option.value] : value.filter((entry) => entry !== option.value))
            }
          />
          {option.label}
        </label>
      ))}
    </div>
  );
}

function ItemCell({
  column,
  value,
  onChange,
  disabled,
}: {
  column: ItemField;
  value: ConfigValue | undefined;
  onChange: (value: ConfigValue) => void;
  disabled?: boolean;
}) {
  switch (column.type) {
    case "number":
    case "duration":
      return (
        <Input
          density="compact"
          type="number"
          aria-label={column.label}
          value={typeof value === "number" ? String(value) : ""}
          min={column.min}
          max={column.max}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))}
        />
      );
    case "boolean":
      return <Switch checked={Boolean(value)} disabled={disabled} onCheckedChange={(on) => onChange(on)} />;
    case "choice":
      return (
        <Select
          density="compact"
          aria-label={column.label}
          value={typeof value === "string" ? value : ""}
          placeholder="Choose"
          disabled={disabled}
          options={column.options ?? []}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    case "multi_choice":
      return (
        <MultiChoice
          options={column.options ?? []}
          value={Array.isArray(value) ? (value as string[]) : []}
          disabled={disabled}
          onChange={onChange}
        />
      );
    case "long_text":
      return (
        <Textarea
          aria-label={column.label}
          rows={2}
          value={typeof value === "string" ? value : ""}
          maxLength={column.maxLength}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    default:
      return (
        <Input
          density="compact"
          aria-label={column.label}
          value={typeof value === "string" ? value : ""}
          maxLength={column.maxLength}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
      );
  }
}

/** Structured list rows (objections, offers, escalation levels…): one small form per row. */
function RowsInput({ field, value, onChange, disabled }: Props) {
  const columns = field.rules?.itemFields ?? [];
  const rows = Array.isArray(value) ? (value as Array<Record<string, ConfigValue>>) : [];
  const update = (index: number, key: string, cell: ConfigValue) =>
    onChange(rows.map((row, at) => (at === index ? { ...row, [key]: cell } : row)));
  return (
    <div className="space-y-3">
      {rows.map((row, index) => (
        <div key={index} className="rounded-xl border border-border p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            {columns.map((column) => (
              <label key={column.key} className={column.type === "long_text" || column.type === "multi_choice" ? "sm:col-span-2" : ""}>
                <span className={captionText}>
                  {column.label}
                  {column.required ? "" : " (optional)"}
                </span>
                <div className="mt-1">
                  <ItemCell column={column} value={row[column.key]} disabled={disabled} onChange={(cell) => update(index, column.key, cell)} />
                </div>
              </label>
            ))}
          </div>
          <div className="mt-2 flex justify-end">
            <Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={() => onChange(rows.filter((_, at) => at !== index))}>
              <Trash2 aria-hidden /> Remove
            </Button>
          </div>
        </div>
      ))}
      <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => onChange([...rows, {}])}>
        <Plus aria-hidden /> Add
      </Button>
    </div>
  );
}

function ScheduleInput({ value, onChange, disabled }: Props) {
  const schedule = (value && typeof value === "object" && !Array.isArray(value) ? value : { days: {}, closures: [] }) as {
    days?: Record<string, Array<{ start: string; end: string }>>;
    closures?: Array<{ date: string; note?: string }>;
  };
  const days = schedule.days ?? {};
  const closures = schedule.closures ?? [];
  const setDay = (day: string, intervals: Array<{ start: string; end: string }>) =>
    onChange({ ...schedule, days: { ...days, [day]: intervals }, closures } as ConfigValue);
  return (
    <div className="space-y-2">
      {DAYS.map(([day, label]) => {
        const intervals = days[day] ?? [];
        const open = intervals.length > 0;
        return (
          <div key={day} className="flex flex-wrap items-center gap-2">
            <span className="w-24 text-sm text-card-foreground">{label}</span>
            <Switch
              checked={open}
              disabled={disabled}
              aria-label={`Open on ${label}`}
              onCheckedChange={(on) => setDay(day, on ? [{ start: "09:00", end: "17:00" }] : [])}
            />
            {intervals.map((interval, index) => (
              <span key={index} className="flex items-center gap-1">
                <Input
                  density="compact"
                  type="time"
                  aria-label={`${label} opens`}
                  value={interval.start}
                  disabled={disabled}
                  className="w-28"
                  onChange={(event) =>
                    setDay(day, intervals.map((iv, at) => (at === index ? { ...iv, start: event.target.value } : iv)))
                  }
                />
                <span className={captionText}>to</span>
                <Input
                  density="compact"
                  type="time"
                  aria-label={`${label} closes`}
                  value={interval.end}
                  disabled={disabled}
                  className="w-28"
                  onChange={(event) =>
                    setDay(day, intervals.map((iv, at) => (at === index ? { ...iv, end: event.target.value } : iv)))
                  }
                />
              </span>
            ))}
            {open ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={disabled}
                onClick={() => setDay(day, [...intervals, { start: "13:00", end: "17:00" }])}
              >
                Split day
              </Button>
            ) : (
              <span className={captionText}>Closed</span>
            )}
          </div>
        );
      })}
      <div className="pt-2">
        <span className={captionText}>Closed dates (one per line, like 2026-12-25)</span>
        <Textarea
          rows={2}
          aria-label="Closed dates"
          disabled={disabled}
          value={closures.map((closure) => closure.date).join("\n")}
          onChange={(event) =>
            onChange({
              ...schedule,
              days,
              closures: event.target.value
                .split("\n")
                .map((line) => line.trim())
                .filter(Boolean)
                .map((date) => ({ date })),
            } as ConfigValue)
          }
        />
      </div>
    </div>
  );
}

export function ValueInput({ field, value, onChange, disabled }: Props) {
  const rules = field.rules ?? {};
  switch (field.type) {
    case "text":
      return (
        <Input value={typeof value === "string" ? value : ""} maxLength={rules.maxLength} disabled={disabled} aria-label={field.label} onChange={(event) => onChange(event.target.value)} />
      );
    case "long_text":
      return (
        <Textarea rows={4} value={typeof value === "string" ? value : ""} maxLength={rules.maxLength} disabled={disabled} aria-label={field.label} onChange={(event) => onChange(event.target.value)} />
      );
    case "number":
      return (
        <Input
          type="number"
          className="max-w-40"
          value={typeof value === "number" ? String(value) : ""}
          min={rules.min}
          max={rules.max}
          disabled={disabled}
          aria-label={field.label}
          onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))}
        />
      );
    case "duration": {
      const unit = rules.displayUnit ?? "minutes";
      const per = UNIT_MINUTES[unit];
      return (
        <div className="flex items-center gap-2">
          <Input
            type="number"
            className="max-w-40"
            value={typeof value === "number" ? String(value / per) : ""}
            min={rules.min !== undefined ? rules.min / per : undefined}
            disabled={disabled}
            aria-label={`${field.label} in ${unit}`}
            onChange={(event) => onChange(event.target.value === "" ? null : Math.round(Number(event.target.value) * per))}
          />
          <span className={captionText}>{unit}</span>
        </div>
      );
    }
    case "boolean":
      return <Switch checked={Boolean(value)} disabled={disabled} aria-label={field.label} onCheckedChange={(on) => onChange(on)} />;
    case "choice":
      if (rules.timezone) {
        return (
          <>
            <Input list={`${field.key}-zones`} value={typeof value === "string" ? value : ""} disabled={disabled} aria-label={field.label} onChange={(event) => onChange(event.target.value)} />
            <datalist id={`${field.key}-zones`}>
              {timeZones().map((zone) => (
                <option key={zone} value={zone} />
              ))}
            </datalist>
          </>
        );
      }
      return (
        <Select
          value={typeof value === "string" ? value : ""}
          placeholder="Choose"
          options={rules.options ?? []}
          disabled={disabled}
          aria-label={field.label}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    case "multi_choice":
      return (
        <MultiChoice options={rules.options ?? []} value={Array.isArray(value) ? (value as string[]) : []} disabled={disabled} onChange={onChange} />
      );
    case "list":
      if (rules.itemFields) return <RowsInput field={field} value={value} onChange={onChange} disabled={disabled} />;
      return (
        <>
          <Textarea
            rows={4}
            disabled={disabled}
            aria-label={field.label}
            value={Array.isArray(value) ? (value as string[]).join("\n") : ""}
            onChange={(event) => onChange(event.target.value.split("\n").map((line) => line.trim()).filter(Boolean))}
          />
          <p className={captionText}>One per line.</p>
        </>
      );
    case "schedule":
      return <ScheduleInput field={field} value={value} onChange={onChange} disabled={disabled} />;
    case "key_value": {
      const record = (value && typeof value === "object" && !Array.isArray(value) ? value : {}) as Record<string, ConfigValue>;
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          {(rules.keys ?? []).map((key) => (
            <label key={key.value}>
              <span className={captionText}>{key.label}</span>
              <Input
                density="compact"
                type={rules.valueType === "number" ? "number" : key.value === "email" ? "email" : "text"}
                value={record[key.value] === undefined || record[key.value] === null ? "" : String(record[key.value])}
                disabled={disabled}
                onChange={(event) => {
                  const raw = event.target.value;
                  const next = rules.valueType === "number" ? (raw === "" ? null : Number(raw)) : raw;
                  onChange({ ...record, [key.value]: next });
                }}
              />
            </label>
          ))}
        </div>
      );
    }
    case "time_window": {
      const window = (value && typeof value === "object" && !Array.isArray(value) ? value : {}) as { start?: string; end?: string };
      return (
        <div className="flex items-center gap-2">
          <Input type="time" density="compact" className="w-32" aria-label="From" value={window.start ?? ""} disabled={disabled} onChange={(event) => onChange({ ...window, start: event.target.value } as ConfigValue)} />
          <span className={captionText}>to</span>
          <Input type="time" density="compact" className="w-32" aria-label="Until" value={window.end ?? ""} disabled={disabled} onChange={(event) => onChange({ ...window, end: event.target.value } as ConfigValue)} />
        </div>
      );
    }
    case "reference": {
      const reference = (value && typeof value === "object" && !Array.isArray(value) ? value : {}) as { kind?: string; id?: string; label?: string };
      return (
        <div className="grid gap-3 sm:grid-cols-3">
          <Select
            density="compact"
            aria-label="Kind"
            value={reference.kind ?? ""}
            placeholder="Kind"
            disabled={disabled}
            options={(rules.referenceKinds ?? ["integration"]).map((kind) => ({ value: kind, label: kind[0].toUpperCase() + kind.slice(1) }))}
            onChange={(event) => onChange({ ...reference, kind: event.target.value } as ConfigValue)}
          />
          <Input density="compact" aria-label="Connection id" placeholder="Connection id" value={reference.id ?? ""} disabled={disabled} onChange={(event) => onChange({ ...reference, id: event.target.value } as ConfigValue)} />
          <Input density="compact" aria-label="Name shown" placeholder="Name shown" value={reference.label ?? ""} disabled={disabled} onChange={(event) => onChange({ ...reference, label: event.target.value } as ConfigValue)} />
        </div>
      );
    }
  }
}
