import type { ChoiceOption, ConfigSection, ConfigValue, FieldDef } from "@/lib/config/types";

/**
 * Every configurable field, in display order. This is the single source for
 * names, help text, types, validation, and platform defaults. The database
 * keeps a generated copy (config_fields) of the facts it enforces itself.
 *
 * Platform defaults reproduce what the app did before this system existed,
 * so a workspace with no template and no overrides behaves as it always has.
 * The launch compliance changes are a separate, recorded platform version.
 */

export const SECTION_INFO: Record<ConfigSection, { label: string; description: string }> = {
  identity: {
    label: "Identity",
    description: "Who the business is, when it is open, and who to reach.",
  },
  qualification: {
    label: "Qualification",
    description: "What makes a lead ready to buy, what means not yet, and what means stop.",
  },
  response: {
    label: "Response windows",
    description: "How quickly leads must hear from a person, and how often after that.",
  },
  tone: {
    label: "Tone and voice",
    description: "How messages sound, how long they are, and the words to use or avoid.",
  },
  industry: {
    label: "Industry fields",
    description: "What the business sells, the facts that matter, objections, and lead sources.",
  },
  escalation: {
    label: "Escalation",
    description: "Who hears about problems, how, and what happens when no one answers.",
  },
  approval: {
    label: "Approval gate",
    description: "Which actions need a person's approval before they happen.",
  },
  integrations: {
    label: "Integrations",
    description: "Connected systems. Only references are stored here, never passwords or keys.",
  },
  sources: {
    label: "Sources",
    description: "What the agents may read for this business, and how long it is kept.",
  },
  operators: {
    label: "Operators and routing",
    description: "How leads reach the customer's own team, and their daily summaries.",
  },
  compliance: {
    label: "Compliance and messaging rules",
    description: "Opt-outs, quiet hours, disclosures, and limits. Workspaces can tighten these, never loosen them.",
  },
};

const DAYS: ChoiceOption[] = [
  { value: "mon", label: "Monday" },
  { value: "tue", label: "Tuesday" },
  { value: "wed", label: "Wednesday" },
  { value: "thu", label: "Thursday" },
  { value: "fri", label: "Friday" },
  { value: "sat", label: "Saturday" },
  { value: "sun", label: "Sunday" },
];
export const WEEKDAYS = DAYS;

export const LEAD_STAGES: ChoiceOption[] = [
  { value: "new", label: "New" },
  { value: "working", label: "Being worked" },
  { value: "call_booked", label: "Call booked" },
  { value: "follow_up", label: "Follow-up" },
  { value: "objection_hold", label: "Objection raised" },
  { value: "no_show", label: "No-show" },
  { value: "ghost", label: "Gone quiet" },
];

export const OBJECTION_CATEGORIES: ChoiceOption[] = [
  { value: "price", label: "Price or cost" },
  { value: "timing", label: "Timing" },
  { value: "spouse_partner", label: "Needs someone else to agree" },
  { value: "trust", label: "Trust or proof" },
  { value: "fit", label: "Fit or need" },
  { value: "competitor", label: "Other options" },
  { value: "other", label: "Something else" },
];

export const SOURCE_KINDS: ChoiceOption[] = [
  { value: "call_transcripts", label: "Call transcripts" },
  { value: "email", label: "Email" },
  { value: "text_messages", label: "Text messages" },
  { value: "forms", label: "Forms" },
  { value: "crm_notes", label: "CRM notes" },
];

/**
 * Approval action types. The first ten existed before this system (the home
 * queue and Ask Vistrial); the last three are generic kinds for new agents.
 */
export const APPROVAL_ACTIONS: Array<ChoiceOption & { reachesPeople: boolean }> = [
  { value: "first_reply", label: "First reply to a new lead", reachesPeople: true },
  { value: "quiet_lead_follow_up", label: "Follow-up to a lead who went quiet", reachesPeople: true },
  { value: "no_show_rebook", label: "Rebooking a no-show", reachesPeople: true },
  { value: "client_report", label: "Sending a report to the client", reachesPeople: true },
  { value: "crm_stage_change", label: "Changing a stage in the CRM", reachesPeople: false },
  { value: "setter_nudge", label: "Nudging a team member", reachesPeople: false },
  { value: "owner_escalation", label: "Escalating to the owner", reachesPeople: false },
  { value: "slack_post", label: "Posting to a Slack channel", reachesPeople: false },
  { value: "discord_post", label: "Posting to a Discord channel", reachesPeople: false },
  { value: "drive_store", label: "Storing a file in Google Drive", reachesPeople: false },
  { value: "send_text", label: "Sending a text message", reachesPeople: true },
  { value: "send_email", label: "Sending an email", reachesPeople: true },
  { value: "create_asset", label: "Creating a document or asset", reachesPeople: false },
];

const APPROVERS: ChoiceOption[] = [
  { value: "owners_and_managers", label: "Owners and the Vistrial team" },
  { value: "owner_only", label: "Owners only" },
  { value: "assigned", label: "The person the lead is assigned to" },
];

const NOTIFY_WHO: ChoiceOption[] = [
  { value: "assignee", label: "The person the lead is assigned to" },
  { value: "setters", label: "All setters" },
  { value: "closers", label: "All closers" },
  { value: "managers", label: "Owners and managers" },
  { value: "service_team", label: "The assigned Vistrial team" },
];

const NOTIFY_CHANNELS: ChoiceOption[] = [
  { value: "push", label: "App notification" },
  { value: "email", label: "Email" },
  { value: "sms", label: "Text message" },
  { value: "team_channel", label: "Team channel (Slack or Teams)" },
  { value: "discord", label: "Discord" },
];

const SEVERITIES: ChoiceOption[] = [
  { value: "info", label: "Information" },
  { value: "warning", label: "Warning" },
  { value: "urgent", label: "Urgent" },
  { value: "critical", label: "Critical" },
];

/** Today's global banned openers and corporate words, which every draft already avoids. */
export const LEGACY_BANNED_TERMS = [
  "I hope this message finds you well",
  "I hope you're doing well",
  "I wanted to reach out",
  "just circling back",
  "circling back",
  "touching base",
  "following up on our conversation",
  "as we discussed",
  "leverage",
  "utilize",
  "synergy",
  "streamline",
  "robust",
  "seamless",
  "journey",
  "solution",
];

export const CONFIG_FIELDS: FieldDef[] = [
  // ---------------------------------------------------------------- identity
  {
    key: "identity.business_name",
    section: "identity",
    label: "Business name",
    help: "The legal or trading name of the business.",
    type: "text",
    rules: { minLength: 2, maxLength: 120 },
    required: true,
    workspaceOnly: true,
  },
  {
    key: "identity.display_name",
    section: "identity",
    label: "Name used in messages",
    help: "How the business is named when a message mentions it, for example \"Glow Studio\".",
    type: "text",
    rules: { minLength: 2, maxLength: 80 },
    required: true,
    workspaceOnly: true,
  },
  {
    key: "identity.timezone",
    section: "identity",
    label: "Time zone",
    help: "The business's own time zone. Business hours and the response clock use it.",
    type: "choice",
    rules: { timezone: true },
    required: true,
    platformDefault: "America/New_York",
  },
  {
    key: "identity.business_hours",
    section: "identity",
    label: "Business hours",
    help: "Open hours for each day of the week, plus dates the business is closed. Leave a day empty to mark it closed.",
    type: "schedule",
    required: true,
    ownerEditable: "when_allowed",
    platformDefault: {
      days: {
        mon: [{ start: "08:00", end: "18:00" }],
        tue: [{ start: "08:00", end: "18:00" }],
        wed: [{ start: "08:00", end: "18:00" }],
        thu: [{ start: "08:00", end: "18:00" }],
        fri: [{ start: "08:00", end: "18:00" }],
        sat: [],
        sun: [],
      },
      closures: [],
    },
  },
  {
    key: "identity.owners_can_edit_hours",
    section: "identity",
    label: "Owners can change business hours",
    help: "When on, the workspace owner can update business hours from their own settings.",
    type: "boolean",
    platformDefault: false,
  },
  {
    key: "identity.primary_contact",
    section: "identity",
    label: "Primary contact",
    help: "The person Vistrial speaks to about this account.",
    type: "key_value",
    rules: {
      keys: [
        { value: "name", label: "Name" },
        { value: "email", label: "Email" },
        { value: "phone", label: "Phone" },
      ],
      valueType: "text",
    },
    required: true,
    workspaceOnly: true,
    ownerEditable: "always",
  },
  {
    key: "identity.escalation_contact",
    section: "identity",
    label: "Escalation contact",
    help: "Who to reach when something urgent cannot wait for the primary contact.",
    type: "key_value",
    rules: {
      keys: [
        { value: "name", label: "Name" },
        { value: "email", label: "Email" },
        { value: "phone", label: "Phone" },
      ],
      valueType: "text",
    },
    workspaceOnly: true,
  },

  // ----------------------------------------------------------- qualification
  {
    key: "qualification.ready_criteria",
    section: "qualification",
    label: "Ready to buy when",
    help: "Plain statements of what makes a lead ready, one per line. For example: \"Asked about a specific treatment or price.\"",
    type: "list",
    rules: { minItems: 1, maxItems: 30, itemMaxLength: 200 },
    required: true,
  },
  {
    key: "qualification.not_ready_criteria",
    section: "qualification",
    label: "Needs nurturing when",
    help: "Signals that a lead is interested but not ready yet.",
    type: "list",
    rules: { maxItems: 30, itemMaxLength: 200 },
    platformDefault: [],
  },
  {
    key: "qualification.disqualifiers",
    section: "qualification",
    label: "Stop pursuing when",
    help: "Reasons to stop pursuing a lead, each with an optional closing message to send.",
    type: "list",
    rules: {
      maxItems: 30,
      itemFields: [
        { key: "reason", label: "Reason", type: "text", required: true, maxLength: 200 },
        { key: "closing_message", label: "Suggested closing message", type: "long_text", maxLength: 600 },
      ],
    },
    platformDefault: [],
  },
  {
    key: "qualification.scoring_bands",
    section: "qualification",
    label: "Score bands",
    help: "What each score range means and the next step it implies. Start the first band at 0.",
    type: "list",
    rules: {
      minItems: 2,
      maxItems: 6,
      uniqueBy: "name",
      itemFields: [
        { key: "name", label: "Band", type: "text", required: true, maxLength: 40 },
        { key: "min_score", label: "From score", type: "number", required: true, min: 0, max: 100 },
        { key: "meaning", label: "What it means", type: "text", required: true, maxLength: 200 },
        { key: "next_step", label: "Next step", type: "text", required: true, maxLength: 200 },
      ],
    },
    required: true,
    platformDefault: [
      { name: "Cold", min_score: 0, meaning: "Interested, but not ready to decide.", next_step: "Keep in touch with useful, low-pressure follow-up." },
      { name: "Warm", min_score: 40, meaning: "Engaged, with some of what they need in place.", next_step: "Fill the gaps: timing, budget, and who decides." },
      { name: "Hot", min_score: 60, meaning: "Ready to buy now.", next_step: "Call today and book the next step." },
    ],
  },
  {
    key: "qualification.ready_threshold",
    section: "qualification",
    label: "Ready from score",
    help: "The score at which a lead counts as ready to buy. It must match the start of one of your score bands.",
    type: "number",
    rules: { min: 0, max: 100, integer: true },
    required: true,
    platformDefault: 60,
  },
  {
    key: "qualification.factor_weights",
    section: "qualification",
    label: "How much each factor counts",
    help: "The share of the score each factor carries. They must add up to 100.",
    type: "key_value",
    rules: {
      keys: [
        { value: "timeline", label: "Timeline" },
        { value: "investment_capacity", label: "Ability to pay" },
        { value: "decision_authority", label: "Can decide" },
        { value: "pain_severity", label: "How much it matters to them" },
      ],
      valueType: "number",
      min: 0,
      max: 100,
    },
    required: true,
    platformDefault: { timeline: 35, investment_capacity: 30, decision_authority: 20, pain_severity: 15 },
  },
  {
    key: "qualification.minimum_info",
    section: "qualification",
    label: "Must know before qualifying",
    help: "Case-file facts that must be known before a lead can count as qualified. Use the keys from Industry fields → Case-file facts.",
    type: "list",
    rules: { maxItems: 20, itemMaxLength: 60 },
    platformDefault: [],
  },

  // ---------------------------------------------------------------- response
  {
    key: "response.first_touch_minutes",
    section: "response",
    label: "First touch within",
    help: "How quickly a new lead must hear from a person.",
    type: "duration",
    rules: { min: 1, max: 10080, integer: true, displayUnit: "minutes" },
    required: true,
    platformDefault: 15,
  },
  {
    key: "response.follow_up_cadence",
    section: "response",
    label: "Longest gap between touches, by stage",
    help: "For each stage, the most time that should pass between touches before someone is nudged.",
    type: "list",
    rules: {
      maxItems: 12,
      uniqueBy: "stage",
      itemFields: [
        { key: "stage", label: "Stage", type: "choice", required: true, options: LEAD_STAGES },
        { key: "max_gap_hours", label: "Longest gap (hours)", type: "number", required: true, min: 1, max: 2160 },
      ],
    },
    platformDefault: [
      { stage: "working", max_gap_hours: 48 },
      { stage: "follow_up", max_gap_hours: 72 },
      { stage: "objection_hold", max_gap_hours: 72 },
      { stage: "no_show", max_gap_hours: 24 },
    ],
  },
  {
    key: "response.after_hours",
    section: "response",
    label: "Outside business hours",
    help: "Whether the response clock keeps running when the business is closed.",
    type: "choice",
    rules: {
      options: [
        { value: "pause", label: "Pause the clock until the business opens" },
        { value: "keep_running", label: "Keep the clock running" },
        { value: "separate_window", label: "Use a longer window after hours" },
      ],
    },
    required: true,
    platformDefault: "keep_running",
  },
  {
    key: "response.after_hours_window_minutes",
    section: "response",
    label: "After-hours window",
    help: "Used only when the clock uses a longer window after hours.",
    type: "duration",
    rules: { min: 15, max: 10080, integer: true, displayUnit: "minutes" },
    platformDefault: 120,
  },
  {
    key: "response.counted_touch_types",
    section: "response",
    label: "Counts as a human touch",
    help: "Which kinds of contact count as a person reaching the lead. Automated messages never count.",
    type: "multi_choice",
    rules: {
      minItems: 1,
      options: [
        { value: "call", label: "Phone call" },
        { value: "text", label: "Text message" },
        { value: "email", label: "Email" },
      ],
    },
    required: true,
    platformDefault: ["call", "text", "email"],
  },
  {
    key: "response.warning_threshold_percent",
    section: "response",
    label: "Nudge at",
    help: "How far through a window to send a nudge before it is missed, as a percentage of the window.",
    type: "number",
    rules: { min: 50, max: 95, integer: true },
    platformDefault: 75,
  },
  {
    key: "response.ghost_days_soft",
    section: "response",
    label: "Going quiet after",
    help: "Days without a reply before a lead is flagged as going quiet.",
    type: "number",
    rules: { min: 1, max: 365, integer: true },
    required: true,
    platformDefault: 14,
  },
  {
    key: "response.ghost_days_hard",
    section: "response",
    label: "Gone quiet after",
    help: "Days without a reply before a lead counts as gone quiet.",
    type: "number",
    rules: { min: 2, max: 365, integer: true },
    required: true,
    platformDefault: 30,
  },
  {
    key: "response.max_sequence_length",
    section: "response",
    label: "Most follow-ups in a row",
    help: "The longest run of follow-up messages Vistrial will draft before stopping to wait for a reply.",
    type: "number",
    rules: { min: 1, max: 8, integer: true },
    platformDefault: 3,
  },
  {
    key: "response.max_sequence_days",
    section: "response",
    label: "Follow-up runs for at most",
    help: "Days a follow-up sequence may run before it stops.",
    type: "number",
    rules: { min: 1, max: 90, integer: true },
    platformDefault: 21,
  },
  {
    key: "response.draft_stale_days",
    section: "response",
    label: "Unapproved drafts expire after",
    help: "Days before a draft no one approved is withdrawn.",
    type: "number",
    rules: { min: 1, max: 14, integer: true },
    platformDefault: 5,
  },
  {
    key: "response.quiet_lead_hours",
    section: "response",
    label: "A lead is quiet after",
    help: "Hours without contact before a lead appears on the home screen as quiet.",
    type: "number",
    rules: { min: 1, max: 720, integer: true },
    platformDefault: 48,
  },
  {
    key: "response.untouched_window_days",
    section: "response",
    label: "Look back for untouched leads",
    help: "Days back the home screen looks for leads no one has contacted.",
    type: "number",
    rules: { min: 1, max: 30, integer: true },
    platformDefault: 3,
  },
  {
    key: "response.no_show_window_days",
    section: "response",
    label: "Rebook no-shows within",
    help: "Days after a missed call during which Vistrial suggests rebooking.",
    type: "number",
    rules: { min: 1, max: 60, integer: true },
    platformDefault: 7,
  },

  // -------------------------------------------------------------------- tone
  {
    key: "tone.formality",
    section: "tone",
    label: "Formality",
    help: "How formal messages sound.",
    type: "choice",
    rules: {
      options: [
        { value: "formal", label: "Formal" },
        { value: "friendly", label: "Friendly" },
        { value: "casual", label: "Casual" },
      ],
    },
    required: true,
    platformDefault: "casual",
  },
  {
    key: "tone.use_contractions",
    section: "tone",
    label: "Use contractions",
    help: "Write \"we're\" and \"you'll\" rather than \"we are\" and \"you will\".",
    type: "boolean",
    platformDefault: true,
  },
  {
    key: "tone.sender_identity",
    section: "tone",
    label: "Messages come from",
    help: "Who messages appear to be from, for example \"Maya at Glow Studio\". Leave empty to use the person sending.",
    type: "text",
    rules: { maxLength: 80 },
    platformDefault: "",
  },
  {
    key: "tone.greeting",
    section: "tone",
    label: "Greeting",
    help: "How emails open, for example \"Hi {first_name},\". Leave empty for no greeting. Texts never use one.",
    type: "text",
    rules: { maxLength: 60 },
    platformDefault: "",
  },
  {
    key: "tone.sign_off",
    section: "tone",
    label: "Sign-off",
    help: "How emails end, for example \"Thanks, Maya\". Leave empty for no sign-off.",
    type: "text",
    rules: { maxLength: 80 },
    platformDefault: "",
  },
  {
    key: "tone.sms_max_chars",
    section: "tone",
    label: "Longest text message",
    help: "Characters. Shorter is better on a phone.",
    type: "number",
    rules: { min: 40, max: 480, integer: true },
    required: true,
    platformDefault: 240,
  },
  {
    key: "tone.email_max_chars",
    section: "tone",
    label: "Longest email",
    help: "Characters, not counting the greeting and sign-off.",
    type: "number",
    rules: { min: 120, max: 4000, integer: true },
    required: true,
    platformDefault: 900,
  },
  {
    key: "tone.emoji",
    section: "tone",
    label: "Emoji",
    help: "Whether messages may use emoji.",
    type: "choice",
    rules: {
      options: [
        { value: "never", label: "Never" },
        { value: "sparing", label: "Sparingly" },
        { value: "natural", label: "Where natural" },
      ],
    },
    platformDefault: "never",
  },
  {
    key: "tone.punctuation_rules",
    section: "tone",
    label: "Punctuation rules",
    help: "Anything specific, for example \"No exclamation marks\".",
    type: "long_text",
    rules: { maxLength: 500 },
    platformDefault: "",
  },
  {
    key: "tone.language",
    section: "tone",
    label: "Language and spelling",
    help: "The language messages are written in, and whose spelling to use.",
    type: "choice",
    rules: {
      options: [
        { value: "en-US", label: "English (United States)" },
        { value: "en-GB", label: "English (United Kingdom)" },
        { value: "en-CA", label: "English (Canada)" },
        { value: "en-AU", label: "English (Australia)" },
        { value: "es-US", label: "Spanish (United States)" },
      ],
    },
    platformDefault: "en-US",
  },
  {
    key: "tone.preferred_terms",
    section: "tone",
    label: "Words to use",
    help: "Terms the business prefers, for example \"consultation\" rather than \"appointment\".",
    type: "list",
    rules: { maxItems: 50, itemMaxLength: 80 },
    platformDefault: [],
  },
  {
    key: "tone.banned_terms",
    section: "tone",
    label: "Words and phrases to avoid",
    help: "Messages never use these. Drafts that contain one are rewritten.",
    type: "list",
    rules: { maxItems: 200, itemMaxLength: 120 },
    platformDefault: LEGACY_BANNED_TERMS,
  },
  {
    key: "tone.examples",
    section: "tone",
    label: "Example messages",
    help: "A few approved messages that show the voice. Two to five works best.",
    type: "list",
    rules: {
      maxItems: 10,
      itemFields: [
        {
          key: "channel",
          label: "Channel",
          type: "choice",
          required: true,
          options: [
            { value: "sms", label: "Text" },
            { value: "email", label: "Email" },
          ],
        },
        { key: "body", label: "Message", type: "long_text", required: true, maxLength: 2000 },
      ],
    },
    platformDefault: [],
  },

  // ---------------------------------------------------------------- industry
  {
    key: "industry.business_description",
    section: "industry",
    label: "What kind of business this is",
    help: "One line the agents use to understand the business, for example \"a med spa offering injectables and skin treatments\".",
    type: "text",
    rules: { minLength: 5, maxLength: 200 },
    required: true,
    platformDefault: "a business that sells through conversations with its leads",
  },
  {
    key: "industry.offers",
    section: "industry",
    label: "What the business sells",
    help: "Each service or offer, with a typical price range.",
    type: "list",
    rules: {
      minItems: 1,
      maxItems: 50,
      uniqueBy: "name",
      itemFields: [
        { key: "name", label: "Offer", type: "text", required: true, maxLength: 100 },
        { key: "ticket_min", label: "Typical price from ($)", type: "number", min: 0, max: 10000000 },
        { key: "ticket_max", label: "Typical price to ($)", type: "number", min: 0, max: 10000000 },
        { key: "recurring", label: "Recurring", type: "boolean" },
      ],
    },
    required: true,
  },
  {
    key: "industry.case_facts",
    section: "industry",
    label: "Case-file facts",
    help: "The facts that matter for this business, gathered for every lead.",
    type: "list",
    rules: {
      minItems: 1,
      maxItems: 40,
      uniqueBy: "key",
      itemFields: [
        { key: "key", label: "Key", type: "text", required: true, maxLength: 60, help: "Short, lowercase, no spaces, e.g. treatment_interest." },
        { key: "label", label: "Label", type: "text", required: true, maxLength: 80 },
        {
          key: "type",
          label: "Type",
          type: "choice",
          required: true,
          options: [
            { value: "text", label: "Text" },
            { value: "number", label: "Number" },
            { value: "choice", label: "Choice" },
            { value: "yes_no", label: "Yes or no" },
            { value: "date", label: "Date" },
          ],
        },
        { key: "required", label: "Required", type: "boolean" },
      ],
    },
    required: true,
  },
  {
    key: "industry.urgency_signals",
    section: "industry",
    label: "Act-now signals",
    help: "Words, phrases, or behaviours that mean a lead needs attention right away.",
    type: "list",
    rules: { maxItems: 50, itemMaxLength: 120 },
    platformDefault: [],
  },
  {
    key: "industry.objections",
    section: "industry",
    label: "Objection library",
    help: "Common objections, how to recognize them, and approved guidance for answering.",
    type: "list",
    rules: {
      maxItems: 200,
      uniqueBy: "label",
      itemFields: [
        { key: "label", label: "Objection", type: "text", required: true, maxLength: 80 },
        { key: "category", label: "Category", type: "choice", required: true, options: OBJECTION_CATEGORIES },
        { key: "recognize", label: "How it sounds", type: "long_text", maxLength: 500 },
        { key: "guidance", label: "How to answer", type: "long_text", maxLength: 1000 },
      ],
    },
    platformDefault: [],
  },
  {
    key: "industry.lead_sources",
    section: "industry",
    label: "Lead sources",
    help: "Where leads come from and how each should be treated.",
    type: "list",
    rules: {
      maxItems: 30,
      uniqueBy: "source",
      itemFields: [
        { key: "source", label: "Source", type: "text", required: true, maxLength: 80 },
        {
          key: "priority",
          label: "Priority",
          type: "choice",
          required: true,
          options: [
            { value: "high", label: "High" },
            { value: "normal", label: "Normal" },
            { value: "low", label: "Low" },
          ],
        },
        { key: "treatment", label: "How to treat it", type: "text", maxLength: 300 },
      ],
    },
    platformDefault: [],
  },

  // -------------------------------------------------------------- escalation
  {
    key: "escalation.levels",
    section: "escalation",
    label: "Who hears about what",
    help: "Each level: what triggers it, who is told, and how. For a missed first touch, \"after\" is how many first-touch windows have passed.",
    type: "list",
    rules: {
      minItems: 1,
      maxItems: 8,
      itemFields: [
        { key: "severity", label: "Severity", type: "choice", required: true, options: SEVERITIES },
        { key: "trigger", label: "When", type: "text", required: true, maxLength: 200 },
        { key: "after_windows", label: "After (windows)", type: "number", min: 1, max: 20 },
        { key: "notify", label: "Who", type: "multi_choice", required: true, options: NOTIFY_WHO },
        { key: "channels", label: "How", type: "multi_choice", required: true, options: NOTIFY_CHANNELS },
      ],
    },
    required: true,
    platformDefault: [
      {
        severity: "warning",
        trigger: "A new lead has not had a first touch within the window.",
        after_windows: 1,
        notify: ["assignee"],
        channels: ["push"],
      },
      {
        severity: "urgent",
        trigger: "Still untouched at twice the window.",
        after_windows: 2,
        notify: ["setters"],
        channels: ["push", "team_channel"],
      },
      {
        severity: "critical",
        trigger: "Still untouched at four times the window.",
        after_windows: 4,
        notify: ["managers"],
        channels: ["push"],
      },
    ],
  },
  {
    key: "escalation.quiet_hours",
    section: "escalation",
    label: "Quiet hours for the team",
    help: "When the team is not disturbed. Outside business hours is the usual choice.",
    type: "choice",
    rules: {
      options: [
        { value: "outside_business_hours", label: "Outside business hours" },
        { value: "none", label: "Never quiet" },
      ],
    },
    platformDefault: "outside_business_hours",
  },
  {
    key: "escalation.urgent_exception",
    section: "escalation",
    label: "Break quiet hours for",
    help: "Which severities may still notify the team during quiet hours.",
    type: "choice",
    rules: {
      options: [
        { value: "critical", label: "Critical only" },
        { value: "urgent_and_critical", label: "Urgent and critical" },
        { value: "none", label: "Nothing" },
      ],
    },
    platformDefault: "critical",
  },
  {
    key: "escalation.unacknowledged_minutes",
    section: "escalation",
    label: "If no one acknowledges within",
    help: "How long an urgent item may go unacknowledged before it moves to the next person.",
    type: "duration",
    rules: { min: 5, max: 1440, integer: true, displayUnit: "minutes" },
    platformDefault: 60,
  },
  {
    key: "escalation.unacknowledged_next",
    section: "escalation",
    label: "Then tell",
    help: "Who hears about it when no one acknowledges in time.",
    type: "choice",
    rules: { options: NOTIFY_WHO },
    platformDefault: "managers",
  },

  // ---------------------------------------------------------------- approval
  {
    key: "approval.actions",
    section: "approval",
    label: "What needs approval",
    help: "For each kind of action, whether a person must approve it first, who may approve, and how long it may wait.",
    type: "list",
    rules: {
      minItems: 1,
      maxItems: 30,
      uniqueBy: "action",
      itemFields: [
        { key: "action", label: "Action", type: "choice", required: true, options: APPROVAL_ACTIONS },
        {
          key: "mode",
          label: "Approval",
          type: "choice",
          required: true,
          options: [
            { value: "ask_first", label: "Ask first" },
            { value: "auto_run", label: "Proceeds without approval" },
            { value: "off", label: "Turned off" },
          ],
        },
        { key: "approver", label: "Who approves", type: "choice", required: true, options: APPROVERS },
        { key: "max_wait_minutes", label: "Longest wait (minutes)", type: "number", min: 15, max: 10080 },
        {
          key: "auto_run_confirmed",
          label: "I understand this proceeds without anyone approving it",
          type: "boolean",
        },
      ],
    },
    required: true,
    platformDefault: [
      { action: "first_reply", mode: "ask_first", approver: "owners_and_managers" },
      { action: "quiet_lead_follow_up", mode: "ask_first", approver: "owners_and_managers" },
      { action: "no_show_rebook", mode: "ask_first", approver: "owners_and_managers" },
      { action: "client_report", mode: "ask_first", approver: "owners_and_managers" },
      { action: "crm_stage_change", mode: "ask_first", approver: "owners_and_managers" },
      { action: "setter_nudge", mode: "auto_run", approver: "owners_and_managers", auto_run_confirmed: true },
      { action: "owner_escalation", mode: "auto_run", approver: "owners_and_managers", auto_run_confirmed: true },
      { action: "slack_post", mode: "ask_first", approver: "owners_and_managers" },
      { action: "discord_post", mode: "ask_first", approver: "owners_and_managers" },
      { action: "drive_store", mode: "ask_first", approver: "owners_and_managers" },
      { action: "send_text", mode: "ask_first", approver: "owners_and_managers" },
      { action: "send_email", mode: "ask_first", approver: "owners_and_managers" },
      { action: "create_asset", mode: "ask_first", approver: "owners_and_managers" },
    ],
  },
  {
    key: "approval.never_auto",
    section: "approval",
    label: "Always needs approval",
    help: "Actions that can never be set to proceed without approval, because they reach people outside the business.",
    type: "multi_choice",
    rules: { options: APPROVAL_ACTIONS },
    defaultLock: true,
    tighten: "superset_list",
    platformDefault: APPROVAL_ACTIONS.filter((action) => action.reachesPeople).map((action) => action.value),
  },
  {
    key: "approval.timeout_minutes",
    section: "approval",
    label: "Waiting too long after",
    help: "How long an item may wait for approval before the timeout rule applies.",
    type: "duration",
    rules: { min: 15, max: 10080, integer: true, displayUnit: "minutes" },
    platformDefault: 240,
  },
  {
    key: "approval.timeout_behavior",
    section: "approval",
    label: "When no one approves in time",
    help: "The safe choice is that nothing happens. Letting an action proceed without approval shows a warning and is recorded.",
    type: "choice",
    rules: {
      options: [
        { value: "nothing", label: "Nothing happens; it keeps waiting" },
        { value: "escalate", label: "Nothing happens; tell the next person" },
        { value: "proceed", label: "It proceeds without approval" },
      ],
    },
    platformDefault: "escalate",
  },
  {
    key: "approval.timeout_proceed_confirmed",
    section: "approval",
    label: "I understand waiting items will proceed without approval",
    help: "Required when the timeout rule lets actions proceed. Actions that always need approval are never affected.",
    type: "boolean",
    platformDefault: false,
  },

  // ------------------------------------------------------------ integrations
  {
    key: "integrations.crm",
    section: "integrations",
    label: "CRM",
    help: "The CRM this workspace uses. The connection itself, and its field mapping, live on the Integrations page.",
    type: "reference",
    rules: { referenceKinds: ["integration"] },
    platformDefault: null,
  },
  {
    key: "integrations.messaging_numbers",
    section: "integrations",
    label: "Messaging numbers",
    help: "Numbers texts are sent from, and the name shown with them.",
    type: "list",
    rules: {
      maxItems: 20,
      uniqueBy: "number",
      itemFields: [
        { key: "label", label: "Label", type: "text", required: true, maxLength: 60 },
        { key: "number", label: "Number", type: "text", required: true, maxLength: 20, help: "International format, e.g. +15551234567." },
        {
          key: "provider",
          label: "Sent through",
          type: "choice",
          required: true,
          options: [
            { value: "crm", label: "The CRM" },
            { value: "telnyx", label: "Telnyx (not connected yet)" },
          ],
        },
        { key: "sender_name", label: "Sender name", type: "text", maxLength: 60 },
      ],
    },
    platformDefault: [],
  },
  {
    key: "integrations.calendar",
    section: "integrations",
    label: "Calendar",
    help: "Where calls are booked.",
    type: "reference",
    rules: { referenceKinds: ["integration"] },
    platformDefault: null,
  },
  {
    key: "integrations.email_domain",
    section: "integrations",
    label: "Email sending domain",
    help: "The domain emails are sent from, for example mail.glowstudio.com.",
    type: "text",
    rules: {
      maxLength: 120,
      pattern: "^$|^([a-z0-9-]+\\.)+[a-z]{2,}$",
      patternHint: "Use a domain like mail.example.com, with no https:// and no slashes.",
    },
    platformDefault: "",
  },
  {
    key: "integrations.chat_channels",
    section: "integrations",
    label: "Chat channels",
    help: "Team channels Vistrial may post to. Connect them on the Integrations page first.",
    type: "list",
    rules: {
      maxItems: 10,
      itemFields: [
        { key: "label", label: "Label", type: "text", required: true, maxLength: 60 },
        {
          key: "kind",
          label: "Kind",
          type: "choice",
          required: true,
          options: [
            { value: "slack", label: "Slack" },
            { value: "discord", label: "Discord" },
            { value: "teams", label: "Teams" },
          ],
        },
        { key: "connection_id", label: "Connection", type: "text", required: true, maxLength: 64 },
      ],
    },
    platformDefault: [],
  },
  {
    key: "integrations.file_folder",
    section: "integrations",
    label: "File storage folder",
    help: "The folder name used for files Vistrial stores.",
    type: "text",
    rules: { minLength: 1, maxLength: 120 },
    platformDefault: "Vistrial",
  },

  // ----------------------------------------------------------------- sources
  {
    key: "sources.allowed",
    section: "sources",
    label: "Agents may read",
    help: "The kinds of information agents may use for this business.",
    type: "multi_choice",
    rules: { options: SOURCE_KINDS },
    required: true,
    platformDefault: SOURCE_KINDS.map((source) => source.value),
  },
  {
    key: "sources.retention_days",
    section: "sources",
    label: "Keep for (days)",
    help: "How long each kind of information is kept. Call transcripts: 30 to 1,095 days.",
    type: "key_value",
    rules: { keys: SOURCE_KINDS, valueType: "number", min: 30, max: 3650 },
    platformDefault: { call_transcripts: 365, email: 365, text_messages: 365, forms: 365, crm_notes: 365 },
  },
  {
    key: "sources.excluded",
    section: "sources",
    label: "Never read",
    help: "Sources excluded for privacy, and why.",
    type: "list",
    rules: {
      maxItems: 10,
      uniqueBy: "source",
      itemFields: [
        { key: "source", label: "Source", type: "choice", required: true, options: SOURCE_KINDS },
        { key: "reason", label: "Why", type: "text", required: true, maxLength: 200 },
      ],
    },
    platformDefault: [],
  },

  {
    key: "sources.forsight_history_weeks",
    section: "sources",
    label: "Forsight shows (weeks)",
    help: "How many weeks of history the Forsight dashboard and reports cover.",
    type: "number",
    rules: { min: 4, max: 52, integer: true },
    platformDefault: 12,
  },
  {
    key: "sources.forsight_quiet_days",
    section: "sources",
    label: "Forsight: going quiet after (days)",
    help: "In Forsight's pipeline health, a lead with no human contact for longer than this is going quiet.",
    type: "number",
    rules: { min: 1, max: 60, integer: true },
    platformDefault: 7,
  },
  {
    key: "sources.forsight_silent_days",
    section: "sources",
    label: "Forsight: silent after (days)",
    help: "Longer than this with no human contact counts as silent. Must be longer than going quiet.",
    type: "number",
    rules: { min: 2, max: 120, integer: true },
    platformDefault: 14,
  },
  {
    key: "sources.forsight_long_silent_days",
    section: "sources",
    label: "Forsight: long silent after (days)",
    help: "Longer than this with no human contact counts as long silent. Must be longer than silent.",
    type: "number",
    rules: { min: 3, max: 365, integer: true },
    platformDefault: 30,
  },
  {
    key: "sources.stellar_stage_labels",
    section: "sources",
    label: "Stellar build stage names",
    help: "What the client portal calls each build stage.",
    type: "key_value",
    rules: {
      keys: [
        { value: "getting_set_up", label: "Stage 1" },
        { value: "building_system", label: "Stage 2" },
        { value: "testing", label: "Stage 3" },
        { value: "live", label: "Stage 4" },
        { value: "running_smoothly", label: "Stage 5" },
      ],
      valueType: "text",
    },
    platformDefault: {
      getting_set_up: "Getting set up",
      building_system: "Building your system",
      testing: "Testing",
      live: "Live",
      running_smoothly: "Running smoothly",
    },
  },

  // --------------------------------------------------------------- operators
  {
    key: "operators.assignment_mode",
    section: "operators",
    label: "How leads are assigned",
    help: "How new leads reach the customer's own operators.",
    type: "choice",
    rules: {
      options: [
        { value: "manual", label: "Manually" },
        { value: "round_robin", label: "Round robin" },
        { value: "by_source", label: "By lead source" },
        { value: "by_service", label: "By service type" },
      ],
    },
    required: true,
    platformDefault: "manual",
  },
  {
    key: "operators.extra_permissions",
    section: "operators",
    label: "Operators may also",
    help: "Extra things operators can do, within what their role allows.",
    type: "multi_choice",
    rules: {
      options: [
        { value: "view_unassigned_details", label: "See full details of unassigned leads" },
        { value: "reassign_own_leads", label: "Hand their own leads to another operator" },
      ],
    },
    platformDefault: [],
  },
  {
    key: "operators.summary_time",
    section: "operators",
    label: "Daily summary",
    help: "When each operator's daily activity summary is produced.",
    type: "choice",
    rules: {
      options: [
        { value: "start_of_day", label: "At the start of their working day" },
        { value: "end_of_day", label: "At the end of their working day" },
      ],
    },
    platformDefault: "start_of_day",
  },
  {
    key: "operators.summary_confirmer",
    section: "operators",
    label: "Summaries are confirmed by",
    help: "Who confirms that a daily summary is accurate.",
    type: "choice",
    rules: {
      options: [
        { value: "operator", label: "The operator" },
        { value: "owner", label: "An owner" },
        { value: "service_team", label: "The Vistrial team" },
      ],
    },
    platformDefault: "operator",
  },

  // -------------------------------------------------------------- compliance
  {
    key: "compliance.opt_out_words",
    section: "compliance",
    label: "Opt-out words",
    help: "A reply that is exactly one of these stops all further messages to that person.",
    type: "list",
    rules: { maxItems: 30, itemMaxLength: 30 },
    defaultLock: true,
    tighten: "superset_list",
    platformDefault: [],
  },
  {
    key: "compliance.quiet_hours",
    section: "compliance",
    label: "No messages between",
    help: "Outbound messages wait outside these hours, in the lead's own local time.",
    type: "time_window",
    required: true,
    defaultLock: true,
    tighten: "wider_window",
    platformDefault: { start: "20:00", end: "08:00" },
  },
  {
    key: "compliance.quiet_hours_basis",
    section: "compliance",
    label: "Quiet hours follow",
    help: "Whose clock quiet hours use.",
    type: "choice",
    rules: {
      options: [
        { value: "lead_local", label: "The lead's local time (stricter when unsure)" },
        { value: "workspace", label: "The business's time zone" },
      ],
    },
    defaultLock: true,
    platformDefault: "workspace",
  },
  {
    key: "compliance.daily_cap_per_lead",
    section: "compliance",
    label: "Most messages per lead per day",
    help: "Across every way Vistrial sends.",
    type: "number",
    rules: { min: 1, max: 20, integer: true },
    required: true,
    defaultLock: true,
    tighten: "lower_number",
    platformDefault: 2,
  },
  {
    key: "compliance.cap_applies_to",
    section: "compliance",
    label: "The daily limit covers",
    help: "Which sends count toward the daily limit.",
    type: "choice",
    rules: {
      options: [
        { value: "every_send", label: "Every message Vistrial sends" },
        { value: "auto_run_only", label: "Only messages sent without approval" },
      ],
    },
    defaultLock: true,
    platformDefault: "auto_run_only",
  },
  {
    key: "compliance.weekly_cap_per_lead",
    section: "compliance",
    label: "Most messages per lead per week",
    help: "0 means no weekly limit beyond the daily one.",
    type: "number",
    rules: { min: 0, max: 100, integer: true },
    defaultLock: true,
    tighten: "lower_number_zero_is_unlimited",
    platformDefault: 0,
  },
  {
    key: "compliance.required_disclosures",
    section: "compliance",
    label: "Required disclosures",
    help: "Text that must appear in messages, for example \"Reply STOP to opt out\".",
    type: "list",
    rules: { maxItems: 10, itemMaxLength: 300 },
    defaultLock: true,
    tighten: "superset_list",
    platformDefault: [],
  },
];

export const FIELD_BY_KEY: Record<string, FieldDef> = Object.fromEntries(
  CONFIG_FIELDS.map((field) => [field.key, field])
);

export function fieldsInSection(section: ConfigSection): FieldDef[] {
  return CONFIG_FIELDS.filter((field) => field.section === section);
}

/** The platform level as the registry defines it: every default, and the default locks. */
export function registryPlatformValues(): Record<string, ConfigValue> {
  const values: Record<string, ConfigValue> = {};
  for (const field of CONFIG_FIELDS) {
    if (field.platformDefault !== undefined) values[field.key] = field.platformDefault;
  }
  return values;
}

export function registryPlatformLocks(): string[] {
  return CONFIG_FIELDS.filter((field) => field.defaultLock).map((field) => field.key);
}

/**
 * The launch change recorded as platform version 2: the compliance rules
 * switched on at launch, as decided. Workspaces cannot loosen them.
 */
export const LAUNCH_COMPLIANCE_CHANGE: {
  note: string;
  values: Record<string, ConfigValue>;
} = {
  note:
    "Launch compliance rules, switched on deliberately: opt-out words stop all messages; the daily per-lead limit covers every send; quiet hours (8pm to 8am) follow the lead's local time; and the first-touch clock pauses outside business hours.",
  values: {
    "compliance.opt_out_words": ["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"],
    "compliance.cap_applies_to": "every_send",
    "compliance.quiet_hours_basis": "lead_local",
    "response.after_hours": "pause",
  },
};
