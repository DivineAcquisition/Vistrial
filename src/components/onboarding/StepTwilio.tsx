"use client"

import { useState } from "react"
import {
  RiExternalLinkLine,
  RiFileCopyLine,
  RiCheckLine,
  RiQuestionLine,
  RiArrowDownSLine,
  RiLoader4Line,
} from "@remixicon/react"
import { Button } from "@/components/Button"
import { Input } from "@/components/Input"
import { Label } from "@/components/Label"
import { cx } from "@/lib/utils"
import type { OnboardingData } from "@/lib/onboarding/types"

interface StepTwilioProps {
  data: OnboardingData
  onUpdate: (updates: Partial<OnboardingData>) => void
  onNext: () => void
  onBack: () => void
}

export function StepTwilio({ data, onUpdate, onNext, onBack }: StepTwilioProps) {
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [showWhy, setShowWhy] = useState(false)
  const [hasAccount, setHasAccount] = useState<boolean | null>(null)
  const [copied, setCopied] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)

  const webhookUrl = typeof window !== "undefined" 
    ? `${window.location.origin}/api/webhooks/twilio`
    : "https://app.vistrial.com/api/webhooks/twilio"

  const handleCopyWebhook = async () => {
    await navigator.clipboard.writeText(webhookUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleTestConnection = async () => {
    if (!data.twilioAccountSid || !data.twilioAuthToken) {
      setErrors({
        twilioAccountSid: !data.twilioAccountSid ? "Account SID is required" : "",
        twilioAuthToken: !data.twilioAuthToken ? "Auth Token is required" : "",
      })
      return
    }

    setTesting(true)
    setTestResult(null)

    try {
      // Test connection via API
      const response = await fetch("/api/twilio/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountSid: data.twilioAccountSid,
          authToken: data.twilioAuthToken,
        }),
      })

      const result = await response.json()

      if (response.ok && result.success) {
        setTestResult({ success: true, message: "Connection successful!" })
      } else {
        setTestResult({ success: false, message: result.error || "Connection failed" })
      }
    } catch {
      setTestResult({ success: false, message: "Connection test failed. Check your credentials." })
    } finally {
      setTesting(false)
    }
  }

  const handleSubmit = () => {
    const newErrors: Record<string, string> = {}

    if (!data.twilioAccountSid.trim()) {
      newErrors.twilioAccountSid = "Account SID is required"
    } else if (!data.twilioAccountSid.startsWith("AC")) {
      newErrors.twilioAccountSid = "Account SID should start with AC"
    }

    if (!data.twilioAuthToken.trim()) {
      newErrors.twilioAuthToken = "Auth Token is required"
    }

    if (!data.twilioPhoneNumber.trim()) {
      newErrors.twilioPhoneNumber = "Phone number is required"
    } else if (!data.twilioPhoneNumber.startsWith("+")) {
      newErrors.twilioPhoneNumber = "Phone number should start with + (e.g., +15551234567)"
    }

    if (!data.webhookConfigured) {
      newErrors.webhookConfigured = "Please confirm you have set up the webhook"
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    onNext()
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white sm:text-3xl">
          Let&apos;s set up your texting number
        </h2>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          This takes about 3 minutes. We&apos;ll walk you through it.
        </p>
      </div>

      {/* Why section (collapsible) */}
      <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        <button
          type="button"
          onClick={() => setShowWhy(!showWhy)}
          className="flex w-full items-center justify-between p-4"
        >
          <span className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-white">
            <RiQuestionLine className="h-5 w-5 text-brand-600 dark:text-brand-400" />
            Why can&apos;t I just use my regular phone number?
          </span>
          <RiArrowDownSLine
            className={cx(
              "h-5 w-5 text-gray-400 transition-transform",
              showWhy && "rotate-180"
            )}
          />
        </button>
        {showWhy && (
          <div className="border-t border-gray-200 p-4 dark:border-gray-700">
            <div className="space-y-3 text-sm text-gray-600 dark:text-gray-400">
              <p><strong>1. AUTOMATION</strong> - Your personal phone can&apos;t auto-send texts while you&apos;re on a job</p>
              <p><strong>2. SEPARATION</strong> - Keep work texts separate from personal</p>
              <p><strong>3. TRACKING</strong> - See exactly which messages get responses</p>
              <p><strong>4. COMPLIANCE</strong> - Business texting has legal requirements (we handle most of this)</p>
              <p className="mt-4 rounded bg-gray-100 p-3 dark:bg-gray-900">
                We use Twilio - the same service used by Uber, Airbnb, and most businesses that text customers. 
                It costs about <strong>$1/month</strong> for the number + ~1 cent per text.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Account selection */}
      {hasAccount === null && (
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setHasAccount(true)}
            className="flex-1 rounded-lg border-2 border-gray-200 bg-white px-4 py-4 text-center transition hover:border-brand-300 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-brand-600"
          >
            <span className="block font-medium text-gray-900 dark:text-white">
              I already have a Twilio account
            </span>
            <span className="mt-1 block text-sm text-gray-500 dark:text-gray-400">
              Enter credentials
            </span>
          </button>
          <button
            type="button"
            onClick={() => setHasAccount(false)}
            className="flex-1 rounded-lg border-2 border-brand-200 bg-brand-50 px-4 py-4 text-center transition hover:border-brand-400 dark:border-brand-800 dark:bg-brand-900/20 dark:hover:border-brand-600"
          >
            <span className="block font-medium text-brand-700 dark:text-brand-300">
              I need to create one
            </span>
            <span className="mt-1 block text-sm text-brand-600 dark:text-brand-400">
              Most people (5 min)
            </span>
          </button>
        </div>
      )}

      {/* Guide for new accounts */}
      {hasAccount === false && (
        <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
          <h3 className="font-semibold text-gray-900 dark:text-white">Quick Setup Guide</h3>

          <div className="space-y-4">
            <div className="flex gap-3">
              <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700 dark:bg-brand-900/30 dark:text-brand-400">
                1
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Create your free Twilio account</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">You&apos;ll get $15 free credit - enough for ~1,500 texts</p>
                <a
                  href="https://www.twilio.com/try-twilio"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
                >
                  Open Twilio Sign-Up <RiExternalLinkLine className="h-4 w-4" />
                </a>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700 dark:bg-brand-900/30 dark:text-brand-400">
                2
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Verify your phone number</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Twilio will text you a code. Standard stuff.</p>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700 dark:bg-brand-900/30 dark:text-brand-400">
                3
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Buy a phone number (~$1/month)</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Go to: Phone Numbers → Buy a Number → Pick any local number with SMS capability
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700 dark:bg-brand-900/30 dark:text-brand-400">
                4
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Copy your credentials</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  On your Twilio Dashboard: Account SID (starts with &quot;AC&quot;) and Auth Token (click &quot;Show&quot;)
                </p>
              </div>
            </div>
          </div>

          <Button
            variant="secondary"
            onClick={() => setHasAccount(true)}
            className="mt-4 w-full"
          >
            I&apos;ve done this - enter credentials
          </Button>
        </div>
      )}

      {/* Credential inputs */}
      {hasAccount === true && (
        <div className="space-y-4">
          <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
            <h3 className="mb-4 font-semibold text-gray-900 dark:text-white">Your Twilio Credentials</h3>
            
            <div className="space-y-4">
              <div>
                <Label htmlFor="accountSid">Account SID</Label>
                <Input
                  id="accountSid"
                  type="text"
                  placeholder="AC..."
                  value={data.twilioAccountSid}
                  onChange={(e) => {
                    onUpdate({ twilioAccountSid: e.target.value })
                    setErrors((prev) => ({ ...prev, twilioAccountSid: "" }))
                    setTestResult(null)
                  }}
                  className={cx("mt-1 font-mono", errors.twilioAccountSid && "border-red-500")}
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Starts with &quot;AC&quot; - found on your Twilio Dashboard
                </p>
                {errors.twilioAccountSid && (
                  <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.twilioAccountSid}</p>
                )}
              </div>

              <div>
                <Label htmlFor="authToken">Auth Token</Label>
                <Input
                  id="authToken"
                  type="password"
                  placeholder="Your auth token..."
                  value={data.twilioAuthToken}
                  onChange={(e) => {
                    onUpdate({ twilioAuthToken: e.target.value })
                    setErrors((prev) => ({ ...prev, twilioAuthToken: "" }))
                    setTestResult(null)
                  }}
                  className={cx("mt-1 font-mono", errors.twilioAuthToken && "border-red-500")}
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Click &quot;Show&quot; on your Dashboard to reveal this
                </p>
                {errors.twilioAuthToken && (
                  <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.twilioAuthToken}</p>
                )}
              </div>

              <div>
                <Label htmlFor="phoneNumber">Your Twilio Phone Number</Label>
                <Input
                  id="phoneNumber"
                  type="tel"
                  placeholder="+15551234567"
                  value={data.twilioPhoneNumber}
                  onChange={(e) => {
                    onUpdate({ twilioPhoneNumber: e.target.value })
                    setErrors((prev) => ({ ...prev, twilioPhoneNumber: "" }))
                  }}
                  className={cx("mt-1 font-mono", errors.twilioPhoneNumber && "border-red-500")}
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  The number you bought (include +1)
                </p>
                {errors.twilioPhoneNumber && (
                  <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.twilioPhoneNumber}</p>
                )}
              </div>

              {/* Test connection button */}
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleTestConnection}
                  disabled={testing}
                  className="gap-2"
                >
                  {testing && <RiLoader4Line className="h-4 w-4 animate-spin" />}
                  Test Connection
                </Button>
                {testResult && (
                  <span
                    className={cx(
                      "text-sm font-medium",
                      testResult.success ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                    )}
                  >
                    {testResult.message}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Webhook setup */}
          <div className="rounded-lg border-2 border-amber-200 bg-amber-50 p-6 dark:border-amber-800 dark:bg-amber-900/20">
            <h3 className="flex items-center gap-2 font-semibold text-amber-800 dark:text-amber-200">
              ⚠️ One More Thing (Important!)
            </h3>
            <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">
              For customers to reply to your texts, you need to tell Twilio where to send their responses.
            </p>

            <ol className="mt-4 list-inside list-decimal space-y-2 text-sm text-amber-800 dark:text-amber-200">
              <li>In Twilio, go to: Phone Numbers → Your Number</li>
              <li>Scroll to &quot;Messaging&quot;</li>
              <li>Under &quot;A MESSAGE COMES IN&quot;, paste this URL:</li>
            </ol>

            <div className="mt-3 flex items-center gap-2">
              <code className="flex-1 rounded bg-white px-3 py-2 font-mono text-xs text-gray-800 dark:bg-gray-900 dark:text-gray-200">
                {webhookUrl}
              </code>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleCopyWebhook}
                className="gap-1"
              >
                {copied ? <RiCheckLine className="h-4 w-4" /> : <RiFileCopyLine className="h-4 w-4" />}
                {copied ? "Copied!" : "Copy"}
              </Button>
            </div>

            <ol start={4} className="mt-3 list-inside list-decimal space-y-2 text-sm text-amber-800 dark:text-amber-200">
              <li>Make sure it&apos;s set to HTTP POST</li>
              <li>Save</li>
            </ol>

            <label className="mt-4 flex items-start gap-3">
              <input
                type="checkbox"
                checked={data.webhookConfigured}
                onChange={(e) => {
                  onUpdate({ webhookConfigured: e.target.checked })
                  setErrors((prev) => ({ ...prev, webhookConfigured: "" }))
                }}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              />
              <span className="text-sm text-amber-800 dark:text-amber-200">
                I&apos;ve configured the webhook URL in Twilio
              </span>
            </label>
            {errors.webhookConfigured && (
              <p className="mt-2 text-sm text-red-600 dark:text-red-400">{errors.webhookConfigured}</p>
            )}
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between">
        <Button variant="secondary" onClick={onBack}>
          Back
        </Button>
        {hasAccount === true && (
          <Button onClick={handleSubmit} className="px-8">
            Continue
          </Button>
        )}
      </div>
    </div>
  )
}
