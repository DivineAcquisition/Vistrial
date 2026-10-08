import { CONFIG_FIELDS, FIELD_BY_KEY, SECTION_INFO } from "@/lib/config/registry";
import type { ChoiceOption, ConfigSection, ConfigValue, FieldDef, ResolvedField } from "@/lib/config/types";

const DAY_LABELS: Record<string, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};

function optionLabel(options: ChoiceOption[] | undefined, value: unknown): string {
  return options?.find((option) => option.value === value)?.label ?? String(value);
}

/** Minutes as people say them: "15 minutes", "2 hours", "3 days". */
export function describeMinutes(minutes: number): string {
  if (minutes % 1440 === 0 && minutes >= 1440) return `${minutes / 1440} ${minutes === 1440 ? "day" : "days"}`;
  if (minutes % 60 === 0 && minutes >= 60) return `${minutes / 60} ${minutes === 60 ? "hour" : "hours"}`;
  return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
}

function describeItem(field: FieldDef, item: ConfigValue): string {
  if (!item || typeof item !== "object" || Array.isArray(item)) return String(item);
  const columns = field.rules?.itemFields ?? [];
  return columns
    .map((column) => {
      const value = item[column.key];
      if (value === undefined || value === null || value === "") return null;
      if (Array.isArray(value)) return `${column.label}: ${value.map((entry) => optionLabel(column.options, entry)).join(", ")}`;
      if (column.type === "choice") return `${column.label}: ${optionLabel(column.options, value)}`;
      return `${column.label}: ${String(value)}`;
    })
    .filter(Boolean)
    .join(" · ");
}

/**
 * A value as one short plain-language line (or a few), for the effective
 * view, comparisons, and review notices. Never shows raw JSON.
 */
export function describeValue(fieldOrKey: FieldDef | string, value: ConfigValue | undefined): string {
  const field = typeof fieldOrKey === "string" ? FIELD_BY_KEY[fieldOrKey] : fieldOrKey;
  if (value === undefined || value === null || value === "") return "Not set";
  if (!field) return typeof value === "object" ? JSON.stringify(value) : String(value);
  const rules = field.rules ?? {};

  switch (field.type) {
    case "boolean":
      return value ? "Yes" : "No";
    case "duration":
      return typeof value === "number" ? describeMinutes(value) : String(value);
    case "choice":
      return optionLabel(rules.options, value);
    case "multi_choice":
      return Array.isArray(value) && value.length ? value.map((entry) => optionLabel(rules.options, entry)).join(", ") : "None";
    case "time_window": {
      const window = value as { start?: string; end?: string };
      return `${window.start ?? "?"} to ${window.end ?? "?"}`;
    }
    case "schedule": {
      const schedule = value as { days?: Record<string, Array<{ start: string; end: string }>>; closures?: Array<{ date: string }> };
      const days = Object.keys(DAY_LABELS)
        .map((day) => {
          const intervals = schedule.days?.[day] ?? [];
          return `${DAY_LABELS[day]} ${intervals.length ? intervals.map((iv) => `${iv.start}–${iv.end}`).join(", ") : "closed"}`;
        })
        .join("; ");
      const closures = schedule.closures?.length ? `. Closed on ${schedule.closures.map((closure) => closure.date).join(", ")}` : "";
      return `${days}${closures}`;
    }
    case "key_value": {
      const entries = Object.entries(value as Record<string, ConfigValue>).filter(([, entry]) => entry !== null && entry !== "");
      if (!entries.length) return "Not set";
      return entries.map(([key, entry]) => `${optionLabel(rules.keys, key)}: ${String(entry)}`).join(" · ");
    }
    case "reference": {
      const reference = value as { kind?: string; id?: string; label?: string };
      return reference.label || reference.id || "Not set";
    }
    case "list":
      if (!Array.isArray(value) || value.length === 0) return "None";
      if (rules.itemFields) return value.map((item) => describeItem(field, item)).join("\n");
      return value.map(String).join(", ");
    default:
      return String(value);
  }
}

export const SOURCE_LABELS: Record<ResolvedField["source"], string> = {
  platform: "Platform default",
  template: "Template",
  workspace: "This workspace",
  missing: "Not set",
};

/** Where a value came from, in the words the screens use. */
export function describeSource(field: ResolvedField): string {
  if (field.source === "missing") return "Not set";
  if (field.lockedAt && field.tightened) return `Locked by the ${field.lockedAt === "platform" ? "platform" : "template"}, made stricter here`;
  if (field.lockedAt) return `Locked by the ${field.lockedAt === "platform" ? "platform" : "template"}`;
  return SOURCE_LABELS[field.source];
}

export function fieldsBySection(): Array<{ section: ConfigSection; label: string; description: string; fields: FieldDef[] }> {
  return (Object.keys(SECTION_INFO) as ConfigSection[]).map((section) => ({
    section,
    label: SECTION_INFO[section].label,
    description: SECTION_INFO[section].description,
    fields: CONFIG_FIELDS.filter((field) => field.section === section),
  }));
}

/** The heading of a review notice: what changed, and between which versions. */
export function noticeTitle(notice: { level: string; from_version: number; to_version: number }, templateName?: string | null): string {
  return notice.level === "platform"
    ? `Platform default update (version ${notice.from_version} → ${notice.to_version})`
    : `${templateName ?? "Template"} update (version ${notice.from_version} → ${notice.to_version})`;
}
