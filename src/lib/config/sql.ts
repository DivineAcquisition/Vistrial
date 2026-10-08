import {
  CONFIG_FIELDS,
  LAUNCH_COMPLIANCE_CHANGE,
  LEGACY_BANNED_TERMS,
  registryPlatformLocks,
  registryPlatformValues,
} from "@/lib/config/registry";
import { SEED_TEMPLATES } from "@/lib/config/seeds";
import {
  DISQUALIFIERS,
  LEAD_CHANNELS,
  OBJECTION_TYPES,
  OFFER_TYPES,
  QUALIFICATION_SIGNALS,
} from "@/lib/profile/vocabulary";
import type { FieldDef } from "@/lib/config/types";

/**
 * The SQL copy of the registry and seeds, embedded in the configuration
 * migration between the begin/end markers. A unit test regenerates it and
 * compares, so the database's field list can never drift from the code.
 */

export const BLOCK_BEGIN = "-- config-registry:begin (generated from src/lib/config; do not edit by hand)";
export const BLOCK_END = "-- config-registry:end";

function literal(text: string): string {
  return `'${text.replace(/'/g, "''")}'`;
}

function jsonLiteral(value: unknown): string {
  const json = JSON.stringify(value);
  if (json.includes("$cfg$")) throw new Error("configuration content may not contain $cfg$");
  return `$cfg$${json}$cfg$::jsonb`;
}

/** The parts of a field's rules the database checks itself. */
export function sqlRules(field: FieldDef): Record<string, unknown> {
  const rules = field.rules ?? {};
  const out: Record<string, unknown> = {};
  for (const key of ["min", "max", "integer", "minLength", "maxLength", "pattern", "minItems", "maxItems", "itemMaxLength", "valueType", "referenceKinds", "timezone", "uniqueBy"] as const) {
    if (rules[key] !== undefined) out[key] = rules[key];
  }
  if (rules.options) out.options = rules.options.map((option) => option.value);
  if (rules.keys) out.keys = rules.keys.map((option) => option.value);
  if (rules.itemFields) {
    out.itemFields = rules.itemFields.map((column) => ({
      key: column.key,
      type: column.type,
      ...(column.required ? { required: true } : {}),
      ...(column.options ? { options: column.options.map((option) => option.value) } : {}),
      ...(column.min !== undefined ? { min: column.min } : {}),
      ...(column.max !== undefined ? { max: column.max } : {}),
      ...(column.maxLength !== undefined ? { maxLength: column.maxLength } : {}),
    }));
  }
  return out;
}

export function generateConfigSql(): string {
  const lines: string[] = [BLOCK_BEGIN];

  lines.push(
    "INSERT INTO public.config_fields (key, section, field_type, label, required, workspace_only, default_lock, tighten, owner_editable, rules, sort_order) VALUES"
  );
  lines.push(
    CONFIG_FIELDS.map(
      (field, index) =>
        `  (${literal(field.key)}, ${literal(field.section)}, ${literal(field.type)}, ${literal(field.label)}, ${field.required ? "true" : "false"}, ${field.workspaceOnly ? "true" : "false"}, ${field.defaultLock ? "true" : "false"}, ${field.tighten ? literal(field.tighten) : "NULL"}, ${field.ownerEditable ? literal(field.ownerEditable) : "NULL"}, ${jsonLiteral(sqlRules(field))}, ${index + 1})`
    ).join(",\n") +
      "\nON CONFLICT (key) DO UPDATE SET section = EXCLUDED.section, field_type = EXCLUDED.field_type, label = EXCLUDED.label, required = EXCLUDED.required, workspace_only = EXCLUDED.workspace_only, default_lock = EXCLUDED.default_lock, tighten = EXCLUDED.tighten, owner_editable = EXCLUDED.owner_editable, rules = EXCLUDED.rules, sort_order = EXCLUDED.sort_order;"
  );

  // Plain-language labels for onboarding answers, so a business profile maps
  // into configuration as readable statements rather than codes.
  const labels = (choices: Array<{ value: string; label: string }>) =>
    Object.fromEntries(choices.map((choice) => [choice.value, choice.label]));
  lines.push(
    `CREATE OR REPLACE FUNCTION public.config_profile_labels() RETURNS jsonb LANGUAGE sql IMMUTABLE AS $fn$ SELECT ${jsonLiteral({
      signals: labels(QUALIFICATION_SIGNALS),
      disqualifiers: labels(DISQUALIFIERS),
      channels: labels(LEAD_CHANNELS),
      offer_types: labels(OFFER_TYPES),
      objection_types: labels(OBJECTION_TYPES),
    })} $fn$;`
  );

  // The words every draft avoided before this system; the legacy banned list
  // only ever added to them.
  lines.push(
    `CREATE OR REPLACE FUNCTION public.config_legacy_banned_terms() RETURNS text[] LANGUAGE sql IMMUTABLE AS $fn$ SELECT ARRAY[${LEGACY_BANNED_TERMS.map(literal).join(", ")}]::text[] $fn$;`
  );

  const locks = registryPlatformLocks();
  lines.push(
    `SELECT public.config_seed_platform(${jsonLiteral(registryPlatformValues())}, ARRAY[${locks.map(literal).join(", ")}]::text[], ${jsonLiteral(LAUNCH_COMPLIANCE_CHANGE.values)}, ${literal(LAUNCH_COMPLIANCE_CHANGE.note)});`
  );
  for (const template of SEED_TEMPLATES) {
    lines.push(
      `SELECT public.config_seed_template(${literal(template.slug)}, ${literal(template.name)}, ${literal(template.description)}, ${jsonLiteral(template.values)});`
    );
  }
  lines.push(BLOCK_END);
  return lines.join("\n");
}
