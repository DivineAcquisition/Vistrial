"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/Button"
import { Card } from "@/components/Card"
import { Badge } from "@/components/Badge"
import {
  RiAddLine,
  RiChat3Line,
  RiMoreLine,
  RiLoader4Line,
  RiRefreshLine,
} from "@remixicon/react"
import { createClient } from "@/lib/supabase/client"

interface SequenceStep {
  id: string
  step_order: number
  delay_value: number
  delay_unit: "minutes" | "hours" | "days"
  message_template: string
  is_active: boolean
}

interface Sequence {
  id: string
  name: string
  is_default: boolean
  is_active: boolean
  created_at: string
  sequence_steps: SequenceStep[]
  lead_count: number
  response_rate: number
  booking_rate: number
}

export default function SequencesPage() {
  const [sequences, setSequences] = useState<Sequence[]>([])
  const [selectedSequence, setSelectedSequence] = useState<Sequence | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const supabase = createClient()

  const fetchSequences = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setError("Please log in to view sequences")
        setIsLoading(false)
        return
      }

      // Fetch sequences with steps
      const { data: sequencesData, error: seqError } = await supabase
        .from("sequences")
        .select("*, sequence_steps(*)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })

      if (seqError) {
        console.error("Error fetching sequences:", seqError)
        setError("Failed to load sequences")
        return
      }

      // Define sequence data shape
      interface SeqData {
        id: string
        name: string
        is_default: boolean
        is_active: boolean
        created_at: string
        sequence_steps?: SequenceStep[]
      }

      // Fetch lead counts and stats for each sequence
      const sequencesWithStats: Sequence[] = await Promise.all(
        (sequencesData || []).map(async (seq: SeqData) => {
          // Get lead count
          const { count: leadCount } = await supabase
            .from("leads")
            .select("*", { count: "exact", head: true })
            .eq("sequence_id", seq.id)

          // Get response rate (leads that responded / total leads in this sequence)
          const { count: respondedCount } = await supabase
            .from("leads")
            .select("*", { count: "exact", head: true })
            .eq("sequence_id", seq.id)
            .in("status", ["responded", "booked"])

          // Get booking rate
          const { count: bookedCount } = await supabase
            .from("leads")
            .select("*", { count: "exact", head: true })
            .eq("sequence_id", seq.id)
            .eq("status", "booked")

          const totalLeads = leadCount || 0
          const responseRate = totalLeads > 0 ? Math.round(((respondedCount || 0) / totalLeads) * 100) : 0
          const bookingRate = totalLeads > 0 ? Math.round(((bookedCount || 0) / totalLeads) * 100) : 0

          return {
            id: seq.id,
            name: seq.name,
            is_default: seq.is_default,
            is_active: seq.is_active,
            created_at: seq.created_at,
            sequence_steps: (seq.sequence_steps || []).sort(
              (a: SequenceStep, b: SequenceStep) => a.step_order - b.step_order
            ),
            lead_count: totalLeads,
            response_rate: responseRate,
            booking_rate: bookingRate,
          }
        })
      )

      setSequences(sequencesWithStats)

      // Select first sequence by default for preview
      if (sequencesWithStats.length > 0 && !selectedSequence) {
        setSelectedSequence(sequencesWithStats[0])
      }
    } catch (err) {
      console.error("Sequences error:", err)
      setError("Failed to load sequences")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSequences()
  }, [fetchSequences])

  const formatDelay = (step: SequenceStep) => {
    if (step.step_order === 1 && step.delay_value === 0) {
      return "Immediately"
    }
    const value = step.delay_value
    const unit = step.delay_unit
    if (unit === "minutes") return `${value} min later`
    if (unit === "hours") return `${value} hour${value > 1 ? "s" : ""} later`
    return `${value} day${value > 1 ? "s" : ""} later`
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <RiLoader4Line className="h-8 w-8 animate-spin text-brand-500" />
          <p className="text-gray-500 dark:text-gray-400">Loading sequences...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-center">
          <p className="text-gray-500 dark:text-gray-400">{error}</p>
          <Button onClick={fetchSequences} className="gap-2">
            <RiRefreshLine className="h-4 w-4" />
            Retry
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-50">
            Sequences
          </h2>
          <p className="text-gray-500 dark:text-gray-400">
            Automated follow-up templates
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={fetchSequences} variant="secondary" className="gap-2">
            <RiRefreshLine className="h-4 w-4" />
            Refresh
          </Button>
          <Button className="gap-2">
            <RiAddLine className="h-5 w-5" />
            New Sequence
          </Button>
        </div>
      </div>

      {/* Empty State */}
      {sequences.length === 0 && (
        <Card className="border-dashed border-2 border-gray-300 dark:border-gray-700">
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-100 dark:bg-brand-900/30">
              <RiChat3Line className="h-8 w-8 text-brand-600 dark:text-brand-400" />
            </div>
            <h3 className="mb-2 text-lg font-semibold text-gray-900 dark:text-gray-50">
              No sequences yet
            </h3>
            <p className="mb-4 max-w-sm text-gray-500 dark:text-gray-400">
              Create your first follow-up sequence to automate SMS messages to your leads.
            </p>
            <Button className="gap-2">
              <RiAddLine className="h-4 w-4" />
              Create Your First Sequence
            </Button>
          </div>
        </Card>
      )}

      {/* Sequences Grid */}
      {sequences.length > 0 && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {sequences.map((sequence) => (
            <Card
              key={sequence.id}
              className={`cursor-pointer transition-all ${
                selectedSequence?.id === sequence.id
                  ? "ring-2 ring-brand-500"
                  : "hover:border-gray-300 dark:hover:border-gray-700"
              }`}
              onClick={() => setSelectedSequence(sequence)}
            >
              <div className="mb-4 flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-gray-900 dark:text-gray-50">
                      {sequence.name}
                    </h3>
                    {sequence.is_default && (
                      <Badge variant="default">Default</Badge>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    {sequence.sequence_steps.length} step{sequence.sequence_steps.length !== 1 ? "s" : ""}
                  </p>
                </div>
                <button
                  className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-gray-800"
                  onClick={(e) => e.stopPropagation()}
                >
                  <RiMoreLine className="h-5 w-5 text-gray-400" />
                </button>
              </div>

              {/* Steps Preview */}
              <div className="mb-6 flex items-center gap-2">
                {sequence.sequence_steps.slice(0, 5).map((step, i) => (
                  <div key={step.id} className="flex items-center">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 dark:bg-brand-950/30">
                      <RiChat3Line className="h-4 w-4 text-brand-600 dark:text-brand-400" />
                    </div>
                    {i < Math.min(sequence.sequence_steps.length - 1, 4) && (
                      <div className="h-0.5 w-4 bg-gray-200 dark:bg-gray-700" />
                    )}
                  </div>
                ))}
                {sequence.sequence_steps.length > 5 && (
                  <span className="text-sm text-gray-500">+{sequence.sequence_steps.length - 5}</span>
                )}
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-4 border-t border-gray-200 pt-4 dark:border-gray-800">
                <div className="text-center">
                  <p className="text-lg font-bold text-gray-900 dark:text-gray-50">
                    {sequence.lead_count}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Used</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-purple-600 dark:text-purple-400">
                    {sequence.response_rate}%
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Response
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-green-600 dark:text-green-400">
                    {sequence.booking_rate}%
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Booking
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div className="mt-4 flex gap-2">
                <Button variant="secondary" className="flex-1">
                  Edit
                </Button>
                <Button
                  className="flex-1"
                  onClick={(e) => {
                    e.stopPropagation()
                    setSelectedSequence(sequence)
                  }}
                >
                  View Steps
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Sequence Builder Preview */}
      {selectedSequence && selectedSequence.sequence_steps.length > 0 && (
        <Card>
          <h3 className="mb-6 text-lg font-semibold text-gray-900 dark:text-gray-50">
            {selectedSequence.name} Steps
          </h3>

          <div className="space-y-4">
            {selectedSequence.sequence_steps.map((step, i) => (
              <div key={step.id} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-600 font-medium text-white">
                    {step.step_order}
                  </div>
                  {i < selectedSequence.sequence_steps.length - 1 && (
                    <div className="my-2 w-0.5 flex-1 bg-gray-200 dark:bg-gray-700" />
                  )}
                </div>
                <div className="flex-1 pb-6">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-50">
                      Step {step.step_order}
                    </span>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      • {formatDelay(step)}
                    </span>
                    {!step.is_active && (
                      <Badge variant="neutral">Disabled</Badge>
                    )}
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      {step.message_template}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {selectedSequence && selectedSequence.sequence_steps.length === 0 && (
        <Card>
          <div className="py-8 text-center text-gray-500 dark:text-gray-400">
            No steps defined for this sequence yet.
          </div>
        </Card>
      )}
    </div>
  )
}
