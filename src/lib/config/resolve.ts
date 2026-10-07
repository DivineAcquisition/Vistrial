import { CONFIG_FIELDS } from "@/lib/config/registry";
import { isAtLeastAsStrict, tightenExplanation } from "@/lib/config/tighten";
import { isMissing, missingRequired, validateCrossField, validateFieldValue } from "@/lib/config/validate";
import type {
  ConfigIssue,
  ConfigValue,
  ConfigValues,
  EffectiveConfig,
  LayerSnapshot,
  ResolvedField,
} from "@/lib/config/types";

export type ResolveInput = {
  platform: LayerSnapshot;
  template: (LayerSnapshot & { slug: string }) | null;
  workspace: LayerSnapshot | null;
  /** False when resolving a template on its own, e.g. for its preview. */
  includeWorkspaceOnly?: boolean;
};

/**
 * One field through the three levels. The rules:
 * - a workspace override beats the template, which beats the platform default;
 * - a field locked at a level ignores the levels below it, except that a
 *   locked field with a tighten rule takes a stricter value from below.
 */
function resolveField(key: string, input: ResolveInput): ResolvedField {
  const field = CONFIG_FIELDS.find((entry) => entry.key === key)!;
  const platformValue = input.platform.values[key];
  const templateValue = input.template?.values[key];
  const workspaceValue = input.workspace?.values[key];
  const lockedAt = input.platform.lockedKeys.includes(key)
    ? "platform"
    : input.template?.lockedKeys.includes(key)
      ? "template"
      : null;

  if (lockedAt === "platform" || lockedAt === "template") {
    let value: ConfigValue | undefined = lockedAt === "platform" ? platformValue : templateValue ?? platformValue;
    let source: ResolvedField["source"] = lockedAt === "platform" || templateValue === undefined ? "platform" : "template";
    let tightened = false;
    let ignoredOverride: ResolvedField["ignoredOverride"];

    const lowerLevels: Array<["template" | "workspace", ConfigValue | undefined]> =
      lockedAt === "platform" ? [["template", templateValue], ["workspace", workspaceValue]] : [["workspace", workspaceValue]];
    for (const [level, candidate] of lowerLevels) {
      if (candidate === undefined) continue;
      if (field.tighten && isAtLeastAsStrict(field.tighten, value, candidate)) {
        value = candidate;
        source = level;
        tightened = true;
      } else {
        ignoredOverride = {
          level,
          reason: field.tighten ? tightenExplanation(field.tighten) : "This setting is locked above this level.",
        };
      }
    }
    return { key, value, source: value === undefined ? "missing" : source, lockedAt, tightened, ignoredOverride };
  }

  if (workspaceValue !== undefined) return { key, value: workspaceValue, source: "workspace", lockedAt: null, tightened: false };
  if (templateValue !== undefined) return { key, value: templateValue, source: "template", lockedAt: null, tightened: false };
  if (platformValue !== undefined) return { key, value: platformValue, source: "platform", lockedAt: null, tightened: false };
  return { key, value: undefined, source: "missing", lockedAt: null, tightened: false };
}

/** Deterministic JSON: object keys sorted, so equal configurations hash equally. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.keys(value as Record<string, unknown>)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`);
  return `{${entries.join(",")}}`;
}

/** FNV-1a, 32-bit, as hex. Enough to tell two resolved configurations apart in a log. */
export function shortHash(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * The version stamp recorded on every run and draft: which version of each
 * level produced the configuration. It matches the database's own stamp
 * (config_version_stamp), so a run written by SQL and one written by the app
 * can be compared directly.
 */
export function versionStamp(input: ResolveInput): string {
  const template = input.template ? `${input.template.slug}@${input.template.version}` : "none";
  return `p${input.platform.version}.t:${template}.w${input.workspace?.version ?? 0}`;
}

export function resolveConfig(input: ResolveInput): EffectiveConfig {
  const fields: Record<string, ResolvedField> = {};
  const values: ConfigValues = {};
  for (const field of CONFIG_FIELDS) {
    const resolved = resolveField(field.key, input);
    fields[field.key] = resolved;
    if (resolved.value !== undefined) values[field.key] = resolved.value;
  }

  const issues: ConfigIssue[] = [];
  issues.push(...missingRequired(values, { includeWorkspaceOnly: input.includeWorkspaceOnly ?? true }));
  for (const field of CONFIG_FIELDS) {
    if (isMissing(field, values[field.key])) continue;
    for (const message of validateFieldValue(field, values[field.key])) {
      issues.push({ key: field.key, message, kind: "invalid" });
    }
  }
  issues.push(...validateCrossField(values));

  return {
    values,
    fields,
    issues,
    version: versionStamp(input),
    templateSlug: input.template?.slug ?? null,
  };
}

/** The values a workspace should store: only what differs from what it would inherit. */
export function sparseOverrides(
  desired: ConfigValues,
  inherited: ConfigValues
): { set: ConfigValues; unchanged: string[] } {
  const set: ConfigValues = {};
  const unchanged: string[] = [];
  for (const [key, value] of Object.entries(desired)) {
    if (stableStringify(value) === stableStringify(inherited[key])) unchanged.push(key);
    else set[key] = value;
  }
  return { set, unchanged };
}

/** Field-by-field difference between two sets of values, for history and review notices. */
export function diffValues(before: ConfigValues, after: ConfigValues): Array<{ key: string; before: ConfigValue | undefined; after: ConfigValue | undefined }> {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changes: Array<{ key: string; before: ConfigValue | undefined; after: ConfigValue | undefined }> = [];
  for (const key of [...keys].sort()) {
    if (stableStringify(before[key]) !== stableStringify(after[key])) {
      changes.push({ key, before: before[key], after: after[key] });
    }
  }
  return changes;
}
