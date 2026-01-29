"use client"

import {
  RiCheckboxCircleFill,
  RiAddLine,
  RiDashboardLine,
  RiPlayCircleLine,
  RiPhoneLine,
  RiStore2Line,
  RiMessage2Line,
} from "@remixicon/react"
import { Button } from "@/components/Button"
import type { OnboardingData } from "@/lib/onboarding/types"
import { getTradeConfig } from "@/lib/onboarding/trade-config"
import { formatPhoneDisplay } from "@/lib/twilio/format-phone"

interface StepCompleteProps {
  data: OnboardingData
  onAddLead: () => void
  onDashboard: () => void
}

export function StepComplete({ data, onAddLead, onDashboard }: StepCompleteProps) {
  const tradeConfig = data.trade ? getTradeConfig(data.trade) : null
  const tradeName = tradeConfig?.name || "Service"
  const sequenceSteps = tradeConfig?.sequenceSteps || 3
  const sequenceDays = tradeConfig?.sequenceDays || 7

  // Get first name from owner name or business name
  const displayName = data.ownerName?.split(" ")[0] || data.businessName.split(" ")[0] || "there"

  return (
    <div className="space-y-8">
      {/* Success Header */}
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
          <RiCheckboxCircleFill className="h-10 w-10 text-green-600 dark:text-green-400" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white sm:text-3xl">
          You&apos;re all set, {displayName}!
        </h2>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Let&apos;s get your first quote follow-up going.
        </p>
      </div>

      {/* Setup Summary */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
        <h3 className="mb-4 font-semibold text-gray-900 dark:text-white">Your Setup</h3>
        
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-700">
              <RiStore2Line className="h-5 w-5 text-gray-600 dark:text-gray-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Business</p>
              <p className="font-medium text-gray-900 dark:text-white">{data.businessName}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-700">
              <RiDashboardLine className="h-5 w-5 text-gray-600 dark:text-gray-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Trade</p>
              <p className="font-medium text-gray-900 dark:text-white">{tradeName}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-700">
              <RiPhoneLine className="h-5 w-5 text-gray-600 dark:text-gray-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Texting from</p>
              <p className="font-mono font-medium text-gray-900 dark:text-white">
                {formatPhoneDisplay(data.twilioPhoneNumber)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-700">
              <RiMessage2Line className="h-5 w-5 text-gray-600 dark:text-gray-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Sequence</p>
              <p className="font-medium text-gray-900 dark:text-white">
                {sequenceSteps} messages over {sequenceDays} days
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Next Step CTA */}
      <div className="rounded-xl border-2 border-brand-200 bg-gradient-to-br from-brand-50 to-white p-6 dark:border-brand-800 dark:from-brand-900/20 dark:to-gray-800">
        <h3 className="text-lg font-bold text-gray-900 dark:text-white">
          Your Next Step
        </h3>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Add your first customer who got a quote.
        </p>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-500">
          We&apos;ll start the follow-up sequence automatically. 
          You handle the job - we&apos;ll handle the follow-up.
        </p>

        <Button
          onClick={onAddLead}
          className="mt-4 w-full gap-2"
        >
          <RiAddLine className="h-5 w-5" />
          Add Your First Quote
        </Button>
      </div>

      {/* Alternative paths */}
      <div className="text-center">
        <p className="text-sm text-gray-500 dark:text-gray-400">Not ready to add a quote yet?</p>
        <div className="mt-3 flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
          <Button
            variant="secondary"
            onClick={onDashboard}
            className="gap-2"
          >
            <RiDashboardLine className="h-4 w-4" />
            Go to Dashboard
          </Button>
          <a
            href="https://vistrial.com/demo"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            <RiPlayCircleLine className="h-4 w-4" />
            Watch 2-min Demo
          </a>
        </div>
      </div>
    </div>
  )
}
