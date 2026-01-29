"use client"

import { useState } from "react"
import { RiCheckLine, RiBarChartBoxLine, RiMoneyDollarCircleLine } from "@remixicon/react"
import { Button } from "@/components/Button"
import { cx } from "@/lib/utils"
import {
  QUOTE_VOLUMES,
  FOLLOWUP_OPTIONS,
  type QuoteVolume,
  type FollowUpOption,
  type OnboardingData,
} from "@/lib/onboarding/types"
import { getTradeEmpathy } from "@/lib/onboarding/trade-config"

interface StepRealityProps {
  data: OnboardingData
  onUpdate: (updates: Partial<OnboardingData>) => void
  onNext: () => void
  onBack: () => void
}

export function StepReality({ data, onUpdate, onNext, onBack }: StepRealityProps) {
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [showReality, setShowReality] = useState(false)

  // Get trade-specific empathy line
  const empathyLine = data.trade ? getTradeEmpathy(data.trade) : "You are busy - we get it"

  // Calculate potential revenue (for reality check)
  const getQuoteMultiplier = (volume: QuoteVolume | null): number => {
    switch (volume) {
      case "1-10": return 5
      case "11-25": return 18
      case "26-50": return 38
      case "50+": return 60
      default: return 20
    }
  }

  const avgJobValue = 800 // Default assumption
  const monthlyQuotes = getQuoteMultiplier(data.monthlyQuotes)
  const currentClosing = Math.round(monthlyQuotes * (data.perceivedCloseRate / 10))
  const potentialClosing = Math.round(monthlyQuotes * ((data.perceivedCloseRate + 2) / 10)) // +20% improvement
  const currentRevenue = currentClosing * avgJobValue
  const missedRevenue = (monthlyQuotes - currentClosing) * avgJobValue
  const potentialGain = (potentialClosing - currentClosing) * avgJobValue

  const handleVolumeSelect = (volume: QuoteVolume) => {
    onUpdate({ monthlyQuotes: volume })
    setErrors((prev) => ({ ...prev, monthlyQuotes: "" }))
  }

  const handleFollowUpSelect = (option: FollowUpOption) => {
    onUpdate({ currentFollowUp: option })
    setErrors((prev) => ({ ...prev, currentFollowUp: "" }))
  }

  const handleCloseRateChange = (value: number) => {
    onUpdate({ perceivedCloseRate: value })
    setShowReality(true)
  }

  const handleSubmit = () => {
    const newErrors: Record<string, string> = {}

    if (!data.monthlyQuotes) {
      newErrors.monthlyQuotes = "Please select your quote volume"
    }

    if (!data.currentFollowUp) {
      newErrors.currentFollowUp = "Please select your current follow-up process"
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    onNext()
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white sm:text-3xl">
          Let&apos;s talk about what happens after you send a quote.
        </h2>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Be honest - we&apos;ve heard it all.
        </p>
      </div>

      {/* Question 1: Quote Volume */}
      <div>
        <label className="mb-3 block text-sm font-medium text-gray-900 dark:text-white">
          How many quotes do you send out in a typical month?
        </label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {QUOTE_VOLUMES.map((volume) => (
            <button
              key={volume.id}
              type="button"
              onClick={() => handleVolumeSelect(volume.id)}
              className={cx(
                "flex items-center justify-between rounded-lg border-2 px-4 py-3 text-left transition-all",
                data.monthlyQuotes === volume.id
                  ? "border-brand-600 bg-brand-50 dark:border-brand-400 dark:bg-brand-900/20"
                  : "border-gray-200 bg-white hover:border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-gray-600"
              )}
            >
              <span
                className={cx(
                  "text-sm font-medium",
                  data.monthlyQuotes === volume.id
                    ? "text-brand-700 dark:text-brand-300"
                    : "text-gray-900 dark:text-white"
                )}
              >
                {volume.label}
              </span>
              {data.monthlyQuotes === volume.id && (
                <RiCheckLine className="h-5 w-5 text-brand-600 dark:text-brand-400" />
              )}
            </button>
          ))}
        </div>
        {errors.monthlyQuotes && (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">{errors.monthlyQuotes}</p>
        )}
      </div>

      {/* Question 2: Current Follow-Up */}
      <div>
        <label className="mb-3 block text-sm font-medium text-gray-900 dark:text-white">
          What&apos;s your follow-up process right now?
        </label>
        <div className="space-y-2">
          {FOLLOWUP_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => handleFollowUpSelect(option.id)}
              className={cx(
                "flex w-full items-center justify-between rounded-lg border-2 px-4 py-3 text-left transition-all",
                data.currentFollowUp === option.id
                  ? "border-brand-600 bg-brand-50 dark:border-brand-400 dark:bg-brand-900/20"
                  : "border-gray-200 bg-white hover:border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-gray-600"
              )}
            >
              <span
                className={cx(
                  "text-sm",
                  data.currentFollowUp === option.id
                    ? "font-medium text-brand-700 dark:text-brand-300"
                    : "text-gray-700 dark:text-gray-300"
                )}
              >
                {option.label}
              </span>
              {data.currentFollowUp === option.id && (
                <RiCheckLine className="h-5 w-5 flex-shrink-0 text-brand-600 dark:text-brand-400" />
              )}
            </button>
          ))}
        </div>
        {errors.currentFollowUp && (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">{errors.currentFollowUp}</p>
        )}
      </div>

      {/* Question 3: Close Rate */}
      <div>
        <label className="mb-3 block text-sm font-medium text-gray-900 dark:text-white">
          Out of 10 quotes you send, how many turn into jobs?
        </label>
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500 dark:text-gray-400">1 job</span>
            <span className="text-2xl font-bold text-brand-600 dark:text-brand-400">
              {data.perceivedCloseRate} out of 10
            </span>
            <span className="text-sm text-gray-500 dark:text-gray-400">10 jobs</span>
          </div>
          <input
            type="range"
            min="1"
            max="10"
            value={data.perceivedCloseRate}
            onChange={(e) => handleCloseRateChange(parseInt(e.target.value))}
            className="mt-4 h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200 accent-brand-600 dark:bg-gray-700"
          />
        </div>
      </div>

      {/* Reality Check Card */}
      {showReality && data.monthlyQuotes && (
        <div className="rounded-xl border-2 border-brand-200 bg-gradient-to-br from-brand-50 to-white p-6 dark:border-brand-800 dark:from-brand-900/20 dark:to-gray-800">
          <h3 className="flex items-center gap-2 text-lg font-bold text-gray-900 dark:text-white">
            <RiBarChartBoxLine className="h-5 w-5 text-brand-600 dark:text-brand-400" />
            Here&apos;s what that means for your business
          </h3>

          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between rounded-lg bg-white p-3 dark:bg-gray-900">
              <span className="text-gray-600 dark:text-gray-400">
                You&apos;re closing {data.perceivedCloseRate} out of 10 quotes
              </span>
              <span className="font-semibold text-gray-900 dark:text-white">
                {data.perceivedCloseRate * 10}% close rate
              </span>
            </div>

            <div className="flex items-center justify-between rounded-lg bg-green-50 p-3 dark:bg-green-900/20">
              <span className="flex items-center gap-2 text-green-700 dark:text-green-400">
                <RiMoneyDollarCircleLine className="h-5 w-5" />
                Currently booking
              </span>
              <span className="font-bold text-green-700 dark:text-green-400">
                ${currentRevenue.toLocaleString()}/month
              </span>
            </div>

            <div className="flex items-center justify-between rounded-lg bg-red-50 p-3 dark:bg-red-900/20">
              <span className="text-red-700 dark:text-red-400">Potentially losing</span>
              <span className="font-bold text-red-700 dark:text-red-400">
                ${missedRevenue.toLocaleString()}/month
              </span>
            </div>
          </div>

          <div className="mt-4 rounded-lg bg-brand-100 p-4 dark:bg-brand-900/30">
            <p className="text-sm text-brand-800 dark:text-brand-200">
              <strong>Industry data shows:</strong> 80% of jobs require 5+ follow-ups. 
              Most contractors stop at 1. Automated follow-up closes 20-40% more.
            </p>
            <p className="mt-2 text-lg font-bold text-brand-700 dark:text-brand-300">
              That&apos;s potentially ${potentialGain.toLocaleString()}-${(potentialGain * 2).toLocaleString()} more per month.
            </p>
          </div>
        </div>
      )}

      {/* Empathy message for reactive/none follow-up */}
      {(data.currentFollowUp === "reactive" || data.currentFollowUp === "none") && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
          <p className="text-center font-medium text-gray-900 dark:text-white">
            You&apos;re not alone - 72% of contractors tell us the same thing.
          </p>
          <p className="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
            The problem isn&apos;t you - it&apos;s time. {empathyLine}.
            <br />
            That&apos;s exactly why we built this.
          </p>
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between">
        <Button variant="secondary" onClick={onBack}>
          Back
        </Button>
        <Button onClick={handleSubmit} className="px-8">
          Continue
        </Button>
      </div>
    </div>
  )
}
