"use client"

import { Button } from "@/components/Button"
import { Divider } from "@/components/Divider"
import { cx, focusInput } from "@/lib/utils"
import { RiArrowLeftLine, RiCheckLine } from "@remixicon/react"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"

export default function VerifyPage() {
  const router = useRouter()
  const [otp, setOtp] = useState(["", "", "", "", "", ""])
  const [isLoading, setIsLoading] = useState(false)
  const [isResending, setIsResending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [email, setEmail] = useState("")
  const [name, setName] = useState("")
  const [resendCooldown, setResendCooldown] = useState(0)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    const storedEmail = sessionStorage.getItem("onboarding_email")
    const storedName = sessionStorage.getItem("onboarding_name")
    if (!storedEmail) {
      router.push("/onboarding")
      return
    }
    setEmail(storedEmail)
    setName(storedName || "")
    inputRefs.current[0]?.focus()
  }, [router])

  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000)
      return () => clearTimeout(timer)
    }
  }, [resendCooldown])

  const handleInputChange = (index: number, value: string) => {
    if (value && !/^\d$/.test(value)) return
    const newOtp = [...otp]
    newOtp[index] = value
    setOtp(newOtp)
    setError(null)
    if (value && index < 5) inputRefs.current[index + 1]?.focus()
    if (value && index === 5 && newOtp.every((d) => d)) handleVerify(newOtp.join(""))
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    const pastedData = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6)
    if (pastedData.length === 6) {
      setOtp(pastedData.split(""))
      inputRefs.current[5]?.focus()
      handleVerify(pastedData)
    }
  }

  const handleVerify = async (code?: string) => {
    const otpCode = code || otp.join("")
    if (otpCode.length !== 6) {
      setError("Please enter all 6 digits")
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp: otpCode }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Invalid verification code")

      setSuccess(true)
      sessionStorage.removeItem("onboarding_email")
      sessionStorage.removeItem("onboarding_name")
      setTimeout(() => router.push("/overview"), 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed")
      setOtp(["", "", "", "", "", ""])
      inputRefs.current[0]?.focus()
    } finally {
      setIsLoading(false)
    }
  }

  const handleResend = async () => {
    if (resendCooldown > 0 || isResending) return
    setIsResending(true)
    setError(null)

    try {
      const response = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, fullName: name, phone: "", resend: true }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Failed to resend code")

      setResendCooldown(60)
      setOtp(["", "", "", "", "", ""])
      inputRefs.current[0]?.focus()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resend code")
    } finally {
      setIsResending(false)
    }
  }

  const maskEmail = (email: string) => {
    const [local, domain] = email.split("@")
    return local.length <= 3 ? `${local[0]}***@${domain}` : `${local.slice(0, 3)}***@${domain}`
  }

  if (success) {
    return (
      <div className="w-full max-w-md text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-500/20">
          <RiCheckLine className="h-6 w-6 text-green-600 dark:text-green-400" />
        </div>
        <h1 className="mt-4 font-semibold text-gray-900 dark:text-gray-50">
          Welcome, {name.split(" ")[0]}!
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Your account has been verified successfully.
        </p>
        <p className="mt-4 text-xs text-gray-400">Redirecting to dashboard...</p>
      </div>
    )
  }

  return (
    <div className="w-full max-w-md">
      <button
        onClick={() => router.push("/onboarding")}
        className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
      >
        <RiArrowLeftLine className="size-4" />
        Back
      </button>
      <div>
        <h1 className="font-semibold text-gray-900 dark:text-gray-50">
          Check your email
        </h1>
        <p className="mt-1 text-sm leading-6 text-gray-500">
          We sent a 6-digit code to{" "}
          <span className="font-medium text-gray-700 dark:text-gray-300">
            {email ? maskEmail(email) : "your email"}
          </span>
        </p>
      </div>
      <Divider className="my-6" />
      <div className="flex justify-center gap-2 sm:gap-3" onPaste={handlePaste}>
        {otp.map((digit, index) => (
          <input
            key={index}
            ref={(el) => { inputRefs.current[index] = el }}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            onChange={(e) => handleInputChange(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            disabled={isLoading}
            className={cx(
              "h-12 w-10 rounded-md border bg-white text-center text-lg font-semibold text-gray-900 shadow-sm outline-none transition sm:h-14 sm:w-12 sm:text-xl",
              "border-gray-300 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-50",
              "disabled:bg-gray-100 disabled:text-gray-400 dark:disabled:bg-gray-800",
              focusInput
            )}
          />
        ))}
      </div>
      {error && (
        <p className="mt-4 text-center text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
      <div className="mt-6">
        <Button
          onClick={() => handleVerify()}
          className="w-full sm:w-auto"
          disabled={isLoading || otp.some((d) => !d)}
          isLoading={isLoading}
          loadingText="Verifying..."
        >
          Verify code
        </Button>
      </div>
      <p className="mt-6 text-sm text-gray-500">
        Didn&apos;t receive the code?{" "}
        <button
          onClick={handleResend}
          disabled={resendCooldown > 0 || isResending}
          className="font-medium text-brand-600 hover:text-brand-500 disabled:cursor-not-allowed disabled:text-gray-400 dark:text-brand-400 dark:hover:text-brand-300"
        >
          {isResending ? "Sending..." : resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend"}
        </button>
      </p>
      <p className="mt-4 text-xs text-gray-500">The code expires in 10 minutes.</p>
    </div>
  )
}
