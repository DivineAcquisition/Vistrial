"use client"

import { RiFlashlightLine } from "@remixicon/react"
import { cx } from "@/lib/utils"
import { ONBOARDING_STEPS } from "@/lib/onboarding/types"

interface OnboardingLayoutProps {
  currentStep: number
  children: React.ReactNode
}

export function OnboardingLayout({ currentStep, children }: OnboardingLayoutProps) {
  const totalSteps = ONBOARDING_STEPS.length
  const progress = (currentStep / totalSteps) * 100

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="mx-auto max-w-3xl px-4 py-4">
          <div className="flex items-center justify-between">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-brand-400 to-brand-600">
                <RiFlashlightLine className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-900 dark:text-white">Vistrial</h1>
                <p className="text-xs text-gray-500 dark:text-gray-400">Setup</p>
              </div>
            </div>

            {/* Step indicator */}
            <div className="text-right">
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                Step {currentStep} of {totalSteps}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {ONBOARDING_STEPS[currentStep - 1]?.duration || ""}
              </p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mt-4">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
              <div
                className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600 transition-all duration-500 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>
      </header>

      {/* Step indicator pills */}
      <div className="border-b border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="mx-auto max-w-3xl px-4 py-3">
          <div className="flex items-center justify-between gap-2 overflow-x-auto">
            {ONBOARDING_STEPS.map((step, index) => (
              <StepPill
                key={step.id}
                step={step.id}
                title={step.title}
                isActive={currentStep === step.id}
                isCompleted={currentStep > step.id}
                isLast={index === ONBOARDING_STEPS.length - 1}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <main className="mx-auto max-w-3xl px-4 py-8">
        {children}
      </main>
    </div>
  )
}

interface StepPillProps {
  step: number
  title: string
  isActive: boolean
  isCompleted: boolean
  isLast: boolean
}

function StepPill({ step, title, isActive, isCompleted, isLast }: StepPillProps) {
  return (
    <div className="flex items-center">
      <div
        className={cx(
          "flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
          isActive && "bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400",
          isCompleted && "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
          !isActive && !isCompleted && "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
        )}
      >
        <span
          className={cx(
            "flex h-5 w-5 items-center justify-center rounded-full text-xs",
            isActive && "bg-brand-600 text-white",
            isCompleted && "bg-green-600 text-white",
            !isActive && !isCompleted && "bg-gray-300 text-gray-600 dark:bg-gray-600 dark:text-gray-300"
          )}
        >
          {isCompleted ? "✓" : step}
        </span>
        <span className="hidden sm:inline">{title}</span>
      </div>
      {!isLast && (
        <div className="mx-2 h-px w-4 bg-gray-300 dark:bg-gray-600 sm:w-8" />
      )}
    </div>
  )
}
