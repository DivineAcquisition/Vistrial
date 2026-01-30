"use client"

import Image from "next/image"
import { RiSparklingLine } from "@remixicon/react"
import { cn } from "@/lib/utils/cn"
import { ONBOARDING_STEPS } from "@/lib/onboarding/types"

interface OnboardingLayoutProps {
  currentStep: number
  children: React.ReactNode
}

export function OnboardingLayout({ currentStep, children }: OnboardingLayoutProps) {
  const totalSteps = ONBOARDING_STEPS.length
  const progress = (currentStep / totalSteps) * 100

  return (
    <div className="min-h-screen bg-gray-950 relative overflow-hidden">
      {/* Animated gradient background */}
      <div className="absolute inset-0 overflow-hidden">
        {/* Main gradient orbs */}
        <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full bg-brand-600/20 blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-brand-400/15 blur-[100px] animate-pulse" style={{ animationDelay: "1s" }} />
        <div className="absolute top-[40%] right-[20%] w-[300px] h-[300px] rounded-full bg-indigo-500/10 blur-[80px] animate-pulse" style={{ animationDelay: "2s" }} />
        
        {/* Grid pattern overlay */}
        <div 
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)`,
            backgroundSize: '50px 50px'
          }}
        />
      </div>

      {/* Content */}
      <div className="relative z-10">
        {/* Header */}
        <header className="border-b border-white/10 bg-gray-950/50 backdrop-blur-xl">
          <div className="mx-auto max-w-4xl px-4 py-4">
            <div className="flex items-center justify-between">
              {/* Logo */}
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="absolute inset-0 bg-brand-500 rounded-xl blur-md opacity-50" />
                  <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 shadow-lg shadow-brand-500/25">
                    <Image
                      src="/Untitled design (2).png"
                      alt="Vistrial"
                      width={28}
                      height={28}
                      className="rounded-lg"
                      unoptimized
                    />
                  </div>
                </div>
                <div>
                  <h1 className="text-lg font-bold text-white">Vistrial</h1>
                  <p className="text-xs text-gray-400">Quote Follow-Up Automation</p>
                </div>
              </div>

              {/* Step indicator */}
              <div className="flex items-center gap-3">
                <div className="hidden sm:flex items-center gap-2">
                  {ONBOARDING_STEPS.map((step, index) => (
                    <div
                      key={step.id}
                      className={cn(
                        "h-2 rounded-full transition-all duration-500",
                        index < currentStep
                          ? "w-8 bg-gradient-to-r from-brand-400 to-brand-600"
                          : index === currentStep - 1
                          ? "w-8 bg-gradient-to-r from-brand-400 to-brand-600 animate-pulse"
                          : "w-2 bg-gray-700"
                      )}
                    />
                  ))}
                </div>
                <div className="px-3 py-1.5 rounded-full bg-white/5 border border-white/10 backdrop-blur-sm">
                  <span className="text-sm font-medium text-white">
                    {currentStep}/{totalSteps}
                  </span>
                </div>
              </div>
            </div>

            {/* Progress bar with glow */}
            <div className="mt-4 relative">
              <div className="h-1 w-full overflow-hidden rounded-full bg-white/5">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-brand-400 via-brand-500 to-brand-600 transition-all duration-700 ease-out relative"
                  style={{ width: `${progress}%` }}
                >
                  {/* Glow effect on progress */}
                  <div className="absolute inset-0 bg-gradient-to-r from-brand-400 via-brand-500 to-brand-600 blur-sm" />
                  {/* Shimmer effect */}
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Main content */}
        <main className="mx-auto max-w-4xl px-4 py-12">
          <div className="relative">
            {/* Glowing card container */}
            <div className="absolute -inset-1 bg-gradient-to-r from-brand-500/20 via-brand-600/20 to-indigo-500/20 rounded-3xl blur-xl opacity-50" />
            <div className="relative bg-gray-900/80 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl shadow-brand-500/10 overflow-hidden">
              {/* Top accent line */}
              <div className="h-px bg-gradient-to-r from-transparent via-brand-500/50 to-transparent" />
              
              <div className="p-8 sm:p-12">
                {children}
              </div>
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="fixed bottom-0 inset-x-0 py-4 bg-gradient-to-t from-gray-950 via-gray-950/80 to-transparent pointer-events-none">
          <div className="mx-auto max-w-4xl px-4">
            <div className="flex items-center justify-center gap-2 text-xs text-gray-500">
              <RiSparklingLine className="w-3 h-3" />
              <span>Powered by Vistrial</span>
            </div>
          </div>
        </footer>
      </div>

      {/* CSS for shimmer animation */}
      <style jsx>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        .animate-shimmer {
          animation: shimmer 2s infinite;
        }
      `}</style>
    </div>
  )
}
