/**
 * Trade-specific configurations for onboarding
 * Customizes job types, sequences, and messaging per trade
 */

import type { TradeId } from "./types"

export interface TradeConfig {
  id: TradeId
  name: string
  jobTypes: string[]
  avgQuoteRange: string
  urgencyLevel: "high" | "medium" | "low"
  empathyLine: string
  sequenceSteps: number
  sequenceDays: number
  defaultMessages: {
    step1: string
    step2: string
    step3: string
    step4?: string
  }
}

export const TRADE_CONFIGS: Record<TradeId, TradeConfig> = {
  plumbing: {
    id: "plumbing",
    name: "Plumbing",
    jobTypes: ["Water Heater", "Drain Cleaning", "Pipe Repair", "Bathroom Remodel", "Emergency Repair", "Faucet/Fixture"],
    avgQuoteRange: "$150-$5,000",
    urgencyLevel: "high",
    empathyLine: "Hard to send texts when you're under a sink",
    sequenceSteps: 3,
    sequenceDays: 7,
    defaultMessages: {
      step1: `Hi {{first_name}}, this is {{business_name}} confirming your quote for {{quote_amount}}. Any questions about the work? Just reply here or call {{business_phone}}. Reply STOP to opt out.`,
      step2: `Hey {{first_name}}, checking in on your plumbing quote. I've got availability this week if you're ready to get it handled. Let me know!`,
      step3: `{{first_name}}, just following up one more time on your quote. If you're ready, reply YES and I'll call to schedule. If not, no worries - we're here when you need us.`,
    },
  },

  hvac: {
    id: "hvac",
    name: "HVAC / Heating & Cooling",
    jobTypes: ["AC Install", "AC Repair", "Heating Install", "Heating Repair", "Maintenance", "Emergency Service", "Ductwork"],
    avgQuoteRange: "$200-$8,000",
    urgencyLevel: "high",
    empathyLine: "Can't follow up when you're in an attic in July",
    sequenceSteps: 3,
    sequenceDays: 7,
    defaultMessages: {
      step1: `Hi {{first_name}}, this is {{business_name}} confirming your HVAC quote for {{quote_amount}}. Any questions? Just reply here or call {{business_phone}}. Reply STOP to opt out.`,
      step2: `Hey {{first_name}}, checking in on your HVAC quote. With the weather we've been having, I'd love to get you taken care of soon. Let me know if you're ready!`,
      step3: `{{first_name}}, final follow-up on your quote. Ready to get comfortable? Reply YES to schedule. We're here when you need us.`,
    },
  },

  electrical: {
    id: "electrical",
    name: "Electrical",
    jobTypes: ["Panel Upgrade", "Outlet Install", "Lighting", "Rewiring", "Emergency Repair", "EV Charger", "Generator"],
    avgQuoteRange: "$100-$3,000",
    urgencyLevel: "medium",
    empathyLine: "Tough to text with wire strippers in your hands",
    sequenceSteps: 3,
    sequenceDays: 7,
    defaultMessages: {
      step1: `Hi {{first_name}}, this is {{business_name}} confirming your electrical quote for {{quote_amount}}. Any questions about the work? Reply here or call {{business_phone}}. Reply STOP to opt out.`,
      step2: `Hey {{first_name}}, following up on your electrical quote. Got time on the schedule this week if you're ready. Let me know!`,
      step3: `{{first_name}}, just checking in one last time. Reply YES if you'd like to get this scheduled, or let me know if you have questions.`,
    },
  },

  roofing: {
    id: "roofing",
    name: "Roofing",
    jobTypes: ["Roof Repair", "Roof Replacement", "Inspection", "Storm Damage", "Gutter Work", "Skylight"],
    avgQuoteRange: "$500-$15,000",
    urgencyLevel: "low",
    empathyLine: "No one's checking their phone on a roof",
    sequenceSteps: 4,
    sequenceDays: 14,
    defaultMessages: {
      step1: `Hi {{first_name}}, this is {{business_name}} confirming your roofing quote for {{quote_amount}}. Happy to answer any questions - just reply here or call {{business_phone}}. Reply STOP to opt out.`,
      step2: `Hey {{first_name}}, checking in on your roofing quote. I know it's a big decision - happy to walk through anything if you have questions.`,
      step3: `{{first_name}}, following up on your roof quote. We're booking out a few weeks, so wanted to give you a heads up on timing. Let me know when you're ready!`,
      step4: `{{first_name}}, final follow-up on your roofing quote. Ready when you are - just reply YES or give us a call. Thanks!`,
    },
  },

  cleaning_residential: {
    id: "cleaning_residential",
    name: "Cleaning (Residential)",
    jobTypes: ["One-Time Clean", "Weekly Service", "Bi-Weekly Service", "Move-Out Clean", "Deep Clean", "Post-Construction"],
    avgQuoteRange: "$100-$400",
    urgencyLevel: "low",
    empathyLine: "You're too busy cleaning to chase callbacks",
    sequenceSteps: 3,
    sequenceDays: 5,
    defaultMessages: {
      step1: `Hi {{first_name}}, this is {{business_name}} confirming your cleaning quote for {{quote_amount}}. Any questions? Reply here or call {{business_phone}}. Reply STOP to opt out.`,
      step2: `Hey {{first_name}}, quick follow-up on your cleaning quote. I have openings this week if you're ready to get on the schedule!`,
      step3: `{{first_name}}, last check-in on your quote. Reply YES and I'll get you booked, or let me know if things have changed. Either way, thanks for considering us!`,
    },
  },

  cleaning_commercial: {
    id: "cleaning_commercial",
    name: "Cleaning (Commercial)",
    jobTypes: ["Office Cleaning", "Retail Cleaning", "Medical Facility", "Warehouse", "Post-Construction", "Floor Care"],
    avgQuoteRange: "$200-$2,000",
    urgencyLevel: "medium",
    empathyLine: "You're too busy cleaning to chase callbacks",
    sequenceSteps: 3,
    sequenceDays: 7,
    defaultMessages: {
      step1: `Hi {{first_name}}, this is {{business_name}} confirming your commercial cleaning quote for {{quote_amount}}. Questions? Reply here or call {{business_phone}}. Reply STOP to opt out.`,
      step2: `{{first_name}}, checking in on your cleaning quote. Happy to discuss the scope or answer any questions about our commercial services.`,
      step3: `{{first_name}}, final follow-up on your quote. Ready to get started? Reply YES or let me know how we can help.`,
    },
  },

  landscaping: {
    id: "landscaping",
    name: "Landscaping / Lawn Care",
    jobTypes: ["Lawn Maintenance", "Landscaping Design", "Tree Service", "Irrigation", "Hardscaping", "Seasonal Cleanup"],
    avgQuoteRange: "$100-$5,000",
    urgencyLevel: "low",
    empathyLine: "Hard to text when you're on the mower",
    sequenceSteps: 3,
    sequenceDays: 7,
    defaultMessages: {
      step1: `Hi {{first_name}}, this is {{business_name}} confirming your landscaping quote for {{quote_amount}}. Any questions? Reply here or call {{business_phone}}. Reply STOP to opt out.`,
      step2: `Hey {{first_name}}, following up on your landscaping quote. Great weather coming up for getting this done - let me know if you're ready!`,
      step3: `{{first_name}}, final check-in on your quote. Reply YES to get scheduled, or let me know if things have changed.`,
    },
  },

  painting: {
    id: "painting",
    name: "Painting",
    jobTypes: ["Interior Painting", "Exterior Painting", "Cabinet Refinish", "Touch-Up Work", "Staining", "Wallpaper Removal"],
    avgQuoteRange: "$300-$5,000",
    urgencyLevel: "low",
    empathyLine: "Paint-covered fingers don't type well",
    sequenceSteps: 3,
    sequenceDays: 7,
    defaultMessages: {
      step1: `Hi {{first_name}}, this is {{business_name}} confirming your painting quote for {{quote_amount}}. Any questions about colors or the process? Reply here or call {{business_phone}}. Reply STOP to opt out.`,
      step2: `Hey {{first_name}}, following up on your painting quote. I have availability coming up if you're ready to transform the space!`,
      step3: `{{first_name}}, last follow-up on your quote. Ready to get started? Reply YES and I'll get you on the schedule.`,
    },
  },

  handyman: {
    id: "handyman",
    name: "Handyman / General Contractor",
    jobTypes: ["General Repairs", "Assembly", "Mounting/Hanging", "Door/Window Repair", "Drywall", "Small Remodels"],
    avgQuoteRange: "$100-$2,000",
    urgencyLevel: "medium",
    empathyLine: "Too many tools in your hands to hold a phone",
    sequenceSteps: 3,
    sequenceDays: 7,
    defaultMessages: {
      step1: `Hi {{first_name}}, this is {{business_name}} confirming your quote for {{quote_amount}}. Any questions about the work? Reply here or call {{business_phone}}. Reply STOP to opt out.`,
      step2: `Hey {{first_name}}, checking in on your quote. I've got some time this week if you're ready to knock this out. Let me know!`,
      step3: `{{first_name}}, following up one more time. Reply YES to get scheduled, or let me know if you have questions.`,
    },
  },

  pest_control: {
    id: "pest_control",
    name: "Pest Control",
    jobTypes: ["General Pest", "Termite Treatment", "Rodent Control", "Bed Bugs", "Mosquito Treatment", "Wildlife Removal"],
    avgQuoteRange: "$150-$1,000",
    urgencyLevel: "high",
    empathyLine: "Hard to text while dealing with someone's pest problem",
    sequenceSteps: 3,
    sequenceDays: 5,
    defaultMessages: {
      step1: `Hi {{first_name}}, this is {{business_name}} confirming your pest control quote for {{quote_amount}}. Ready to solve your problem - just reply here or call {{business_phone}}. Reply STOP to opt out.`,
      step2: `Hey {{first_name}}, following up on your pest control quote. The sooner we treat, the sooner they're gone. Want to get you scheduled?`,
      step3: `{{first_name}}, last check-in. Don't let those pests get comfortable! Reply YES to get on the schedule.`,
    },
  },

  garage_doors: {
    id: "garage_doors",
    name: "Garage Doors",
    jobTypes: ["Door Repair", "Door Replacement", "Opener Install", "Opener Repair", "Spring Replacement", "Maintenance"],
    avgQuoteRange: "$150-$2,500",
    urgencyLevel: "high",
    empathyLine: "Can't text while you're wrestling with a garage door",
    sequenceSteps: 3,
    sequenceDays: 5,
    defaultMessages: {
      step1: `Hi {{first_name}}, this is {{business_name}} confirming your garage door quote for {{quote_amount}}. Any questions? Reply here or call {{business_phone}}. Reply STOP to opt out.`,
      step2: `Hey {{first_name}}, checking in on your garage door quote. Security matters - let me know when you're ready to get this fixed!`,
      step3: `{{first_name}}, final follow-up. Ready to get that door working right? Reply YES to schedule.`,
    },
  },

  windows_doors: {
    id: "windows_doors",
    name: "Windows & Doors",
    jobTypes: ["Window Replacement", "Door Install", "Storm Windows", "Screen Repair", "Glass Repair", "Entry Doors"],
    avgQuoteRange: "$200-$5,000",
    urgencyLevel: "low",
    empathyLine: "Hard to text with a window in your hands",
    sequenceSteps: 3,
    sequenceDays: 10,
    defaultMessages: {
      step1: `Hi {{first_name}}, this is {{business_name}} confirming your window/door quote for {{quote_amount}}. Any questions? Reply here or call {{business_phone}}. Reply STOP to opt out.`,
      step2: `Hey {{first_name}}, following up on your quote. Energy bills adding up? Let's get those new windows in. Let me know when you're ready!`,
      step3: `{{first_name}}, final check-in on your quote. Reply YES to get scheduled, or let me know if you have questions.`,
    },
  },

  flooring: {
    id: "flooring",
    name: "Flooring",
    jobTypes: ["Hardwood Install", "Tile Install", "Carpet Install", "LVP/Laminate", "Refinishing", "Repair"],
    avgQuoteRange: "$500-$8,000",
    urgencyLevel: "low",
    empathyLine: "Too busy on your hands and knees to check your phone",
    sequenceSteps: 3,
    sequenceDays: 10,
    defaultMessages: {
      step1: `Hi {{first_name}}, this is {{business_name}} confirming your flooring quote for {{quote_amount}}. Questions about materials or timeline? Reply here or call {{business_phone}}. Reply STOP to opt out.`,
      step2: `Hey {{first_name}}, following up on your flooring quote. Ready to transform those floors? I've got openings coming up!`,
      step3: `{{first_name}}, last follow-up on your quote. Reply YES and I'll get you on the schedule. Looking forward to it!`,
    },
  },

  other: {
    id: "other",
    name: "Other",
    jobTypes: ["Service Call", "Repair", "Installation", "Consultation", "Maintenance"],
    avgQuoteRange: "$100-$2,000",
    urgencyLevel: "medium",
    empathyLine: "You're busy - we get it",
    sequenceSteps: 3,
    sequenceDays: 7,
    defaultMessages: {
      step1: `Hi {{first_name}}, this is {{business_name}} confirming your quote for {{quote_amount}}. Any questions? Reply here or call {{business_phone}}. Reply STOP to opt out.`,
      step2: `Hey {{first_name}}, following up on your quote. I've got availability this week if you're ready. Let me know!`,
      step3: `{{first_name}}, final follow-up on your quote. Reply YES to schedule, or let me know if you have questions. Thanks!`,
    },
  },
}

/**
 * Get trade config by ID
 */
export function getTradeConfig(tradeId: TradeId): TradeConfig {
  return TRADE_CONFIGS[tradeId] || TRADE_CONFIGS.other
}

/**
 * Get trade-specific empathy message
 */
export function getTradeEmpathy(tradeId: TradeId): string {
  return TRADE_CONFIGS[tradeId]?.empathyLine || TRADE_CONFIGS.other.empathyLine
}

/**
 * Get default job types for a trade
 */
export function getTradeJobTypes(tradeId: TradeId): string[] {
  return TRADE_CONFIGS[tradeId]?.jobTypes || TRADE_CONFIGS.other.jobTypes
}
