/**
 * Fabricated, plausible case file used on the public site. Not a client.
 * Shape matches the operator Case File: score, factors, objection, last touch.
 */
export const DEMO_CASE = {
  sampleLabel: "Sample",
  name: "Jordan Hale",
  email: "jordan@northline.example",
  phone: "(415) 555-0148",
  source: "Meta · High-ticket coaching",
  campaign: "March webinar replay",
  status: "Working",
  track: "Ready now",
  setter: "Maya Chen",
  closer: "Chris Adel",
  lastTouch: "14 hours ago",
  lastTouchChannel: "SMS",
  lastTouchWho: "Maya Chen",
  optedIn: "3 days ago",
  score: {
    total: 74,
    confidence: "High · 4 of 4",
    reasoning:
      "Timeline is this quarter. Budget is in range. Spouse is on the decision. Pain is the missed follow-up on their own list.",
    factors: [
      { key: "timeline", label: "How soon they want to move", value: 82 },
      { key: "investment_capacity", label: "What they can spend", value: 70 },
      { key: "decision_authority", label: "Whether they decide", value: 64 },
      { key: "pain_severity", label: "How much it hurts", value: 81 },
    ],
  },
  objection: {
    type: "Timing",
    verbatim:
      "I need to see if we can do this after the Q4 launch. The budget is earmarked until then.",
    source: "Discovery · 2 days ago",
  },
  touches: [
    {
      when: "14 hours ago",
      who: "Maya Chen",
      channel: "SMS",
      detail: "Sent the recap Maya promised on the setter call.",
    },
    {
      when: "2 days ago",
      who: "Maya Chen",
      channel: "Call",
      detail: "Discovery, 18 min. Spouse decides with them. Asked about timing.",
    },
    {
      when: "2 days ago",
      who: "System",
      channel: "SMS",
      detail: "First touch 4 minutes after opt-in.",
    },
    {
      when: "3 days ago",
      who: "Jordan Hale",
      channel: "Form",
      detail: "Webinar replay opt-in.",
    },
  ],
  transcript: {
    title: "Discovery · 18 min",
    budget: "Can do five figures if the spouse is in. Not this month’s cash.",
    timeline: "Wants to start after the Q4 launch. Named a date.",
    authority: "Spouse has to be on the close call. Will not decide alone.",
  },
  brief: {
    who: "Jordan Hale · Meta webinar replay",
    setter:
      "Qualified on pain and timeline. Did not push price. Booked Chris for a close.",
    quote: "We have been paying for leads we never actually talk to.",
  },
  followUp: {
    channel: "Email",
    status: "Pending approval",
    body: "Jordan — on the call you said the Q4 launch has the budget until it ships. Chris has a slot after that date, and Maya already flagged the spouse needs to be there. Reply yes and we will send the invite.",
  },
} as const;
