"use client"

import { useEffect, useState } from "react"
import { StatCard } from "@/components/ui/dashboard/StatCard"
import { LeadStatus } from "@/components/ui/leads/StatusBadge"
import { Button } from "@/components/Button"
import { Card } from "@/components/Card"
import {
  RiUserLine,
  RiTimeLine,
  RiChat3Line,
  RiCheckboxCircleLine,
  RiSendPlaneLine,
  RiAddLine,
  RiArrowRightSLine,
  RiLoader4Line,
  RiRefreshLine,
} from "@remixicon/react"
import Link from "next/link"
import { siteConfig } from "@/app/siteConfig"
import { createClient } from "@/lib/supabase/client"

interface DashboardStats {
  totalLeads: number
  inSequence: number
  responded: number
  booked: number
  notInterested: number
  noResponse: number
  responseRate: number
  bookingRate: number
  totalQuoted: number
  totalBooked: number
}

interface RecentActivity {
  id: string
  type: "response" | "sent" | "booked" | "added"
  name: string
  message?: string
  amount?: number
  quoteAmount?: number
  time: string
  createdAt: Date
}

interface LeadNeedingAttention {
  id: string
  name: string
  phone: string
  quoteAmount: number
  status: LeadStatus
  jobType: string
  lastResponse: string
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([])
  const [leadsNeedingAttention, setLeadsNeedingAttention] = useState<LeadNeedingAttention[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const supabase = createClient()

  const fetchDashboardData = async () => {
    try {
      setIsLoading(true)
      setError(null)

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setError("Please log in to view your dashboard")
        setIsLoading(false)
        return
      }

      // Fetch leads for stats calculation
      const { data: leads, error: leadsError } = await supabase
        .from("leads")
        .select("*")
        .eq("user_id", user.id)

      if (leadsError) {
        console.error("Error fetching leads:", leadsError)
      }

      // Define lead data shape
      interface LeadData {
        id?: string
        status?: string
        quote_amount?: number
        booked_amount?: number
        updated_at?: string
        name?: string
        phone?: string
        last_response_text?: string
        job_type_id?: string
      }

      const leadsData: LeadData[] = leads || []

      // Calculate stats from leads
      const totalLeads = leadsData.length
      const inSequence = leadsData.filter((l: LeadData) => l.status === "in_sequence").length
      const responded = leadsData.filter((l: LeadData) => l.status === "responded").length
      const booked = leadsData.filter((l: LeadData) => l.status === "booked").length
      const notInterested = leadsData.filter((l: LeadData) => l.status === "not_interested" || l.status === "cancelled").length
      const noResponse = leadsData.filter((l: LeadData) => l.status === "no_response").length

      const totalQuoted = leadsData.reduce((sum: number, l: LeadData) => sum + (l.quote_amount || 0), 0)
      const totalBookedAmount = leadsData
        .filter((l: LeadData) => l.status === "booked")
        .reduce((sum: number, l: LeadData) => sum + (l.booked_amount || l.quote_amount || 0), 0)

      const responseRate = totalLeads > 0 ? ((responded + booked) / totalLeads) * 100 : 0
      const bookingRate = totalLeads > 0 ? (booked / totalLeads) * 100 : 0

      setStats({
        totalLeads,
        inSequence,
        responded,
        booked,
        notInterested,
        noResponse,
        responseRate: Math.round(responseRate * 10) / 10,
        bookingRate: Math.round(bookingRate * 10) / 10,
        totalQuoted,
        totalBooked: totalBookedAmount,
      })

      // Fetch recent messages for activity
      const { data: messages } = await supabase
        .from("messages")
        .select("*, leads(name)")
        .eq("user_id", user.id)
        .order("sent_at", { ascending: false })
        .limit(10)

      const activities: RecentActivity[] = []
      
      if (messages) {
        for (const msg of messages) {
          const leadName = (msg.leads as { name?: string })?.name || "Unknown"
          activities.push({
            id: msg.id,
            type: msg.direction === "inbound" ? "response" : "sent",
            name: leadName,
            message: msg.body?.substring(0, 50) + (msg.body?.length > 50 ? "..." : ""),
            time: formatTimeAgo(new Date(msg.sent_at)),
            createdAt: new Date(msg.sent_at),
          })
        }
      }

      // Add recently booked leads
      const recentlyBooked = leadsData
        .filter((l: LeadData) => l.status === "booked")
        .sort((a: LeadData, b: LeadData) => new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime())
        .slice(0, 3)

      for (const lead of recentlyBooked) {
        activities.push({
          id: `booked-${lead.id}`,
          type: "booked",
          name: lead.name || "Unknown",
          amount: lead.booked_amount || lead.quote_amount,
          time: formatTimeAgo(new Date(lead.updated_at || Date.now())),
          createdAt: new Date(lead.updated_at || Date.now()),
        })
      }

      // Sort by time and limit
      activities.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      setRecentActivity(activities.slice(0, 5))

      // Fetch leads needing attention (responded status)
      const needsAttention = leadsData
        .filter((l: LeadData) => l.status === "responded")
        .map((l: LeadData) => ({
          id: l.id || "",
          name: l.name || "Unknown",
          phone: l.phone || "",
          quoteAmount: l.quote_amount || 0,
          status: (l.status || "new") as LeadStatus,
          jobType: l.job_type_id || "Service",
          lastResponse: l.last_response_text || "Responded to your message",
        }))

      setLeadsNeedingAttention(needsAttention)

    } catch (err) {
      console.error("Dashboard error:", err)
      setError("Failed to load dashboard data")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchDashboardData()
  }, [])

  const formatTimeAgo = (date: Date): string => {
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 60) return `${diffMins} min ago`
    if (diffHours < 24) return `${diffHours} hours ago`
    if (diffDays === 1) return "1 day ago"
    return `${diffDays} days ago`
  }

  // Empty state or loading
  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <RiLoader4Line className="h-8 w-8 animate-spin text-brand-500" />
          <p className="text-gray-500 dark:text-gray-400">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-center">
          <p className="text-gray-500 dark:text-gray-400">{error}</p>
          <Button onClick={fetchDashboardData} className="gap-2">
            <RiRefreshLine className="h-4 w-4" />
            Retry
          </Button>
        </div>
      </div>
    )
  }

  const displayStats = stats || {
    totalLeads: 0,
    inSequence: 0,
    responded: 0,
    booked: 0,
    notInterested: 0,
    noResponse: 0,
    responseRate: 0,
    bookingRate: 0,
    totalQuoted: 0,
    totalBooked: 0,
  }

  const funnelData = [
    { label: "Total Leads", value: displayStats.totalLeads, percent: 100, color: "bg-gray-300 dark:bg-gray-700" },
    {
      label: "In Sequence",
      value: displayStats.inSequence,
      percent: displayStats.totalLeads > 0 ? (displayStats.inSequence / displayStats.totalLeads) * 100 : 0,
      color: "bg-yellow-400",
    },
    {
      label: "Responded",
      value: displayStats.responded,
      percent: displayStats.totalLeads > 0 ? (displayStats.responded / displayStats.totalLeads) * 100 : 0,
      color: "bg-purple-400",
    },
    {
      label: "Booked",
      value: displayStats.booked,
      percent: displayStats.totalLeads > 0 ? (displayStats.booked / displayStats.totalLeads) * 100 : 0,
      color: "bg-green-500",
    },
  ]

  const quoteToClose = displayStats.totalQuoted > 0 
    ? Math.round((displayStats.totalBooked / displayStats.totalQuoted) * 1000) / 10 
    : 0

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-50">
            Dashboard
          </h2>
          <p className="text-gray-500 dark:text-gray-400">
            Track your quote follow-ups
          </p>
        </div>
        <Button onClick={fetchDashboardData} variant="secondary" className="gap-2">
          <RiRefreshLine className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Empty State */}
      {displayStats.totalLeads === 0 && (
        <Card className="border-dashed border-2 border-gray-300 dark:border-gray-700">
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-100 dark:bg-brand-900/30">
              <RiUserLine className="h-8 w-8 text-brand-600 dark:text-brand-400" />
            </div>
            <h3 className="mb-2 text-lg font-semibold text-gray-900 dark:text-gray-50">
              No leads yet
            </h3>
            <p className="mb-4 max-w-sm text-gray-500 dark:text-gray-400">
              Start by adding your first lead to begin tracking quote follow-ups and grow your business.
            </p>
            <Link href="/details">
              <Button className="gap-2">
                <RiAddLine className="h-4 w-4" />
                Add Your First Lead
              </Button>
            </Link>
          </div>
        </Card>
      )}

      {/* Stats Grid */}
      {displayStats.totalLeads > 0 && (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="Total Leads"
              value={displayStats.totalLeads}
              subtitle="All time"
              icon={RiUserLine}
            />
            <StatCard
              title="In Sequence"
              value={displayStats.inSequence}
              subtitle="Active follow-ups"
              icon={RiTimeLine}
              iconClassName="bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400"
            />
            <StatCard
              title="Response Rate"
              value={`${displayStats.responseRate}%`}
              subtitle="Replied to messages"
              icon={RiChat3Line}
              iconClassName="bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400"
            />
            <StatCard
              title="Booking Rate"
              value={`${displayStats.bookingRate}%`}
              subtitle="Converted to jobs"
              icon={RiCheckboxCircleLine}
              iconClassName="bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
            />
          </div>

          {/* Funnel + Activity */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Lead Funnel */}
            <Card className="lg:col-span-2">
              <h3 className="mb-6 text-lg font-semibold text-gray-900 dark:text-gray-50">
                Lead Funnel
              </h3>

              {/* Visual Funnel */}
              <div className="space-y-3">
                {funnelData.map((stage, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <div className="w-24 text-right text-sm text-gray-600 dark:text-gray-400">
                      {stage.label}
                    </div>
                    <div className="flex-1">
                      <div className="relative h-10 overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800">
                        <div
                          className={`flex h-full items-center justify-end rounded-lg pr-3 transition-all ${stage.color}`}
                          style={{ width: `${Math.max(stage.percent, 5)}%` }}
                        >
                          <span className="text-sm font-semibold text-white drop-shadow">
                            {stage.value}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="w-16 text-sm font-medium text-gray-700 dark:text-gray-300">
                      {stage.percent.toFixed(0)}%
                    </div>
                  </div>
                ))}
              </div>

              {/* Conversion metrics */}
              <div className="mt-6 grid grid-cols-3 gap-4 border-t border-gray-200 pt-6 dark:border-gray-800">
                <div className="text-center">
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-50">
                    ${displayStats.totalQuoted.toLocaleString()}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Total Quoted
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                    ${displayStats.totalBooked.toLocaleString()}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Revenue Booked
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-brand-600 dark:text-brand-400">
                    {quoteToClose}%
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Quote-to-Close
                  </p>
                </div>
              </div>
            </Card>

            {/* Recent Activity */}
            <Card>
              <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-50">
                Recent Activity
              </h3>
              {recentActivity.length === 0 ? (
                <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-8">
                  No recent activity yet
                </p>
              ) : (
                <div className="space-y-4">
                  {recentActivity.map((activity) => (
                    <div key={activity.id} className="flex items-start gap-3">
                      <div
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                          activity.type === "response"
                            ? "bg-purple-100 dark:bg-purple-900/30"
                            : activity.type === "sent"
                              ? "bg-blue-100 dark:bg-blue-900/30"
                              : activity.type === "booked"
                                ? "bg-green-100 dark:bg-green-900/30"
                                : "bg-gray-100 dark:bg-gray-800"
                        }`}
                      >
                        {activity.type === "response" && (
                          <RiChat3Line className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                        )}
                        {activity.type === "sent" && (
                          <RiSendPlaneLine className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                        )}
                        {activity.type === "booked" && (
                          <RiCheckboxCircleLine className="h-4 w-4 text-green-600 dark:text-green-400" />
                        )}
                        {activity.type === "added" && (
                          <RiAddLine className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-50">
                          {activity.name}
                        </p>
                        <p className="truncate text-sm text-gray-500 dark:text-gray-400">
                          {activity.type === "response" && `"${activity.message}"`}
                          {activity.type === "sent" && (activity.message || "Message sent")}
                          {activity.type === "booked" && `Booked $${activity.amount}`}
                          {activity.type === "added" &&
                            `Added with $${activity.quoteAmount} quote`}
                        </p>
                        <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
                          {activity.time}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <button className="mt-4 flex w-full items-center justify-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300">
                View all activity <RiArrowRightSLine className="h-4 w-4" />
              </button>
            </Card>
          </div>

          {/* Leads Needing Attention */}
          <Card className="p-0">
            <div className="flex items-center justify-between border-b border-gray-200 p-6 dark:border-gray-800">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-50">
                  Needs Attention
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Leads that responded or need manual action
                </p>
              </div>
              <Link
                href={siteConfig.baseLinks.details}
                className="flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400"
              >
                View all leads <RiArrowRightSLine className="h-4 w-4" />
              </Link>
            </div>
            <div className="divide-y divide-gray-200 dark:divide-gray-800">
              {leadsNeedingAttention.map((lead) => (
                <div
                  key={lead.id}
                  className="flex cursor-pointer items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-900/30">
                      <RiChat3Line className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 dark:text-gray-50">
                        {lead.name}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        &quot;{lead.lastResponse}&quot;
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Button size="sm" className="bg-green-600 hover:bg-green-700">
                      Mark Booked
                    </Button>
                    <Button variant="secondary" size="sm">
                      Reply
                    </Button>
                  </div>
                </div>
              ))}
              {leadsNeedingAttention.length === 0 && (
                <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                  No leads need attention right now
                </div>
              )}
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
