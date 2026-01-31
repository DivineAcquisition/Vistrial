"use client"

import { Button } from "@/components/Button"
import { Divider } from "@/components/Divider"
import { Input } from "@/components/Input"
import { Label } from "@/components/Label"
import { RiArrowRightLine } from "@remixicon/react"
import { useRouter } from "next/navigation"
import { useState } from "react"

export default function OnboardingPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    phone: "",
  })

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
    setError(null)
  }

  const formatPhoneNumber = (value: string) => {
    const digits = value.replace(/\D/g, "")
    if (digits.length <= 3) return digits
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`
  }

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, phone: formatPhoneNumber(e.target.value) }))
    setError(null)
  }

  const validateForm = () => {
    if (!formData.fullName.trim()) {
      setError("Please enter your full name")
      return false
    }
    if (!formData.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      setError("Please enter a valid email address")
      return false
    }
    if (formData.phone.replace(/\D/g, "").length < 10) {
      setError("Please enter a valid 10-digit phone number")
      return false
    }
    return true
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateForm()) return

    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Failed to send verification code")

      sessionStorage.setItem("onboarding_email", formData.email)
      sessionStorage.setItem("onboarding_name", formData.fullName)
      router.push("/onboarding/verify")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="w-full max-w-md">
      <div>
        <h1 className="font-semibold text-gray-900 dark:text-gray-50">
          Create your account
        </h1>
        <p className="mt-1 text-sm leading-6 text-gray-500">
          Enter your details to get started with VisTrial.
        </p>
      </div>
      <Divider className="my-6" />
      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-6">
          <div className="col-span-full">
            <Label htmlFor="fullName" className="font-medium">
              Full name
            </Label>
            <Input
              type="text"
              id="fullName"
              name="fullName"
              value={formData.fullName}
              onChange={handleInputChange}
              placeholder="John Doe"
              className="mt-2"
              autoComplete="name"
            />
          </div>
          <div className="col-span-full">
            <Label htmlFor="email" className="font-medium">
              Email
            </Label>
            <Input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleInputChange}
              placeholder="john@example.com"
              className="mt-2"
              autoComplete="email"
            />
          </div>
          <div className="col-span-full">
            <Label htmlFor="phone" className="font-medium">
              Phone number
            </Label>
            <Input
              type="tel"
              id="phone"
              name="phone"
              value={formData.phone}
              onChange={handlePhoneChange}
              placeholder="(555) 123-4567"
              className="mt-2"
              autoComplete="tel"
            />
          </div>
          {error && (
            <div className="col-span-full">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}
          <div className="col-span-full mt-4">
            <Button
              type="submit"
              className="w-full sm:w-auto"
              isLoading={isLoading}
              loadingText="Sending code..."
            >
              Continue
              <RiArrowRightLine className="ml-1.5 size-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </form>
      <p className="mt-6 text-xs text-gray-500">
        We&apos;ll send a 6-digit verification code to your email.
      </p>
    </div>
  )
}
