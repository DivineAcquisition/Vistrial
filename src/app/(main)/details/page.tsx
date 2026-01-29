"use client"

import { Button } from "@/components/Button"
import { Input } from "@/components/Input"
import { Card } from "@/components/Card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/Select"
import { StatusBadge, LeadStatus } from "@/components/ui/leads/StatusBadge"
import { LeadDetailSlideOver } from "@/components/ui/leads/LeadDetailSlideOver"
import {
  RiSearchLine,
  RiCalendarLine,
  RiMoreLine,
} from "@remixicon/react"
import { useState } from "react"

interface Lead {
  id: number
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
}

const leads: Lead[] = [
  {
    id: 1,
    name: "John Smith",
    phone: "(555) 123-4567",
    email: "john@email.com",
    quoteAmount: 850,
    status: "in_sequence",
    jobType: "Water Heater",
    currentStep: 2,
    totalSteps: 3,
    nextAction: "2026-01-30T14:00:00",
    createdAt: "2026-01-27",
    lastActivity: "Message sent 2 days ago",
  },
  {
    id: 2,
    name: "Sarah Johnson",
    phone: "(555) 234-5678",
    quoteAmount: 425,
    status: "responded",
    jobType: "Pipe Repair",
    currentStep: 2,
    totalSteps: 3,
    lastResponse: "Yes, I'm interested! Can you call me tomorrow?",
    createdAt: "2026-01-25",
    lastActivity: "Responded 3 hours ago",
  },
  {
    id: 3,
    name: "Mike Davis",
    phone: "(555) 345-6789",
    quoteAmount: 1200,
    status: "booked",
    jobType: "AC Install",
    bookedAmount: 1200,
    createdAt: "2026-01-20",
    lastActivity: "Booked on Jan 26",
  },
  {
    id: 4,
    name: "Lisa Chen",
    phone: "(555) 456-7890",
    quoteAmount: 175,
    status: "not_interested",
    jobType: "Drain Cleaning",
    lostReason: "Going with another company",
    createdAt: "2026-01-22",
    lastActivity: "Marked lost on Jan 25",
  },
  {
    id: 5,
    name: "Bob Wilson",
    phone: "(555) 567-8901",
    quoteAmount: 650,
    status: "no_response",
    jobType: "Faucet Install",
    currentStep: 3,
    totalSteps: 3,
    createdAt: "2026-01-15",
    lastActivity: "Sequence completed",
  },
]

export default function LeadsPage() {
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [searchTerm, setSearchTerm] = useState("")

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-50">
          Leads
        </h2>
        <p className="text-gray-500 dark:text-gray-400">
          Manage your quote follow-ups
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative min-w-64 flex-1">
          <RiSearchLine className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <Input
            type="text"
            placeholder="Search leads..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select defaultValue="all">
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="in_sequence">In Sequence</SelectItem>
            <SelectItem value="responded">Responded</SelectItem>
            <SelectItem value="booked">Booked</SelectItem>
            <SelectItem value="not_interested">Not Interested</SelectItem>
            <SelectItem value="no_response">No Response</SelectItem>
          </SelectContent>
        </Select>
        <Select defaultValue="all">
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All Job Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Job Types</SelectItem>
            <SelectItem value="water-heater">Water Heater</SelectItem>
            <SelectItem value="drain-cleaning">Drain Cleaning</SelectItem>
            <SelectItem value="pipe-repair">Pipe Repair</SelectItem>
            <SelectItem value="faucet-install">Faucet Install</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="secondary" className="gap-2">
          <RiCalendarLine className="h-5 w-5 text-gray-500" />
          Date Range
        </Button>
      </div>

      {/* Leads Table */}
      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-800/50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                  Lead
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                  Quote
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                  Progress
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                  Last Activity
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase text-gray-500 dark:text-gray-400"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
              {leads.map((lead) => (
                <tr
                  key={lead.id}
                  className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50"
                  onClick={() => setSelectedLead(lead)}
                >
                  <td className="px-6 py-4">
                    <div>
                      <p className="font-medium text-gray-900 dark:text-gray-50">
                        {lead.name}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {lead.phone}
                      </p>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div>
                      <p className="font-medium text-gray-900 dark:text-gray-50">
                        ${lead.quoteAmount}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {lead.jobType}
                      </p>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge status={lead.status} />
                  </td>
                  <td className="px-6 py-4">
                    {lead.status === "in_sequence" && lead.totalSteps && (
                      <div className="flex items-center gap-2">
                        <div className="flex gap-1">
                          {[...Array(lead.totalSteps)].map((_, i) => (
                            <div
                              key={i}
                              className={`h-2 w-2 rounded-full ${
                                i < (lead.currentStep || 0)
                                  ? "bg-brand-500"
                                  : "bg-gray-200 dark:bg-gray-700"
                              }`}
                            />
                          ))}
                        </div>
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          Step {lead.currentStep}/{lead.totalSteps}
                        </span>
                      </div>
                    )}
                    {lead.status === "booked" && (
                      <span className="text-sm font-medium text-green-600 dark:text-green-400">
                        ${lead.bookedAmount} booked
                      </span>
                    )}
                    {lead.status === "no_response" && (
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        Sequence complete
                      </span>
                    )}
                    {lead.status === "responded" && (
                      <span className="text-sm font-medium text-purple-600 dark:text-purple-400">
                        Awaiting action
                      </span>
                    )}
                    {lead.status === "not_interested" && (
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        {lead.lostReason}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {lead.lastActivity}
                    </p>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-gray-800"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <RiMoreLine className="h-5 w-5 text-gray-400" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between border-t border-gray-200 px-6 py-4 dark:border-gray-800">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Showing 1-5 of 156 leads
          </p>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm">
              Previous
            </Button>
            <Button size="sm">1</Button>
            <Button variant="secondary" size="sm">
              2
            </Button>
            <Button variant="secondary" size="sm">
              3
            </Button>
            <Button variant="secondary" size="sm">
              Next
            </Button>
          </div>
        </div>
      </Card>

      {/* Lead Detail Slide Over */}
      {selectedLead && (
        <LeadDetailSlideOver
          lead={selectedLead}
          onClose={() => setSelectedLead(null)}
        />
      )}
    </div>
  )
}
