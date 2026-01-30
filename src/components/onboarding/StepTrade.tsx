"use client"

import { useState } from "react"
import {
  RiCheckLine,
  RiToolsLine,
  RiTempColdLine,
  RiFlashlightLine,
  RiHome4Line,
  RiPlantLine,
  RiBrush2Line,
  RiSettings3Line,
  RiBugLine,
  RiDoorOpenLine,
  RiWindow2Line,
  RiPaintLine,
  RiAddLine,
  RiArrowRightLine,
  RiBuilding2Line,
  RiUserLine,
  RiPhoneLine,
} from "@remixicon/react"
import { cn } from "@/lib/utils/cn"
import { TRADES, type TradeId, type OnboardingData } from "@/lib/onboarding/types"

interface StepTradeProps {
  data: OnboardingData
  onUpdate: (updates: Partial<OnboardingData>) => void
  onNext: () => void
}

// Trade icons mapping
const TRADE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  plumbing: RiToolsLine,
  hvac: RiTempColdLine,
  electrical: RiFlashlightLine,
  roofing: RiHome4Line,
  cleaning_residential: RiHome4Line,
  cleaning_commercial: RiBuilding2Line,
  landscaping: RiPlantLine,
  painting: RiBrush2Line,
  handyman: RiSettings3Line,
  pest_control: RiBugLine,
  garage_doors: RiDoorOpenLine,
  windows_doors: RiWindow2Line,
  flooring: RiPaintLine,
  other: RiAddLine,
}

export function StepTrade({ data, onUpdate, onNext }: StepTradeProps) {
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [focusedField, setFocusedField] = useState<string | null>(null)

  const handleTradeSelect = (tradeId: TradeId) => {
    onUpdate({ trade: tradeId })
    setErrors((prev) => ({ ...prev, trade: "" }))
  }

  const handleSubmit = () => {
    const newErrors: Record<string, string> = {}

    if (!data.trade) {
      newErrors.trade = "Please select your trade"
    }

    if (data.trade === "other" && !data.tradeOther?.trim()) {
      newErrors.tradeOther = "Please describe your trade"
    }

    if (!data.businessName.trim()) {
      newErrors.businessName = "Business name is required"
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    onNext()
  }

  return (
    <div className="space-y-8">
      {/* Header with animated gradient text */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-brand-500/10 border border-brand-500/20">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-500"></span>
          </span>
          <span className="text-sm font-medium text-brand-400">Step 1 of 5</span>
        </div>
        <h2 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-white via-gray-100 to-gray-300 bg-clip-text text-transparent">
          What kind of work do you do?
        </h2>
        <p className="text-gray-400 max-w-lg mx-auto">
          We&apos;ll customize your quote follow-up messages for your industry.
        </p>
      </div>

      {/* Trade Selection Grid */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-4">
          Select your trade
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {TRADES.map((trade) => {
            const Icon = TRADE_ICONS[trade.id] || RiToolsLine
            const isSelected = data.trade === trade.id

            return (
              <button
                key={trade.id}
                type="button"
                onClick={() => handleTradeSelect(trade.id)}
                className={cn(
                  "group relative flex flex-col items-center gap-2 rounded-xl p-4 text-center transition-all duration-300",
                  "border-2 hover:scale-[1.02] active:scale-[0.98]",
                  isSelected
                    ? "border-brand-500 bg-brand-500/10"
                    : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10"
                )}
              >
                {/* Glow effect on hover/selected */}
                {isSelected && (
                  <div className="absolute inset-0 rounded-xl bg-brand-500/20 blur-xl -z-10" />
                )}
                
                {/* Icon container */}
                <div className={cn(
                  "flex h-12 w-12 items-center justify-center rounded-lg transition-all duration-300",
                  isSelected
                    ? "bg-gradient-to-br from-brand-400 to-brand-600 shadow-lg shadow-brand-500/30"
                    : "bg-white/10 group-hover:bg-white/20"
                )}>
                  <Icon className={cn(
                    "h-6 w-6 transition-colors",
                    isSelected ? "text-white" : "text-gray-400 group-hover:text-white"
                  )} />
                </div>

                {/* Label */}
                <span className={cn(
                  "text-sm font-medium transition-colors line-clamp-2",
                  isSelected ? "text-white" : "text-gray-400 group-hover:text-white"
                )}>
                  {trade.label}
                </span>

                {/* Check indicator */}
                {isSelected && (
                  <div className="absolute top-2 right-2 flex h-5 w-5 items-center justify-center rounded-full bg-brand-500">
                    <RiCheckLine className="h-3 w-3 text-white" />
                  </div>
                )}
              </button>
            )
          })}
        </div>
        {errors.trade && (
          <p className="mt-3 text-sm text-red-400 flex items-center gap-2">
            <span className="h-1 w-1 rounded-full bg-red-400" />
            {errors.trade}
          </p>
        )}

        {/* Other trade input */}
        {data.trade === "other" && (
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Describe your trade
            </label>
            <div className={cn(
              "relative rounded-xl transition-all duration-300",
              focusedField === "tradeOther" && "ring-2 ring-brand-500/50"
            )}>
              <input
                type="text"
                placeholder="e.g., Pool cleaning, Solar installation..."
                value={data.tradeOther || ""}
                onChange={(e) => onUpdate({ tradeOther: e.target.value })}
                onFocus={() => setFocusedField("tradeOther")}
                onBlur={() => setFocusedField(null)}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-brand-500/50 transition-colors"
              />
            </div>
            {errors.tradeOther && (
              <p className="mt-2 text-sm text-red-400">{errors.tradeOther}</p>
            )}
          </div>
        )}
      </div>

      {/* Business Info Card */}
      <div className="relative">
        <div className="absolute -inset-0.5 bg-gradient-to-r from-brand-500/30 to-indigo-500/30 rounded-2xl blur opacity-50" />
        <div className="relative space-y-5 rounded-xl border border-white/10 bg-gray-900/50 backdrop-blur-sm p-6">
          <div className="flex items-center gap-3 pb-4 border-b border-white/10">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-brand-400/20 to-brand-600/20">
              <RiBuilding2Line className="h-5 w-5 text-brand-400" />
            </div>
            <div>
              <h3 className="font-semibold text-white">Business Details</h3>
              <p className="text-xs text-gray-400">This info appears in your quote messages</p>
            </div>
          </div>

          {/* Business Name */}
          <div>
            <label className="flex items-center gap-1 text-sm font-medium text-gray-300 mb-2">
              <RiBuilding2Line className="h-4 w-4 text-gray-500" />
              Business Name
              <span className="text-brand-400">*</span>
            </label>
            <div className={cn(
              "relative rounded-xl transition-all duration-300",
              focusedField === "businessName" && "ring-2 ring-brand-500/50"
            )}>
              <input
                type="text"
                placeholder="e.g., Pro Plumbing, ABC HVAC..."
                value={data.businessName}
                onChange={(e) => {
                  onUpdate({ businessName: e.target.value })
                  setErrors((prev) => ({ ...prev, businessName: "" }))
                }}
                onFocus={() => setFocusedField("businessName")}
                onBlur={() => setFocusedField(null)}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-brand-500/50 transition-colors"
              />
            </div>
            {errors.businessName && (
              <p className="mt-2 text-sm text-red-400">{errors.businessName}</p>
            )}
          </div>

          {/* Owner Name */}
          <div>
            <label className="flex items-center gap-1 text-sm font-medium text-gray-300 mb-2">
              <RiUserLine className="h-4 w-4 text-gray-500" />
              Your Name
              <span className="text-gray-500 font-normal">(optional)</span>
            </label>
            <div className={cn(
              "relative rounded-xl transition-all duration-300",
              focusedField === "ownerName" && "ring-2 ring-brand-500/50"
            )}>
              <input
                type="text"
                placeholder="e.g., Mike, Sarah..."
                value={data.ownerName || ""}
                onChange={(e) => onUpdate({ ownerName: e.target.value })}
                onFocus={() => setFocusedField("ownerName")}
                onBlur={() => setFocusedField(null)}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-brand-500/50 transition-colors"
              />
            </div>
            <p className="mt-1.5 text-xs text-gray-500">
              Some contractors like to sign their messages personally
            </p>
          </div>

          {/* Business Phone */}
          <div>
            <label className="flex items-center gap-1 text-sm font-medium text-gray-300 mb-2">
              <RiPhoneLine className="h-4 w-4 text-gray-500" />
              Business Phone
              <span className="text-gray-500 font-normal">(optional)</span>
            </label>
            <div className={cn(
              "relative rounded-xl transition-all duration-300",
              focusedField === "businessPhone" && "ring-2 ring-brand-500/50"
            )}>
              <input
                type="tel"
                placeholder="(555) 123-4567"
                value={data.businessPhone || ""}
                onChange={(e) => onUpdate({ businessPhone: e.target.value })}
                onFocus={() => setFocusedField("businessPhone")}
                onBlur={() => setFocusedField(null)}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-brand-500/50 transition-colors"
              />
            </div>
            <p className="mt-1.5 text-xs text-gray-500">
              Include in messages so customers can call you back
            </p>
          </div>
        </div>
      </div>

      {/* Continue Button */}
      <div className="flex justify-end pt-4">
        <button
          onClick={handleSubmit}
          className="group relative inline-flex items-center gap-2 px-8 py-3 rounded-xl font-semibold text-white overflow-hidden transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
        >
          {/* Button gradient background */}
          <div className="absolute inset-0 bg-gradient-to-r from-brand-500 to-brand-600" />
          {/* Hover glow */}
          <div className="absolute inset-0 bg-gradient-to-r from-brand-400 to-brand-500 opacity-0 group-hover:opacity-100 transition-opacity" />
          {/* Shine effect */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
          
          <span className="relative">Continue</span>
          <RiArrowRightLine className="relative h-5 w-5 group-hover:translate-x-1 transition-transform" />
        </button>
      </div>
    </div>
  )
}
