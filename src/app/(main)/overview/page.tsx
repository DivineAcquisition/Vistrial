"use client"

import { StatCard } from "@/components/ui/dashboard/StatCard"
import { StatusBadge, LeadStatus } from "@/components/ui/leads/StatusBadge"
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
} from "@remixicon/react"
import Link from "next/link"
import { siteConfig } from "@/app/siteConfig"

// Sample data
const stats = {
  totalLeads: 156,
  inSequence: 42,
  responded: 38,
  booked: 24,
  notInterested: 18,
  noResponse: 34,
  responseRate: 39.7,
  bookingRate: 15.4,
  totalQuoted: 48500,
  totalBooked: 18200,
}

const recentActivity = [
  {
    type: "response" as const,
    name: "Sarah Johnson",
    message: "Yes, I'm interested!",
    time: "3 hours ago",
  },
  {
    type: "sent" as const,
    name: "John Smith",
    message: "Following up on your quote...",
    time: "5 hours ago",
  },
  {
    type: "booked" as const,
    name: "Mike Davis",
    amount: 1200,
    time: "1 day ago",
  },
  {
    type: "added" as const,
    name: "Tom Harris",
    quoteAmount: 320,
    time: "1 day ago",
  },
  {
    type: "sent" as const,
    name: "Bob Wilson",
    message: "Final follow-up...",
    time: "2 days ago",
  },
]

const leadsNeedingAttention = [
  {
    id: 2,
    name: "Sarah Johnson",
    phone: "(555) 234-5678",
    quoteAmount: 425,
    status: "responded" as LeadStatus,
    jobType: "Pipe Repair",
    lastResponse: "Yes, I'm interested! Can you call me tomorrow?",
  },
]

const funnelData = [
  { label: "Total Leads", value: stats.totalLeads, percent: 100, color: "bg-gray-300 dark:bg-gray-700" },
  {
    label: "In Sequence",
    value: stats.inSequence,
    percent: (stats.inSequence / stats.totalLeads) * 100,
    color: "bg-yellow-400",
  },
  {
    label: "Responded",
    value: stats.responded,
    percent: (stats.responded / stats.totalLeads) * 100,
    color: "bg-purple-400",
  },
  {
    label: "Booked",
    value: stats.booked,
    percent: (stats.booked / stats.totalLeads) * 100,
    color: "bg-green-500",
  },
]

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-50">
          Dashboard
        </h2>
        <p className="text-gray-500 dark:text-gray-400">
          Track your quote follow-ups
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Leads"
          value={stats.totalLeads}
          subtitle="This month"
          icon={RiUserLine}
        />
        <StatCard
          title="In Sequence"
          value={stats.inSequence}
          subtitle="Active follow-ups"
          icon={RiTimeLine}
          iconClassName="bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400"
        />
        <StatCard
          title="Response Rate"
          value={`${stats.responseRate}%`}
          subtitle="Replied to messages"
          icon={RiChat3Line}
          iconClassName="bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400"
        />
        <StatCard
          title="Booking Rate"
          value={`${stats.bookingRate}%`}
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
                      style={{ width: `${stage.percent}%` }}
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
                ${stats.totalQuoted.toLocaleString()}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Total Quoted
              </p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                ${stats.totalBooked.toLocaleString()}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Revenue Booked
              </p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-brand-600 dark:text-brand-400">
                37.5%
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
          <div className="space-y-4">
            {recentActivity.map((activity, i) => (
              <div key={i} className="flex items-start gap-3">
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
                    {activity.type === "sent" && "Message sent"}
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
    </div>
  )
}
