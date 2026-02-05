// @ts-nocheck
"use client"

/**
 * Public Quote View Page
 * Customers view and accept quotes at q.vistrial.io/[token]
 */

import { useState, useEffect, use, useCallback } from "react"
import {
  RiCheckLine,
  RiCloseLine,
  RiTimeLine,
  RiHome4Line,
  RiPhoneLine,
  RiMailLine,
  RiMoneyDollarCircleLine,
} from "@remixicon/react"

interface QuoteData {
  id: string
  quote_number: string
  status: string
  total: number
  subtotal: number
  discount_amount: number
  bedrooms: number | null
  bathrooms: number | null
  address_line1: string | null
  city: string | null
  state: string | null
  zip: string | null
  property_condition: string | null
  has_pets: boolean
  estimated_hours: number | null
  expires_at: string | null
  created_at: string
  adjustments: Array<{ name: string; amount: number; type: string }>
  business: {
    name: string
    phone: string | null
    email: string | null
    logo_url: string | null
    primary_color: string | null
  }
  contact: {
    first_name: string
    last_name: string
    phone: string
    email: string | null
  }
}

interface QuoteViewPageProps {
  params: Promise<{ token: string }>
}

export default function QuoteViewPage({ params }: QuoteViewPageProps) {
  const { token } = use(params)
  const [quote, setQuote] = useState<QuoteData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [accepting, setAccepting] = useState(false)
  const [showSchedule, setShowSchedule] = useState(false)
  const [selectedDate, setSelectedDate] = useState("")
  const [notes, setNotes] = useState("")

  const fetchQuote = useCallback(async () => {
    try {
      const response = await fetch(`/api/quotes/public/${token}`)
      if (response.ok) {
        const data = await response.json()
        setQuote(data.quote)
      } else {
        setError("Quote not found or has expired")
      }
    } catch (err) {
      setError("Failed to load quote")
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    fetchQuote()
  }, [fetchQuote])

  const handleAccept = async () => {
    if (!quote) return

    setAccepting(true)
    try {
      const response = await fetch(`/api/quotes/${quote.id}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduledDate: selectedDate,
          customerNotes: notes,
        }),
      })

      if (response.ok) {
        setQuote({ ...quote, status: "accepted" })
      } else {
        const data = await response.json()
        alert(data.error || "Failed to accept quote")
      }
    } catch (err) {
      alert("Something went wrong. Please try again.")
    } finally {
      setAccepting(false)
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
    }).format(amount)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    })
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600"></div>
      </div>
    )
  }

  if (error || !quote) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl p-8 text-center max-w-md">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <RiCloseLine className="w-8 h-8 text-red-600" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Quote Not Found</h1>
          <p className="text-gray-500">
            This quote may have expired or the link is invalid.
          </p>
        </div>
      </div>
    )
  }

  const brandColor = quote.business.primary_color || "#7c3aed"
  const isExpired = quote.expires_at && new Date(quote.expires_at) < new Date()
  const canAccept = quote.status === "sent" && !isExpired

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-2xl mx-auto py-8 px-4">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden mb-6">
          <div 
            className="p-6 text-white"
            style={{ backgroundColor: brandColor }}
          >
            <div className="flex items-center gap-4">
              {quote.business.logo_url ? (
                <img src={quote.business.logo_url} alt="" className="w-12 h-12 rounded-lg bg-white/20" />
              ) : (
                <div className="w-12 h-12 rounded-lg bg-white/20 flex items-center justify-center">
                  <RiMoneyDollarCircleLine className="w-6 h-6" />
                </div>
              )}
              <div>
                <h1 className="text-xl font-bold">{quote.business.name}</h1>
                <p className="text-white/80">Quote #{quote.quote_number}</p>
              </div>
            </div>
          </div>

          <div className="p-6">
            {/* Status */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <p className="text-sm text-gray-500">Quote for</p>
                <p className="text-lg font-semibold text-gray-900">
                  {quote.contact.first_name} {quote.contact.last_name}
                </p>
              </div>
              <div className="text-right">
                {quote.status === "accepted" && (
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-green-100 text-green-700 text-sm font-medium">
                    <RiCheckLine className="w-4 h-4" />
                    Accepted
                  </span>
                )}
                {quote.status === "declined" && (
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-red-100 text-red-700 text-sm font-medium">
                    <RiCloseLine className="w-4 h-4" />
                    Declined
                  </span>
                )}
                {quote.status === "sent" && isExpired && (
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-gray-100 text-gray-700 text-sm font-medium">
                    <RiTimeLine className="w-4 h-4" />
                    Expired
                  </span>
                )}
                {canAccept && (
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-sm font-medium">
                    <RiTimeLine className="w-4 h-4" />
                    Awaiting Response
                  </span>
                )}
              </div>
            </div>

            {/* Price */}
            <div className="text-center py-6 border-y">
              <p className="text-gray-500 mb-1">Quote Total</p>
              <p className="text-5xl font-bold" style={{ color: brandColor }}>
                {formatCurrency(quote.total)}
              </p>
              {quote.estimated_hours && (
                <p className="text-sm text-gray-500 mt-2 flex items-center justify-center gap-1">
                  <RiTimeLine className="w-4 h-4" />
                  ~{quote.estimated_hours} hours estimated
                </p>
              )}
            </div>

            {/* Property Details */}
            <div className="py-6 border-b">
              <h3 className="text-sm font-medium text-gray-500 mb-3 flex items-center gap-2">
                <RiHome4Line className="w-4 h-4" />
                Property Details
              </h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-500">Size</p>
                  <p className="font-medium text-gray-900">
                    {quote.bedrooms} bed / {quote.bathrooms} bath
                  </p>
                </div>
                <div>
                  <p className="text-gray-500">Condition</p>
                  <p className="font-medium text-gray-900 capitalize">
                    {quote.property_condition?.replace("_", " ") || "Standard"}
                  </p>
                </div>
                {quote.address_line1 && (
                  <div className="col-span-2">
                    <p className="text-gray-500">Address</p>
                    <p className="font-medium text-gray-900">
                      {quote.address_line1}
                      {quote.city && `, ${quote.city}`}
                      {quote.state && ` ${quote.state}`}
                      {quote.zip && ` ${quote.zip}`}
                    </p>
                  </div>
                )}
                <div>
                  <p className="text-gray-500">Pets</p>
                  <p className="font-medium text-gray-900">
                    {quote.has_pets ? "Yes" : "No"}
                  </p>
                </div>
              </div>
            </div>

            {/* Price Breakdown */}
            <div className="py-6 border-b">
              <h3 className="text-sm font-medium text-gray-500 mb-3">Price Breakdown</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Subtotal</span>
                  <span className="text-gray-900">{formatCurrency(quote.subtotal)}</span>
                </div>
                {quote.adjustments?.map((adj, i) => (
                  <div key={i} className="flex justify-between">
                    <span className="text-gray-600">{adj.name}</span>
                    <span className="text-gray-900">
                      {adj.type === "subtract" ? "-" : "+"}{formatCurrency(adj.amount)}
                    </span>
                  </div>
                ))}
                {(quote.discount_amount || 0) > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Discount</span>
                    <span>-{formatCurrency(quote.discount_amount)}</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold pt-2 border-t">
                  <span className="text-gray-900">Total</span>
                  <span style={{ color: brandColor }}>{formatCurrency(quote.total)}</span>
                </div>
              </div>
            </div>

            {/* Expiration */}
            {quote.expires_at && canAccept && (
              <div className="py-4 text-center">
                <p className="text-sm text-gray-500">
                  This quote expires on {formatDate(quote.expires_at)}
                </p>
              </div>
            )}

            {/* Actions */}
            {canAccept && !showSchedule && (
              <div className="pt-6 space-y-3">
                <button
                  onClick={() => setShowSchedule(true)}
                  className="w-full py-4 rounded-xl font-semibold text-white text-lg transition-colors"
                  style={{ backgroundColor: brandColor }}
                >
                  Accept Quote
                </button>
                <p className="text-center text-sm text-gray-500">
                  Questions? Call {quote.business.phone || "us"} or reply to this text.
                </p>
              </div>
            )}

            {/* Schedule Selection */}
            {showSchedule && canAccept && (
              <div className="pt-6 space-y-4">
                <h3 className="font-semibold text-gray-900">When would you like to schedule?</h3>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  min={new Date().toISOString().split("T")[0]}
                  className="w-full p-3 border rounded-lg"
                />
                <textarea
                  placeholder="Any special notes or requests? (optional)"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="w-full p-3 border rounded-lg"
                />
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowSchedule(false)}
                    className="flex-1 py-3 rounded-lg font-semibold border"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleAccept}
                    disabled={accepting || !selectedDate}
                    className="flex-1 py-3 rounded-lg font-semibold text-white disabled:opacity-50"
                    style={{ backgroundColor: brandColor }}
                  >
                    {accepting ? "Processing..." : "Confirm Booking"}
                  </button>
                </div>
              </div>
            )}

            {/* Accepted State */}
            {quote.status === "accepted" && (
              <div className="pt-6 text-center">
                <div 
                  className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
                  style={{ backgroundColor: `${brandColor}20` }}
                >
                  <RiCheckLine className="w-8 h-8" style={{ color: brandColor }} />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Quote Accepted!</h3>
                <p className="text-gray-500">
                  We&apos;ll be in touch shortly to confirm your appointment.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Contact Info */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h3 className="text-sm font-medium text-gray-500 mb-3">Contact Us</h3>
          <div className="space-y-2">
            <p className="font-semibold text-gray-900">{quote.business.name}</p>
            {quote.business.phone && (
              <a 
                href={`tel:${quote.business.phone}`}
                className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
              >
                <RiPhoneLine className="w-4 h-4" />
                {quote.business.phone}
              </a>
            )}
            {quote.business.email && (
              <a 
                href={`mailto:${quote.business.email}`}
                className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
              >
                <RiMailLine className="w-4 h-4" />
                {quote.business.email}
              </a>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-8 text-sm text-gray-400">
          Powered by <a href="https://vistrial.io" className="text-brand-600 hover:underline">Vistrial</a>
        </div>
      </div>
    </div>
  )
}
