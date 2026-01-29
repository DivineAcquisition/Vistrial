"use client"

import { useState } from "react"
import {
  RiCheckboxCircleLine,
  RiArrowDownSLine,
  RiAlertLine,
} from "@remixicon/react"
import { Button } from "@/components/Button"
import { cx } from "@/lib/utils"
import type { OnboardingData } from "@/lib/onboarding/types"

interface StepComplianceProps {
  data: OnboardingData
  onUpdate: (updates: Partial<OnboardingData>) => void
  onNext: () => void
  onBack: () => void
}

export function StepCompliance({ data, onUpdate, onNext, onBack }: StepComplianceProps) {
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [showFinePrint, setShowFinePrint] = useState(false)

  const handleAcknowledge = (checked: boolean) => {
    onUpdate({
      complianceAcknowledged: checked,
      acknowledgedAt: checked ? new Date().toISOString() : undefined,
    })
    setErrors({})
  }

  const handleSubmit = () => {
    if (!data.complianceAcknowledged) {
      setErrors({ acknowledgment: "Please acknowledge the SMS guidelines" })
      return
    }
    onNext()
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white sm:text-3xl">
          Quick legal stuff (30 seconds)
        </h2>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Business texting has rules. Here&apos;s what you need to know.
        </p>
      </div>

      {/* The 3 Rules */}
      <div className="rounded-xl border-2 border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
        <h3 className="text-lg font-bold text-gray-900 dark:text-white">
          The 3 Rules of Texting Customers
        </h3>

        <div className="mt-6 space-y-6">
          {/* Rule 1 */}
          <div className="flex gap-4">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-brand-100 text-lg font-bold text-brand-700 dark:bg-brand-900/30 dark:text-brand-400">
              1
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 dark:text-white">
                Only text people who asked for a quote
              </h4>
              <div className="mt-2 space-y-1 text-sm">
                <p className="flex items-center gap-2 text-green-600 dark:text-green-400">
                  <RiCheckboxCircleLine className="h-4 w-4" />
                  They gave you their number
                </p>
                <p className="flex items-center gap-2 text-green-600 dark:text-green-400">
                  <RiCheckboxCircleLine className="h-4 w-4" />
                  They requested your service
                </p>
                <p className="flex items-center gap-2 text-red-600 dark:text-red-400">
                  <span className="text-lg">✗</span>
                  Don&apos;t buy lead lists and blast them
                </p>
              </div>
            </div>
          </div>

          {/* Rule 2 */}
          <div className="flex gap-4">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-brand-100 text-lg font-bold text-brand-700 dark:bg-brand-900/30 dark:text-brand-400">
              2
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 dark:text-white">
                STOP means STOP
              </h4>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                If someone texts STOP, we automatically remove them. 
                You don&apos;t have to do anything.
              </p>
            </div>
          </div>

          {/* Rule 3 */}
          <div className="flex gap-4">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-brand-100 text-lg font-bold text-brand-700 dark:bg-brand-900/30 dark:text-brand-400">
              3
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 dark:text-white">
                Text during normal hours
              </h4>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                We only send between 8am-9pm their time. Automatically handled.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* What we handle */}
      <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/20">
        <h4 className="font-semibold text-green-800 dark:text-green-200">
          What We Handle Automatically
        </h4>
        <ul className="mt-2 space-y-1.5 text-sm text-green-700 dark:text-green-300">
          <li className="flex items-center gap-2">
            <RiCheckboxCircleLine className="h-4 w-4" />
            Stop/unsubscribe detection
          </li>
          <li className="flex items-center gap-2">
            <RiCheckboxCircleLine className="h-4 w-4" />
            Automatic opt-out confirmation
          </li>
          <li className="flex items-center gap-2">
            <RiCheckboxCircleLine className="h-4 w-4" />
            Time-of-day restrictions (8am-9pm)
          </li>
          <li className="flex items-center gap-2">
            <RiCheckboxCircleLine className="h-4 w-4" />
            Message logging for your records
          </li>
          <li className="flex items-center gap-2">
            <RiCheckboxCircleLine className="h-4 w-4" />
            Your business name in first message
          </li>
        </ul>
      </div>

      {/* What you are responsible for */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
        <h4 className="flex items-center gap-2 font-semibold text-amber-800 dark:text-amber-200">
          <RiAlertLine className="h-5 w-5" />
          What You&apos;re Responsible For
        </h4>
        <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">
          Only add customers who:
        </p>
        <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-amber-700 dark:text-amber-300">
          <li>Requested a quote from you</li>
          <li>Gave you their phone number for that purpose</li>
          <li>Haven&apos;t told you to stop contacting them</li>
        </ul>
        <p className="mt-3 text-sm font-medium text-amber-800 dark:text-amber-200">
          That&apos;s it. If someone asked you for a quote, you&apos;re good to follow up.
        </p>
      </div>

      {/* Fine print (collapsible) */}
      <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        <button
          type="button"
          onClick={() => setShowFinePrint(!showFinePrint)}
          className="flex w-full items-center justify-between p-4"
        >
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            What happens if I break the rules?
          </span>
          <RiArrowDownSLine
            className={cx(
              "h-5 w-5 text-gray-400 transition-transform",
              showFinePrint && "rotate-180"
            )}
          />
        </button>
        {showFinePrint && (
          <div className="border-t border-gray-200 p-4 dark:border-gray-700">
            <div className="text-sm text-gray-600 dark:text-gray-400">
              <p>
                Texting people without consent can result in fines of{" "}
                <strong className="text-red-600 dark:text-red-400">$500-$1,500 per message</strong>. 
                Class action lawsuits have hit companies for millions.
              </p>
              <p className="mt-3">
                <strong>But here&apos;s the thing:</strong> if you&apos;re just following up on quotes that 
                customers requested, you&apos;re fine. This law exists to stop spam, not legitimate 
                business follow-up.
              </p>
              <p className="mt-3 font-medium">
                Don&apos;t buy lead lists. Don&apos;t text random people. Follow up on YOUR quotes. Simple.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Acknowledgment */}
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={data.complianceAcknowledged}
            onChange={(e) => handleAcknowledge(e.target.checked)}
            className="mt-0.5 h-5 w-5 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
          />
          <span className="text-sm text-gray-700 dark:text-gray-300">
            I understand that I should only text customers who requested quotes from my business, 
            and I&apos;ll honor opt-out requests.
          </span>
        </label>
        {errors.acknowledgment && (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">{errors.acknowledgment}</p>
        )}
      </div>

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
