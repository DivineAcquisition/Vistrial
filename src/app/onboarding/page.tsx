"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { OnboardingLayout } from "@/components/onboarding/OnboardingLayout"
import { StepTrade } from "@/components/onboarding/StepTrade"
import { StepReality } from "@/components/onboarding/StepReality"
import { StepTwilio } from "@/components/onboarding/StepTwilio"
import { StepCompliance } from "@/components/onboarding/StepCompliance"
import { StepSequence } from "@/components/onboarding/StepSequence"
import { StepComplete } from "@/components/onboarding/StepComplete"
import {
  type OnboardingData,
  initialOnboardingData,
  ONBOARDING_STEPS,
} from "@/lib/onboarding/types"

export default function OnboardingPage() {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(1)
  const [data, setData] = useState<OnboardingData>(initialOnboardingData)
  const [, setIsSubmitting] = useState(false)
  const [startTime] = useState(Date.now())

  // Persist data to localStorage
  useEffect(() => {
    const saved = localStorage.getItem("vistrial_onboarding")
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        setData((prev) => ({ ...prev, ...parsed.data }))
        setCurrentStep(parsed.step || 1)
      } catch {
        // Ignore parse errors
      }
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(
      "vistrial_onboarding",
      JSON.stringify({ step: currentStep, data })
    )
  }, [currentStep, data])

  const updateData = (updates: Partial<OnboardingData>) => {
    setData((prev) => ({ ...prev, ...updates }))
  }

  const nextStep = () => {
    if (currentStep < ONBOARDING_STEPS.length) {
      setCurrentStep((prev) => prev + 1)
      window.scrollTo(0, 0)
    } else {
      // Complete onboarding
      handleComplete()
    }
  }

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep((prev) => prev - 1)
      window.scrollTo(0, 0)
    }
  }

  const handleComplete = async () => {
    setIsSubmitting(true)

    try {
      // Calculate time to complete
      const timeToComplete = Math.round((Date.now() - startTime) / 1000)

      // Submit onboarding data to API
      const response = await fetch("/api/onboarding/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          completedAt: new Date().toISOString(),
          timeToComplete,
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to complete onboarding")
      }

      // Clear localStorage
      localStorage.removeItem("vistrial_onboarding")

      // Move to completion step
      setCurrentStep(ONBOARDING_STEPS.length + 1)
    } catch (error) {
      console.error("Onboarding error:", error)
      // Still show completion for demo purposes
      setCurrentStep(ONBOARDING_STEPS.length + 1)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleAddLead = () => {
    router.push("/details?addLead=true")
  }

  const handleDashboard = () => {
    router.push("/dashboard")
  }

  // Completion screen (after step 5)
  if (currentStep > ONBOARDING_STEPS.length) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
        <div className="mx-auto max-w-2xl px-4 py-12">
          <StepComplete
            data={data}
            onAddLead={handleAddLead}
            onDashboard={handleDashboard}
          />
        </div>
      </div>
    )
  }

  return (
    <OnboardingLayout currentStep={currentStep}>
      {currentStep === 1 && (
        <StepTrade data={data} onUpdate={updateData} onNext={nextStep} />
      )}

      {currentStep === 2 && (
        <StepReality
          data={data}
          onUpdate={updateData}
          onNext={nextStep}
          onBack={prevStep}
        />
      )}

      {currentStep === 3 && (
        <StepTwilio
          data={data}
          onUpdate={updateData}
          onNext={nextStep}
          onBack={prevStep}
        />
      )}

      {currentStep === 4 && (
        <StepCompliance
          data={data}
          onUpdate={updateData}
          onNext={nextStep}
          onBack={prevStep}
        />
      )}

      {currentStep === 5 && (
        <StepSequence
          data={data}
          onUpdate={updateData}
          onNext={nextStep}
          onBack={prevStep}
        />
      )}
    </OnboardingLayout>
  )
}
