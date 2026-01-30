"use client"

import {
  RiCheckLine,
  RiArrowLeftLine,
  RiMessage2Line,
  RiTimeLine,
  RiEditLine,
  RiMagicLine,
  RiSparklingLine,
} from "@remixicon/react"
import { cn } from "@/lib/utils/cn"
import { type OnboardingData } from "@/lib/onboarding/types"

interface StepSequenceProps {
  data: OnboardingData
  onUpdate: (updates: Partial<OnboardingData>) => void
  onNext: () => void
  onBack: () => void
}

const DEFAULT_SEQUENCE = [
  {
    day: "Day 1",
    delay: "Same day",
    message: "Hi {name}! Thanks for getting a quote from {business}. Just wanted to check in—any questions about the estimate I sent over?",
  },
  {
    day: "Day 3",
    delay: "2 days later",
    message: "Hey {name}, following up on your quote. I can usually get you on the schedule within the next week or two. Want me to lock in a date?",
  },
  {
    day: "Day 5",
    delay: "2 days later",
    message: "Hi {name}—I know you're probably busy. Just a quick note that our schedule is filling up. Let me know if you'd like to move forward with the work!",
  },
  {
    day: "Day 7",
    delay: "2 days later",
    message: "Last check-in, {name}! If you're still interested in the quote, I'm happy to answer any questions. If not, no worries at all. Take care! - {owner}",
  },
]

export function StepSequence({ data, onUpdate, onNext, onBack }: StepSequenceProps) {

  const handleTemplateSelect = (template: "default" | "custom") => {
    onUpdate({ sequenceTemplate: template })
  }

  const handleSubmit = () => {
    onNext()
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-brand-500/10 border border-brand-500/20">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-500"></span>
          </span>
          <span className="text-sm font-medium text-brand-400">Step 5 of 5</span>
        </div>
        <h2 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-white via-gray-100 to-gray-300 bg-clip-text text-transparent">
          Your follow-up sequence
        </h2>
        <p className="text-gray-400 max-w-lg mx-auto">
          This is what we&apos;ll send to customers who got a quote but haven&apos;t booked yet.
        </p>
      </div>

      {/* Template Selection */}
      <div className="grid grid-cols-2 gap-4">
        <button
          onClick={() => handleTemplateSelect("default")}
          className={cn(
            "group relative flex flex-col items-center gap-3 rounded-xl p-6 text-center transition-all duration-300",
            "border-2 hover:scale-[1.02] active:scale-[0.98]",
            data.sequenceTemplate === "default"
              ? "border-brand-500 bg-brand-500/10"
              : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10"
          )}
        >
          {data.sequenceTemplate === "default" && (
            <div className="absolute inset-0 rounded-xl bg-brand-500/20 blur-xl -z-10" />
          )}
          <div className={cn(
            "flex h-14 w-14 items-center justify-center rounded-xl transition-all",
            data.sequenceTemplate === "default"
              ? "bg-gradient-to-br from-brand-400 to-brand-600 shadow-lg shadow-brand-500/30"
              : "bg-white/10 group-hover:bg-white/20"
          )}>
            <RiMagicLine className={cn(
              "h-7 w-7",
              data.sequenceTemplate === "default" ? "text-white" : "text-gray-400"
            )} />
          </div>
          <div>
            <h3 className={cn(
              "font-semibold transition-colors",
              data.sequenceTemplate === "default" ? "text-white" : "text-gray-300"
            )}>
              Use recommended
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              Battle-tested messages
            </p>
          </div>
          {data.sequenceTemplate === "default" && (
            <div className="absolute top-3 right-3 flex h-6 w-6 items-center justify-center rounded-full bg-brand-500">
              <RiCheckLine className="h-4 w-4 text-white" />
            </div>
          )}
        </button>

        <button
          onClick={() => handleTemplateSelect("custom")}
          className={cn(
            "group relative flex flex-col items-center gap-3 rounded-xl p-6 text-center transition-all duration-300",
            "border-2 hover:scale-[1.02] active:scale-[0.98]",
            data.sequenceTemplate === "custom"
              ? "border-brand-500 bg-brand-500/10"
              : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10"
          )}
        >
          {data.sequenceTemplate === "custom" && (
            <div className="absolute inset-0 rounded-xl bg-brand-500/20 blur-xl -z-10" />
          )}
          <div className={cn(
            "flex h-14 w-14 items-center justify-center rounded-xl transition-all",
            data.sequenceTemplate === "custom"
              ? "bg-gradient-to-br from-brand-400 to-brand-600 shadow-lg shadow-brand-500/30"
              : "bg-white/10 group-hover:bg-white/20"
          )}>
            <RiEditLine className={cn(
              "h-7 w-7",
              data.sequenceTemplate === "custom" ? "text-white" : "text-gray-400"
            )} />
          </div>
          <div>
            <h3 className={cn(
              "font-semibold transition-colors",
              data.sequenceTemplate === "custom" ? "text-white" : "text-gray-300"
            )}>
              Customize later
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              Edit after setup
            </p>
          </div>
          {data.sequenceTemplate === "custom" && (
            <div className="absolute top-3 right-3 flex h-6 w-6 items-center justify-center rounded-full bg-brand-500">
              <RiCheckLine className="h-4 w-4 text-white" />
            </div>
          )}
        </button>
      </div>

      {/* Sequence Preview */}
      <div className="relative">
        <div className="absolute -inset-0.5 bg-gradient-to-r from-brand-500/30 to-indigo-500/30 rounded-2xl blur opacity-50" />
        <div className="relative rounded-xl border border-white/10 bg-gray-900/50 backdrop-blur-sm overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-white/10 bg-white/5">
            <RiSparklingLine className="h-5 w-5 text-brand-400" />
            <h3 className="font-semibold text-white">Preview: 4-message sequence</h3>
          </div>

          <div className="p-5 space-y-4">
            {DEFAULT_SEQUENCE.map((step, index) => (
              <div
                key={index}
                className="group relative"
              >
                {/* Timeline connector */}
                {index < DEFAULT_SEQUENCE.length - 1 && (
                  <div className="absolute left-[19px] top-[40px] bottom-[-16px] w-0.5 bg-gradient-to-b from-brand-500/50 to-brand-500/20" />
                )}

                <div className="flex gap-4">
                  {/* Day badge */}
                  <div className="flex flex-col items-center">
                    <div className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-full transition-all",
                      index === 0
                        ? "bg-gradient-to-br from-brand-400 to-brand-600 shadow-lg shadow-brand-500/30"
                        : "bg-white/10 border border-white/10"
                    )}>
                      <span className={cn(
                        "text-sm font-bold",
                        index === 0 ? "text-white" : "text-gray-400"
                      )}>
                        {index + 1}
                      </span>
                    </div>
                  </div>

                  {/* Message card */}
                  <div className="flex-1 pb-4">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="font-semibold text-white">{step.day}</span>
                      <span className="flex items-center gap-1 text-xs text-gray-500">
                        <RiTimeLine className="h-3 w-3" />
                        {step.delay}
                      </span>
                    </div>
                    <div className="relative rounded-lg bg-white/5 border border-white/10 p-4 group-hover:bg-white/10 transition-colors">
                      {/* Message bubble tail */}
                      <div className="absolute left-[-6px] top-4 w-3 h-3 bg-white/5 border-l border-b border-white/10 rotate-45 group-hover:bg-white/10 transition-colors" />
                      
                      <div className="flex items-start gap-2">
                        <RiMessage2Line className="h-4 w-4 text-brand-400 mt-0.5 flex-shrink-0" />
                        <p className="text-sm text-gray-300 leading-relaxed">
                          {step.message}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Variables legend */}
          <div className="px-5 py-3 border-t border-white/10 bg-white/5">
            <div className="flex flex-wrap gap-3 text-xs text-gray-400">
              <span className="flex items-center gap-1">
                <code className="px-1.5 py-0.5 rounded bg-brand-500/20 text-brand-400">{"{name}"}</code>
                Customer&apos;s name
              </span>
              <span className="flex items-center gap-1">
                <code className="px-1.5 py-0.5 rounded bg-brand-500/20 text-brand-400">{"{business}"}</code>
                Your business name
              </span>
              <span className="flex items-center gap-1">
                <code className="px-1.5 py-0.5 rounded bg-brand-500/20 text-brand-400">{"{owner}"}</code>
                Your name
              </span>
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
          <div className="absolute inset-0 bg-gradient-to-r from-green-500 to-emerald-600" />
          <div className="absolute inset-0 bg-gradient-to-r from-green-400 to-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
          <span className="relative">Complete Setup</span>
          <RiCheckLine className="relative h-5 w-5" />
        </button>
      </div>
    </div>
  )
}
