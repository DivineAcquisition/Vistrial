"use client"

import { useState } from "react"
import {
  RiCheckLine,
  RiArrowRightLine,
  RiArrowLeftLine,
  RiShieldCheckLine,
  RiFileListLine,
  RiTimeLine,
  RiStopCircleLine,
  RiMessageLine,
} from "@remixicon/react"
import { cn } from "@/lib/utils/cn"
import { type OnboardingData } from "@/lib/onboarding/types"

interface StepComplianceProps {
  data: OnboardingData
  onUpdate: (updates: Partial<OnboardingData>) => void
  onNext: () => void
  onBack: () => void
}

const COMPLIANCE_ITEMS = [
  {
    icon: RiFileListLine,
    title: "Written Consent Required",
    description: "Get customer permission before texting. A simple checkbox on your quote form works.",
    color: "from-blue-400 to-blue-600",
  },
  {
    icon: RiTimeLine,
    title: "Timing Restrictions",
    description: "Only text between 8am-9pm in the customer's timezone. We handle this automatically.",
    color: "from-amber-400 to-orange-600",
  },
  {
    icon: RiStopCircleLine,
    title: "Opt-Out Honored",
    description: "If someone texts STOP, we immediately stop messaging them. No exceptions.",
    color: "from-red-400 to-red-600",
  },
  {
    icon: RiMessageLine,
    title: "Clear Identification",
    description: "Every message identifies your business name. No mystery texts.",
    color: "from-green-400 to-green-600",
  },
]

export function StepCompliance({ data, onUpdate, onNext, onBack }: StepComplianceProps) {
  const [error, setError] = useState<string | null>(null)

  const handleAcknowledge = () => {
    onUpdate({
      complianceAcknowledged: !data.complianceAcknowledged,
      acknowledgedAt: !data.complianceAcknowledged ? new Date().toISOString() : undefined,
    })
    setError(null)
  }

  const handleSubmit = () => {
    if (!data.complianceAcknowledged) {
      setError("Please acknowledge the compliance requirements to continue")
      return
    }
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
          <span className="text-sm font-medium text-brand-400">Step 4 of 5</span>
        </div>
        <h2 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-white via-gray-100 to-gray-300 bg-clip-text text-transparent">
          Quick legal stuff
        </h2>
        <p className="text-gray-400 max-w-lg mx-auto">
          We take SMS compliance seriously. Here&apos;s what you need to know.
        </p>
      </div>

      {/* Shield Icon */}
      <div className="flex justify-center">
        <div className="relative">
          <div className="absolute inset-0 bg-brand-500 rounded-full blur-2xl opacity-30 animate-pulse" />
          <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 shadow-lg shadow-brand-500/30">
            <RiShieldCheckLine className="h-10 w-10 text-white" />
          </div>
        </div>
      </div>

      {/* Compliance Items */}
      <div className="grid gap-4">
        {COMPLIANCE_ITEMS.map((item, index) => (
          <div
            key={index}
            className="group relative overflow-hidden rounded-xl border border-white/10 bg-white/5 p-4 transition-all duration-300 hover:bg-white/10"
          >
            {/* Hover glow */}
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity">
              <div className={cn(
                "absolute top-0 left-0 w-32 h-32 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2 bg-gradient-to-r opacity-20",
                item.color
              )} />
            </div>
            
            <div className="relative flex items-start gap-4">
              <div className={cn(
                "flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br",
                item.color
              )}>
                <item.icon className="h-5 w-5 text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-white">{item.title}</h3>
                <p className="mt-1 text-sm text-gray-400">{item.description}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Acknowledgment Checkbox */}
      <div className="relative">
        <div className={cn(
          "absolute -inset-0.5 rounded-2xl blur transition-opacity duration-300",
          data.complianceAcknowledged 
            ? "bg-gradient-to-r from-green-500/30 to-emerald-500/30 opacity-100" 
            : "bg-gradient-to-r from-brand-500/30 to-indigo-500/30 opacity-50"
        )} />
        <label 
          className={cn(
            "relative flex items-start gap-4 rounded-xl border p-5 cursor-pointer transition-all duration-300",
            data.complianceAcknowledged
              ? "border-green-500/50 bg-green-500/10"
              : "border-white/10 bg-gray-900/50 hover:border-white/20"
          )}
        >
          <div className={cn(
            "relative flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md border-2 transition-all duration-300",
            data.complianceAcknowledged 
              ? "bg-green-500 border-green-500" 
              : "border-white/30 hover:border-white/50"
          )}>
            {data.complianceAcknowledged && (
              <RiCheckLine className="h-4 w-4 text-white" />
            )}
          </div>
          <input
            type="checkbox"
            checked={data.complianceAcknowledged}
            onChange={handleAcknowledge}
            className="sr-only"
          />
          <div>
            <span className={cn(
              "font-medium transition-colors",
              data.complianceAcknowledged ? "text-green-400" : "text-white"
            )}>
              I understand and agree to follow SMS compliance rules
            </span>
            <p className="mt-1 text-sm text-gray-400">
              I will only text customers who have given consent, and I will honor opt-out requests immediately.
            </p>
          </div>
        </label>
      </div>

      {error && (
        <p className="text-sm text-red-400 text-center flex items-center justify-center gap-2">
          <span className="h-1 w-1 rounded-full bg-red-400" />
          {error}
        </p>
      )}

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
    </div>
  )
}
