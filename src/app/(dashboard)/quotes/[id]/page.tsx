"use client"

/**
 * Quote Detail Page
 * View and manage a single quote
 */

import { useState, useEffect, use } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  RiArrowLeftLine,
  RiSendPlaneLine,
  RiFileCopyLine,
  RiDeleteBinLine,
  RiEditLine,
  RiCheckLine,
  RiCloseLine,
  RiTimeLine,
  RiUser3Line,
  RiHome4Line,
  RiMoneyDollarCircleLine,
  RiPercentLine,
  RiMailSendLine,
  RiExternalLinkLine,
} from "@remixicon/react"
import { Button } from "@/components/Button"
import { Card } from "@/components/Card"
import { Badge } from "@/components/Badge"
import { cx } from "@/lib/utils"
import { formatCurrency, getProfitStatus, DEFAULT_COST_SETTINGS } from "@/lib/quotes/calculations"
import type { Quote, QuoteStatus, QuoteFollowUp } from "@/types/quotes"

interface QuoteDetailPageProps {
  params: Promise<{ id: string }>
}

// Format date
function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

// Format phone
function formatPhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, "")
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`
  }
  if (cleaned.length === 11 && cleaned.startsWith("1")) {
    return `(${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`
  }
  return phone
}

export default function QuoteDetailPage({ params }: QuoteDetailPageProps) {
  const { id } = use(params)
  const router = useRouter()
  const [quote, setQuote] = useState<Quote | null>(null)
  const [followUps, setFollowUps] = useState<QuoteFollowUp[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)

  // Fetch quote
  useEffect(() => {
    async function fetchQuote() {
      try {
        const response = await fetch(`/api/quotes/${id}`)
        if (response.ok) {
          const data = await response.json()
          setQuote(data.quote)
          setFollowUps(data.quote.quote_follow_ups || [])
        } else {
          router.push("/quotes")
        }
      } catch (error) {
        console.error("Error fetching quote:", error)
        router.push("/quotes")
      } finally {
        setLoading(false)
      }
    }

    fetchQuote()
  }, [id, router])

  // Send quote
  const handleSend = async () => {
    if (!quote) return

    setSending(true)
    try {
      const response = await fetch(`/api/quotes/${id}/send`, { method: "POST" })
      if (response.ok) {
        const data = await response.json()
        setQuote({ ...quote, status: "sent", sent_at: new Date().toISOString() })
        alert(`Quote sent! Link: ${data.quoteLink}`)
      } else {
        const error = await response.json()
        alert(error.error || "Failed to send quote")
      }
    } catch (error) {
      console.error("Send error:", error)
      alert("Failed to send quote")
    } finally {
      setSending(false)
    }
  }

  // Copy quote link
  const handleCopyLink = () => {
    if (!quote?.access_token) return

    const link = `${window.location.origin}/q/${quote.access_token}`
    navigator.clipboard.writeText(link)
    alert("Quote link copied!")
  }

  // Delete quote
  const handleDelete = async () => {
    if (!quote || quote.status !== "draft") return

    if (!confirm("Are you sure you want to delete this quote?")) return

    try {
      const response = await fetch(`/api/quotes/${id}`, { method: "DELETE" })
      if (response.ok) {
        router.push("/quotes")
      } else {
        const error = await response.json()
        alert(error.error || "Failed to delete quote")
      }
    } catch (error) {
      console.error("Delete error:", error)
      alert("Failed to delete quote")
    }
  }

  // Status badge
  const getStatusBadge = (status: QuoteStatus) => {
    const variants: Record<string, { variant: "default" | "success" | "warning" | "error" | "neutral"; label: string }> = {
      draft: { variant: "neutral", label: "Draft" },
      sent: { variant: "default", label: "Sent" },
      viewed: { variant: "warning", label: "Viewed" },
      accepted: { variant: "success", label: "Accepted" },
      declined: { variant: "error", label: "Declined" },
      expired: { variant: "neutral", label: "Expired" },
    }

    const config = variants[status] || variants.draft
    return <Badge variant={config.variant}>{config.label}</Badge>
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600"></div>
      </div>
    )
  }

  if (!quote) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Quote not found</p>
        <Link href="/quotes" className="text-brand-600 hover:underline mt-2 inline-block">
          Back to Quotes
        </Link>
      </div>
    )
  }

  const profitStatus = getProfitStatus(quote.profit_margin || 0, DEFAULT_COST_SETTINGS)
  const contact = quote.contact
  const isExpired = quote.expires_at && new Date(quote.expires_at) < new Date()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/quotes" className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
            <RiArrowLeftLine className="h-5 w-5 text-gray-500" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">{quote.quote_number}</h1>
              {getStatusBadge(isExpired && quote.status === "sent" ? "expired" : quote.status)}
            </div>
            <p className="text-gray-500">Created {formatDate(quote.created_at)}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {quote.status === "draft" && (
            <>
              <Button variant="secondary" onClick={handleDelete}>
                <RiDeleteBinLine className="h-4 w-4 mr-2" />
                Delete
              </Button>
              <Link href={`/quotes/new?edit=${quote.id}`}>
                <Button variant="secondary">
                  <RiEditLine className="h-4 w-4 mr-2" />
                  Edit
                </Button>
              </Link>
              <Button onClick={handleSend} disabled={sending}>
                <RiSendPlaneLine className="h-4 w-4 mr-2" />
                {sending ? "Sending..." : "Send Quote"}
              </Button>
            </>
          )}
          {quote.status !== "draft" && (
            <>
              <Button variant="secondary" onClick={handleCopyLink}>
                <RiFileCopyLine className="h-4 w-4 mr-2" />
                Copy Link
              </Button>
              <a
                href={`/q/${quote.access_token}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center px-4 py-2 rounded-lg bg-brand-600 text-white hover:bg-brand-700"
              >
                <RiExternalLinkLine className="h-4 w-4 mr-2" />
                View Quote
              </a>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Customer */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold flex items-center gap-2 mb-4 text-gray-900 dark:text-gray-50">
              <RiUser3Line className="h-5 w-5" />
              Customer
            </h3>
            {contact ? (
              <div className="space-y-1">
                <p className="font-medium text-gray-900 dark:text-gray-50">
                  {contact.first_name} {contact.last_name}
                </p>
                <p className="text-gray-500">{formatPhone(contact.phone)}</p>
                {contact.email && <p className="text-gray-500">{contact.email}</p>}
              </div>
            ) : (
              <p className="text-gray-400">No contact information</p>
            )}
          </Card>

          {/* Property */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold flex items-center gap-2 mb-4 text-gray-900 dark:text-gray-50">
              <RiHome4Line className="h-5 w-5" />
              Property Details
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500">Address</p>
                <p className="text-gray-900 dark:text-gray-50">
                  {quote.address_line1 || "-"}
                  {quote.city && (
                    <>
                      <br />
                      {quote.city}, {quote.state} {quote.zip}
                    </>
                  )}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Size</p>
                <p className="text-gray-900 dark:text-gray-50">
                  {quote.bedrooms} bed, {quote.bathrooms} bath
                  {quote.sqft && ` • ${quote.sqft.toLocaleString()} sq ft`}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Condition</p>
                <p className="text-gray-900 dark:text-gray-50 capitalize">
                  {quote.property_condition?.replace("_", " ") || "Average"}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Pets</p>
                <p className="text-gray-900 dark:text-gray-50">{quote.has_pets ? "Yes" : "No"}</p>
              </div>
            </div>
          </Card>

          {/* Follow-ups */}
          {quote.status !== "draft" && followUps.length > 0 && (
            <Card className="p-6">
              <h3 className="text-lg font-semibold flex items-center gap-2 mb-4 text-gray-900 dark:text-gray-50">
                <RiMailSendLine className="h-5 w-5" />
                Follow-up Messages
              </h3>
              <div className="space-y-3">
                {followUps.map((fu) => (
                  <div
                    key={fu.id}
                    className={cx(
                      "p-3 rounded-lg border",
                      fu.status === "sent"
                        ? "bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800"
                        : fu.status === "pending"
                          ? "bg-gray-50 border-gray-200 dark:bg-gray-800 dark:border-gray-700"
                          : "bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {fu.status === "sent" ? (
                          <RiCheckLine className="h-4 w-4 text-green-600" />
                        ) : fu.status === "pending" ? (
                          <RiTimeLine className="h-4 w-4 text-gray-400" />
                        ) : (
                          <RiCloseLine className="h-4 w-4 text-red-600" />
                        )}
                        <span className="font-medium text-gray-900 dark:text-gray-50">Day {fu.day_number}</span>
                      </div>
                      <span className="text-sm text-gray-500">
                        {fu.sent_at ? `Sent ${formatDate(fu.sent_at)}` : `Scheduled for ${formatDate(fu.scheduled_for)}`}
                      </span>
                    </div>
                    {fu.message_body && <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{fu.message_body}</p>}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Internal Notes */}
          {quote.internal_notes && (
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-50">Internal Notes</h3>
              <p className="text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{quote.internal_notes}</p>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Price Summary */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold flex items-center gap-2 mb-4 text-gray-900 dark:text-gray-50">
              <RiMoneyDollarCircleLine className="h-5 w-5" />
              Quote Summary
            </h3>

            <div className="text-center py-4 border-b dark:border-gray-700">
              <p className="text-4xl font-bold text-gray-900 dark:text-gray-50">{formatCurrency(quote.total)}</p>
              {quote.estimated_hours && (
                <p className="text-sm text-gray-500 mt-1 flex items-center justify-center gap-1">
                  <RiTimeLine className="h-4 w-4" />
                  {quote.estimated_hours} hrs estimated
                </p>
              )}
            </div>

            {/* Price Breakdown */}
            <div className="space-y-2 text-sm py-3 border-b dark:border-gray-700">
              <div className="flex justify-between">
                <span className="text-gray-500">Base price</span>
                <span className="text-gray-900 dark:text-gray-50">{formatCurrency(quote.base_price || 0)}</span>
              </div>
              {quote.adjustments &&
                quote.adjustments.map((adj, i) => (
                  <div key={i} className="flex justify-between">
                    <span className="text-gray-500">{adj.name}</span>
                    <span className="text-gray-900 dark:text-gray-50">
                      {adj.type === "subtract" ? "-" : "+"}
                      {formatCurrency(adj.amount)}
                    </span>
                  </div>
                ))}
              {(quote.discount_amount || 0) > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Discount</span>
                  <span>-{formatCurrency(quote.discount_amount || 0)}</span>
                </div>
              )}
            </div>

            {/* Profit */}
            <div className={cx("p-4 rounded-lg my-4", profitStatus.bgColor)}>
              <div className="flex items-center justify-between mb-2">
                <span className={cx("font-medium", profitStatus.color)}>Profit Margin</span>
                <RiPercentLine className={cx("h-5 w-5", profitStatus.color)} />
              </div>
              <p className={cx("text-2xl font-bold", profitStatus.color)}>
                {(quote.profit_margin || 0).toFixed(1)}%
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{formatCurrency(quote.profit_amount || 0)} profit</p>
            </div>

            {/* Cost Breakdown */}
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Labor</span>
                <span className="text-gray-900 dark:text-gray-50">{formatCurrency(quote.labor_cost || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Supplies</span>
                <span className="text-gray-900 dark:text-gray-50">{formatCurrency(quote.supply_cost || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Travel</span>
                <span className="text-gray-900 dark:text-gray-50">{formatCurrency(quote.travel_cost || 0)}</span>
              </div>
              <div className="flex justify-between font-medium pt-2 border-t dark:border-gray-700">
                <span className="text-gray-900 dark:text-gray-50">Total Cost</span>
                <span className="text-gray-900 dark:text-gray-50">{formatCurrency(quote.total_cost || 0)}</span>
              </div>
            </div>
          </Card>

          {/* Timeline */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-50">Timeline</h3>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-gray-400"></div>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-50">Created</p>
                  <p className="text-xs text-gray-500">{formatDate(quote.created_at)}</p>
                </div>
              </div>
              {quote.sent_at && (
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-50">Sent</p>
                    <p className="text-xs text-gray-500">{formatDate(quote.sent_at)}</p>
                  </div>
                </div>
              )}
              {quote.viewed_at && (
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-50">Viewed</p>
                    <p className="text-xs text-gray-500">{formatDate(quote.viewed_at)}</p>
                  </div>
                </div>
              )}
              {quote.responded_at && (
                <div className="flex items-center gap-3">
                  <div
                    className={cx(
                      "w-2 h-2 rounded-full",
                      quote.status === "accepted" ? "bg-green-500" : "bg-red-500"
                    )}
                  ></div>
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-50">
                      {quote.status === "accepted" ? "Accepted" : "Declined"}
                    </p>
                    <p className="text-xs text-gray-500">{formatDate(quote.responded_at)}</p>
                  </div>
                </div>
              )}
              {quote.expires_at && quote.status === "sent" && (
                <div className="flex items-center gap-3">
                  <div className={cx("w-2 h-2 rounded-full", isExpired ? "bg-gray-400" : "bg-gray-300")}></div>
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-50">
                      {isExpired ? "Expired" : "Expires"}
                    </p>
                    <p className="text-xs text-gray-500">{formatDate(quote.expires_at)}</p>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
