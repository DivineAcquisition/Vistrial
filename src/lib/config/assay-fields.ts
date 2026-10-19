import { APPROVED_INPUTS } from "@/lib/assay/inputs";
import { ASSAY_PLATFORM_DEFAULTS } from "@/lib/assay/templates";
import { CALL_SIGNALS, ENGAGEMENT_RULE_KINDS } from "@/lib/assay/vocabulary";
import type { ChoiceOption, FieldDef } from "@/lib/config/types";

/**
 * Assay's rules in the configuration system. Staff edit them per workspace or
 * per template; Owners only read them. None of these fields is owner-editable.
 */

const INPUT_OPTIONS: ChoiceOption[] = APPROVED_INPUTS.map((input) => ({ value: input.key, label: input.label }));

const OP_OPTIONS: ChoiceOption[] = [
  { value: "is_true", label: "Is yes" },
  { value: "is_false", label: "Is no" },
  { value: "gte", label: "Is at least" },
  { value: "lte", label: "Is at most" },
  { value: "equals", label: "Equals" },
  { value: "source_quality", label: "How this source has converted" },
];

const KIND_LABELS: Record<(typeof ENGAGEMENT_RULE_KINDS)[number], string> = {
  replied: "Replied",
  called_back: "Called back",
  form_submitted: "Filled in a form",
  quote_requested: "Asked for a quote",
  pricing_asked: "Asked about pricing",
  application_submitted: "Submitted an application",
  deposit_paid: "Paid a deposit",
  quote_viewed: "Opened a quote",
  materials_opened: "Opened materials",
  booked: "Booked",
  rescheduled_by_lead: "Rescheduled",
  canceled: "Canceled a booking",
  no_show: "Missed a booking",
  meeting_completed: "Completed a meeting",
  stage_forward: "Moved forward in the pipeline",
  stage_back: "Moved back in the pipeline",
  reopened: "Came back after closing",
  replied_fast: "Replied quickly to the team",
  two_way: "Several replies in a window",
  no_reply: "No reply after the team reached out",
};

const KIND_OPTIONS: ChoiceOption[] = ENGAGEMENT_RULE_KINDS.map((kind) => ({ value: kind, label: KIND_LABELS[kind] }));

const SIGNAL_OPTIONS: ChoiceOption[] = (Object.keys(CALL_SIGNALS) as Array<keyof typeof CALL_SIGNALS>).map((signal) => ({
  value: signal,
  label: signal.replaceAll("_", " "),
}));

const POINTS = { key: "points", label: "Points", type: "number", required: true, min: -100, max: 100 } as const;
const REASON = { key: "reason", label: "Reason shown to people", type: "text", required: true, maxLength: 160 } as const;
const ENABLED = { key: "enabled", label: "On", type: "boolean" } as const;
const RULE_ID = { key: "id", label: "Rule id", type: "text", required: true, maxLength: 60 } as const;

function def(key: string): FieldDef["platformDefault"] {
  return ASSAY_PLATFORM_DEFAULTS[key];
}

function number(key: string, label: string, help: string, min: number, max: number): FieldDef {
  return { key, section: "assay", label, help, type: "number", rules: { min, max, integer: true }, platformDefault: def(key) };
}

function toggle(key: string, label: string, help: string): FieldDef {
  return { key, section: "assay", label, help, type: "boolean", platformDefault: def(key) };
}

export const ASSAY_FIELDS: FieldDef[] = [
  {
    key: "assay.weights",
    section: "assay",
    label: "How much each part counts",
    help: "Fit, engagement, and call signals. With no call yet, the call share is split between the other two.",
    type: "key_value",
    rules: {
      keys: [
        { value: "fit", label: "Fit" },
        { value: "engagement", label: "Engagement" },
        { value: "call", label: "Call signals" },
      ],
      valueType: "number",
      min: 10,
      max: 60,
    },
    platformDefault: def("assay.weights"),
  },
  {
    key: "assay.tiers",
    section: "assay",
    label: "Tier lines",
    help: "The score where Hot, Warm, and Cool start. Below Cool is Cold.",
    type: "key_value",
    rules: {
      keys: [
        { value: "hot", label: "Hot from" },
        { value: "warm", label: "Warm from" },
        { value: "cool", label: "Cool from" },
      ],
      valueType: "number",
      min: 1,
      max: 100,
    },
    platformDefault: def("assay.tiers"),
  },
  number("assay.tier_stickiness", "Points below a line before a lead drops a tier", "Stops leads flickering between tiers. Moving up is immediate.", 0, 20),
  number("assay.decay_half_life_days", "Engagement halves after this many quiet days", "Only positive engagement fades. Negative points never fade.", 1, 60),
  number("assay.negative_expiry_days", "Negative engagement clears after", "A no-show, cancel, or move back stops counting once the lead acts again this many days later.", 7, 180),
  number("assay.engagement_lookback_days", "Engagement looks back", "Positive activity older than this does not count.", 14, 365),
  {
    key: "assay.signal_confidence",
    section: "assay",
    label: "Call signals count from",
    help: "Signals Scribe is less sure of are listed as unclear and do not score.",
    type: "choice",
    rules: {
      options: [
        { value: "medium", label: "Medium confidence (the lead agreed to it)" },
        { value: "high", label: "High confidence (the lead said it)" },
      ],
    },
    platformDefault: def("assay.signal_confidence"),
  },
  number("assay.signal_half_after_days", "Call signals count at half after", "Days after the call.", 7, 365),
  number("assay.signal_drop_after_days", "Call signals stop counting after", "Days after the call, unless a newer call confirms them.", 14, 730),
  {
    key: "assay.fit_rules",
    section: "assay",
    label: "Fit rules",
    help: "Who the lead is, from approved inputs only. A missing field scores neutral unless the rule says otherwise.",
    type: "list",
    rules: {
      maxItems: 40,
      uniqueBy: "id",
      itemFields: [
        RULE_ID,
        { key: "input", label: "Reads", type: "choice", required: true, options: INPUT_OPTIONS },
        { key: "op", label: "Condition", type: "choice", required: true, options: OP_OPTIONS },
        { key: "value", label: "Compared with", type: "text", maxLength: 60 },
        POINTS,
        REASON,
        {
          key: "missing",
          label: "When the field is missing",
          type: "choice",
          options: [
            { value: "neutral", label: "Neutral" },
            { value: "negative", label: "Counts against the lead" },
          ],
        },
        ENABLED,
      ],
    },
    platformDefault: def("assay.fit_rules"),
  },
  {
    key: "assay.engagement_rules",
    section: "assay",
    label: "Engagement rules",
    help: "What the lead is doing. Team activity alone never raises engagement.",
    type: "list",
    rules: {
      maxItems: 40,
      uniqueBy: "id",
      itemFields: [
        RULE_ID,
        { key: "kind", label: "Counts", type: "choice", required: true, options: KIND_OPTIONS },
        POINTS,
        REASON,
        { key: "max_count", label: "Counts at most", type: "number", min: 1, max: 10 },
        { key: "minutes", label: "Within minutes (quick replies)", type: "number", min: 0, max: 1440 },
        { key: "days", label: "Days (silence or window)", type: "number", min: 0, max: 365 },
        { key: "min_count", label: "Replies needed (window)", type: "number", min: 0, max: 20 },
        ENABLED,
      ],
    },
    platformDefault: def("assay.engagement_rules"),
  },
  {
    key: "assay.call_rules",
    section: "assay",
    label: "Call signal rules",
    help: "Points for what Scribe found on calls. The AI fills the signals; it never sets a score.",
    type: "list",
    rules: {
      maxItems: 40,
      uniqueBy: "id",
      itemFields: [
        RULE_ID,
        { key: "signal", label: "Signal", type: "choice", required: true, options: SIGNAL_OPTIONS },
        { key: "value", label: "Value", type: "text", required: true, maxLength: 60 },
        POINTS,
        REASON,
        ENABLED,
      ],
    },
    platformDefault: def("assay.call_rules"),
  },
  {
    key: "assay.field_map",
    section: "assay",
    label: "Fields Assay reads",
    help: "Maps this workspace's form or CRM fields onto approved inputs. Anything not on the approved list is ignored and reported.",
    type: "list",
    rules: {
      maxItems: 40,
      itemFields: [
        { key: "source", label: "Field in this workspace", type: "text", required: true, maxLength: 80 },
        { key: "input", label: "Approved input", type: "choice", required: true, options: INPUT_OPTIONS },
      ],
    },
    platformDefault: def("assay.field_map"),
  },
  toggle("assay.trigger_became_hot", "Act when a lead becomes Hot", "A task, a notice, and a draft request. Never from an early score."),
  toggle("assay.trigger_big_jump", "Act on a big jump", "When the score rises quickly, even if not Hot yet."),
  number("assay.big_jump_points", "A big jump is at least", "Points within 24 hours.", 5, 60),
  toggle("assay.trigger_going_quiet", "Act when a Hot lead goes quiet", "No lead activity and no team touch for the set days."),
  number("assay.going_quiet_days", "A Hot lead is quiet after", "Days with no lead activity and no team touch.", 1, 30),
  toggle("assay.trigger_hot_no_show", "Act on a Hot or Warm no-show", "A task and a reschedule draft request."),
  number("assay.cooldown_hours", "The same trigger waits at least", "Hours before it can fire again on the same lead.", 1, 720),
  number("assay.tasks_per_person_day", "Most Assay tasks per person per day", "After this, new ones are grouped into one summary notice.", 1, 100),
  number("assay.tasks_per_workspace_day", "Most Assay tasks per workspace per day", "Staff see it on the health view when this is reached.", 1, 1000),
  number("assay.drafts_per_workspace_day", "Most Assay draft requests per workspace per day", "Relay's own limits still apply.", 0, 1000),
];
