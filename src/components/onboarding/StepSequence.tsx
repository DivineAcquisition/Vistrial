"use client"

import { useState } from "react"
import {
  RiTimeLine,
  RiMessage2Line,
  RiEditLine,
  RiArrowGoBackLine,
} from "@remixicon/react"
import { Button } from "@/components/Button"
import { cx } from "@/lib/utils"
import type { OnboardingData } from "@/lib/onboarding/types"
import { getTradeConfig } from "@/lib/onboarding/trade-config"

interface StepSequenceProps {
  data: OnboardingData
  onUpdate: (updates: Partial<OnboardingData>) => void
  onNext: () => void
  onBack: () => void
}

export function StepSequence({ data, onUpdate, onNext, onBack }: StepSequenceProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editedMessages, setEditedMessages] = useState<Record<string, string>>({})

  // Get trade-specific config
  const tradeConfig = data.trade ? getTradeConfig(data.trade) : null
  const tradeName = tradeConfig?.name || "Service"

  // Get default messages for the trade
  const defaultMessages = tradeConfig?.defaultMessages || {
    step1: `Hi {{first_name}}, this is {{business_name}} confirming your quote for {{quote_amount}}. Any questions? Just reply here or call {{business_phone}}. Reply STOP to opt out.`,
    step2: `Hey {{first_name}}, following up on your quote. I've got availability this week if you're ready. Let me know!`,
    step3: `{{first_name}}, final follow-up on your quote. Reply YES to schedule, or let me know if you have questions. Thanks!`,
  }

  // Calculate delay labels based on trade
  const sequenceDays = tradeConfig?.sequenceDays || 7
  const delays = {
    step1: "Sent immediately",
    step2: `${Math.ceil(sequenceDays / 3)} days later`,
    step3: `${sequenceDays} days after quote`,
    step4: tradeConfig?.defaultMessages.step4 ? `${sequenceDays * 2} days after quote` : undefined,
  }

  // Replace template variables with preview values
  const previewMessage = (template: string): string => {
    return template
      .replace(/\{\{first_name\}\}/gi, "John")
      .replace(/\{\{name\}\}/gi, "John Smith")
      .replace(/\{\{quote_amount\}\}/gi, "$850")
      .replace(/\{\{business_name\}\}/gi, data.businessName || "Pro Service")
      .replace(/\{\{business_phone\}\}/gi, data.businessPhone || "(555) 123-4567")
  }

  const getCurrentMessage = (step: keyof typeof defaultMessages): string => {
    if (data.sequenceTemplate === "custom" && data.customMessages?.[step]) {
      return data.customMessages[step] as string
    }
    return editedMessages[step] || defaultMessages[step] || ""
  }

  const handleEditMessage = (step: string, value: string) => {
    setEditedMessages((prev) => ({ ...prev, [step]: value }))
  }

  const handleSaveCustom = () => {
    onUpdate({
      sequenceTemplate: "custom",
      customMessages: editedMessages,
    })
    setIsEditing(false)
  }

  const handleUseDefault = () => {
    onUpdate({
      sequenceTemplate: "default",
      customMessages: undefined,
    })
    setIsEditing(false)
    setEditedMessages({})
  }

  const handleSubmit = () => {
    // If editing, save changes first
    if (isEditing && Object.keys(editedMessages).length > 0) {
      onUpdate({
        sequenceTemplate: "custom",
        customMessages: editedMessages,
      })
    }
    onNext()
  }

  const messageSteps = [
    { key: "step1" as const, label: "Message 1", delay: delays.step1 },
    { key: "step2" as const, label: "Message 2", delay: delays.step2 },
    { key: "step3" as const, label: "Message 3", delay: delays.step3 },
    ...(defaultMessages.step4
      ? [{ key: "step4" as const, label: "Message 4", delay: delays.step4 }]
      : []),
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white sm:text-3xl">
          Your follow-up sequence is ready
        </h2>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          We built this based on what works for {tradeName.toLowerCase()}. 
          Tweak it or use it as-is.
        </p>
      </div>

      {/* Sequence Card */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden dark:border-gray-700 dark:bg-gray-800">
        {/* Header */}
        <div className="border-b border-gray-200 bg-gray-50 px-6 py-4 dark:border-gray-700 dark:bg-gray-900">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">
                Standard {tradeName} Follow-Up
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {messageSteps.length} messages over {sequenceDays} days
              </p>
            </div>
            {!isEditing && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setIsEditing(true)}
                className="gap-1"
              >
                <RiEditLine className="h-4 w-4" />
                Edit Messages
              </Button>
            )}
          </div>
        </div>

        {/* Messages */}
        <div className="divide-y divide-gray-200 dark:divide-gray-700">
          {messageSteps.map((step) => (
            <div key={step.key} className="p-6">
              {/* Step header */}
              <div className="mb-3 flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 dark:bg-brand-900/30">
                  <RiMessage2Line className="h-4 w-4 text-brand-600 dark:text-brand-400" />
                </div>
                <div>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {step.label}
                  </span>
                  <span className="mx-2 text-gray-400">•</span>
                  <span className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
                    <RiTimeLine className="h-3.5 w-3.5" />
                    {step.delay}
                  </span>
                </div>
              </div>

              {/* Message content */}
              {isEditing ? (
                <div>
                  <textarea
                    value={editedMessages[step.key] ?? defaultMessages[step.key]}
                    onChange={(e) => handleEditMessage(step.key, e.target.value)}
                    rows={4}
                    className={cx(
                      "w-full rounded-lg border border-gray-200 bg-white p-3 text-sm",
                      "focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500",
                      "dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                    )}
                  />
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    Available variables: {`{{first_name}}`}, {`{{quote_amount}}`}, {`{{business_name}}`}, {`{{business_phone}}`}
                  </p>
                </div>
              ) : (
                <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-900">
                  <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                    {previewMessage(getCurrentMessage(step.key))}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Edit mode actions */}
      {isEditing && (
        <div className="flex items-center justify-between rounded-lg border border-brand-200 bg-brand-50 p-4 dark:border-brand-800 dark:bg-brand-900/20">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleUseDefault}
            className="gap-1"
          >
            <RiArrowGoBackLine className="h-4 w-4" />
            Reset to Default
          </Button>
          <Button
            size="sm"
            onClick={handleSaveCustom}
          >
            Save Changes
          </Button>
        </div>
      )}

      {/* Skip customization note */}
      {!isEditing && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-center dark:border-gray-700 dark:bg-gray-800">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            <strong>Want to customize this later?</strong> You can always edit your sequences in Settings. 
            Most contractors start with the default and tweak it after seeing how customers respond.
          </p>
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between">
        <Button variant="secondary" onClick={onBack}>
          Back
        </Button>
        <Button onClick={handleSubmit} className="px-8">
          {isEditing ? "Save & Continue" : "Looks Good"}
        </Button>
      </div>
    </div>
  )
}
