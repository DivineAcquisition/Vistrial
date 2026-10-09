import { APPROVAL_ACTIONS, CONFIG_FIELDS, FIELD_BY_KEY, WEEKDAYS } from "@/lib/config/registry";
import { isAtLeastAsStrict, minutesOfDay, tightenExplanation, windowMinutes } from "@/lib/config/tighten";
import type { ConfigIssue, ConfigValue, ConfigValues, FieldDef, ItemField } from "@/lib/config/types";

/**
 * Validation for the configuration system. Every message says what is wrong
 * and how to fix it, in words the person editing can act on.
 */

const SECRET_PATTERNS: RegExp[] = [
  /\b(sk|pk|rk)_(live|test)_[A-Za-z0-9]{8,}/,
  /\bxox[abprs]-[A-Za-z0-9-]{8,}/,
  /hooks\.slack\.com\/services\//i,
  /discord(app)?\.com\/api\/webhooks\//i,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{20,}/,
  /\bAIza[0-9A-Za-z_-]{30,}/,
];

export const SECRET_MESSAGE =
  "This looks like a password, key, or private link. Never put those in settings: connect the service on the Integrations page, where it is stored encrypted.";

export function looksLikeSecret(text: string): boolean {
  return SECRET_PATTERNS.some((pattern) => pattern.test(text));
}

function containsSecret(value: unknown): boolean {
  if (typeof value === "string") return looksLikeSecret(value);
  if (Array.isArray(value)) return value.some(containsSecret);
  if (value && typeof value === "object") return Object.values(value).some(containsSecret);
  return false;
}

let timezoneCache: Set<string> | null = null;
export function isValidTimeZone(value: string): boolean {
  if (!timezoneCache) {
    try {
      timezoneCache = new Set(Intl.supportedValuesOf("timeZone"));
      timezoneCache.add("UTC");
    } catch {
      timezoneCache = new Set();
    }
  }
  if (timezoneCache.has(value)) return true;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const PHONE = /^\+?[0-9 ().-]{7,20}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function quote(label: string) {
  return `“${label}”`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function checkNumber(label: string, value: unknown, rules: { min?: number; max?: number; integer?: boolean }): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return `Enter a number for ${label}.`;
  if (rules.integer && !Number.isInteger(value)) return `Use a whole number for ${label}.`;
  if (rules.min !== undefined && rules.max !== undefined && (value < rules.min || value > rules.max)) {
    return `Enter a number from ${rules.min} to ${rules.max} for ${label}.`;
  }
  if (rules.min !== undefined && value < rules.min) return `${capitalize(label)} must be at least ${rules.min}.`;
  if (rules.max !== undefined && value > rules.max) return `${capitalize(label)} can be at most ${rules.max}.`;
  return null;
}

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function checkItem(fieldLabel: string, index: number, item: unknown, itemFields: ItemField[]): string[] {
  const where = `Row ${index + 1} of ${quote(fieldLabel)}`;
  if (!isPlainObject(item)) return [`${where} is not filled in correctly. Remove it and add it again.`];
  const errors: string[] = [];
  for (const column of itemFields) {
    const value = item[column.key];
    const empty = value === undefined || value === null || (typeof value === "string" && value.trim() === "") ||
      (Array.isArray(value) && value.length === 0);
    if (empty) {
      if (column.required) errors.push(`${where} needs ${quote(column.label)}.`);
      continue;
    }
    const label = `${quote(column.label)} in row ${index + 1}`;
    switch (column.type) {
      case "text":
      case "long_text":
        if (typeof value !== "string") errors.push(`${capitalize(label)} must be text.`);
        else if (column.maxLength && value.length > column.maxLength) {
          errors.push(`${capitalize(label)} is too long. Keep it under ${column.maxLength} characters.`);
        }
        break;
      case "number":
      case "duration": {
        const problem = checkNumber(label, value, { min: column.min, max: column.max });
        if (problem) errors.push(problem);
        break;
      }
      case "boolean":
        if (typeof value !== "boolean") errors.push(`${capitalize(label)} must be yes or no.`);
        break;
      case "choice":
        if (!column.options?.some((option) => option.value === value)) {
          errors.push(`Choose one of the listed options for ${label}.`);
        }
        break;
      case "multi_choice":
        if (!Array.isArray(value) || value.some((entry) => !column.options?.some((option) => option.value === entry))) {
          errors.push(`Choose only listed options for ${label}.`);
        }
        break;
    }
  }
  return errors;
}

function checkSchedule(label: string, value: unknown): string[] {
  if (!isPlainObject(value) || !isPlainObject(value.days)) {
    return [`Set the hours for each day in ${quote(label)}.`];
  }
  const errors: string[] = [];
  let openDays = 0;
  for (const day of WEEKDAYS) {
    const intervals = (value.days as Record<string, unknown>)[day.value];
    if (intervals === undefined) continue;
    if (!Array.isArray(intervals)) {
      errors.push(`${day.label} hours are not set correctly in ${quote(label)}.`);
      continue;
    }
    const spans: Array<[number, number]> = [];
    for (const interval of intervals) {
      const start = isPlainObject(interval) ? minutesOfDay(interval.start) : null;
      const end = isPlainObject(interval) ? minutesOfDay(interval.end) : null;
      if (start === null || end === null) {
        errors.push(`Use times like 09:00 for ${day.label} in ${quote(label)}.`);
        continue;
      }
      if (end <= start) {
        errors.push(`On ${day.label}, the closing time must be after the opening time.`);
        continue;
      }
      spans.push([start, end]);
    }
    spans.sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < spans.length; i += 1) {
      if (spans[i][0] < spans[i - 1][1]) errors.push(`${day.label} has overlapping hours. Merge them into one.`);
    }
    if (spans.length > 0) openDays += 1;
  }
  if (openDays === 0 && errors.length === 0) {
    errors.push(`${quote(label)} needs at least one open day.`);
  }
  if (value.closures !== undefined) {
    if (!Array.isArray(value.closures)) errors.push(`Closed dates in ${quote(label)} are not set correctly.`);
    else {
      value.closures.forEach((closure, index) => {
        if (!isPlainObject(closure) || typeof closure.date !== "string" || !DATE.test(closure.date)) {
          errors.push(`Closed date ${index + 1} needs a date like 2026-12-25.`);
        }
      });
      if (value.closures.length > 60) errors.push(`Keep closed dates to 60 or fewer.`);
    }
  }
  return errors;
}

/** Problems with one field's own value. Missing values are not checked here. */
export function validateFieldValue(field: FieldDef, value: ConfigValue | undefined): string[] {
  if (value === undefined || value === null) return [];
  const rules = field.rules ?? {};
  const label = quote(field.label);
  if (containsSecret(value)) return [SECRET_MESSAGE];

  switch (field.type) {
    case "text":
    case "long_text": {
      if (typeof value !== "string") return [`${label} must be text.`];
      const errors: string[] = [];
      if (rules.minLength && value.trim().length > 0 && value.trim().length < rules.minLength) {
        errors.push(`${label} is too short. Use at least ${rules.minLength} characters.`);
      }
      if (rules.maxLength && value.length > rules.maxLength) {
        errors.push(`${label} is too long. Keep it under ${rules.maxLength} characters.`);
      }
      if (rules.pattern && !new RegExp(rules.pattern).test(value)) {
        errors.push(rules.patternHint ?? `${label} is not in the expected format.`);
      }
      return errors;
    }
    case "number":
    case "duration": {
      const problem = checkNumber(label, value, rules);
      return problem ? [problem] : [];
    }
    case "boolean":
      return typeof value === "boolean" ? [] : [`${label} must be yes or no.`];
    case "choice": {
      if (typeof value !== "string") return [`Choose an option for ${label}.`];
      if (rules.timezone) return isValidTimeZone(value) ? [] : [`${label}: choose a time zone from the list, like America/Chicago.`];
      return rules.options?.some((option) => option.value === value) ? [] : [`Choose one of the listed options for ${label}.`];
    }
    case "multi_choice": {
      if (!Array.isArray(value)) return [`Choose options for ${label}.`];
      const errors: string[] = [];
      if (value.some((entry) => !rules.options?.some((option) => option.value === entry))) {
        errors.push(`Choose only listed options for ${label}.`);
      }
      if (new Set(value).size !== value.length) errors.push(`${label} lists the same option twice.`);
      if (rules.minItems && value.length < rules.minItems) {
        errors.push(`Choose at least ${rules.minItems} for ${label}.`);
      }
      return errors;
    }
    case "list": {
      if (!Array.isArray(value)) return [`${label} must be a list.`];
      const errors: string[] = [];
      if (rules.minItems && value.length < rules.minItems) {
        errors.push(`Add at least ${rules.minItems} ${rules.minItems === 1 ? "entry" : "entries"} to ${label}.`);
      }
      if (rules.maxItems && value.length > rules.maxItems) {
        errors.push(`${label} can hold at most ${rules.maxItems} entries. Remove some.`);
      }
      if (rules.itemFields) {
        value.forEach((item, index) => errors.push(...checkItem(field.label, index, item, rules.itemFields ?? [])));
        if (rules.uniqueBy) {
          const seen = new Set<string>();
          for (const item of value) {
            if (!isPlainObject(item)) continue;
            const id = String(item[rules.uniqueBy] ?? "").trim().toLowerCase();
            if (!id) continue;
            if (seen.has(id)) {
              const column = rules.itemFields.find((entry) => entry.key === rules.uniqueBy);
              errors.push(`${label} lists ${quote(String(item[rules.uniqueBy]))} twice. Each ${column?.label.toLowerCase() ?? "entry"} can appear once.`);
            }
            seen.add(id);
          }
        }
      } else {
        const seen = new Set<string>();
        value.forEach((item, index) => {
          if (typeof item !== "string" || item.trim() === "") {
            errors.push(`Entry ${index + 1} in ${label} is empty. Fill it in or remove it.`);
            return;
          }
          if (rules.itemMaxLength && item.length > rules.itemMaxLength) {
            errors.push(`Entry ${index + 1} in ${label} is too long. Keep entries under ${rules.itemMaxLength} characters.`);
          }
          const id = item.trim().toLowerCase();
          if (seen.has(id)) errors.push(`${label} lists ${quote(item.trim())} twice.`);
          seen.add(id);
        });
      }
      return errors;
    }
    case "schedule":
      return checkSchedule(field.label, value);
    case "key_value": {
      if (!isPlainObject(value)) return [`${label} is not set correctly.`];
      const errors: string[] = [];
      const allowed = rules.keys?.map((key) => key.value);
      for (const [key, entry] of Object.entries(value)) {
        const keyLabel = rules.keys?.find((option) => option.value === key)?.label ?? key;
        if (allowed && !allowed.includes(key)) {
          errors.push(`${label} has an entry Vistrial does not recognize (${quote(key)}). Remove it.`);
          continue;
        }
        if (entry === null || entry === "") continue;
        if (rules.valueType === "number") {
          const problem = checkNumber(`${quote(keyLabel)} in ${label}`, entry, { min: rules.min, max: rules.max, integer: true });
          if (problem) errors.push(problem);
        } else if (typeof entry !== "string") {
          errors.push(`${quote(keyLabel)} in ${label} must be text.`);
        } else if (key === "email" && !EMAIL.test(entry)) {
          errors.push(`Enter a valid email address for ${quote(keyLabel)} in ${label}.`);
        } else if (key === "phone" && !PHONE.test(entry)) {
          errors.push(`Enter a phone number with digits only, like +1 555 123 4567, for ${label}.`);
        } else if (entry.length > 200) {
          errors.push(`${quote(keyLabel)} in ${label} is too long.`);
        }
      }
      return errors;
    }
    case "reference": {
      if (!isPlainObject(value)) return [`${label} is not set correctly. Choose it again.`];
      if (typeof value.id !== "string" || value.id.trim() === "") return [`Choose what ${label} points to.`];
      if (rules.referenceKinds && !rules.referenceKinds.includes(value.kind as never)) {
        return [`${label} can only point to ${rules.referenceKinds.join(" or ")}.`];
      }
      return [];
    }
    case "time_window": {
      if (!isPlainObject(value)) return [`Set a start and end time for ${label}.`];
      if (minutesOfDay(value.start) === null || minutesOfDay(value.end) === null) {
        return [`Use times like 20:00 and 08:00 for ${label}.`];
      }
      if (value.start === value.end) {
        return [`${label} would cover the whole day or none of it. Use different start and end times.`];
      }
      return [];
    }
  }
}

function isEmptyValue(value: ConfigValue | undefined): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  if (isPlainObject(value)) return Object.values(value).every((entry) => entry === null || entry === "");
  return false;
}

export function isMissing(field: FieldDef, value: ConfigValue | undefined): boolean {
  if (field.type === "boolean" || field.type === "number" || field.type === "duration") {
    return value === undefined || value === null;
  }
  return isEmptyValue(value);
}

const asList = (value: ConfigValue | undefined): Array<Record<string, ConfigValue>> =>
  Array.isArray(value) ? (value.filter(isPlainObject) as Array<Record<string, ConfigValue>>) : [];

/**
 * Checks that span several fields. Run on resolved values, so a template plus
 * a workspace's overrides is judged as one configuration.
 */
export function validateCrossField(values: ConfigValues): ConfigIssue[] {
  const issues: ConfigIssue[] = [];
  const add = (key: string, message: string) => issues.push({ key, message, kind: "invalid" });

  const goingQuiet = values["sources.forsight_quiet_days"];
  const silent = values["sources.forsight_silent_days"];
  const longSilent = values["sources.forsight_long_silent_days"];
  if (typeof goingQuiet === "number" && typeof silent === "number" && silent <= goingQuiet) {
    add("sources.forsight_silent_days", "Silent must be longer than going quiet.");
  }
  if (typeof silent === "number" && typeof longSilent === "number" && longSilent <= silent) {
    add("sources.forsight_long_silent_days", "Long silent must be longer than silent.");
  }

  const weights = values["qualification.factor_weights"];
  if (isPlainObject(weights)) {
    const total = Object.values(weights).reduce<number>((sum, entry) => sum + (typeof entry === "number" ? entry : 0), 0);
    if (total !== 100) {
      add("qualification.factor_weights", `The factor shares add up to ${total}. Change them so they add up to exactly 100.`);
    }
  }

  const bands = asList(values["qualification.scoring_bands"]);
  if (bands.length > 0) {
    const mins = bands.map((band) => Number(band.min_score));
    const sorted = [...mins].sort((a, b) => a - b);
    if (sorted[0] !== 0) add("qualification.scoring_bands", "The first score band must start at 0, so every score has a meaning.");
    if (new Set(mins).size !== mins.length) {
      add("qualification.scoring_bands", "Two score bands start at the same score. Give each band its own starting score.");
    }
    const threshold = values["qualification.ready_threshold"];
    if (typeof threshold === "number" && !mins.includes(threshold)) {
      add(
        "qualification.ready_threshold",
        `"Ready from score" is ${threshold}, but no score band starts there. Start a band at ${threshold}, or change the score to match a band.`
      );
    }
  }

  const facts = new Set(asList(values["industry.case_facts"]).map((fact) => String(fact.key)));
  const minimum = values["qualification.minimum_info"];
  if (Array.isArray(minimum)) {
    const unknown = minimum.map(String).filter((key) => !facts.has(key));
    if (unknown.length > 0) {
      add(
        "qualification.minimum_info",
        `"Must know before qualifying" names ${unknown.map((key) => `"${key}"`).join(", ")}, which ${unknown.length === 1 ? "is" : "are"} not in Case-file facts. Add ${unknown.length === 1 ? "it" : "them"} there or remove ${unknown.length === 1 ? "it" : "them"} here.`
      );
    }
  }
  for (const fact of asList(values["industry.case_facts"])) {
    if (typeof fact.key === "string" && !/^[a-z][a-z0-9_]{1,59}$/.test(fact.key)) {
      add("industry.case_facts", `The key "${fact.key}" should be lowercase letters, numbers, and underscores, like treatment_interest.`);
    }
  }
  for (const offer of asList(values["industry.offers"])) {
    if (typeof offer.ticket_min === "number" && typeof offer.ticket_max === "number" && offer.ticket_min > offer.ticket_max) {
      add("industry.offers", `For "${offer.name}", the lowest price is above the highest. Swap them.`);
    }
  }

  const soft = values["response.ghost_days_soft"];
  const hard = values["response.ghost_days_hard"];
  if (typeof soft === "number" && typeof hard === "number" && soft >= hard) {
    add("response.ghost_days_hard", `"Gone quiet after" (${hard} days) must be longer than "Going quiet after" (${soft} days).`);
  }
  const firstTouch = values["response.first_touch_minutes"];
  const cadence = asList(values["response.follow_up_cadence"]);
  if (typeof firstTouch === "number" && cadence.length > 0) {
    const shortest = Math.min(...cadence.map((step) => Number(step.max_gap_hours) * 60));
    if (firstTouch >= shortest) {
      add(
        "response.follow_up_cadence",
        `The first touch window (${firstTouch} minutes) is not shorter than the shortest follow-up gap (${shortest / 60} hours). The first touch should always come sooner. Shorten the first touch window or lengthen that gap.`
      );
    }
  }
  if (values["response.after_hours"] === "separate_window") {
    const afterHours = values["response.after_hours_window_minutes"];
    if (typeof afterHours !== "number") {
      add("response.after_hours_window_minutes", "Set the after-hours window, because the clock uses a longer window after hours.");
    } else if (typeof firstTouch === "number" && afterHours < firstTouch) {
      add("response.after_hours_window_minutes", "The after-hours window should be at least as long as the normal first-touch window.");
    }
  }

  const banned = new Set((Array.isArray(values["tone.banned_terms"]) ? values["tone.banned_terms"] : []).map((term) => String(term).toLowerCase()));
  const clash = (Array.isArray(values["tone.preferred_terms"]) ? values["tone.preferred_terms"] : [])
    .map(String)
    .filter((term) => banned.has(term.toLowerCase()));
  if (clash.length > 0) {
    add("tone.preferred_terms", `${clash.map((term) => `"${term}"`).join(", ")} ${clash.length === 1 ? "is" : "are"} both preferred and banned. Remove ${clash.length === 1 ? "it" : "them"} from one list.`);
  }
  const sms = values["tone.sms_max_chars"];
  const email = values["tone.email_max_chars"];
  if (typeof sms === "number" && typeof email === "number" && sms > email) {
    add("tone.sms_max_chars", "The longest text is longer than the longest email. Texts should be the shorter of the two.");
  }
  asList(values["tone.examples"]).forEach((example, index) => {
    const limit = example.channel === "sms" ? sms : email;
    if (typeof limit === "number" && typeof example.body === "string" && example.body.length > limit * 1.25) {
      add("tone.examples", `Example ${index + 1} is much longer than the ${example.channel === "sms" ? "text" : "email"} limit (${limit} characters). Shorten it so it shows the real voice.`);
    }
  });

  const neverAuto = new Set((Array.isArray(values["approval.never_auto"]) ? values["approval.never_auto"] : []).map(String));
  const reachesPeople = new Set(APPROVAL_ACTIONS.filter((item) => item.reachesPeople).map((item) => item.value));
  for (const action of asList(values["approval.actions"])) {
    if (action.mode !== "auto_run") continue;
    if (reachesPeople.has(String(action.action))) {
      add("approval.actions", `"${labelForAction(String(action.action))}" reaches a lead or client, so a person always approves it. Set it to "Ask first".`);
    } else if (neverAuto.has(String(action.action))) {
      add("approval.actions", `"${labelForAction(String(action.action))}" always needs approval and cannot proceed without it. Set it to "Ask first".`);
    } else if (action.auto_run_confirmed !== true) {
      add("approval.actions", `"${labelForAction(String(action.action))}" is set to proceed without approval. Tick the confirmation on that row to accept this, or set it to "Ask first".`);
    }
  }
  if (values["approval.timeout_behavior"] === "proceed" && values["approval.timeout_proceed_confirmed"] !== true) {
    add("approval.timeout_proceed_confirmed", "Waiting items are set to proceed without approval. Confirm that you understand, or choose a safer option.");
  }

  const mode = values["operators.assignment_mode"];
  if (mode === "by_source" && asList(values["industry.lead_sources"]).length === 0) {
    add("operators.assignment_mode", "Assigning by lead source needs at least one lead source in Industry fields.");
  }
  if (mode === "by_service" && asList(values["industry.offers"]).length === 0) {
    add("operators.assignment_mode", "Assigning by service type needs at least one offer in Industry fields.");
  }

  const quiet = windowMinutes(values["compliance.quiet_hours"]);
  if (quiet && quiet.size >= 1440 - 60) {
    add("compliance.quiet_hours", "Quiet hours leave less than an hour a day for messages. Shorten them so messages can still go out.");
  }

  const sources = new Set((Array.isArray(values["sources.allowed"]) ? values["sources.allowed"] : []).map(String));
  for (const excluded of asList(values["sources.excluded"])) {
    if (sources.has(String(excluded.source))) {
      add("sources.excluded", `"${excluded.source}" is both allowed and excluded. Remove it from "Agents may read" to exclude it.`);
    }
  }
  const retention = values["sources.retention_days"];
  if (isPlainObject(retention) && typeof retention.call_transcripts === "number" && retention.call_transcripts > 1095) {
    add("sources.retention_days", "Call transcripts can be kept for at most 1,095 days (three years).");
  }

  return issues;
}

function labelForAction(value: string): string {
  const field = FIELD_BY_KEY["approval.actions"];
  const options = field.rules?.itemFields?.find((column) => column.key === "action")?.options ?? [];
  return options.find((option) => option.value === value)?.label ?? value;
}

/**
 * Validate a level's own values before saving. A draft may be incomplete; it
 * may never be invalid. Locked fields may only be tightened.
 */
export function validateLayerValues(
  values: ConfigValues,
  options: {
    level: "platform" | "template" | "workspace";
    /** Values and locks from the levels above, to judge locked fields against. */
    inheritedLocked?: Record<string, ConfigValue | undefined>;
  }
): ConfigIssue[] {
  const issues: ConfigIssue[] = [];
  for (const [key, value] of Object.entries(values)) {
    const field = FIELD_BY_KEY[key];
    if (!field) {
      issues.push({ key, message: `"${key}" is not a setting Vistrial knows about. Remove it.`, kind: "invalid" });
      continue;
    }
    if (field.workspaceOnly && options.level !== "workspace") {
      issues.push({ key, message: `${quote(field.label)} belongs to each workspace and cannot be set in a template or the platform default.`, kind: "invalid" });
      continue;
    }
    for (const message of validateFieldValue(field, value)) issues.push({ key, message, kind: "invalid" });
    if (options.inheritedLocked && key in options.inheritedLocked) {
      const baseline = options.inheritedLocked[key];
      if (!field.tighten) {
        issues.push({ key, message: `${quote(field.label)} is locked above this level and cannot be changed here.`, kind: "invalid" });
      } else if (!isAtLeastAsStrict(field.tighten, baseline, value)) {
        issues.push({ key, message: tightenExplanation(field.tighten), kind: "invalid" });
      }
    }
  }
  return issues;
}

/** Every required field with no value, as a plain-language checklist entry. */
export function missingRequired(values: ConfigValues, options: { includeWorkspaceOnly: boolean }): ConfigIssue[] {
  return CONFIG_FIELDS.filter((field) => field.required && (options.includeWorkspaceOnly || !field.workspaceOnly))
    .filter((field) => isMissing(field, values[field.key]))
    .map((field) => ({
      key: field.key,
      kind: "missing" as const,
      message: `${quote(field.label)} is required before going live. ${field.help}`,
    }));
}
