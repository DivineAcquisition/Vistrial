"use client"

import { Button } from "@/components/Button"
import { Input } from "@/components/Input"
import { StatusBadge, LeadStatus } from "./StatusBadge"
import {
  RiCloseLine,
  RiUserLine,
  RiSendPlaneLine,
  RiMoreLine,
  RiCheckboxCircleLine,
} from "@remixicon/react"

interface Lead {
  id: string | number
  name: string
  phone: string
  email?: string
  quoteAmount: number
  status: LeadStatus
  jobType: string
  currentStep?: number
  totalSteps?: number
  nextAction?: string
  createdAt: string
  lastActivity: string
  lastResponse?: string
  bookedAmount?: number
  lostReason?: string
  sequence_id?: string
}

interface LeadDetailSlideOverProps {
  lead: Lead
  onClose: () => void
}

const messages = [
  {
    id: 1,
    direction: "outbound" as const,
    body: "Hi John, this is Pro Plumbing. Thanks for your interest! I wanted to confirm I sent over your quote for $850 for the water heater install. Any questions? Just reply here or call us anytime.",
    time: "2026-01-27 10:30 AM",
    status: "delivered",
  },
  {
    id: 2,
    direction: "outbound" as const,
    body: "Hey John, just checking in on the quote I sent over. Would love to get you scheduled. Still interested? Let me know!",
    time: "2026-01-30 10:30 AM",
    status: "delivered",
  },
]

export function LeadDetailSlideOver({ lead, onClose }: LeadDetailSlideOverProps) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50">
      <div className="flex h-full w-full max-w-2xl flex-col bg-white dark:bg-gray-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 p-6 dark:border-gray-800">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-100 dark:bg-brand-950/30">
              <RiUserLine className="h-6 w-6 text-brand-600 dark:text-brand-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-50">
                {lead.name}
              </h2>
              <p className="text-gray-500 dark:text-gray-400">{lead.phone}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <RiCloseLine className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Status + Actions */}
        <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-800/50">
          <StatusBadge status={lead.status} />
          <div className="flex items-center gap-2">
            <Button size="sm" className="bg-green-600 hover:bg-green-700">
              Mark Booked
            </Button>
            <Button variant="secondary" size="sm">
              Mark Lost
            </Button>
            <button className="rounded-lg border border-gray-200 p-1.5 hover:bg-white dark:border-gray-700 dark:hover:bg-gray-800">
              <RiMoreLine className="h-4 w-4 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Quote Info */}
          <div className="border-b border-gray-200 p-6 dark:border-gray-800">
            <h3 className="mb-4 text-sm font-semibold uppercase text-gray-500 dark:text-gray-400">
              Quote Details
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Amount
                </p>
                <p className="text-lg font-semibold text-gray-900 dark:text-gray-50">
                  ${lead.quoteAmount}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Job Type
                </p>
                <p className="text-lg font-semibold text-gray-900 dark:text-gray-50">
                  {lead.jobType}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Quote Date
                </p>
                <p className="text-lg font-semibold text-gray-900 dark:text-gray-50">
                  {lead.createdAt}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Sequence
                </p>
                <p className="text-lg font-semibold text-gray-900 dark:text-gray-50">
                  Standard Follow-Up
                </p>
              </div>
            </div>
          </div>

          {/* Conversation */}
          <div className="p-6">
            <h3 className="mb-4 text-sm font-semibold uppercase text-gray-500 dark:text-gray-400">
              Conversation
            </h3>
            <div className="space-y-4">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${
                    msg.direction === "outbound"
                      ? "justify-end"
                      : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[80%] ${
                      msg.direction === "outbound"
                        ? "rounded-2xl rounded-br-md bg-brand-600 text-white"
                        : "rounded-2xl rounded-bl-md bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-50"
                    } p-4`}
                  >
                    <p className="text-sm">{msg.body}</p>
                    <div
                      className={`mt-2 flex items-center gap-2 text-xs ${
                        msg.direction === "outbound"
                          ? "text-brand-200"
                          : "text-gray-500 dark:text-gray-400"
                      }`}
                    >
                      <span>{msg.time}</span>
                      {msg.direction === "outbound" && (
                        <>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <RiCheckboxCircleLine className="h-3 w-3" />
                            {msg.status}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Send Message */}
        <div className="border-t border-gray-200 p-4 dark:border-gray-800">
          <div className="flex gap-2">
            <Input
              type="text"
              placeholder="Type a message..."
              className="flex-1"
            />
            <Button className="px-4">
              <RiSendPlaneLine className="h-5 w-5" />
            </Button>
          </div>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            This will send a manual SMS outside the sequence
          </p>
        </div>
      </div>
    </div>
  )
}
