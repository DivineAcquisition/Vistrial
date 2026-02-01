/**
 * Quote Calculation Utilities
 * Handles pricing, costs, and profit calculations for quotes
 */

import type {
  PropertyCondition,
  PricingTemplate,
  CostSettings,
  QuoteAdjustment,
  QuoteCalculation,
} from "@/types/quotes"

export interface PropertyDetails {
  sqft?: number
  bedrooms?: number
  bathrooms?: number
  propertyCondition?: PropertyCondition
  hasPets?: boolean
}

// Default cost settings
export const DEFAULT_COST_SETTINGS: CostSettings = {
  id: "",
  business_id: "",
  updated_at: "",
  hourly_labor_rate: 18,
  cleaner_count_default: 1,
  supply_cost_per_job: 5,
  supply_cost_percent: null,
  travel_cost_per_mile: 0.67,
  average_travel_miles: 10,
  flat_travel_fee: null,
  monthly_overhead: null,
  overhead_per_job: null,
  target_profit_margin: 30,
  minimum_profit_margin: 15,
  minimum_job_price: 75,
  sqft_per_hour: 500,
  warn_below_margin: true,
  warn_margin_threshold: 20,
}

// Condition multipliers
export const CONDITION_MULTIPLIERS: Record<PropertyCondition, number> = {
  clean: 0.9,
  average: 1.0,
  dirty: 1.25,
  very_dirty: 1.5,
}

// Calculate base price from property details
export function calculateBasePrice(
  property: PropertyDetails,
  template: Partial<PricingTemplate>
): number {
  const pricingMethod = template.pricing_method || "variable"

  switch (pricingMethod) {
    case "flat":
      return template.flat_price || 0

    case "sqft":
      if (!property.sqft || !template.price_per_sqft) return 0
      return property.sqft * template.price_per_sqft

    case "variable":
    default: {
      const bedrooms = property.bedrooms || 1
      let price = 0

      // Get bedroom-based price
      if (bedrooms === 1) price = template.price_1bed || 0
      else if (bedrooms === 2) price = template.price_2bed || 0
      else if (bedrooms === 3) price = template.price_3bed || 0
      else if (bedrooms === 4) price = template.price_4bed || 0
      else price = template.price_5bed_plus || 0

      // Add bathroom price
      const bathrooms = property.bathrooms || 1
      price += bathrooms * (template.price_per_bathroom || 0)

      return price
    }
  }
}

// Calculate estimated hours for the job
export function calculateEstimatedHours(
  property: PropertyDetails,
  template: Partial<PricingTemplate>,
  costSettings: CostSettings
): number {
  const { sqft, bedrooms = 1, bathrooms = 1, propertyCondition = "average" } = property

  // Method 1: Use template time estimates
  if (template.base_hours) {
    let hours = template.base_hours
    hours += (bedrooms - 1) * (template.hours_per_bedroom || 0.5)
    hours += (bathrooms - 1) * (template.hours_per_bathroom || 0.33)
    hours *= CONDITION_MULTIPLIERS[propertyCondition]
    return hours
  }

  // Method 2: Calculate from sqft
  if (sqft && costSettings.sqft_per_hour) {
    return (sqft / costSettings.sqft_per_hour) * CONDITION_MULTIPLIERS[propertyCondition]
  }

  // Method 3: Rough estimate from bedrooms
  const baseHours: Record<number, number> = {
    1: 1.5,
    2: 2.5,
    3: 3.5,
    4: 4.5,
    5: 5.5,
  }
  const base = baseHours[Math.min(bedrooms, 5)] || 3
  return base * CONDITION_MULTIPLIERS[propertyCondition]
}

// Calculate all costs
export function calculateCosts(
  estimatedHours: number,
  subtotal: number,
  costSettings: CostSettings
): { laborCost: number; supplyCost: number; travelCost: number; totalCost: number } {
  // Labor cost
  const laborCost = estimatedHours * costSettings.hourly_labor_rate * costSettings.cleaner_count_default

  // Supply cost (flat or percentage)
  let supplyCost = costSettings.supply_cost_per_job || 0
  if (costSettings.supply_cost_percent) {
    supplyCost = subtotal * (costSettings.supply_cost_percent / 100)
  }

  // Travel cost
  let travelCost = costSettings.flat_travel_fee || 0
  if (!travelCost && costSettings.travel_cost_per_mile && costSettings.average_travel_miles) {
    travelCost = costSettings.travel_cost_per_mile * costSettings.average_travel_miles * 2 // round trip
  }

  const totalCost = laborCost + supplyCost + travelCost

  return { laborCost, supplyCost, travelCost, totalCost }
}

// Full quote calculation
export function calculateQuote(
  property: PropertyDetails,
  template: Partial<PricingTemplate>,
  costSettings: CostSettings,
  customAdjustments: QuoteAdjustment[] = [],
  discountAmount: number = 0,
  customPrice?: number
): QuoteCalculation {
  const warnings: string[] = []
  const propertyCondition = property.propertyCondition || "average"

  // 1. Calculate base price
  let basePrice = calculateBasePrice(property, template)

  // 2. Apply condition multiplier
  const conditionMultiplier = CONDITION_MULTIPLIERS[propertyCondition]
  basePrice = basePrice * conditionMultiplier

  // 3. Calculate adjustments
  const adjustments: QuoteAdjustment[] = []

  // Pet fee
  if (property.hasPets && template.pet_fee) {
    adjustments.push({ name: "Pet fee", amount: template.pet_fee, type: "add" })
  }

  // Custom adjustments
  for (const adj of customAdjustments) {
    adjustments.push(adj)
  }

  // 4. Calculate adjustment total
  let adjustmentTotal = 0
  for (const adj of adjustments) {
    let amount = adj.amount
    if (adj.type === "percent") {
      amount = basePrice * (adj.amount / 100)
    }
    if (adj.type === "subtract") {
      amount = -Math.abs(amount)
    }
    adjustmentTotal += amount
  }

  // 5. Calculate subtotal
  const subtotal = basePrice + adjustmentTotal

  // 6. Apply discount and get total
  let total = Math.max(subtotal - discountAmount, costSettings.minimum_job_price)

  // 7. Use custom price if provided
  if (customPrice !== undefined && customPrice > 0) {
    total = customPrice
  }

  // 8. Calculate time estimate
  const estimatedHours = calculateEstimatedHours(property, template, costSettings)

  // 9. Calculate costs
  const { laborCost, supplyCost, travelCost, totalCost } = calculateCosts(
    estimatedHours,
    subtotal,
    costSettings
  )

  // 10. Calculate profit
  const profitAmount = total - totalCost
  const profitMargin = total > 0 ? (profitAmount / total) * 100 : 0

  // 11. Check profitability
  const isProfitable = profitMargin >= costSettings.minimum_profit_margin

  if (profitMargin < costSettings.minimum_profit_margin) {
    warnings.push(
      `Profit margin (${profitMargin.toFixed(1)}%) is below minimum (${costSettings.minimum_profit_margin}%)`
    )
  }

  if (total <= costSettings.minimum_job_price) {
    warnings.push(`Price is at minimum job price of $${costSettings.minimum_job_price}`)
  }

  return {
    base_price: Math.round(basePrice * 100) / 100,
    adjustments,
    subtotal: Math.round(subtotal * 100) / 100,
    total: Math.round(total * 100) / 100,
    estimated_hours: Math.round(estimatedHours * 10) / 10,
    labor_cost: Math.round(laborCost * 100) / 100,
    supply_cost: Math.round(supplyCost * 100) / 100,
    travel_cost: Math.round(travelCost * 100) / 100,
    total_cost: Math.round(totalCost * 100) / 100,
    profit_amount: Math.round(profitAmount * 100) / 100,
    profit_margin: Math.round(profitMargin * 10) / 10,
    is_profitable: isProfitable,
    warnings,
  }
}

// Suggest price to hit target margin
export function suggestPriceForMargin(totalCost: number, targetMargin: number): number {
  // price = cost / (1 - margin)
  // e.g., $100 cost with 30% margin = $100 / 0.7 = $142.86
  return Math.round((totalCost / (1 - targetMargin / 100)) * 100) / 100
}

// Get profit status
export function getProfitStatus(
  profitMargin: number,
  costSettings: CostSettings
): { status: "excellent" | "good" | "low"; color: string; bgColor: string } {
  if (profitMargin >= costSettings.target_profit_margin) {
    return { status: "excellent", color: "text-green-600", bgColor: "bg-green-50" }
  }
  if (profitMargin >= costSettings.minimum_profit_margin) {
    return { status: "good", color: "text-amber-600", bgColor: "bg-amber-50" }
  }
  return { status: "low", color: "text-red-600", bgColor: "bg-red-50" }
}

// Format currency
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount)
}
