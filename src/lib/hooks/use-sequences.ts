"use client"

import { useEffect, useState, useCallback, useMemo } from "react"
import { createClient } from "@/lib/supabase/client"
import type { Sequence, SequenceStep, SequenceInput, SequenceStepInput } from "@/types/database"

export function useSequences() {
  const [sequences, setSequences] = useState<Sequence[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const supabase = useMemo(() => createClient(), [])

  const fetchSequences = useCallback(async () => {
    try {
      setIsLoading(true)

      const { data, error: fetchError } = await supabase
        .from("sequences")
        .select("*")
        .order("created_at", { ascending: false })

      if (fetchError) throw fetchError

      setSequences(data || [])
    } catch (err) {
      setError(err as Error)
    } finally {
      setIsLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    fetchSequences()
  }, [fetchSequences])

  const createSequence = async (input: SequenceInput) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error("Not authenticated")

    const { data, error } = await supabase
      .from("sequences")
      .insert({
        ...input,
        user_id: user.id,
      })
      .select()
      .single()

    if (error) throw error

    setSequences((prev) => [data, ...prev])
    return data
  }

  const updateSequence = async (id: string, updates: Partial<Sequence>) => {
    const { data, error } = await supabase
      .from("sequences")
      .update(updates)
      .eq("id", id)
      .select()
      .single()

    if (error) throw error

    setSequences((prev) => prev.map((s) => (s.id === id ? data : s)))
    return data
  }

  const deleteSequence = async (id: string) => {
    const { error } = await supabase.from("sequences").delete().eq("id", id)

    if (error) throw error

    setSequences((prev) => prev.filter((s) => s.id !== id))
  }

  return {
    sequences,
    isLoading,
    error,
    refetch: fetchSequences,
    createSequence,
    updateSequence,
    deleteSequence,
  }
}

export function useSequenceSteps(sequenceId: string) {
  const [steps, setSteps] = useState<SequenceStep[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const supabase = useMemo(() => createClient(), [])

  const fetchSteps = useCallback(async () => {
    try {
      setIsLoading(true)

      const { data, error: fetchError } = await supabase
        .from("sequence_steps")
        .select("*")
        .eq("sequence_id", sequenceId)
        .order("step_order", { ascending: true })

      if (fetchError) throw fetchError

      setSteps(data || [])
    } catch (err) {
      setError(err as Error)
    } finally {
      setIsLoading(false)
    }
  }, [supabase, sequenceId])

  useEffect(() => {
    if (sequenceId) {
      fetchSteps()
    }
  }, [sequenceId, fetchSteps])

  const createStep = async (input: SequenceStepInput) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error("Not authenticated")

    const { data, error } = await supabase
      .from("sequence_steps")
      .insert({
        ...input,
        sequence_id: sequenceId,
        user_id: user.id,
      })
      .select()
      .single()

    if (error) throw error

    setSteps((prev) => [...prev, data].sort((a, b) => a.step_order - b.step_order))
    return data
  }

  const updateStep = async (id: string, updates: Partial<SequenceStep>) => {
    const { data, error } = await supabase
      .from("sequence_steps")
      .update(updates)
      .eq("id", id)
      .select()
      .single()

    if (error) throw error

    setSteps((prev) =>
      prev.map((s) => (s.id === id ? data : s)).sort((a, b) => a.step_order - b.step_order)
    )
    return data
  }

  const deleteStep = async (id: string) => {
    const { error } = await supabase.from("sequence_steps").delete().eq("id", id)

    if (error) throw error

    setSteps((prev) => prev.filter((s) => s.id !== id))
  }

  const reorderSteps = async (stepIds: string[]) => {
    const updates = stepIds.map((id, index) => ({
      id,
      step_order: index + 1,
    }))

    for (const update of updates) {
      await supabase
        .from("sequence_steps")
        .update({ step_order: update.step_order })
        .eq("id", update.id)
    }

    await fetchSteps()
  }

  return {
    steps,
    isLoading,
    error,
    refetch: fetchSteps,
    createStep,
    updateStep,
    deleteStep,
    reorderSteps,
  }
}
