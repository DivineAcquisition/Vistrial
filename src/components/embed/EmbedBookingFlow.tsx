// @ts-nocheck
"use client"

/**
 * Embeddable Booking Flow Component
 * Full multi-step booking experience for embed/iframe
 */

import { useState, useEffect } from "react"
import {
  RiCheckLine,
  RiCalendarLine,
  RiHome4Line,
  RiUser3Line,
  RiBankCardLine,
  RiSparklingLine,
} from "@remixicon/react"
import { cn } from "@/lib/utils/cn"

interface ServiceType {
  id: string
  name: string
  description?: string
  price_1bed?: number
  price_2bed?: number
  price_3bed?: number
  price_4bed?: number
  price_5bed_plus?: number
  price_per_bathroom?: number
}

interface Business {
  id: string
  name: string
  slug: string
  logo_url?: string
  primary_color?: string
  phone?: string
}

interface EmbedBookingFlowProps {
  business: Business
  serviceTypes: ServiceType[]
  serviceAreas?: string[]
}

type Step = "service" | "property" | "schedule" | "contact" | "payment" | "confirmation"
type Frequency = "onetime" | "weekly" | "biweekly" | "monthly"

export function EmbedBookingFlow({
  business,
  serviceTypes,
  serviceAreas = [],
}: EmbedBookingFlowProps) {
  const [step, setStep] = useState<Step>("service")
  const [loading, setLoading] = useState(false)

  // Form state
  const [selectedService, setSelectedService] = useState<ServiceType | null>(null)
  const [zip, setZip] = useState("")
  const [zipValid, setZipValid] = useState<boolean | null>(null)
  const [bedrooms, setBedrooms] = useState(3)
  const [bathrooms, setBathrooms] = useState(2)
  const [hasPets, setHasPets] = useState(false)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [selectedTime, setSelectedTime] = useState<string | null>(null)
  const [contact, setContact] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
    address: "",
    city: "",
    state: "",
    instructions: "",
  })
  const [frequency, setFrequency] = useState<Frequency>("onetime")
  const [, setBookingComplete] = useState(false)

  // Calculate price
  const calculatePrice = () => {
    if (!selectedService) return 0
    
    const basePrices: Record<number, number> = {
      1: selectedService.price_1bed || 100,
      2: selectedService.price_2bed || 120,
      3: selectedService.price_3bed || 140,
      4: selectedService.price_4bed || 180,
      5: selectedService.price_5bed_plus || 220,
    }

    let price = basePrices[Math.min(bedrooms, 5)] || 140
    price += (bathrooms - 1) * (selectedService.price_per_bathroom || 15)
    if (hasPets) price += 20

    // Frequency discount
    const discounts: Record<string, number> = {
      onetime: 0,
      monthly: 0.05,
      biweekly: 0.10,
      weekly: 0.15,
    }
    price = price * (1 - (discounts[frequency] || 0))

    return Math.round(price)
  }

  const price = calculatePrice()
  const deposit = Math.round(price * 0.25)

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
    }).format(amount)
  }

  // Validate zip
  useEffect(() => {
    if (zip.length === 5) {
      const valid = serviceAreas.length === 0 || serviceAreas.includes(zip)
      setZipValid(valid)
    } else {
      setZipValid(null)
    }
  }, [zip, serviceAreas])

  // Generate time slots
  const timeSlots = [
    { time: "08:00", label: "8:00 AM", available: true },
    { time: "09:00", label: "9:00 AM", available: true },
    { time: "10:00", label: "10:00 AM", available: true },
    { time: "11:00", label: "11:00 AM", available: false },
    { time: "13:00", label: "1:00 PM", available: true },
    { time: "14:00", label: "2:00 PM", available: true },
    { time: "15:00", label: "3:00 PM", available: true },
    { time: "16:00", label: "4:00 PM", available: true },
  ]

  // Generate calendar dates (next 28 days)
  const generateDates = () => {
    const dates = []
    const today = new Date()
    for (let i = 1; i <= 28; i++) {
      const date = new Date(today)
      date.setDate(today.getDate() + i)
      dates.push(date)
    }
    return dates
  }

  const calendarDates = generateDates()

  // Handle booking submission
  const handleSubmit = async () => {
    setLoading(true)

    try {
      const response = await fetch("/api/booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId: business.id,
          serviceTypeId: selectedService?.id,
          scheduledDate: selectedDate?.toISOString().split("T")[0],
          scheduledTime: selectedTime,
          ...contact,
          zip,
          bedrooms,
          bathrooms,
          hasPets,
          frequency,
          total: price,
          depositAmount: deposit,
        }),
      })

      if (response.ok) {
        setBookingComplete(true)
        setStep("confirmation")
        // Notify parent window
        window.parent.postMessage("vistrial:booked", "*")
      }
    } catch (error) {
      console.error("Booking error:", error)
      alert("Something went wrong. Please try again.")
    }

    setLoading(false)
  }

  // Report height to parent for iframe resizing
  useEffect(() => {
    const reportHeight = () => {
      window.parent.postMessage({
        type: "vistrial:resize",
        height: document.body.scrollHeight,
      }, "*")
    }
    reportHeight()
    const observer = new ResizeObserver(reportHeight)
    observer.observe(document.body)
    return () => observer.disconnect()
  }, [step])

  // Steps config
  const steps: { key: Step; label: string; icon: typeof RiSparklingLine }[] = [
    { key: "service", label: "Service", icon: RiSparklingLine },
    { key: "property", label: "Property", icon: RiHome4Line },
    { key: "schedule", label: "Schedule", icon: RiCalendarLine },
    { key: "contact", label: "Contact", icon: RiUser3Line },
    { key: "payment", label: "Book", icon: RiBankCardLine },
  ]

  const currentStepIndex = steps.findIndex(s => s.key === step)

  const nextStep = () => {
    const nextIndex = currentStepIndex + 1
    if (nextIndex < steps.length) {
      setStep(steps[nextIndex].key)
    }
  }

  const prevStep = () => {
    const prevIndex = currentStepIndex - 1
    if (prevIndex >= 0) {
      setStep(steps[prevIndex].key)
    }
  }

  // Brand color
  const brandColor = business.primary_color || "#7c3aed"

  const frequencyOptions: { value: Frequency; label: string; discount: string | null }[] = [
    { value: "weekly", label: "Weekly", discount: "15% off" },
    { value: "biweekly", label: "Biweekly", discount: "10% off" },
    { value: "monthly", label: "Monthly", discount: "5% off" },
    { value: "onetime", label: "One-time", discount: null },
  ]

  return (
    <div className="min-h-screen bg-white font-sans">
      {/* Header */}
      <div 
        className="p-4 text-white"
        style={{ backgroundColor: brandColor }}
      >
        <div className="flex items-center gap-3">
          {business.logo_url ? (
            <img src={business.logo_url} alt="" className="w-10 h-10 rounded-lg" />
          ) : (
            <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
              <RiSparklingLine className="w-5 h-5" />
            </div>
          )}
          <div>
            <h1 className="font-bold text-lg">{business.name}</h1>
            <p className="text-sm text-white/80">Book your cleaning</p>
          </div>
        </div>
      </div>

      {/* Progress */}
      {step !== "confirmation" && (
        <div className="px-4 py-3 border-b bg-gray-50">
          <div className="flex items-center justify-between">
            {steps.map((s, i) => (
              <div key={s.key} className="flex items-center">
                <div
                  className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors",
                    i < currentStepIndex
                      ? "bg-green-500 text-white"
                      : i === currentStepIndex
                      ? "text-white"
                      : "bg-gray-200 text-gray-500"
                  )}
                  style={i === currentStepIndex ? { backgroundColor: brandColor } : {}}
                >
                  {i < currentStepIndex ? <RiCheckLine className="w-4 h-4" /> : i + 1}
                </div>
                {i < steps.length - 1 && (
                  <div 
                    className={cn(
                      "w-8 h-0.5 mx-1",
                      i < currentStepIndex ? "bg-green-500" : "bg-gray-200"
                    )}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="p-4">
        {/* Step 1: Service Selection */}
        {step === "service" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Select Service</h2>
            <div className="space-y-3">
              {serviceTypes.map((service) => (
                <button
                  key={service.id}
                  onClick={() => setSelectedService(service)}
                  className={cn(
                    "w-full p-4 rounded-xl border-2 text-left transition-all",
                    selectedService?.id === service.id
                      ? "border-brand-600 bg-brand-50"
                      : "border-gray-200 hover:border-gray-300"
                  )}
                  style={selectedService?.id === service.id ? { borderColor: brandColor, backgroundColor: `${brandColor}10` } : {}}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-semibold text-gray-900">{service.name}</p>
                      {service.description && (
                        <p className="text-sm text-gray-500 mt-1">{service.description}</p>
                      )}
                    </div>
                    <p className="font-semibold" style={{ color: brandColor }}>
                      From ${service.price_1bed || 100}
                    </p>
                  </div>
                </button>
              ))}
            </div>

            {/* Zip Check */}
            <div className="pt-4 border-t">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Your Zip Code
              </label>
              <input
                type="text"
                maxLength={5}
                value={zip}
                onChange={(e) => setZip(e.target.value.replace(/\D/g, ""))}
                placeholder="Enter zip code"
                className="w-full p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              {zipValid === false && (
                <p className="text-red-500 text-sm mt-2">
                  Sorry, we don&apos;t service this area yet.
                </p>
              )}
              {zipValid === true && (
                <p className="text-green-600 text-sm mt-2">
                  ✓ Great, we service your area!
                </p>
              )}
            </div>

            <button
              onClick={nextStep}
              disabled={!selectedService || (serviceAreas.length > 0 && !zipValid)}
              className="w-full py-3 rounded-lg font-semibold text-white disabled:opacity-50 transition-colors"
              style={{ backgroundColor: brandColor }}
            >
              Continue
            </button>
          </div>
        )}

        {/* Step 2: Property Details */}
        {step === "property" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Property Details</h2>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Bedrooms</label>
                <select
                  value={bedrooms}
                  onChange={(e) => setBedrooms(Number(e.target.value))}
                  className="w-full p-3 border rounded-lg"
                >
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>{n} {n === 5 ? "+" : ""} bedroom{n > 1 ? "s" : ""}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Bathrooms</label>
                <select
                  value={bathrooms}
                  onChange={(e) => setBathrooms(Number(e.target.value))}
                  className="w-full p-3 border rounded-lg"
                >
                  {[1, 1.5, 2, 2.5, 3, 3.5, 4].map((n) => (
                    <option key={n} value={n}>{n} bath{n > 1 ? "s" : ""}</option>
                  ))}
                </select>
              </div>
            </div>

            <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer">
              <input
                type="checkbox"
                checked={hasPets}
                onChange={(e) => setHasPets(e.target.checked)}
                className="w-5 h-5 rounded"
              />
              <span>I have pets (+$20)</span>
            </label>

            {/* Frequency Selection - THE UPSELL */}
            <div className="pt-4 border-t">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                How often?
              </label>
              <div className="grid grid-cols-2 gap-2">
                {frequencyOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setFrequency(option.value)}
                    className={cn(
                      "p-3 rounded-lg border-2 text-left transition-all",
                      frequency === option.value
                        ? "border-brand-600 bg-brand-50"
                        : "border-gray-200"
                    )}
                    style={frequency === option.value ? { borderColor: brandColor, backgroundColor: `${brandColor}10` } : {}}
                  >
                    <p className="font-medium text-gray-900">{option.label}</p>
                    {option.discount && (
                      <p className="text-sm text-green-600">{option.discount}</p>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Price Display */}
            <div className="p-4 bg-gray-50 rounded-lg">
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Estimated Price</span>
                <span className="text-2xl font-bold" style={{ color: brandColor }}>
                  {formatCurrency(price)}
                </span>
              </div>
              {frequency !== "onetime" && (
                <p className="text-sm text-gray-500 mt-1">
                  per cleaning · billed {frequency}
                </p>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={prevStep}
                className="flex-1 py-3 rounded-lg font-semibold border"
              >
                Back
              </button>
              <button
                onClick={nextStep}
                className="flex-1 py-3 rounded-lg font-semibold text-white"
                style={{ backgroundColor: brandColor }}
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Schedule */}
        {step === "schedule" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Choose Date &amp; Time</h2>

            {/* Calendar */}
            <div className="border rounded-lg p-3">
              <div className="grid grid-cols-7 gap-1 text-center mb-2">
                {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                  <div key={i} className="text-xs text-gray-400 py-1">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {calendarDates.slice(0, 28).map((date, i) => {
                  const isSelected = selectedDate?.toDateString() === date.toDateString()
                  const isWeekend = date.getDay() === 0 || date.getDay() === 6
                  return (
                    <button
                      key={i}
                      onClick={() => setSelectedDate(date)}
                      disabled={isWeekend}
                      className={cn(
                        "py-2 text-sm rounded-lg transition-colors",
                        isSelected
                          ? "text-white"
                          : isWeekend
                          ? "text-gray-300 cursor-not-allowed"
                          : "hover:bg-gray-100"
                      )}
                      style={isSelected ? { backgroundColor: brandColor } : {}}
                    >
                      {date.getDate()}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Time Slots */}
            {selectedDate && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Available Times
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {timeSlots.map((slot) => (
                    <button
                      key={slot.time}
                      onClick={() => setSelectedTime(slot.time)}
                      disabled={!slot.available}
                      className={cn(
                        "p-2 text-sm rounded-lg border transition-colors",
                        selectedTime === slot.time
                          ? "text-white border-transparent"
                          : slot.available
                          ? "border-gray-200 hover:border-gray-300"
                          : "border-gray-100 text-gray-300 cursor-not-allowed"
                      )}
                      style={selectedTime === slot.time ? { backgroundColor: brandColor } : {}}
                    >
                      {slot.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={prevStep} className="flex-1 py-3 rounded-lg font-semibold border">
                Back
              </button>
              <button
                onClick={nextStep}
                disabled={!selectedDate || !selectedTime}
                className="flex-1 py-3 rounded-lg font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: brandColor }}
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Contact Info */}
        {step === "contact" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Your Information</h2>

            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                placeholder="First name"
                value={contact.firstName}
                onChange={(e) => setContact({ ...contact, firstName: e.target.value })}
                className="p-3 border rounded-lg"
              />
              <input
                type="text"
                placeholder="Last name"
                value={contact.lastName}
                onChange={(e) => setContact({ ...contact, lastName: e.target.value })}
                className="p-3 border rounded-lg"
              />
            </div>

            <input
              type="tel"
              placeholder="Phone number"
              value={contact.phone}
              onChange={(e) => setContact({ ...contact, phone: e.target.value })}
              className="w-full p-3 border rounded-lg"
            />

            <input
              type="email"
              placeholder="Email"
              value={contact.email}
              onChange={(e) => setContact({ ...contact, email: e.target.value })}
              className="w-full p-3 border rounded-lg"
            />

            <input
              type="text"
              placeholder="Street address"
              value={contact.address}
              onChange={(e) => setContact({ ...contact, address: e.target.value })}
              className="w-full p-3 border rounded-lg"
            />

            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                placeholder="City"
                value={contact.city}
                onChange={(e) => setContact({ ...contact, city: e.target.value })}
                className="p-3 border rounded-lg"
              />
              <input
                type="text"
                placeholder="State"
                value={contact.state}
                onChange={(e) => setContact({ ...contact, state: e.target.value.toUpperCase() })}
                maxLength={2}
                className="p-3 border rounded-lg"
              />
            </div>

            <textarea
              placeholder="Special instructions (gate code, parking, etc.)"
              value={contact.instructions}
              onChange={(e) => setContact({ ...contact, instructions: e.target.value })}
              rows={2}
              className="w-full p-3 border rounded-lg"
            />

            <div className="flex gap-3">
              <button onClick={prevStep} className="flex-1 py-3 rounded-lg font-semibold border">
                Back
              </button>
              <button
                onClick={nextStep}
                disabled={!contact.firstName || !contact.phone || !contact.email || !contact.address}
                className="flex-1 py-3 rounded-lg font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: brandColor }}
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* Step 5: Review & Payment */}
        {step === "payment" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Review &amp; Book</h2>

            <div className="border rounded-lg divide-y">
              <div className="p-3 flex justify-between">
                <span className="text-gray-500">Service</span>
                <span className="font-medium">{selectedService?.name}</span>
              </div>
              <div className="p-3 flex justify-between">
                <span className="text-gray-500">Property</span>
                <span>{bedrooms} bed / {bathrooms} bath</span>
              </div>
              <div className="p-3 flex justify-between">
                <span className="text-gray-500">Date</span>
                <span>{selectedDate?.toLocaleDateString()}</span>
              </div>
              <div className="p-3 flex justify-between">
                <span className="text-gray-500">Time</span>
                <span>{selectedTime}</span>
              </div>
              <div className="p-3 flex justify-between">
                <span className="text-gray-500">Frequency</span>
                <span className="capitalize">{frequency}</span>
              </div>
              <div className="p-3 flex justify-between">
                <span className="text-gray-500">Address</span>
                <span className="text-right">{contact.address}, {contact.city}</span>
              </div>
            </div>

            {/* Price Summary */}
            <div className="bg-gray-50 rounded-lg p-4 space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600">Service Total</span>
                <span className="font-semibold">{formatCurrency(price)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Due today (deposit)</span>
                <span>{formatCurrency(deposit)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Due at cleaning</span>
                <span>{formatCurrency(price - deposit)}</span>
              </div>
            </div>

            {frequency !== "onetime" && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
                🎉 You&apos;re signing up for {frequency} cleaning! Your card will be charged {formatCurrency(price)} automatically for each cleaning.
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={prevStep} className="flex-1 py-3 rounded-lg font-semibold border">
                Back
              </button>
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="flex-1 py-3 rounded-lg font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: brandColor }}
              >
                {loading ? "Processing..." : `Pay ${formatCurrency(deposit)} Deposit`}
              </button>
            </div>
          </div>
        )}

        {/* Confirmation */}
        {step === "confirmation" && (
          <div className="text-center py-8">
            <div 
              className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
              style={{ backgroundColor: `${brandColor}20` }}
            >
              <RiCheckLine className="w-8 h-8" style={{ color: brandColor }} />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">You&apos;re Booked!</h2>
            <p className="text-gray-500 mb-6">
              Your cleaning is scheduled for {selectedDate?.toLocaleDateString()} at {selectedTime}.
              We&apos;ll send you a confirmation text shortly.
            </p>
            <div className="p-4 bg-gray-50 rounded-lg text-left">
              <p className="font-medium text-gray-900">{business.name}</p>
              {business.phone && <p className="text-sm text-gray-500">{business.phone}</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
