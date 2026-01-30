"use client"

import { useState } from "react"
import {
  RiCheckLine,
  RiArrowRightLine,
  RiArrowLeftLine,
  RiPhoneLine,
  RiKey2Line,
  RiLockLine,
  RiExternalLinkLine,
  RiInformationLine,
  RiCheckboxCircleLine,
  RiLoader4Line,
} from "@remixicon/react"
import { cn } from "@/lib/utils/cn"
import { type OnboardingData } from "@/lib/onboarding/types"

interface StepTwilioProps {
  data: OnboardingData
  onUpdate: (updates: Partial<OnboardingData>) => void
  onNext: () => void
  onBack: () => void
}

export function StepTwilio({ data, onUpdate, onNext, onBack }: StepTwilioProps) {
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [focusedField, setFocusedField] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<"success" | "error" | null>(null)
  const [skipTwilio, setSkipTwilio] = useState(false)

  const handleTest = async () => {
    if (!data.twilioAccountSid || !data.twilioAuthToken || !data.twilioPhoneNumber) {
      setErrors({
        general: "Please fill in all Twilio credentials first"
      })
      return
    }

    setTesting(true)
    setTestResult(null)

    try {
      const response = await fetch("/api/twilio/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountSid: data.twilioAccountSid,
          authToken: data.twilioAuthToken,
          phoneNumber: data.twilioPhoneNumber,
        }),
      })

      if (response.ok) {
        setTestResult("success")
        onUpdate({ webhookConfigured: true })
      } else {
        setTestResult("error")
      }
    } catch {
      setTestResult("error")
    } finally {
      setTesting(false)
    }
  }

  const handleSubmit = () => {
    if (skipTwilio) {
      onNext()
      return
    }

    const newErrors: Record<string, string> = {}

    if (!data.twilioAccountSid.trim()) {
      newErrors.accountSid = "Account SID is required"
    }

    if (!data.twilioAuthToken.trim()) {
      newErrors.authToken = "Auth Token is required"
    }

    if (!data.twilioPhoneNumber.trim()) {
      newErrors.phoneNumber = "Phone number is required"
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
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
          <span className="text-sm font-medium text-brand-400">Step 3 of 5</span>
        </div>
        <h2 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-white via-gray-100 to-gray-300 bg-clip-text text-transparent">
          Connect your texting number
        </h2>
        <p className="text-gray-400 max-w-lg mx-auto">
          We use Twilio to send texts from your own business number.
        </p>
      </div>

      {/* Info Banner */}
      <div className="relative overflow-hidden rounded-xl border border-blue-500/20 bg-blue-500/10 p-4">
        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-2xl" />
        <div className="relative flex items-start gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/20">
            <RiInformationLine className="h-4 w-4 text-blue-400" />
          </div>
          <div>
            <p className="text-sm text-blue-200">
              Don&apos;t have Twilio yet?{" "}
              <a
                href="https://www.twilio.com/try-twilio"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 underline inline-flex items-center gap-1"
              >
                Create a free account
                <RiExternalLinkLine className="h-3 w-3" />
              </a>
            </p>
            <p className="text-xs text-blue-300/70 mt-1">
              You get $15 free credits to start
            </p>
          </div>
        </div>
      </div>

      {/* Skip Option */}
      <label className="flex items-center gap-3 cursor-pointer group">
        <div className={cn(
          "relative w-5 h-5 rounded border-2 transition-all duration-200",
          skipTwilio 
            ? "bg-brand-500 border-brand-500" 
            : "border-white/30 group-hover:border-white/50"
        )}>
          {skipTwilio && <RiCheckLine className="absolute inset-0 m-auto h-3 w-3 text-white" />}
        </div>
        <input
          type="checkbox"
          checked={skipTwilio}
          onChange={(e) => setSkipTwilio(e.target.checked)}
          className="sr-only"
        />
        <span className="text-sm text-gray-400 group-hover:text-gray-300">
          Skip for now — I&apos;ll set up Twilio later
        </span>
      </label>

      {/* Twilio Credentials */}
      {!skipTwilio && (
        <div className="relative">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-brand-500/30 to-indigo-500/30 rounded-2xl blur opacity-50" />
          <div className="relative space-y-5 rounded-xl border border-white/10 bg-gray-900/50 backdrop-blur-sm p-6">
            {/* Account SID */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-2">
                <RiKey2Line className="h-4 w-4 text-gray-500" />
                Account SID
                <span className="text-brand-400">*</span>
              </label>
              <div className={cn(
                "relative rounded-xl transition-all duration-300",
                focusedField === "accountSid" && "ring-2 ring-brand-500/50"
              )}>
                <input
                  type="text"
                  placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  value={data.twilioAccountSid}
                  onChange={(e) => {
                    onUpdate({ twilioAccountSid: e.target.value })
                    setErrors((prev) => ({ ...prev, accountSid: "" }))
                  }}
                  onFocus={() => setFocusedField("accountSid")}
                  onBlur={() => setFocusedField(null)}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-brand-500/50 transition-colors font-mono text-sm"
                />
              </div>
              {errors.accountSid && (
                <p className="mt-2 text-sm text-red-400">{errors.accountSid}</p>
              )}
            </div>

            {/* Auth Token */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-2">
                <RiLockLine className="h-4 w-4 text-gray-500" />
                Auth Token
                <span className="text-brand-400">*</span>
              </label>
              <div className={cn(
                "relative rounded-xl transition-all duration-300",
                focusedField === "authToken" && "ring-2 ring-brand-500/50"
              )}>
                <input
                  type="password"
                  placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  value={data.twilioAuthToken}
                  onChange={(e) => {
                    onUpdate({ twilioAuthToken: e.target.value })
                    setErrors((prev) => ({ ...prev, authToken: "" }))
                  }}
                  onFocus={() => setFocusedField("authToken")}
                  onBlur={() => setFocusedField(null)}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-brand-500/50 transition-colors font-mono text-sm"
                />
              </div>
              {errors.authToken && (
                <p className="mt-2 text-sm text-red-400">{errors.authToken}</p>
              )}
            </div>

            {/* Phone Number */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-2">
                <RiPhoneLine className="h-4 w-4 text-gray-500" />
                Twilio Phone Number
                <span className="text-brand-400">*</span>
              </label>
              <div className={cn(
                "relative rounded-xl transition-all duration-300",
                focusedField === "phoneNumber" && "ring-2 ring-brand-500/50"
              )}>
                <input
                  type="tel"
                  placeholder="+1234567890"
                  value={data.twilioPhoneNumber}
                  onChange={(e) => {
                    onUpdate({ twilioPhoneNumber: e.target.value })
                    setErrors((prev) => ({ ...prev, phoneNumber: "" }))
                  }}
                  onFocus={() => setFocusedField("phoneNumber")}
                  onBlur={() => setFocusedField(null)}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-brand-500/50 transition-colors font-mono text-sm"
                />
              </div>
              {errors.phoneNumber && (
                <p className="mt-2 text-sm text-red-400">{errors.phoneNumber}</p>
              )}
              <p className="mt-1.5 text-xs text-gray-500">
                Include country code (e.g., +1 for US)
              </p>
            </div>

            {/* Test Connection Button */}
            <div className="pt-2">
              <button
                onClick={handleTest}
                disabled={testing}
                className={cn(
                  "w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-medium transition-all duration-300",
                  testResult === "success"
                    ? "bg-green-500/20 border border-green-500/30 text-green-400"
                    : testResult === "error"
                    ? "bg-red-500/20 border border-red-500/30 text-red-400"
                    : "bg-white/5 border border-white/10 text-white hover:bg-white/10"
                )}
              >
                {testing ? (
                  <>
                    <RiLoader4Line className="h-5 w-5 animate-spin" />
                    Testing connection...
                  </>
                ) : testResult === "success" ? (
                  <>
                    <RiCheckboxCircleLine className="h-5 w-5" />
                    Connection successful!
                  </>
                ) : testResult === "error" ? (
                  <>
                    <RiInformationLine className="h-5 w-5" />
                    Connection failed — check credentials
                  </>
                ) : (
                  <>
                    <RiPhoneLine className="h-5 w-5" />
                    Test Connection
                  </>
                )}
              </button>
            </div>

            {errors.general && (
              <p className="text-sm text-red-400 text-center">{errors.general}</p>
            )}
          </div>
        </div>
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
          <span className="relative">{skipTwilio ? "Skip" : "Continue"}</span>
          <RiArrowRightLine className="relative h-5 w-5 group-hover:translate-x-1 transition-transform" />
        </button>
      </div>
    </div>
  )
}
