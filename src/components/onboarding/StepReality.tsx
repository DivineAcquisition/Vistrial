"use client"

import { useState } from "react"
import {
  RiCheckLine,
  RiArrowRightLine,
  RiArrowLeftLine,
  RiFileTextLine,
  RiTimeLine,
  RiEmotionSadLine,
  RiEmotionNormalLine,
  RiEmotionLine,
  RiEmotionHappyLine,
  RiLineChartLine,
} from "@remixicon/react"
import { cn } from "@/lib/utils/cn"
import {
  QUOTE_VOLUMES,
  FOLLOWUP_OPTIONS,
  type OnboardingData,
  type QuoteVolume,
  type FollowUpOption,
} from "@/lib/onboarding/types"

interface StepRealityProps {
  data: OnboardingData
  onUpdate: (updates: Partial<OnboardingData>) => void
  onNext: () => void
  onBack: () => void
}

const VOLUME_ICONS = {
  "1-10": "📋",
  "11-25": "📑",
  "26-50": "📚",
  "50+": "🏢",
}

const FOLLOWUP_ICONS = {
  consistent: RiEmotionHappyLine,
  sometimes: RiEmotionLine,
  reactive: RiEmotionNormalLine,
  none: RiEmotionSadLine,
}

const CLOSE_RATE_LABELS = [
  { value: 1, label: "< 10%", color: "from-red-500 to-orange-500" },
  { value: 2, label: "10-20%", color: "from-orange-500 to-amber-500" },
  { value: 3, label: "20-30%", color: "from-amber-500 to-yellow-500" },
  { value: 4, label: "30-40%", color: "from-yellow-500 to-lime-500" },
  { value: 5, label: "40-50%", color: "from-lime-500 to-green-500" },
  { value: 6, label: "> 50%", color: "from-green-500 to-emerald-500" },
]

export function StepReality({ data, onUpdate, onNext, onBack }: StepRealityProps) {
  const [errors, setErrors] = useState<Record<string, string>>({})

  const handleSubmit = () => {
    const newErrors: Record<string, string> = {}

    if (!data.monthlyQuotes) {
      newErrors.monthlyQuotes = "Please select how many quotes you send"
    }

    if (!data.currentFollowUp) {
      newErrors.currentFollowUp = "Please select your current follow-up approach"
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    onNext()
  }

  const currentCloseRate = CLOSE_RATE_LABELS.find(r => r.value === data.perceivedCloseRate) || CLOSE_RATE_LABELS[2]

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-brand-500/10 border border-brand-500/20">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-500"></span>
          </span>
          <span className="text-sm font-medium text-brand-400">Step 2 of 5</span>
        </div>
        <h2 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-white via-gray-100 to-gray-300 bg-clip-text text-transparent">
          Let&apos;s talk follow-up reality
        </h2>
        <p className="text-gray-400 max-w-lg mx-auto">
          No judgment here—we just need to understand where you&apos;re starting from.
        </p>
      </div>

      {/* Monthly Quotes */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <RiFileTextLine className="h-5 w-5 text-brand-400" />
          <label className="text-sm font-medium text-gray-300">
            How many quotes do you send per month?
          </label>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {QUOTE_VOLUMES.map((volume) => {
            const isSelected = data.monthlyQuotes === volume.id
            return (
              <button
                key={volume.id}
                type="button"
                onClick={() => {
                  onUpdate({ monthlyQuotes: volume.id as QuoteVolume })
                  setErrors((prev) => ({ ...prev, monthlyQuotes: "" }))
                }}
                className={cn(
                  "group relative flex flex-col items-center gap-2 rounded-xl p-4 text-center transition-all duration-300",
                  "border-2 hover:scale-[1.02] active:scale-[0.98]",
                  isSelected
                    ? "border-brand-500 bg-brand-500/10"
                    : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10"
                )}
              >
                {isSelected && (
                  <div className="absolute inset-0 rounded-xl bg-brand-500/20 blur-xl -z-10" />
                )}
                <span className="text-2xl">{VOLUME_ICONS[volume.id as keyof typeof VOLUME_ICONS]}</span>
                <span className={cn(
                  "text-sm font-medium transition-colors",
                  isSelected ? "text-white" : "text-gray-400 group-hover:text-white"
                )}>
                  {volume.label}
                </span>
                {isSelected && (
                  <div className="absolute top-2 right-2 flex h-5 w-5 items-center justify-center rounded-full bg-brand-500">
                    <RiCheckLine className="h-3 w-3 text-white" />
                  </div>
                )}
              </button>
            )
          })}
        </div>
        {errors.monthlyQuotes && (
          <p className="mt-3 text-sm text-red-400 flex items-center gap-2">
            <span className="h-1 w-1 rounded-full bg-red-400" />
            {errors.monthlyQuotes}
          </p>
        )}
      </div>

      {/* Current Follow-Up */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <RiTimeLine className="h-5 w-5 text-brand-400" />
          <label className="text-sm font-medium text-gray-300">
            How do you currently follow up on quotes?
          </label>
        </div>
        <div className="space-y-3">
          {FOLLOWUP_OPTIONS.map((option) => {
            const isSelected = data.currentFollowUp === option.id
            const Icon = FOLLOWUP_ICONS[option.id as keyof typeof FOLLOWUP_ICONS]
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => {
                  onUpdate({ currentFollowUp: option.id as FollowUpOption })
                  setErrors((prev) => ({ ...prev, currentFollowUp: "" }))
                }}
                className={cn(
                  "group relative w-full flex items-center gap-4 rounded-xl p-4 text-left transition-all duration-300",
                  "border-2 hover:scale-[1.01] active:scale-[0.99]",
                  isSelected
                    ? "border-brand-500 bg-brand-500/10"
                    : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10"
                )}
              >
                {isSelected && (
                  <div className="absolute inset-0 rounded-xl bg-brand-500/20 blur-xl -z-10" />
                )}
                <div className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-lg transition-all",
                  isSelected
                    ? "bg-gradient-to-br from-brand-400 to-brand-600"
                    : "bg-white/10 group-hover:bg-white/20"
                )}>
                  <Icon className={cn(
                    "h-5 w-5",
                    isSelected ? "text-white" : "text-gray-400"
                  )} />
                </div>
                <span className={cn(
                  "flex-1 text-sm font-medium transition-colors",
                  isSelected ? "text-white" : "text-gray-400 group-hover:text-white"
                )}>
                  {option.label}
                </span>
                {isSelected && (
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-500">
                    <RiCheckLine className="h-4 w-4 text-white" />
                  </div>
                )}
              </button>
            )
          })}
        </div>
        {errors.currentFollowUp && (
          <p className="mt-3 text-sm text-red-400 flex items-center gap-2">
            <span className="h-1 w-1 rounded-full bg-red-400" />
            {errors.currentFollowUp}
          </p>
        )}
      </div>

      {/* Close Rate Slider */}
      <div className="relative">
        <div className="absolute -inset-0.5 bg-gradient-to-r from-brand-500/30 to-indigo-500/30 rounded-2xl blur opacity-50" />
        <div className="relative rounded-xl border border-white/10 bg-gray-900/50 backdrop-blur-sm p-6">
          <div className="flex items-center gap-2 mb-6">
            <RiLineChartLine className="h-5 w-5 text-brand-400" />
            <label className="text-sm font-medium text-gray-300">
              What&apos;s your estimated close rate on quotes?
            </label>
          </div>

          {/* Current value display */}
          <div className="text-center mb-6">
            <div className={cn(
              "inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r",
              currentCloseRate.color
            )}>
              <span className="text-2xl font-bold text-white">{currentCloseRate.label}</span>
            </div>
            <p className="mt-2 text-xs text-gray-500">
              {data.perceivedCloseRate <= 2 
                ? "Don't worry—we'll help you improve this!"
                : data.perceivedCloseRate <= 4
                ? "Good start—let's make it even better"
                : "Nice! Let's keep that momentum going"}
            </p>
          </div>

          {/* Slider */}
          <div className="relative px-2">
            <input
              type="range"
              min="1"
              max="6"
              value={data.perceivedCloseRate}
              onChange={(e) => onUpdate({ perceivedCloseRate: parseInt(e.target.value) })}
              className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer slider-thumb"
              style={{
                background: `linear-gradient(to right, rgb(139, 92, 246) 0%, rgb(139, 92, 246) ${((data.perceivedCloseRate - 1) / 5) * 100}%, rgba(255,255,255,0.1) ${((data.perceivedCloseRate - 1) / 5) * 100}%, rgba(255,255,255,0.1) 100%)`
              }}
            />
            <div className="flex justify-between mt-2 text-xs text-gray-500">
              <span>Low</span>
              <span>High</span>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Buttons */}
      <div className="flex justify-between pt-4">
        <button
          onClick={onBack}
          className="group inline-flex items-center gap-2 px-6 py-3 rounded-xl font-medium text-gray-400 hover:text-white border border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10 transition-all duration-300"
        >
          <RiArrowLeftLine className="h-5 w-5 group-hover:-translate-x-1 transition-transform" />
          Back
        </button>
        <button
          onClick={handleSubmit}
          className="group relative inline-flex items-center gap-2 px-8 py-3 rounded-xl font-semibold text-white overflow-hidden transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-brand-500 to-brand-600" />
          <div className="absolute inset-0 bg-gradient-to-r from-brand-400 to-brand-500 opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
          <span className="relative">Continue</span>
          <RiArrowRightLine className="relative h-5 w-5 group-hover:translate-x-1 transition-transform" />
        </button>
      </div>

      <style jsx>{`
        .slider-thumb::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 24px;
          height: 24px;
          background: linear-gradient(135deg, #a78bfa 0%, #7c3aed 100%);
          border-radius: 50%;
          cursor: pointer;
          box-shadow: 0 0 20px rgba(139, 92, 246, 0.5);
          border: 3px solid white;
        }
        .slider-thumb::-moz-range-thumb {
          width: 24px;
          height: 24px;
          background: linear-gradient(135deg, #a78bfa 0%, #7c3aed 100%);
          border-radius: 50%;
          cursor: pointer;
          box-shadow: 0 0 20px rgba(139, 92, 246, 0.5);
          border: 3px solid white;
        }
      `}</style>
    </div>
  )
}
