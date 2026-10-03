import { plural, type HomeArea } from "@/lib/home/areas/types";

/**
 * Sales: getting leads answered, followed up, and booked. Every action type
 * here has a matching row seeded in 20261002010000_home_screen.sql.
 */
export const SALES_AREA: HomeArea = {
  id: "sales",
  label: "Sales",
  actionTypes: [
    {
      id: "quiet_lead_follow_up",
      area: "sales",
      group: "people",
      reachesPeople: true,
      defaultMode: "ask_first",
      label: "Follow-up messages to quiet leads",
      description: "A message to a lead who has gone 48 hours or more with no activity.",
      describeDone: (count) => `Followed up with ${plural(count, "quiet lead", "quiet leads")}`,
    },
    {
      id: "no_show_rebook",
      area: "sales",
      group: "people",
      reachesPeople: true,
      defaultMode: "ask_first",
      label: "No-show rebooking messages",
      description: "A message offering a new time to someone who missed their appointment.",
      describeDone: (count) => `Sent rebooking messages to ${plural(count, "no-show", "no-shows")}`,
    },
    {
      id: "first_reply",
      area: "sales",
      group: "people",
      reachesPeople: true,
      defaultMode: "ask_first",
      label: "First reply to a new lead",
      description: "The first message a new lead gets from your team.",
      describeDone: (count) => `Replied to ${plural(count, "new lead", "new leads")}`,
    },
    {
      id: "client_report",
      area: "sales",
      group: "people",
      reachesPeople: true,
      defaultMode: "ask_first",
      label: "Reports sent to the client",
      description: "A summary of results emailed to the client.",
      describeDone: (count) => `Sent ${plural(count, "report", "reports")} to the client`,
    },
    {
      id: "crm_stage_change",
      area: "sales",
      group: "internal",
      reachesPeople: false,
      defaultMode: "ask_first",
      label: "CRM stage or tag changes",
      description: "Moving a lead to a new stage or adding a tag in your CRM.",
      describeDone: (count) => `Updated ${plural(count, "lead", "leads")} in the CRM`,
    },
    {
      id: "setter_nudge",
      area: "sales",
      group: "internal",
      reachesPeople: false,
      defaultMode: "auto_run",
      label: "Internal tasks and nudges to setters",
      description: "A task on the lead for whoever is assigned, when a new lead waits past your response window.",
      describeDone: (count) => `Nudged the team about ${plural(count, "untouched lead", "untouched leads")}`,
    },
    {
      id: "owner_escalation",
      area: "sales",
      group: "internal",
      reachesPeople: false,
      defaultMode: "auto_run",
      label: "Escalations to the owner",
      description: "A heads-up to you when something waits in the approval queue too long.",
      describeDone: (count) => `Escalated ${plural(count, "waiting item", "waiting items")} to the owner`,
    },
  ],
  // Untouched new leads first, then no-shows, then quiet leads.
  queueKinds: [
    { id: "untouched_lead_nudge", actionType: "setter_nudge", urgency: 10, label: "Untouched" },
    { id: "no_show_rebook", actionType: "no_show_rebook", urgency: 20, label: "No-show" },
    { id: "quiet_lead_follow_up", actionType: "quiet_lead_follow_up", urgency: 30, label: "Quiet lead" },
  ],
  cards: ["quiet_leads_recovered", "first_reply_time", "no_shows_rebooked", "revenue_booked"],
};
