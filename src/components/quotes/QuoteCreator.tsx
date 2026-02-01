"use client"

/**
 * QuoteCreator Component
 * Interactive quote builder with integrated profit calculator
 */

import { useState, useEffect, useCallback } from "react"
import {
  RiCalculatorLine,
  RiMoneyDollarCircleLine,
  RiTimeLine,
  RiArrowUpLine,
  RiArrowDownLine,
  RiAlertLine,
  RiSendPlaneLine,
  RiSaveLine,
  RiAddLine,
  RiDeleteBinLine,
  RiHome4Line,
  RiUser3Line,
  RiArrowDownSLine,
  RiArrowUpSLine,
} from "@remixicon/react"
import { Button } from "@/components/Button"
import { Input } from "@/components/Input"
import { Card } from "@/components/Card"
import { cx } from "@/lib/utils"
import {
  calculateQuote,
  suggestPriceForMargin,
  getProfitStatus,
  formatCurrency,
  CONDITION_MULTIPLIERS,
  DEFAULT_COST_SETTINGS,
} from "@/lib/quotes/calculations"
import type {
  Contact,
  ServiceType,
  CostSettings,
  QuoteAdjustment,
  PropertyCondition,
  PropertyType,
  QuoteCalculation,
} from "@/types/quotes"

interface QuoteCreatorProps {
  contacts: Contact[]
  serviceTypes: ServiceType[]
  costSettings?: CostSettings
  onSave: (data: QuoteFormData) => Promise<void>
  onSend: (data: QuoteFormData) => Promise<void>
}

export interface QuoteFormData {
  contactId: string
  serviceTypeId?: string
  addressLine1?: string
  city?: string
  state?: string
  zip?: string
  sqft?: number
  bedrooms: number
  bathrooms: number
  propertyType: PropertyType
  propertyCondition: PropertyCondition
  hasPets: boolean
  petDetails?: string
  pricingMethod: string
  customPrice?: number
  adjustments: QuoteAdjustment[]
  discountAmount: number
  discountReason?: string
  internalNotes?: string
  calculation: QuoteCalculation
}

interface AdjustmentRow {
  id: string
  name: string
  amount: number
  type: "add" | "subtract"
}

export function QuoteCreator({
  contacts,
  serviceTypes,
  costSettings = DEFAULT_COST_SETTINGS,
  onSave,
  onSend,
}: QuoteCreatorProps) {
  // Contact & Service
  const [selectedContactId, setSelectedContactId] = useState<string>("")
  const [selectedServiceId, setSelectedServiceId] = useState<string>("")

  // Property Details
  const [sqft, setSqft] = useState<number>(0)
  const [bedrooms, setBedrooms] = useState<number>(3)
  const [bathrooms, setBathrooms] = useState<number>(2)
  const [propertyType] = useState<PropertyType>("house")
  const [propertyCondition, setPropertyCondition] = useState<PropertyCondition>("average")
  const [hasPets, setHasPets] = useState(false)
  const [petDetails, setPetDetails] = useState("")

  // Address
  const [address, setAddress] = useState({
    line1: "",
    city: "",
    state: "",
    zip: "",
  })

  // Pricing
  const [useCustomPrice, setUseCustomPrice] = useState(false)
  const [customPrice, setCustomPrice] = useState<number>(0)
  const [adjustments, setAdjustments] = useState<AdjustmentRow[]>([])
  const [discountAmount, setDiscountAmount] = useState<number>(0)
  const [discountReason, setDiscountReason] = useState("")

  // Notes
  const [internalNotes, setInternalNotes] = useState("")

  // Calculated values
  const [calculation, setCalculation] = useState<QuoteCalculation>({
    base_price: 0,
    adjustments: [],
    subtotal: 0,
    total: 0,
    estimated_hours: 0,
    labor_cost: 0,
    supply_cost: 0,
    travel_cost: 0,
    total_cost: 0,
    profit_amount: 0,
    profit_margin: 0,
    is_profitable: true,
    warnings: [],
  })

  // UI State
  const [showCostBreakdown, setShowCostBreakdown] = useState(true)
  const [sending, setSending] = useState(false)
  const [saving, setSaving] = useState(false)

  // Get selected contact
  const selectedContact = contacts.find((c) => c.id === selectedContactId)
  const selectedService = serviceTypes.find((s) => s.id === selectedServiceId)

  // Calculate everything when inputs change
  const calculate = useCallback(() => {
    const template = selectedService
      ? {
          pricing_method: "variable" as const,
          price_1bed: selectedService.price_1bed || 0,
          price_2bed: selectedService.price_2bed || 0,
          price_3bed: selectedService.price_3bed || 0,
          price_4bed: selectedService.price_4bed || 0,
          price_5bed_plus: selectedService.price_5bed_plus || 0,
          price_per_bathroom: selectedService.price_per_bathroom || 0,
          pet_fee: 20,
          condition_multipliers: CONDITION_MULTIPLIERS,
        }
      : {
          pricing_method: "variable" as const,
          price_1bed: 100,
          price_2bed: 130,
          price_3bed: 160,
          price_4bed: 190,
          price_5bed_plus: 220,
          price_per_bathroom: 15,
          pet_fee: 20,
          condition_multipliers: CONDITION_MULTIPLIERS,
        }

    const formattedAdjustments: QuoteAdjustment[] = adjustments
      .filter((a) => a.name && a.amount)
      .map((a) => ({
        name: a.name,
        amount: a.amount,
        type: a.type,
      }))

    const result = calculateQuote(
      {
        sqft: sqft || undefined,
        bedrooms,
        bathrooms,
        propertyCondition,
        hasPets,
      },
      template,
      costSettings,
      formattedAdjustments,
      discountAmount,
      useCustomPrice ? customPrice : undefined
    )

    setCalculation(result)
  }, [
    selectedService,
    bedrooms,
    bathrooms,
    sqft,
    propertyCondition,
    hasPets,
    adjustments,
    discountAmount,
    useCustomPrice,
    customPrice,
    costSettings,
  ])

  useEffect(() => {
    calculate()
  }, [calculate])

  // When contact selected, populate address
  useEffect(() => {
    if (selectedContact) {
      setAddress({
        line1: selectedContact.address_line1 || "",
        city: selectedContact.city || "",
        state: selectedContact.state || "",
        zip: selectedContact.zip || "",
      })
    }
  }, [selectedContact])

  // Add adjustment
  const addAdjustment = () => {
    setAdjustments([...adjustments, { id: Date.now().toString(), name: "", amount: 0, type: "add" }])
  }

  // Remove adjustment
  const removeAdjustment = (id: string) => {
    setAdjustments(adjustments.filter((a) => a.id !== id))
  }

  // Update adjustment
  const updateAdjustment = (id: string, field: keyof AdjustmentRow, value: string | number) => {
    setAdjustments(adjustments.map((a) => (a.id === id ? { ...a, [field]: value } : a)))
  }

  // Get profit status
  const profitStatus = getProfitStatus(calculation.profit_margin, costSettings)

  // Suggest price for target margin
  const handleSuggestPrice = () => {
    const suggestedPrice = suggestPriceForMargin(calculation.total_cost, costSettings.target_profit_margin)
    setCustomPrice(Math.round(suggestedPrice))
    setUseCustomPrice(true)
  }

  // Build form data
  const buildFormData = (): QuoteFormData => ({
    contactId: selectedContactId,
    serviceTypeId: selectedServiceId || undefined,
    addressLine1: address.line1 || undefined,
    city: address.city || undefined,
    state: address.state || undefined,
    zip: address.zip || undefined,
    sqft: sqft || undefined,
    bedrooms,
    bathrooms,
    propertyType,
    propertyCondition,
    hasPets,
    petDetails: petDetails || undefined,
    pricingMethod: "variable",
    customPrice: useCustomPrice ? customPrice : undefined,
    adjustments: adjustments
      .filter((a) => a.name && a.amount)
      .map((a) => ({
        name: a.name,
        amount: a.amount,
        type: a.type,
      })),
    discountAmount,
    discountReason: discountReason || undefined,
    internalNotes: internalNotes || undefined,
    calculation,
  })

  // Handle save
  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(buildFormData())
    } finally {
      setSaving(false)
    }
  }

  // Handle send
  const handleSend = async () => {
    if (!selectedContactId) {
      alert("Please select a customer")
      return
    }
    setSending(true)
    try {
      await onSend(buildFormData())
    } finally {
      setSending(false)
    }
  }

  const conditionOptions: { value: PropertyCondition; label: string; desc: string }[] = [
    { value: "clean", label: "Clean", desc: "-10%" },
    { value: "average", label: "Average", desc: "Base" },
    { value: "dirty", label: "Dirty", desc: "+25%" },
    { value: "very_dirty", label: "Very Dirty", desc: "+50%" },
  ]

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left Column - Quote Details */}
      <div className="lg:col-span-2 space-y-6">
        {/* Customer Selection */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold flex items-center gap-2 mb-4 text-gray-900 dark:text-gray-50">
            <RiUser3Line className="h-5 w-5" />
            Customer
          </h3>
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">
              Select Customer
            </label>
            <select
              value={selectedContactId}
              onChange={(e) => setSelectedContactId(e.target.value)}
              className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">Select a customer...</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.first_name} {c.last_name} - {c.phone}
                </option>
              ))}
            </select>

            {selectedContact && (
              <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg text-sm">
                <p className="font-medium text-gray-900 dark:text-gray-50">
                  {selectedContact.first_name} {selectedContact.last_name}
                </p>
                <p className="text-gray-500">{selectedContact.phone}</p>
                {selectedContact.email && <p className="text-gray-500">{selectedContact.email}</p>}
              </div>
            )}
          </div>
        </Card>

        {/* Property Details */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold flex items-center gap-2 mb-4 text-gray-900 dark:text-gray-50">
            <RiHome4Line className="h-5 w-5" />
            Property Details
          </h3>
          <div className="space-y-4">
            {/* Service Type */}
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">
                Service Type
              </label>
              <select
                value={selectedServiceId}
                onChange={(e) => setSelectedServiceId(e.target.value)}
                className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="">Select service...</option>
                {serviceTypes.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Size */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">
                  Bedrooms
                </label>
                <select
                  value={bedrooms.toString()}
                  onChange={(e) => setBedrooms(Number(e.target.value))}
                  className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n.toString()}>
                      {n} {n === 5 ? "+" : ""} bedroom{n > 1 ? "s" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">
                  Bathrooms
                </label>
                <select
                  value={bathrooms.toString()}
                  onChange={(e) => setBathrooms(Number(e.target.value))}
                  className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  {[1, 1.5, 2, 2.5, 3, 4].map((n) => (
                    <option key={n} value={n.toString()}>
                      {n} bath{n > 1 ? "s" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">
                  Sq Ft (optional)
                </label>
                <Input
                  type="number"
                  value={sqft || ""}
                  onChange={(e) => setSqft(Number(e.target.value))}
                  placeholder="2000"
                />
              </div>
            </div>

            {/* Condition */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Property Condition
              </label>
              <div className="grid grid-cols-4 gap-2">
                {conditionOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setPropertyCondition(option.value)}
                    className={cx(
                      "p-3 rounded-lg border-2 text-center transition-all",
                      propertyCondition === option.value
                        ? "border-brand-600 bg-brand-50 dark:bg-brand-900/20"
                        : "border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
                    )}
                  >
                    <p className="font-medium text-sm text-gray-900 dark:text-gray-50">{option.label}</p>
                    <p className="text-xs text-gray-500">{option.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Pets */}
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={hasPets}
                onChange={(e) => setHasPets(e.target.checked)}
                className="w-5 h-5 text-brand-600 rounded border-gray-300 focus:ring-brand-500"
              />
              <span className="text-gray-700 dark:text-gray-300">Has pets (+$20)</span>
            </label>

            {hasPets && (
              <Input
                placeholder="Pet details (optional)"
                value={petDetails}
                onChange={(e) => setPetDetails(e.target.value)}
              />
            )}

            {/* Address */}
            <div className="pt-4 border-t dark:border-gray-700">
              <p className="font-medium text-sm text-gray-700 dark:text-gray-300 mb-3">Service Address</p>
              <Input
                placeholder="Street address"
                value={address.line1}
                onChange={(e) => setAddress({ ...address, line1: e.target.value })}
                className="mb-2"
              />
              <div className="grid grid-cols-3 gap-2">
                <Input
                  placeholder="City"
                  value={address.city}
                  onChange={(e) => setAddress({ ...address, city: e.target.value })}
                />
                <Input
                  placeholder="State"
                  maxLength={2}
                  value={address.state}
                  onChange={(e) => setAddress({ ...address, state: e.target.value.toUpperCase() })}
                />
                <Input
                  placeholder="Zip"
                  maxLength={5}
                  value={address.zip}
                  onChange={(e) => setAddress({ ...address, zip: e.target.value })}
                />
              </div>
            </div>
          </div>
        </Card>

        {/* Adjustments */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold flex items-center gap-2 text-gray-900 dark:text-gray-50">
              <RiMoneyDollarCircleLine className="h-5 w-5" />
              Price Adjustments
            </h3>
            <Button variant="secondary" onClick={addAdjustment}>
              <RiAddLine className="h-4 w-4 mr-1" /> Add
            </Button>
          </div>
          <div className="space-y-3">
            {adjustments.map((adj) => (
              <div key={adj.id} className="flex items-center gap-2">
                <Input
                  placeholder="Adjustment name"
                  value={adj.name}
                  onChange={(e) => updateAdjustment(adj.id, "name", e.target.value)}
                  className="flex-1"
                />
                <select
                  value={adj.type}
                  onChange={(e) => updateAdjustment(adj.id, "type", e.target.value)}
                  className="w-20 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="add">+</option>
                  <option value="subtract">-</option>
                </select>
                <Input
                  type="number"
                  value={adj.amount || ""}
                  onChange={(e) => updateAdjustment(adj.id, "amount", Number(e.target.value))}
                  className="w-24"
                  placeholder="$0"
                />
                <Button variant="ghost" onClick={() => removeAdjustment(adj.id)}>
                  <RiDeleteBinLine className="h-4 w-4 text-gray-400" />
                </Button>
              </div>
            ))}

            {/* Discount */}
            <div className="pt-3 border-t dark:border-gray-700 mt-4">
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">
                    Discount
                  </label>
                  <Input
                    type="number"
                    value={discountAmount || ""}
                    onChange={(e) => setDiscountAmount(Number(e.target.value))}
                    placeholder="$0"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">
                    Reason
                  </label>
                  <Input
                    value={discountReason}
                    onChange={(e) => setDiscountReason(e.target.value)}
                    placeholder="First-time customer, referral, etc."
                  />
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Internal Notes */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-50">Internal Notes</h3>
          <textarea
            placeholder="Notes for your team (customer won&apos;t see these)"
            value={internalNotes}
            onChange={(e) => setInternalNotes(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </Card>
      </div>

      {/* Right Column - Price & Profit Calculator */}
      <div className="space-y-6">
        {/* Price Summary */}
        <Card className="p-6 sticky top-6">
          <h3 className="text-lg font-semibold flex items-center gap-2 mb-4 text-gray-900 dark:text-gray-50">
            <RiCalculatorLine className="h-5 w-5" />
            Quote Total
          </h3>

          {/* Main Price */}
          <div className="text-center py-4 border-b dark:border-gray-700">
            {useCustomPrice ? (
              <div className="flex items-center justify-center gap-2">
                <span className="text-2xl text-gray-600 dark:text-gray-400">$</span>
                <input
                  type="number"
                  value={customPrice}
                  onChange={(e) => setCustomPrice(Number(e.target.value))}
                  className="text-4xl font-bold w-32 text-center border-b-2 border-brand-600 bg-transparent focus:outline-none text-gray-900 dark:text-gray-50"
                />
              </div>
            ) : (
              <p className="text-4xl font-bold text-gray-900 dark:text-gray-50">
                {formatCurrency(calculation.total)}
              </p>
            )}
            <p className="text-sm text-gray-500 mt-1 flex items-center justify-center gap-1">
              <RiTimeLine className="h-4 w-4" />
              {calculation.estimated_hours} hrs estimated
            </p>
          </div>

          {/* Custom Price Toggle */}
          <label className="flex items-center justify-between cursor-pointer py-3 border-b dark:border-gray-700">
            <span className="text-sm text-gray-700 dark:text-gray-300">Use custom price</span>
            <input
              type="checkbox"
              checked={useCustomPrice}
              onChange={(e) => {
                setUseCustomPrice(e.target.checked)
                if (e.target.checked) setCustomPrice(Math.round(calculation.total))
              }}
              className="w-5 h-5 text-brand-600 rounded border-gray-300 focus:ring-brand-500"
            />
          </label>

          {/* Price Breakdown */}
          <div className="space-y-2 text-sm py-3 border-b dark:border-gray-700">
            <div className="flex justify-between">
              <span className="text-gray-500">Base price</span>
              <span className="text-gray-900 dark:text-gray-50">{formatCurrency(calculation.base_price)}</span>
            </div>
            {hasPets && (
              <div className="flex justify-between">
                <span className="text-gray-500">Pet fee</span>
                <span className="text-gray-900 dark:text-gray-50">+$20</span>
              </div>
            )}
            {adjustments
              .filter((a) => a.name && a.amount)
              .map((adj) => (
                <div key={adj.id} className="flex justify-between">
                  <span className="text-gray-500">{adj.name}</span>
                  <span className="text-gray-900 dark:text-gray-50">
                    {adj.type === "add" ? "+" : "-"}
                    {formatCurrency(adj.amount)}
                  </span>
                </div>
              ))}
            {discountAmount > 0 && (
              <div className="flex justify-between text-green-600">
                <span>Discount</span>
                <span>-{formatCurrency(discountAmount)}</span>
              </div>
            )}
          </div>

          {/* Profit Indicator */}
          <div className={cx("p-4 rounded-lg my-4", profitStatus.bgColor)}>
            <div className="flex items-center justify-between mb-2">
              <span className={cx("font-medium", profitStatus.color)}>Profit Margin</span>
              {profitStatus.status === "low" ? (
                <RiArrowDownLine className={cx("h-5 w-5", profitStatus.color)} />
              ) : (
                <RiArrowUpLine className={cx("h-5 w-5", profitStatus.color)} />
              )}
            </div>
            <p className={cx("text-2xl font-bold", profitStatus.color)}>
              {calculation.profit_margin.toFixed(1)}%
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {formatCurrency(calculation.profit_amount)} profit
            </p>

            {!calculation.is_profitable && (
              <div className="mt-3 pt-3 border-t border-red-200 dark:border-red-800">
                <div className="flex items-start gap-2">
                  <RiAlertLine className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                  <div className="text-sm">
                    <p className="text-red-600 font-medium">Below minimum margin</p>
                    <button onClick={handleSuggestPrice} className="text-red-600 underline hover:no-underline mt-1">
                      Set price to {formatCurrency(suggestPriceForMargin(calculation.total_cost, costSettings.target_profit_margin))} for{" "}
                      {costSettings.target_profit_margin}% margin
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Cost Breakdown */}
          <div>
            <button
              onClick={() => setShowCostBreakdown(!showCostBreakdown)}
              className="flex items-center justify-between w-full py-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            >
              <span>Cost Breakdown</span>
              {showCostBreakdown ? <RiArrowUpSLine className="h-4 w-4" /> : <RiArrowDownSLine className="h-4 w-4" />}
            </button>

            {showCostBreakdown && (
              <div className="space-y-2 text-sm pt-2 border-t dark:border-gray-700">
                <div className="flex justify-between">
                  <span className="text-gray-500">
                    Labor ({calculation.estimated_hours}h × ${costSettings.hourly_labor_rate})
                  </span>
                  <span className="text-gray-900 dark:text-gray-50">{formatCurrency(calculation.labor_cost)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Supplies</span>
                  <span className="text-gray-900 dark:text-gray-50">{formatCurrency(calculation.supply_cost)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Travel</span>
                  <span className="text-gray-900 dark:text-gray-50">{formatCurrency(calculation.travel_cost)}</span>
                </div>
                <div className="flex justify-between font-medium pt-2 border-t dark:border-gray-700">
                  <span className="text-gray-900 dark:text-gray-50">Total Cost</span>
                  <span className="text-gray-900 dark:text-gray-50">{formatCurrency(calculation.total_cost)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="space-y-2 pt-4 border-t dark:border-gray-700 mt-4">
            <Button className="w-full" onClick={handleSend} disabled={sending || !selectedContactId}>
              <RiSendPlaneLine className="h-4 w-4 mr-2" />
              {sending ? "Sending..." : "Send Quote"}
            </Button>
            <Button variant="secondary" className="w-full" onClick={handleSave} disabled={saving}>
              <RiSaveLine className="h-4 w-4 mr-2" />
              {saving ? "Saving..." : "Save as Draft"}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  )
}
