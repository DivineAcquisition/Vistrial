/**
 * Onboarding Types for Vistrial
 * Niche-aware flow for home service contractors
 */

// Available trades
export const TRADES = [
  { id: "plumbing", label: "Plumbing" },
  { id: "hvac", label: "HVAC / Heating & Cooling" },
  { id: "electrical", label: "Electrical" },
  { id: "roofing", label: "Roofing" },
  { id: "cleaning_residential", label: "Cleaning (Residential)" },
  { id: "cleaning_commercial", label: "Cleaning (Commercial)" },
  { id: "landscaping", label: "Landscaping / Lawn Care" },
  { id: "painting", label: "Painting" },
  { id: "handyman", label: "Handyman / General Contractor" },
  { id: "pest_control", label: "Pest Control" },
  { id: "garage_doors", label: "Garage Doors" },
  { id: "windows_doors", label: "Windows & Doors" },
  { id: "flooring", label: "Flooring" },
  { id: "other", label: "Other" },
] as const

export type TradeId = (typeof TRADES)[number]["id"]

// Quote volume options
export const QUOTE_VOLUMES = [
  { id: "1-10", label: "1-10 quotes" },
  { id: "11-25", label: "11-25 quotes" },
  { id: "26-50", label: "26-50 quotes" },
  { id: "50+", label: "50+ quotes" },
] as const

export type QuoteVolume = (typeof QUOTE_VOLUMES)[number]["id"]

// Current follow-up options
export const FOLLOWUP_OPTIONS = [
  { id: "consistent", label: "I follow up consistently (call or text within a few days)" },
  { id: "sometimes", label: "I try to follow up but often forget" },
  { id: "reactive", label: "I only follow up if they call me first" },
  { id: "none", label: "What follow-up? (no judgment - you're busy)" },
] as const

export type FollowUpOption = (typeof FOLLOWUP_OPTIONS)[number]["id"]

// Complete onboarding data
export interface OnboardingData {
  // Step 1: Trade
  trade: TradeId | null
  tradeOther?: string
  businessName: string
  ownerName?: string
  businessPhone?: string

  // Step 2: Reality
  monthlyQuotes: QuoteVolume | null
  currentFollowUp: FollowUpOption | null
  perceivedCloseRate: number

  // Step 3: Twilio
  twilioAccountSid: string
  twilioAuthToken: string
  twilioPhoneNumber: string
  webhookConfigured: boolean

  // Step 4: Compliance
  complianceAcknowledged: boolean
  acknowledgedAt?: string

  // Step 5: Sequence
  sequenceTemplate: "default" | "custom"
  customMessages?: {
    step1?: string
    step2?: string
    step3?: string
    step4?: string
  }
}

// Initial onboarding state
export const initialOnboardingData: OnboardingData = {
  // Step 1
  trade: null,
  tradeOther: "",
  businessName: "",
  ownerName: "",
  businessPhone: "",

  // Step 2
  monthlyQuotes: null,
  currentFollowUp: null,
  perceivedCloseRate: 3,

  // Step 3
  twilioAccountSid: "",
  twilioAuthToken: "",
  twilioPhoneNumber: "",
  webhookConfigured: false,

  // Step 4
  complianceAcknowledged: false,

  // Step 5
  sequenceTemplate: "default",
}

// Onboarding step definitions
export interface OnboardingStep {
  id: number
  title: string
  description: string
  duration: string
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
  { id: 1, title: "Your Trade", description: "Tell us about your business", duration: "30 sec" },
  { id: 2, title: "Follow-Up Reality", description: "Your current process", duration: "45 sec" },
  { id: 3, title: "Texting Number", description: "Connect Twilio", duration: "2-3 min" },
  { id: 4, title: "Legal Stuff", description: "Quick compliance", duration: "30 sec" },
  { id: 5, title: "First Sequence", description: "Your follow-up messages", duration: "1 min" },
]
