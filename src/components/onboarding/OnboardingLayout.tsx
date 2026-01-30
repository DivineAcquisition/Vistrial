"use client"

import { RiSparklingLine } from "@remixicon/react"
import { cn } from "@/lib/utils/cn"
import { ONBOARDING_STEPS } from "@/lib/onboarding/types"
import { Logo } from "@/components/ui/Logo"

interface OnboardingLayoutProps {
  currentStep: number
  children: React.ReactNode
}

export function OnboardingLayout({ currentStep, children }: OnboardingLayoutProps) {
  const totalSteps = ONBOARDING_STEPS.length
  const progress = (currentStep / totalSteps) * 100

  return (
    <div className="min-h-screen bg-white relative overflow-hidden">
      {/* Subtle background gradient */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full bg-brand-400/10 blur-3xl animate-float" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-indigo-400/10 blur-3xl animate-float-delayed" />
      </div>

      {/* Content */}
      <div className="relative z-10">
        {/* Header */}
        <header className="border-b border-gray-100 bg-white/80 backdrop-blur-xl">
          <div className="mx-auto max-w-4xl px-4 py-4">
            <div className="flex items-center justify-between">
              {/* Logo */}
              <Logo size="sm" variant="dark" />

              {/* Step indicator */}
              <div className="flex items-center gap-3">
                <div className="hidden sm:flex items-center gap-2">
                  {ONBOARDING_STEPS.map((step, index) => (
                    <div
                      key={step.id}
                      className={cn(
                        "h-2 rounded-full transition-all duration-500",
                        index < currentStep
                          ? "w-8 bg-gradient-to-r from-brand-500 to-brand-600"
                          : index === currentStep - 1
                          ? "w-8 bg-gradient-to-r from-brand-500 to-brand-600"
                          : "w-2 bg-gray-200"
                      )}
                    />
                  ))}
                </div>
                <div className="px-3 py-1.5 rounded-full bg-gray-100 border border-gray-200">
                  <span className="text-sm font-medium text-gray-700">
                    {currentStep}/{totalSteps}
                  </span>
                </div>
              </div>
            </div>

            {/* Progress bar */}
            <div className="mt-4 relative">
              <div className="h-1 w-full overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-600 transition-all duration-700 ease-out relative"
                  style={{ width: `${progress}%` }}
                >
                  {/* Shimmer effect */}
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent animate-shimmer" />
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Main content */}
        <main className="mx-auto max-w-4xl px-4 py-12">
          <div className="relative">
            {/* Card glow */}
            <div className="absolute -inset-1 bg-gradient-to-r from-brand-500/10 via-brand-600/10 to-indigo-500/10 rounded-3xl blur-xl opacity-60" />
            <div className="relative bg-white rounded-2xl border border-gray-200 shadow-xl overflow-hidden">
              {/* Top accent line */}
              <div className="h-px bg-gradient-to-r from-transparent via-brand-500/30 to-transparent" />
              
              <div className="p-8 sm:p-12">
                {children}
              </div>
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="fixed bottom-0 inset-x-0 py-4 bg-gradient-to-t from-white via-white/80 to-transparent pointer-events-none">
          <div className="mx-auto max-w-4xl px-4">
            <div className="flex items-center justify-center gap-2 text-xs text-gray-400">
              <RiSparklingLine className="w-3 h-3" />
              <span>Powered by Vistrial</span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}
