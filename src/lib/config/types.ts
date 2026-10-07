/**
 * The configuration system's vocabulary. One product serves many industries:
 * every value an agent or feature acts on resolves through three levels,
 *
 *   platform default  →  industry template  →  workspace override
 *
 * and the result records where each value came from. Nothing here touches the
 * database; the registry is pure data so the same definitions drive the
 * screens, validation, the resolver, and the SQL copy of the field list.
 */

export const CONFIG_SECTIONS = [
  "identity",
  "qualification",
  "response",
  "tone",
  "industry",
  "escalation",
  "approval",
  "integrations",
  "sources",
  "operators",
  "compliance",
] as const;
export type ConfigSection = (typeof CONFIG_SECTIONS)[number];

export type ConfigLevel = "platform" | "template" | "workspace";

export type FieldType =
  | "text"
  | "long_text"
  | "number"
  | "duration"
  | "boolean"
  | "choice"
  | "multi_choice"
  | "list"
  | "schedule"
  | "key_value"
  | "reference"
  | "time_window";

export type ChoiceOption = { value: string; label: string; hint?: string };

/** One column of a structured list item, for example an objection's "how to recognize it". */
export type ItemField = {
  key: string;
  label: string;
  type: "text" | "long_text" | "number" | "duration" | "boolean" | "choice" | "multi_choice";
  required?: boolean;
  options?: ChoiceOption[];
  min?: number;
  max?: number;
  maxLength?: number;
  help?: string;
};

/**
 * How a locked field may still be changed below its level. Compliance rules
 * are locked so a workspace can tighten them and never loosen them.
 */
export type TightenRule =
  | "lower_number"
  | "lower_number_zero_is_unlimited"
  | "superset_list"
  | "wider_window";

export type FieldRules = {
  min?: number;
  max?: number;
  integer?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  patternHint?: string;
  options?: ChoiceOption[];
  minItems?: number;
  maxItems?: number;
  /** Plain list of short texts when absent; structured rows when present. */
  itemFields?: ItemField[];
  /** Key for list rows that must be unique, e.g. an action type. */
  uniqueBy?: string;
  itemMaxLength?: number;
  /** key_value: the keys allowed, in display order. */
  keys?: ChoiceOption[];
  valueType?: "number" | "text";
  /** reference: what it may point at. */
  referenceKinds?: Array<"member" | "channel" | "integration">;
  /** choice: any IANA time zone name. */
  timezone?: boolean;
  /** duration: the unit shown to people. Stored as minutes. */
  displayUnit?: "minutes" | "hours" | "days";
};

export type FieldDef = {
  key: string;
  section: ConfigSection;
  label: string;
  /** Plain language, for the person editing it. */
  help: string;
  type: FieldType;
  rules?: FieldRules;
  /** A workspace cannot go live until this has a value somewhere in the chain. */
  required?: boolean;
  /** Only a workspace can hold this (business name, contacts); templates never do. */
  workspaceOnly?: boolean;
  /** Locked at the platform level unless a Platform Admin unlocks it. */
  defaultLock?: boolean;
  tighten?: TightenRule;
  /** Workspace Owners may edit it: always, or only when the Service Team allows. */
  ownerEditable?: "always" | "when_allowed";
  /** The platform default. Absent means a template or workspace must supply it. */
  platformDefault?: ConfigValue;
};

export type ConfigValue =
  | string
  | number
  | boolean
  | null
  | ConfigValue[]
  | { [key: string]: ConfigValue };

export type ConfigValues = Record<string, ConfigValue>;

/** One level as stored: its sparse values and the fields it locks for the levels below. */
export type LayerSnapshot = {
  values: ConfigValues;
  lockedKeys: string[];
  version: number;
};

export type ValueSource = "platform" | "template" | "workspace" | "missing";

export type ResolvedField = {
  key: string;
  value: ConfigValue | undefined;
  source: ValueSource;
  /** The level that locks this field, if any. */
  lockedAt: "platform" | "template" | null;
  /** A locked field that a lower level made stricter. */
  tightened: boolean;
  /** An override that a lock ignored, kept so the screen can explain it. */
  ignoredOverride?: { level: "template" | "workspace"; reason: string };
};

export type ConfigIssue = {
  key: string;
  /** Plain language: what is wrong and how to fix it. */
  message: string;
  kind: "missing" | "invalid";
};

export type EffectiveConfig = {
  values: ConfigValues;
  fields: Record<string, ResolvedField>;
  /** Missing required fields and validation problems. Empty when ready. */
  issues: ConfigIssue[];
  /** Identifies exactly which levels produced this result. Recorded on every run and draft. */
  version: string;
  templateSlug: string | null;
};
