// @ts-nocheck
"use client"

import { useEffect, useState, useCallback, useMemo } from "react"
import { createClient } from "@/lib/supabase/client"
import type { Lead, LeadStatus, LeadInput } from "@/types/database"

interface UseLeadsOptions {
  status?: LeadStatus | "all"
  search?: string
  sequenceId?: string
  limit?: number
}

export function useLeads(options: UseLeadsOptions = {}) {
  const [leads, setLeads] = useState<Lead[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const supabase = useMemo(() => createClient(), [])
  const { status = "all", search, sequenceId, limit = 100 } = options

  const fetchLeads = useCallback(async () => {
    try {
      setIsLoading(true)

      let query = supabase
        .from("leads")
        .select("*, job_type:job_types(*), sequence:sequences(*)")
        .order("created_at", { ascending: false })
        .limit(limit)

      if (status !== "all") {
        query = query.eq("status", status)
      }

      if (search) {
        query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%`)
      }

      if (sequenceId) {
        query = query.eq("sequence_id", sequenceId)
      }

      const { data, error: fetchError } = await query

      if (fetchError) throw fetchError

      setLeads(data || [])
    } catch (err) {
      setError(err as Error)
    } finally {
      setIsLoading(false)
    }
  }, [supabase, status, search, sequenceId, limit])

  useEffect(() => {
    fetchLeads()
  }, [fetchLeads])

  const createLead = async (input: LeadInput, startSequence = true) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error("Not authenticated")

    const { data, error } = await supabase
      .from("leads")
      .insert({
        ...input,
        user_id: user.id,
      })
      .select("*, job_type:job_types(*), sequence:sequences(*)")
      .single()

    if (error) throw error

    if (startSequence && data.sequence_id) {
      await supabase.rpc("start_lead_sequence", { p_lead_id: data.id })
    }

    setLeads((prev) => [data, ...prev])
    return data
  }

  const updateLead = async (id: string, updates: Partial<Lead>) => {
    const { data, error } = await supabase
      .from("leads")
      .update(updates)
      .eq("id", id)
      .select("*, job_type:job_types(*), sequence:sequences(*)")
      .single()

    if (error) throw error

    setLeads((prev) => prev.map((l) => (l.id === id ? data : l)))
    return data
  }

  const deleteLead = async (id: string) => {
    const { error } = await supabase.from("leads").delete().eq("id", id)

    if (error) throw error

    setLeads((prev) => prev.filter((l) => l.id !== id))
  }

  const markAsBooked = async (id: string, amount?: number) => {
    const { error } = await supabase.rpc("mark_lead_booked", {
      p_lead_id: id,
      p_booked_amount: amount,
    })

    if (error) throw error

    await fetchLeads()
  }

  const markAsLost = async (id: string, reason?: string) => {
    const { error } = await supabase.rpc("mark_lead_lost", {
      p_lead_id: id,
      p_reason: reason,
    })

    if (error) throw error

    await fetchLeads()
  }

  const pauseSequence = async (id: string) => {
    await updateLead(id, { status: "paused", next_action_at: null })
  }

  const resumeSequence = async (id: string) => {
    const lead = leads.find((l) => l.id === id)
    if (!lead || !lead.sequence_id) return

    await updateLead(id, { status: "in_sequence" })
    
    // Recalculate next action time
    const { error } = await supabase.rpc("calculate_next_action", {
      p_lead_id: id,
      p_step_order: lead.current_step,
    })

    if (error) throw error
    await fetchLeads()
  }

  const restartSequence = async (id: string) => {
    const { error } = await supabase.rpc("start_lead_sequence", { p_lead_id: id })

    if (error) throw error

    await fetchLeads()
  }

  return {
    leads,
    isLoading,
    error,
    refetch: fetchLeads,
    createLead,
    updateLead,
    deleteLead,
    markAsBooked,
    markAsLost,
    pauseSequence,
    resumeSequence,
    restartSequence,
  }
}
