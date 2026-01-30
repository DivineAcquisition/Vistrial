"use client"

import { useEffect, useState, useCallback } from "react"
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
  RiLoader4Line,
  RiAddLine,
  RiRefreshLine,
} from "@remixicon/react"
import { createClient } from "@/lib/supabase/client"
import { AddLeadModal } from "@/components/ui/leads/AddLeadModal"

interface Lead {
  id: string
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

interface JobType {
  id: string
  name: string
}

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [jobTypes, setJobTypes] = useState<JobType[]>([])
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [jobTypeFilter, setJobTypeFilter] = useState<string>("all")
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const pageSize = 20

  const supabase = createClient()

  const fetchLeads = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setError("Please log in to view leads")
        setIsLoading(false)
        return
      }

      // Build query
      let query = supabase
        .from("leads")
        .select("*, job_types(id, name), sequences(id, name)", { count: "exact" })
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .range((page - 1) * pageSize, page * pageSize - 1)

      // Apply filters
      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter)
      }

      if (searchTerm) {
        query = query.or(`name.ilike.%${searchTerm}%,phone.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`)
      }

      if (jobTypeFilter !== "all") {
        query = query.eq("job_type_id", jobTypeFilter)
      }

      const { data, error: fetchError, count } = await query

      if (fetchError) {
        console.error("Error fetching leads:", fetchError)
        setError("Failed to fetch leads")
        return
      }

      // Define shape of lead data from Supabase
      interface LeadData {
        id: string
        name?: string
        phone?: string
        email?: string
        quote_amount?: number
        status?: string
        job_types?: { name?: string }
        current_step?: number
        next_action_at?: string
        created_at?: string
        updated_at?: string
        last_response_at?: string
        last_response_text?: string
        booked_amount?: number
        lost_reason?: string
        sequence_id?: string
      }

      // Transform data
      const transformedLeads: Lead[] = (data || []).map((lead: LeadData) => ({
        id: lead.id,
        name: lead.name || "Unknown",
        phone: lead.phone || "",
        email: lead.email,
        quoteAmount: lead.quote_amount || 0,
        status: lead.status as LeadStatus,
        jobType: lead.job_types?.name || "Service",
        currentStep: lead.current_step,
        totalSteps: 3, // Default, will need to fetch from sequence
        nextAction: lead.next_action_at,
        createdAt: lead.created_at,
        lastActivity: formatLastActivity(lead),
        lastResponse: lead.last_response_text,
        bookedAmount: lead.booked_amount,
        lostReason: lead.lost_reason,
        sequence_id: lead.sequence_id,
      }))

      setLeads(transformedLeads)
      setTotalCount(count || 0)

      // Fetch job types for filter
      const { data: jobTypesData } = await supabase
        .from("job_types")
        .select("id, name")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .order("name")

      setJobTypes(jobTypesData || [])

    } catch (err) {
      console.error("Leads error:", err)
      setError("Failed to load leads")
    } finally {
      setIsLoading(false)
    }
  }, [statusFilter, searchTerm, jobTypeFilter, page])

  useEffect(() => {
    fetchLeads()
  }, [fetchLeads])

  const formatLastActivity = (lead: { updated_at?: string; last_response_at?: string; status?: string }) => {
    const date = lead.last_response_at || lead.updated_at
    if (!date) return "No activity"
    
    const d = new Date(date)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (lead.status === "responded" && lead.last_response_at) {
      if (diffMins < 60) return `Responded ${diffMins} min ago`
      if (diffHours < 24) return `Responded ${diffHours} hours ago`
      return `Responded ${diffDays} days ago`
    }

    if (diffMins < 60) return `${diffMins} min ago`
    if (diffHours < 24) return `${diffHours} hours ago`
    return `${diffDays} days ago`
  }

  const handleAddLead = async (leadData: {
    name: string
    phone: string
    email?: string
    quoteAmount: number
    jobTypeId?: string
    sequenceId?: string
    notes?: string
  }) => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Not authenticated")

      const { error } = await supabase.from("leads").insert({
        user_id: user.id,
        name: leadData.name,
        phone: leadData.phone,
        email: leadData.email,
        quote_amount: leadData.quoteAmount,
        job_type_id: leadData.jobTypeId || null,
        sequence_id: leadData.sequenceId || null,
        notes: leadData.notes,
        status: leadData.sequenceId ? "in_sequence" : "new",
        consent_method: "manual",
        consent_timestamp: new Date().toISOString(),
      })

      if (error) throw error

      setShowAddModal(false)
      fetchLeads()
    } catch (err) {
      console.error("Error adding lead:", err)
      alert("Failed to add lead")
    }
  }

  // Empty state
  if (isLoading && leads.length === 0) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <RiLoader4Line className="h-8 w-8 animate-spin text-brand-500" />
          <p className="text-gray-500 dark:text-gray-400">Loading leads...</p>
        </div>
      </div>
    )
  }

  if (error && leads.length === 0) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-center">
          <p className="text-gray-500 dark:text-gray-400">{error}</p>
          <Button onClick={fetchLeads} className="gap-2">
            <RiRefreshLine className="h-4 w-4" />
            Retry
          </Button>
        </div>
      </div>
    )
  }

  const totalPages = Math.ceil(totalCount / pageSize)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-50">
            Leads
          </h2>
          <p className="text-gray-500 dark:text-gray-400">
            Manage your quote follow-ups
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={fetchLeads} variant="secondary" className="gap-2">
            <RiRefreshLine className="h-4 w-4" />
            Refresh
          </Button>
          <Button onClick={() => setShowAddModal(true)} className="gap-2">
            <RiAddLine className="h-4 w-4" />
            Add Lead
          </Button>
        </div>
      </div>

      {/* Empty State */}
      {leads.length === 0 && !isLoading && statusFilter === "all" && !searchTerm && (
        <Card className="border-dashed border-2 border-gray-300 dark:border-gray-700">
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-100 dark:bg-brand-900/30">
              <RiAddLine className="h-8 w-8 text-brand-600 dark:text-brand-400" />
            </div>
            <h3 className="mb-2 text-lg font-semibold text-gray-900 dark:text-gray-50">
              No leads yet
            </h3>
            <p className="mb-4 max-w-sm text-gray-500 dark:text-gray-400">
              Add your first lead to start tracking quote follow-ups. Each lead can be assigned to an automated SMS sequence.
            </p>
            <Button onClick={() => setShowAddModal(true)} className="gap-2">
              <RiAddLine className="h-4 w-4" />
              Add Your First Lead
            </Button>
          </div>
        </Card>
      )}

      {/* Filters */}
      {(leads.length > 0 || statusFilter !== "all" || searchTerm) && (
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative min-w-64 flex-1">
            <RiSearchLine className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
            <Input
              type="text"
              placeholder="Search leads..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value)
                setPage(1)
              }}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1) }}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="new">New</SelectItem>
              <SelectItem value="in_sequence">In Sequence</SelectItem>
              <SelectItem value="responded">Responded</SelectItem>
              <SelectItem value="booked">Booked</SelectItem>
              <SelectItem value="not_interested">Not Interested</SelectItem>
              <SelectItem value="no_response">No Response</SelectItem>
            </SelectContent>
          </Select>
          <Select value={jobTypeFilter} onValueChange={(v) => { setJobTypeFilter(v); setPage(1) }}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="All Job Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Job Types</SelectItem>
              {jobTypes.map((jt) => (
                <SelectItem key={jt.id} value={jt.id}>{jt.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="secondary" className="gap-2">
            <RiCalendarLine className="h-5 w-5 text-gray-500" />
            Date Range
          </Button>
        </div>
      )}

      {/* Leads Table */}
      {(leads.length > 0 || statusFilter !== "all" || searchTerm) && (
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
                {leads.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                      No leads found matching your filters
                    </td>
                  </tr>
                ) : (
                  leads.map((lead) => (
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
                            ${lead.quoteAmount.toLocaleString()}
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
                              Step {lead.currentStep || 1}/{lead.totalSteps}
                            </span>
                          </div>
                        )}
                        {lead.status === "booked" && (
                          <span className="text-sm font-medium text-green-600 dark:text-green-400">
                            ${(lead.bookedAmount || lead.quoteAmount).toLocaleString()} booked
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
                            {lead.lostReason || "Not interested"}
                          </span>
                        )}
                        {lead.status === "new" && (
                          <span className="text-sm text-gray-500 dark:text-gray-400">
                            Not started
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
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between border-t border-gray-200 px-6 py-4 dark:border-gray-800">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Showing {leads.length > 0 ? ((page - 1) * pageSize + 1) : 0}-{Math.min(page * pageSize, totalCount)} of {totalCount} leads
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={page === 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              {[...Array(Math.min(totalPages, 5))].map((_, i) => {
                const pageNum = i + 1
                return (
                  <Button
                    key={pageNum}
                    variant={page === pageNum ? "primary" : "secondary"}
                    size="sm"
                    onClick={() => setPage(pageNum)}
                  >
                    {pageNum}
                  </Button>
                )
              })}
              <Button
                variant="secondary"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Lead Detail Slide Over */}
      {selectedLead && (
        <LeadDetailSlideOver
          lead={selectedLead}
          onClose={() => setSelectedLead(null)}
        />
      )}

      {/* Add Lead Modal */}
      {showAddModal && (
        <AddLeadModal
          onClose={() => setShowAddModal(false)}
          onSubmit={handleAddLead}
          jobTypes={jobTypes}
        />
      )}
    </div>
  )
}
