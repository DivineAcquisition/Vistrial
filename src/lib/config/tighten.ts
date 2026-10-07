import type { ConfigValue, TightenRule } from "@/lib/config/types";

/** Minutes since midnight for "HH:MM", or null. */
export function minutesOfDay(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = value.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/** The minutes of the day a quiet window covers, as a set of minute indexes. */
export function windowMinutes(window: unknown): Set<number> | null {
  if (!window || typeof window !== "object" || Array.isArray(window)) return null;
  const start = minutesOfDay((window as Record<string, unknown>).start);
  const end = minutesOfDay((window as Record<string, unknown>).end);
  if (start === null || end === null || start === end) return null;
  const covered = new Set<number>();
  for (let minute = start; minute !== end; minute = (minute + 1) % 1440) covered.add(minute);
  return covered;
}

function normalizedSet(value: unknown): Set<string> | null {
  if (!Array.isArray(value)) return null;
  return new Set(value.map((item) => String(item).trim().toLowerCase()));
}

/**
 * Whether `candidate` is at least as strict as `baseline` under a locked
 * field's tighten rule. Equal counts as allowed: an override that changes
 * nothing loosens nothing.
 */
export function isAtLeastAsStrict(rule: TightenRule, baseline: ConfigValue | undefined, candidate: ConfigValue): boolean {
  if (baseline === undefined || baseline === null) return true;
  switch (rule) {
    case "lower_number":
      return typeof candidate === "number" && typeof baseline === "number" && candidate <= baseline;
    case "lower_number_zero_is_unlimited": {
      if (typeof candidate !== "number" || typeof baseline !== "number") return false;
      if (baseline === 0) return true;
      return candidate !== 0 && candidate <= baseline;
    }
    case "superset_list": {
      const base = normalizedSet(baseline);
      const next = normalizedSet(candidate);
      if (!base || !next) return false;
      for (const item of base) if (!next.has(item)) return false;
      return true;
    }
    case "wider_window": {
      const base = windowMinutes(baseline);
      const next = windowMinutes(candidate);
      if (!base || !next) return false;
      for (const minute of base) if (!next.has(minute)) return false;
      return true;
    }
  }
}

export function tightenExplanation(rule: TightenRule): string {
  switch (rule) {
    case "lower_number":
    case "lower_number_zero_is_unlimited":
      return "This rule is locked. You can lower the limit, but not raise it.";
    case "superset_list":
      return "This rule is locked. You can add to the list, but not remove anything from it.";
    case "wider_window":
      return "This rule is locked. You can make the quiet window longer, but not shorter.";
  }
}
