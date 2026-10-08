import { LEGACY_BANNED_TERMS } from "@/lib/config/registry";
import type { ConfigValues } from "@/lib/config/types";

/**
 * The three starting templates. Each holds only what differs from the
 * platform default, so later improvements to the default still reach them.
 * All three start as drafts until a Platform Admin reviews and activates them.
 */
export type SeedTemplate = {
  slug: string;
  name: string;
  description: string;
  values: ConfigValues;
};

const PLATFORM_ESCALATION = [
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
];

export const MED_SPA: SeedTemplate = {
  slug: "med-spa",
  name: "Med Spa",
  description: "Injectables, facials, laser and skin treatments, body contouring, and memberships.",
  values: {
    "industry.business_description": "a med spa offering injectables, facials, laser and skin treatments, and body contouring",
    "industry.offers": [
      { name: "Injectables (wrinkle relaxers and fillers)", ticket_min: 300, ticket_max: 1500, recurring: false },
      { name: "Facials and peels", ticket_min: 150, ticket_max: 400, recurring: false },
      { name: "Laser and skin treatments", ticket_min: 300, ticket_max: 2500, recurring: false },
      { name: "Body contouring", ticket_min: 600, ticket_max: 4000, recurring: false },
      { name: "Membership", ticket_min: 99, ticket_max: 299, recurring: true },
    ],
    "industry.case_facts": [
      { key: "treatment_interest", label: "Treatment of interest", type: "text", required: true },
      { key: "concern", label: "What they want to change", type: "text", required: false },
      { key: "prior_treatments", label: "Treatments they have had before", type: "text", required: false },
      { key: "timeline", label: "When they want it done", type: "text", required: true },
      { key: "budget_comfort", label: "Budget they are comfortable with", type: "text", required: false },
      { key: "consultation_preference", label: "In-person or virtual consultation", type: "text", required: false },
    ],
    "industry.urgency_signals": [
      "An upcoming event, like a wedding, holiday, or trip",
      "As soon as possible",
      "This week",
      "Asks about a promotion before it ends",
      "Asks for the next available appointment",
    ],
    "industry.objections": [
      {
        label: "Cost",
        category: "price",
        recognize: "\"How much is it?\", \"That's more than I thought\", \"Do you have payment plans?\"",
        guidance: "Give the price range plainly, explain what is included, and mention memberships or payment options if you offer them. Never discount under pressure.",
      },
      {
        label: "Nervous about the treatment",
        category: "trust",
        recognize: "\"Does it hurt?\", \"I'm worried it will look fake\", \"What if something goes wrong?\"",
        guidance: "Acknowledge the worry, explain what the treatment involves in simple terms, and offer a consultation to talk it through with the provider. Make no medical claims or promises about results.",
      },
      {
        label: "Timing",
        category: "timing",
        recognize: "\"Not right now\", \"Maybe after the holidays\", \"I'm too busy this month\"",
        guidance: "Ask whether there is an event or date they have in mind, and offer to hold a time that suits them.",
      },
      {
        label: "Trust in the provider",
        category: "trust",
        recognize: "\"Who does the treatment?\", \"Are they certified?\", \"Can I see before-and-after photos?\"",
        guidance: "Share the provider's credentials and experience, and point to reviews or a gallery. Offer a consultation to meet them first.",
      },
      {
        label: "Needs to think about it",
        category: "fit",
        recognize: "\"Let me think about it\", \"I'll get back to you\"",
        guidance: "Respect it. Offer one clear, easy next step, like a free consultation, and check in once without pressure.",
      },
    ],
    "industry.lead_sources": [
      { source: "Website booking form", priority: "high", treatment: "Reply quickly; they already chose a time slot or treatment." },
      { source: "Google search", priority: "high", treatment: "Usually ready to book. Lead with availability." },
      { source: "Instagram or Facebook ads", priority: "normal", treatment: "Often browsing. Start with the treatment they clicked on." },
      { source: "Referral from a client", priority: "high", treatment: "Mention who referred them and thank them." },
    ],
    "qualification.ready_criteria": [
      "Asks about a specific treatment or its price.",
      "Asks about availability or the next open appointment.",
      "Has had a consultation or treatment with us before.",
      "Mentions an event or a date they want to look their best for.",
    ],
    "qualification.not_ready_criteria": [
      "General browsing with no treatment in mind.",
      "Asks only about price, with no interest in a specific treatment.",
      "Says they are \"just looking\".",
    ],
    "qualification.disqualifiers": [
      {
        reason: "Lives outside the area we serve.",
        closing_message: "Thanks so much for reaching out. We only see clients in our local area, so we're not the right fit, but we hope you find someone wonderful nearby.",
      },
      {
        reason: "Below the minimum age for treatment.",
        closing_message: "Thank you for your interest. We can only treat clients who are 18 or older, so we're not able to book you in.",
      },
      {
        reason: "Wants a treatment we do not offer.",
        closing_message: "Thanks for asking. That's not a treatment we offer, so we'd rather point you to a specialist who does.",
      },
    ],
    "qualification.minimum_info": ["treatment_interest", "timeline"],
    "response.first_touch_minutes": 5,
    "response.follow_up_cadence": [
      { stage: "working", max_gap_hours: 4 },
      { stage: "follow_up", max_gap_hours: 24 },
      { stage: "objection_hold", max_gap_hours: 24 },
      { stage: "no_show", max_gap_hours: 4 },
    ],
    "response.ghost_days_soft": 3,
    "response.ghost_days_hard": 7,
    "response.max_sequence_days": 7,
    "tone.formality": "friendly",
    "tone.emoji": "sparing",
    "tone.sms_max_chars": 300,
    "tone.punctuation_rules": "At most one exclamation mark per message. No capitals for emphasis.",
    "tone.preferred_terms": ["consultation", "treatment plan", "provider", "results vary"],
    "tone.banned_terms": [
      ...LEGACY_BANNED_TERMS,
      "guaranteed results",
      "cure",
      "permanent",
      "risk-free",
      "pain-free",
      "act now",
      "last chance",
      "limited time only",
    ],
    "tone.examples": [
      {
        channel: "sms",
        body: "Hi Jess, it's Maya from Glow Studio. We have a lip filler consultation open Thursday at 4. Would that work for you?",
      },
      {
        channel: "email",
        body: "Thanks for asking about laser skin resurfacing. A short consultation lets our provider look at your skin and talk through what to expect, including downtime and cost. We have openings this week on Tuesday and Thursday afternoon. Would either suit you?",
      },
    ],
  },
};

export const HOME_SERVICES: SeedTemplate = {
  slug: "home-services",
  name: "Home Services",
  description: "Recurring and one-time jobs: cleaning, HVAC, roofing, lawn care, plumbing, pest control, remodeling.",
  values: {
    "industry.business_description": "a local home services company doing recurring and one-time jobs at people's homes",
    "identity.business_hours": {
      days: {
        mon: [{ start: "07:00", end: "18:00" }],
        tue: [{ start: "07:00", end: "18:00" }],
        wed: [{ start: "07:00", end: "18:00" }],
        thu: [{ start: "07:00", end: "18:00" }],
        fri: [{ start: "07:00", end: "18:00" }],
        sat: [{ start: "08:00", end: "14:00" }],
        sun: [],
      },
      closures: [],
    },
    "industry.offers": [
      { name: "Recurring service (cleaning, lawn care, pest control)", ticket_min: 100, ticket_max: 400, recurring: true },
      { name: "One-time job", ticket_min: 150, ticket_max: 1500, recurring: false },
      { name: "Repair or emergency call-out", ticket_min: 150, ticket_max: 800, recurring: false },
      { name: "Large project (roofing, HVAC replacement, remodeling)", ticket_min: 3000, ticket_max: 40000, recurring: false },
    ],
    "industry.case_facts": [
      { key: "service_type", label: "Service needed", type: "text", required: true },
      { key: "property_type", label: "Property type (house, apartment, business)", type: "text", required: false },
      { key: "property_size", label: "Property size", type: "text", required: false },
      { key: "service_area", label: "Address or area", type: "text", required: true },
      { key: "timing", label: "When they need it", type: "text", required: true },
      { key: "frequency", label: "One-time or recurring", type: "text", required: false },
      { key: "access_notes", label: "Access notes (gate code, pets, parking)", type: "text", required: false },
    ],
    "industry.urgency_signals": [
      "today",
      "leak",
      "flooding",
      "broken",
      "no heat",
      "no AC",
      "emergency",
      "A move-in or move-out date",
    ],
    "industry.objections": [
      {
        label: "Price",
        category: "price",
        recognize: "\"That's expensive\", \"Can you do it cheaper?\"",
        guidance: "Explain what the price includes and why. Offer a smaller first job or a recurring rate if you have one. Do not undercut yourself to win the job.",
      },
      {
        label: "Availability",
        category: "timing",
        recognize: "\"When can you come?\", \"I need it sooner than that\"",
        guidance: "Give the earliest real date. If an emergency, say what you can do today.",
      },
      {
        label: "Trust and reviews",
        category: "trust",
        recognize: "\"Are you insured?\", \"Do you have reviews?\"",
        guidance: "Confirm licensing and insurance, and share where to read reviews.",
      },
      {
        label: "Getting other quotes",
        category: "competitor",
        recognize: "\"I'm getting a few quotes\", \"Someone else quoted less\"",
        guidance: "That's sensible. Make your quote easy to compare: what is included, warranty, and timing. Follow up once after a couple of days.",
      },
      {
        label: "Timing",
        category: "timing",
        recognize: "\"Not until next month\", \"After the holidays\"",
        guidance: "Offer to book a date now so they keep the slot, and set a reminder.",
      },
    ],
    "industry.lead_sources": [
      { source: "Google local listing", priority: "high", treatment: "Usually needs help soon. Reply with the earliest date." },
      { source: "Website quote form", priority: "high", treatment: "Confirm the job and the address, then give a time." },
      { source: "Referral", priority: "high", treatment: "Mention who referred them." },
      { source: "Lead marketplace (Angi, Thumbtack)", priority: "normal", treatment: "Reply fast; they contacted several companies." },
      { source: "Flyers and door hangers", priority: "low", treatment: "Often price shopping. Lead with a clear starting price." },
    ],
    "qualification.ready_criteria": [
      "Described a specific job.",
      "Gave an address or the area they are in.",
      "Asked for a quote or a date.",
      "Mentioned something urgent, like a leak or a broken system.",
    ],
    "qualification.not_ready_criteria": [
      "Curious about prices in general.",
      "Comparing many providers with no date in mind.",
    ],
    "qualification.disqualifiers": [
      {
        reason: "Outside our service area.",
        closing_message: "Thanks for getting in touch. That address is outside the area we cover, so we can't help with this one. Sorry we couldn't be more useful.",
      },
      {
        reason: "A job type we do not offer.",
        closing_message: "Thanks for asking. That's not a job we do, but a specialist will be able to help.",
      },
      {
        reason: "Below our minimum job size.",
        closing_message: "Thanks for reaching out. That job is smaller than we usually take on, so we're not the best fit this time.",
      },
    ],
    "qualification.minimum_info": ["service_type", "service_area", "timing"],
    "response.first_touch_minutes": 10,
    "response.follow_up_cadence": [
      { stage: "working", max_gap_hours: 24 },
      { stage: "follow_up", max_gap_hours: 48 },
      { stage: "objection_hold", max_gap_hours: 48 },
      { stage: "no_show", max_gap_hours: 24 },
    ],
    "response.ghost_days_soft": 7,
    "response.ghost_days_hard": 21,
    "response.max_sequence_days": 14,
    "escalation.levels": [
      ...PLATFORM_ESCALATION,
      {
        severity: "urgent",
        trigger: "A lead mentions an emergency, like a leak, flooding, or no heat.",
        notify: ["assignee", "managers"],
        channels: ["push", "sms"],
      },
    ],
    "tone.formality": "friendly",
    "tone.sms_max_chars": 200,
    "tone.email_max_chars": 600,
    "tone.punctuation_rules": "Plain words and short sentences. No exclamation marks in quotes or prices.",
    "tone.banned_terms": [...LEGACY_BANNED_TERMS, "kindly", "do not hesitate", "per our conversation"],
    "tone.examples": [
      { channel: "sms", body: "Hi Dan, it's Luis from Northside Plumbing. We can be there tomorrow between 8 and 10 to look at the leak. Does that work?" },
      { channel: "sms", body: "Thanks for the photos. A full gutter clean for a two-story house is usually $180 to $240. Want me to book you in for Saturday morning?" },
    ],
  },
};

export const COACHES_CONSULTANTS: SeedTemplate = {
  slug: "coaches-consultants",
  name: "Coaches and Consultants",
  description: "High-ticket programs, group programs, one-to-one coaching, and consulting engagements.",
  values: {
    "industry.business_description": "a high-ticket coaching or consulting business that sells through sales calls",
    "industry.offers": [
      { name: "High-ticket program", ticket_min: 3000, ticket_max: 25000, recurring: false },
      { name: "Group program", ticket_min: 500, ticket_max: 5000, recurring: false },
      { name: "One-to-one coaching", ticket_min: 1000, ticket_max: 10000, recurring: true },
      { name: "Consulting engagement", ticket_min: 5000, ticket_max: 50000, recurring: false },
    ],
    "industry.case_facts": [
      { key: "stated_goal", label: "What they want to achieve", type: "text", required: true },
      { key: "current_situation", label: "Where they are now", type: "text", required: false },
      { key: "budget_range", label: "Budget range", type: "text", required: true },
      { key: "decision_maker", label: "Who makes the decision", type: "text", required: true },
      { key: "timeline", label: "When they want to start", type: "text", required: true },
      { key: "previous_coaching", label: "Coaching or consulting they have had before", type: "text", required: false },
      { key: "objections_raised", label: "Objections raised on the call", type: "text", required: false },
    ],
    "industry.urgency_signals": [
      "A stated deadline",
      "A launch date coming up",
      "\"Ready to start\"",
      "A recent trigger event, like losing a client or new funding",
    ],
    "industry.objections": [
      {
        label: "Price",
        category: "price",
        recognize: "\"It's a lot of money right now\", \"I can't justify that\"",
        guidance: "Tie the investment back to the goal they stated and what it is costing them to stay where they are. Offer a payment plan only if one exists.",
      },
      {
        label: "Timing",
        category: "timing",
        recognize: "\"Now's not the right time\", \"Maybe next quarter\"",
        guidance: "Ask what would need to be true for the timing to be right, and what waiting costs them.",
      },
      {
        label: "Needs to talk to a partner or team",
        category: "spouse_partner",
        recognize: "\"I need to talk to my partner\", \"I have to run it by my team\"",
        guidance: "Offer a short call with the other decision-maker, and send a one-page summary they can share.",
      },
      {
        label: "Skeptical about results",
        category: "trust",
        recognize: "\"How do I know this will work for me?\"",
        guidance: "Share a relevant client story with specifics, and be honest about what the program needs from them.",
      },
      {
        label: "Past bad experience",
        category: "trust",
        recognize: "\"I've done a program before and it didn't work\"",
        guidance: "Ask what went wrong, listen, and explain clearly how this differs. Never criticize the other provider.",
      },
    ],
    "industry.lead_sources": [
      { source: "Referral", priority: "high", treatment: "Mention who referred them; trust is already there." },
      { source: "Paid social ads", priority: "normal", treatment: "Confirm the problem they want solved before talking about the offer." },
      { source: "Webinar or podcast", priority: "normal", treatment: "Reference what they watched or heard." },
      { source: "Email list", priority: "normal", treatment: "They know you; ask what prompted them to reply now." },
    ],
    "qualification.ready_criteria": [
      "Has stated a clear problem and the goal they want.",
      "Has acknowledged the budget.",
      "The decision-maker is on the call.",
      "Has stated a timeline for starting.",
      "Has engaged with earlier touches.",
    ],
    "qualification.not_ready_criteria": [
      "Curious, but with no clear goal.",
      "No budget for this yet.",
      "Needs approval from someone who is not on the call.",
    ],
    "qualification.disqualifiers": [
      {
        reason: "Not at the right stage for the offer.",
        closing_message: "Thanks for the time today. Based on where you are right now, this isn't the right program yet. Here's what I'd focus on first, and I'm happy to talk again when you get there.",
      },
      {
        reason: "No decision-making authority, with no path to the person who has it.",
        closing_message: null,
      },
      {
        reason: "Unwilling to commit to the program format.",
        closing_message: "Thanks for being straight with me. The program only works with the full commitment, so it wouldn't be fair to take you on. I wish you the best with it.",
      },
    ],
    "qualification.minimum_info": ["stated_goal", "budget_range", "decision_maker", "timeline"],
    "response.first_touch_minutes": 15,
    "response.follow_up_cadence": [
      { stage: "working", max_gap_hours: 48 },
      { stage: "follow_up", max_gap_hours: 96 },
      { stage: "objection_hold", max_gap_hours: 72 },
      { stage: "no_show", max_gap_hours: 24 },
    ],
    "tone.formality": "friendly",
    "tone.punctuation_rules": "Confident and plain. No hype, no exclamation marks in follow-ups after a call.",
    "tone.banned_terms": [...LEGACY_BANNED_TERMS, "guaranteed", "life-changing", "secret", "hack", "only a few spots left"],
    "tone.examples": [
      { channel: "sms", body: "Good talking today, Sam. You said the goal is 10 clients a month by March. I'll send the plan we walked through tonight; worth looking at before Thursday's call." },
      {
        channel: "email",
        body: "Thanks for walking me through where the business is. You mentioned two things are holding growth back: no consistent lead flow and closing calls yourself. The program covers both, and the next step is a 20-minute call with your business partner so you can decide together. Does Thursday at 2 work?",
      },
    ],
  },
};

export const SEED_TEMPLATES: SeedTemplate[] = [MED_SPA, HOME_SERVICES, COACHES_CONSULTANTS];
