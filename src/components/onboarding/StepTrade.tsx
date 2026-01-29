"use client"

import { useState } from "react"
import { RiCheckLine } from "@remixicon/react"
import { Button } from "@/components/Button"
import { Input } from "@/components/Input"
import { Label } from "@/components/Label"
import { cx } from "@/lib/utils"
import { TRADES, type TradeId, type OnboardingData } from "@/lib/onboarding/types"

interface StepTradeProps {
  data: OnboardingData
  onUpdate: (updates: Partial<OnboardingData>) => void
  onNext: () => void
}

export function StepTrade({ data, onUpdate, onNext }: StepTradeProps) {
  const [errors, setErrors] = useState<Record<string, string>>({})

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
      {/* Header */}
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white sm:text-3xl">
          What kind of work do you do?
        </h2>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          We&apos;ll customize everything for your trade.
        </p>
      </div>

      {/* Trade Selection */}
      <div>
        <Label className="mb-3 block text-sm font-medium">Select your trade</Label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {TRADES.map((trade) => (
            <button
              key={trade.id}
              type="button"
              onClick={() => handleTradeSelect(trade.id)}
              className={cx(
                "relative flex items-center justify-between rounded-lg border-2 px-4 py-3 text-left transition-all",
                data.trade === trade.id
                  ? "border-brand-600 bg-brand-50 dark:border-brand-400 dark:bg-brand-900/20"
                  : "border-gray-200 bg-white hover:border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-gray-600"
              )}
            >
              <span
                className={cx(
                  "text-sm font-medium",
                  data.trade === trade.id
                    ? "text-brand-700 dark:text-brand-300"
                    : "text-gray-900 dark:text-white"
                )}
              >
                {trade.label}
              </span>
              {data.trade === trade.id && (
                <RiCheckLine className="h-5 w-5 text-brand-600 dark:text-brand-400" />
              )}
            </button>
          ))}
        </div>
        {errors.trade && (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">{errors.trade}</p>
        )}

        {/* Other trade input */}
        {data.trade === "other" && (
          <div className="mt-4">
            <Label htmlFor="tradeOther">Describe your trade</Label>
            <Input
              id="tradeOther"
              type="text"
              placeholder="e.g., Pool cleaning, Solar installation..."
              value={data.tradeOther || ""}
              onChange={(e) => onUpdate({ tradeOther: e.target.value })}
              className="mt-1"
            />
            {errors.tradeOther && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.tradeOther}</p>
            )}
          </div>
        )}
      </div>

      {/* Business Info */}
      <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
        <div>
          <Label htmlFor="businessName">
            Business Name <span className="text-red-500">*</span>
          </Label>
          <Input
            id="businessName"
            type="text"
            placeholder="e.g., Pro Plumbing, ABC HVAC..."
            value={data.businessName}
            onChange={(e) => {
              onUpdate({ businessName: e.target.value })
              setErrors((prev) => ({ ...prev, businessName: "" }))
            }}
            className="mt-1"
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            This shows up in your texts to customers
          </p>
          {errors.businessName && (
            <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.businessName}</p>
          )}
        </div>

        <div>
          <Label htmlFor="ownerName">Your Name (optional)</Label>
          <Input
            id="ownerName"
            type="text"
            placeholder="e.g., Mike, Sarah..."
            value={data.ownerName || ""}
            onChange={(e) => onUpdate({ ownerName: e.target.value })}
            className="mt-1"
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Some contractors like to sign their messages
          </p>
        </div>

        <div>
          <Label htmlFor="businessPhone">Business Phone (optional)</Label>
          <Input
            id="businessPhone"
            type="tel"
            placeholder="(555) 123-4567"
            value={data.businessPhone || ""}
            onChange={(e) => onUpdate({ businessPhone: e.target.value })}
            className="mt-1"
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            We can include this in messages for callbacks
          </p>
        </div>
      </div>

      {/* Next button */}
      <div className="flex justify-end">
        <Button onClick={handleSubmit} className="px-8">
          Continue
        </Button>
      </div>
    </div>
  )
}
