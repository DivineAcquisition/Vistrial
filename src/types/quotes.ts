/**
 * Quote System Types for Vistrial
 */

// Quote status
export type QuoteStatus = 
  | "draft" 
  | "sent" 
  | "viewed" 
  | "accepted" 
  | "declined" 
  | "expired"

// Property condition
export type PropertyCondition = "clean" | "average" | "dirty" | "very_dirty"

// Property type
export type PropertyType = "house" | "apartment" | "condo" | "townhouse"

// Pricing method
export type PricingMethod = "flat" | "sqft" | "variable" | "hourly"

// Follow-up status
export type FollowUpStatus = "pending" | "sent" | "failed" | "skipped" | "cancelled"

// Quote interface
export interface Quote {
  id: string
  created_at: string
  updated_at: string
  
  // Relationships
  business_id: string
  contact_id: string
  service_type_id: string | null
  
  // Quote details
  quote_number: string
  title: string | null
  
  // Property info
  address_line1: string | null
  city: string | null
  state: string | null
  zip: string | null
  sqft: number | null
  bedrooms: number | null
  bathrooms: number | null
  property_type: PropertyType | null
  property_condition: PropertyCondition | null
  has_pets: boolean
  pet_details: string | null
  
  // Pricing
  pricing_method: PricingMethod
  base_price: number | null
  adjustments: QuoteAdjustment[]
  subtotal: number
  discount_amount: number
  discount_reason: string | null
  total: number
  
  // Cost & Profit
  estimated_hours: number | null
  labor_cost: number | null
  supply_cost: number | null
  travel_cost: number | null
  total_cost: number | null
  profit_amount: number | null
  profit_margin: number | null
  
  // Status
  status: QuoteStatus
  sent_at: string | null
  viewed_at: string | null
  responded_at: string | null
  expires_at: string | null
  
  // Response
  decline_reason: string | null
  customer_notes: string | null
  
  // Follow-up
  follow_up_enabled: boolean
  follow_up_paused: boolean
  next_follow_up_at: string | null
  follow_up_count: number
  
  // Conversion
  converted_to_booking_id: string | null
  converted_at: string | null
  
  // Internal
  internal_notes: string | null
  access_token: string | null
  
  // Joined
  contact?: Contact
  service_type?: ServiceType
}

// Quote adjustment
export interface QuoteAdjustment {
  name: string
  amount: number
  type: "add" | "subtract" | "percent"
}

// Quote line item
export interface QuoteLineItem {
  id: string
  quote_id: string
  name: string
  description: string | null
  quantity: number
  unit_price: number
  total: number
  estimated_minutes: number | null
  labor_cost: number | null
  supply_cost: number | null
  is_optional: boolean
  is_selected: boolean
  display_order: number
}

// Quote follow-up
export interface QuoteFollowUp {
  id: string
  created_at: string
  quote_id: string
  scheduled_for: string
  sent_at: string | null
  channel: "sms" | "email" | "call"
  template_key: string | null
  message_body: string | null
  status: FollowUpStatus
  failure_reason: string | null
  opened_at: string | null
  clicked_at: string | null
  replied_at: string | null
  message_id: string | null
  day_number: number | null
}

// Pricing template
export interface PricingTemplate {
  id: string
  created_at: string
  business_id: string
  name: string
  description: string | null
  service_type: string | null
  pricing_method: PricingMethod
  
  // Flat rate
  flat_price: number | null
  
  // Per sqft
  price_per_sqft: number | null
  min_sqft: number | null
  max_sqft: number | null
  
  // Variable (by bedroom)
  price_1bed: number | null
  price_2bed: number | null
  price_3bed: number | null
  price_4bed: number | null
  price_5bed_plus: number | null
  price_per_bathroom: number | null
  
  // Time estimates
  base_hours: number | null
  hours_per_bedroom: number | null
  hours_per_bathroom: number | null
  hours_per_1000_sqft: number | null
  
  // Cost defaults
  hourly_labor_cost: number | null
  supply_cost_percent: number
  
  // Adjustments
  condition_multipliers: Record<PropertyCondition, number>
  pet_fee: number
  
  is_active: boolean
  is_default: boolean
}

// Cost settings
export interface CostSettings {
  id: string
  business_id: string
  updated_at: string
  
  // Labor
  hourly_labor_rate: number
  cleaner_count_default: number
  
  // Supplies
  supply_cost_per_job: number | null
  supply_cost_percent: number | null
  
  // Travel
  travel_cost_per_mile: number
  average_travel_miles: number
  flat_travel_fee: number | null
  
  // Overhead
  monthly_overhead: number | null
  overhead_per_job: number | null
  
  // Targets
  target_profit_margin: number
  minimum_profit_margin: number
  minimum_job_price: number
  
  // Productivity
  sqft_per_hour: number
  
  // Warnings
  warn_below_margin: boolean
  warn_margin_threshold: number
}

// Quote message template
export interface QuoteMessageTemplate {
  id: string
  business_id: string
  name: string
  template_key: string
  channel: "sms" | "email"
  subject: string | null
  body: string
  is_active: boolean
}

// Contact (simplified for quotes)
export interface Contact {
  id: string
  first_name: string
  last_name: string
  phone: string
  email: string | null
  address_line1?: string
  city?: string
  state?: string
  zip?: string
}

// Service type (simplified for quotes)
export interface ServiceType {
  id: string
  name: string
  pricing_type: string
  base_price: number | null
  price_1bed: number | null
  price_2bed: number | null
  price_3bed: number | null
  price_4bed: number | null
  price_5bed_plus: number | null
  price_per_bathroom: number | null
}

// Quote input for creating/updating
export interface QuoteInput {
  contact_id: string
  service_type_id?: string
  title?: string
  address_line1?: string
  city?: string
  state?: string
  zip?: string
  sqft?: number
  bedrooms?: number
  bathrooms?: number
  property_type?: PropertyType
  property_condition?: PropertyCondition
  has_pets?: boolean
  pet_details?: string
  pricing_method?: PricingMethod
  custom_price?: number
  adjustments?: QuoteAdjustment[]
  discount_amount?: number
  discount_reason?: string
  internal_notes?: string
  line_items?: Omit<QuoteLineItem, "id" | "quote_id">[]
  send_immediately?: boolean
}

// Quote calculation result
export interface QuoteCalculation {
  base_price: number
  adjustments: QuoteAdjustment[]
  subtotal: number
  total: number
  estimated_hours: number
  labor_cost: number
  supply_cost: number
  travel_cost: number
  total_cost: number
  profit_amount: number
  profit_margin: number
  is_profitable: boolean
  warnings: string[]
}

// Quote stats
export interface QuoteStats {
  total_quotes: number
  sent_quotes: number
  accepted_quotes: number
  declined_quotes: number
  accepted_revenue: number
  conversion_rate: number
  average_quote_value: number
  average_profit_margin: number
}
