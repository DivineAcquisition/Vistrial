"use client"

import { useEffect, useState } from "react"
import {
  RiCheckLine,
  RiAddLine,
  RiDashboardLine,
  RiSparklingLine,
  RiRocketLine,
  RiFileTextLine,
  RiMessage2Line,
  RiTimeLine,
} from "@remixicon/react"
import { cn } from "@/lib/utils/cn"
import { type OnboardingData } from "@/lib/onboarding/types"

interface StepCompleteProps {
  data: OnboardingData
  onAddLead: () => void
  onDashboard: () => void
}

export function StepComplete({ data, onAddLead, onDashboard }: StepCompleteProps) {
  const [showContent, setShowContent] = useState(false)
  const [showButtons, setShowButtons] = useState(false)

  useEffect(() => {
    const timer1 = setTimeout(() => setShowContent(true), 500)
    const timer2 = setTimeout(() => setShowButtons(true), 1200)
    return () => {
      clearTimeout(timer1)
      clearTimeout(timer2)
    }
  }, [])

  return (
    <div className="min-h-screen bg-gray-950 relative overflow-hidden flex items-center justify-center p-4">
      {/* Animated celebration background */}
      <div className="absolute inset-0 overflow-hidden">
        {/* Confetti-like particles */}
        <div className="absolute top-[10%] left-[10%] w-2 h-2 bg-brand-400 rounded-full animate-bounce" style={{ animationDelay: "0s", animationDuration: "2s" }} />
        <div className="absolute top-[20%] right-[15%] w-3 h-3 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: "0.3s", animationDuration: "2.5s" }} />
        <div className="absolute bottom-[30%] left-[20%] w-2 h-2 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: "0.5s", animationDuration: "1.8s" }} />
        <div className="absolute top-[40%] right-[10%] w-2 h-2 bg-pink-400 rounded-full animate-bounce" style={{ animationDelay: "0.7s", animationDuration: "2.2s" }} />
        <div className="absolute bottom-[20%] right-[25%] w-3 h-3 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "0.2s", animationDuration: "1.9s" }} />
        
        {/* Main gradient orbs */}
        <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full bg-brand-600/20 blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-green-500/15 blur-[100px] animate-pulse" style={{ animationDelay: "1s" }} />
        <div className="absolute top-[40%] right-[20%] w-[300px] h-[300px] rounded-full bg-indigo-500/10 blur-[80px] animate-pulse" style={{ animationDelay: "2s" }} />
      </div>

      {/* Content */}
      <div className="relative z-10 max-w-lg w-full">
        <div className={cn(
          "transform transition-all duration-700",
          showContent ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
        )}>
          {/* Success Card */}
          <div className="relative">
            <div className="absolute -inset-1 bg-gradient-to-r from-green-500/30 via-brand-500/30 to-green-500/30 rounded-3xl blur-xl opacity-70 animate-pulse" />
            <div className="relative bg-gray-900/90 backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden">
              {/* Top accent */}
              <div className="h-1 bg-gradient-to-r from-green-400 via-brand-500 to-green-400" />
              
              <div className="p-8 text-center">
                {/* Logo */}
                <div className="flex justify-center mb-6">
                  <div className="relative">
                    <div className="absolute inset-0 bg-green-500 rounded-full blur-xl opacity-50 animate-pulse" />
                    <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-green-400 to-green-600 shadow-lg shadow-green-500/30">
                      <RiCheckLine className="h-10 w-10 text-white" />
                    </div>
                  </div>
                </div>

                {/* Title */}
                <h1 className="text-3xl font-bold bg-gradient-to-r from-white via-gray-100 to-gray-300 bg-clip-text text-transparent mb-2">
                  You&apos;re all set!
                </h1>
                <p className="text-gray-400 mb-8">
                  {data.businessName} is ready to start converting more quotes.
                </p>

                {/* Stats/What's configured */}
                <div className="grid grid-cols-3 gap-3 mb-8">
                  <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                    <RiFileTextLine className="h-6 w-6 text-brand-400 mx-auto mb-2" />
                    <p className="text-xs text-gray-400">Trade</p>
                    <p className="text-sm font-medium text-white capitalize">
                      {data.trade?.replace("_", " ")}
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                    <RiMessage2Line className="h-6 w-6 text-green-400 mx-auto mb-2" />
                    <p className="text-xs text-gray-400">Sequence</p>
                    <p className="text-sm font-medium text-white">4 messages</p>
                  </div>
                  <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                    <RiTimeLine className="h-6 w-6 text-amber-400 mx-auto mb-2" />
                    <p className="text-xs text-gray-400">Duration</p>
                    <p className="text-sm font-medium text-white">7 days</p>
                  </div>
                </div>

                {/* What's next */}
                <div className="text-left mb-8">
                  <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                    <RiRocketLine className="h-4 w-4 text-brand-400" />
                    What&apos;s next?
                  </h3>
                  <div className="space-y-2">
                    <div className="flex items-center gap-3 text-sm">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-500/20 text-brand-400">
                        <span className="text-xs font-bold">1</span>
                      </div>
                      <span className="text-gray-300">Add your first lead/quote</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-gray-400">
                        <span className="text-xs font-bold">2</span>
                      </div>
                      <span className="text-gray-400">We&apos;ll start texting automatically</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-gray-400">
                        <span className="text-xs font-bold">3</span>
                      </div>
                      <span className="text-gray-400">Watch your close rate improve</span>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className={cn(
                  "space-y-3 transform transition-all duration-500",
                  showButtons ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
                )}>
                  <button
                    onClick={onAddLead}
                    className="group relative w-full inline-flex items-center justify-center gap-2 px-6 py-4 rounded-xl font-semibold text-white overflow-hidden transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-brand-500 to-brand-600" />
                    <div className="absolute inset-0 bg-gradient-to-r from-brand-400 to-brand-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                    <RiAddLine className="relative h-5 w-5" />
                    <span className="relative">Add Your First Quote</span>
                  </button>

                  <button
                    onClick={onDashboard}
                    className="group w-full inline-flex items-center justify-center gap-2 px-6 py-4 rounded-xl font-medium text-gray-300 hover:text-white border border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10 transition-all duration-300"
                  >
                    <RiDashboardLine className="h-5 w-5" />
                    Go to Dashboard
                  </button>
                </div>
              </div>

              {/* Footer */}
              <div className="px-8 py-4 border-t border-white/10 bg-white/5">
                <div className="flex items-center justify-center gap-2 text-xs text-gray-500">
                  <RiSparklingLine className="h-3 w-3" />
                  <span>Powered by Vistrial</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
