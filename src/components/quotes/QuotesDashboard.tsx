"use client"

/**
 * QuotesDashboard Component
 * Display and manage all quotes
 */

import { useState } from "react"
import Link from "next/link"
import {
  RiFileTextLine,
  RiSendPlaneLine,
  RiCheckLine,
  RiMoneyDollarCircleLine,
  RiPercentLine,
  RiAddLine,
  RiSearchLine,
  RiMoreLine,
  RiTimeLine,
} from "@remixicon/react"
import { Button } from "@/components/Button"
import { Input } from "@/components/Input"
import { Badge } from "@/components/Badge"
import { Card } from "@/components/Card"
import { cx } from "@/lib/utils"
import { formatCurrency } from "@/lib/quotes/calculations"
import type { Quote, QuoteStatus, QuoteStats } from "@/types/quotes"

interface QuotesDashboardProps {
  quotes: Quote[]
  stats: QuoteStats
}

// Stats card component
function StatsCard({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: string | number
  icon: React.ElementType
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-brand-50 dark:bg-brand-900/20">
          <Icon className="h-5 w-5 text-brand-600 dark:text-brand-400" />
        </div>
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
          <p className="text-xl font-semibold text-gray-900 dark:text-gray-50">{value}</p>
        </div>
      </div>
    </Card>
  )
}

// Format date
function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
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

export function QuotesDashboard({ quotes, stats }: QuotesDashboardProps) {
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")

  // Filter quotes
  const filteredQuotes = quotes.filter((quote) => {
    const contact = quote.contact
    const matchesSearch =
      quote.quote_number.toLowerCase().includes(search.toLowerCase()) ||
      (contact?.first_name?.toLowerCase() || "").includes(search.toLowerCase()) ||
      (contact?.last_name?.toLowerCase() || "").includes(search.toLowerCase()) ||
      (contact?.phone || "").includes(search)

    const matchesStatus = statusFilter === "all" || quote.status === statusFilter

    return matchesSearch && matchesStatus
  })

  // Status badge
  const getStatusBadge = (status: QuoteStatus, expiresAt: string | null) => {
    const isExpired = expiresAt && new Date(expiresAt) < new Date() && status === "sent"
    const displayStatus = isExpired ? "expired" : status

    const variants: Record<string, { variant: "default" | "success" | "warning" | "error" | "neutral"; label: string }> = {
      draft: { variant: "neutral", label: "Draft" },
      sent: { variant: "default", label: "Sent" },
      viewed: { variant: "warning", label: "Viewed" },
      accepted: { variant: "success", label: "Accepted" },
      declined: { variant: "error", label: "Declined" },
      expired: { variant: "neutral", label: "Expired" },
    }

    const config = variants[displayStatus] || variants.draft
    return <Badge variant={config.variant}>{config.label}</Badge>
  }

  // Profit margin indicator
  const getProfitIndicator = (margin: number | null) => {
    if (margin === null) return { color: "text-gray-500", label: "-" }
    if (margin >= 30) return { color: "text-green-600", label: "Excellent" }
    if (margin >= 20) return { color: "text-amber-600", label: "Good" }
    return { color: "text-red-600", label: "Low" }
  }

  const filterOptions = [
    { value: "all", label: "All" },
    { value: "draft", label: "Draft" },
    { value: "sent", label: "Sent" },
    { value: "viewed", label: "Viewed" },
    { value: "accepted", label: "Accepted" },
    { value: "declined", label: "Declined" },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Quotes</h1>
          <p className="text-gray-500 dark:text-gray-400">Create, send, and track quotes</p>
        </div>
        <Link href="/quotes/new">
          <Button>
            <RiAddLine className="h-4 w-4 mr-2" />
            New Quote
          </Button>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatsCard label="Quotes Sent" value={stats.sent_quotes} icon={RiSendPlaneLine} />
        <StatsCard
          label="Awaiting Response"
          value={stats.sent_quotes - stats.accepted_quotes - stats.declined_quotes}
          icon={RiTimeLine}
        />
        <StatsCard label="Accepted" value={stats.accepted_quotes} icon={RiCheckLine} />
        <StatsCard label="Revenue Won" value={formatCurrency(stats.accepted_revenue)} icon={RiMoneyDollarCircleLine} />
        <StatsCard label="Conversion Rate" value={`${stats.conversion_rate}%`} icon={RiPercentLine} />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <RiSearchLine className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search quotes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        <div className="flex gap-2 flex-wrap">
          {filterOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => setStatusFilter(option.value)}
              className={cx(
                "px-3 py-1.5 text-sm rounded-lg transition-colors",
                statusFilter === option.value
                  ? "bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400"
                  : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Quotes Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500 dark:text-gray-400">Quote</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500 dark:text-gray-400">Customer</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500 dark:text-gray-400">Amount</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500 dark:text-gray-400">Profit</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500 dark:text-gray-400">Status</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500 dark:text-gray-400">Follow-ups</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500 dark:text-gray-400">Date</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y dark:divide-gray-700">
              {filteredQuotes.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                    <RiFileTextLine className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No quotes found</p>
                    <Link href="/quotes/new" className="text-brand-600 hover:underline mt-1 inline-block">
                      Create your first quote
                    </Link>
                  </td>
                </tr>
              ) : (
                filteredQuotes.map((quote) => {
                  const profitIndicator = getProfitIndicator(quote.profit_margin)
                  const isExpired = quote.expires_at && new Date(quote.expires_at) < new Date()
                  const contact = quote.contact

                  return (
                    <tr key={quote.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="px-4 py-3">
                        <Link
                          href={`/quotes/${quote.id}`}
                          className="font-medium text-brand-600 dark:text-brand-400 hover:underline"
                        >
                          {quote.quote_number}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        {contact ? (
                          <div>
                            <p className="font-medium text-gray-900 dark:text-gray-50">
                              {contact.first_name} {contact.last_name}
                            </p>
                            <p className="text-sm text-gray-500">{formatPhone(contact.phone)}</p>
                          </div>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-50">
                        {formatCurrency(quote.total)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={cx("text-sm font-medium", profitIndicator.color)}>
                          {quote.profit_margin !== null ? `${quote.profit_margin.toFixed(0)}%` : "-"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {getStatusBadge(quote.status, quote.expires_at)}
                          {quote.status === "sent" && !isExpired && quote.expires_at && (
                            <span className="text-xs text-gray-400">Expires {formatDate(quote.expires_at)}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {quote.status === "sent" && (
                          <span className="text-sm text-gray-500">{quote.follow_up_count}/4 sent</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">{formatDate(quote.created_at)}</td>
                      <td className="px-4 py-3">
                        <button className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
                          <RiMoreLine className="h-4 w-4 text-gray-400" />
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
