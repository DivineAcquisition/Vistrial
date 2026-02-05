// @ts-nocheck
"use client"

import { useEffect, useState, useCallback, useMemo } from "react"
import { createClient } from "@/lib/supabase/client"
import type { OptOut, OptOutInput } from "@/types/database"

interface UseOptOutsOptions {
  limit?: number
}

export function useOptOuts(options: UseOptOutsOptions = {}) {
  const [optOuts, setOptOuts] = useState<OptOut[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const supabase = useMemo(() => createClient(), [])
  const { limit = 100 } = options

  const fetchOptOuts = useCallback(async () => {
    try {
      setIsLoading(true)

      const { data, error: fetchError } = await supabase
        .from("opt_outs")
        .select("*")
        .order("opted_out_at", { ascending: false })
        .limit(limit)

      if (fetchError) throw fetchError

      setOptOuts(data || [])
    } catch (err) {
      setError(err as Error)
    } finally {
      setIsLoading(false)
    }
  }, [supabase, limit])

  useEffect(() => {
    fetchOptOuts()
  }, [fetchOptOuts])

  /**
   * Check if a phone number is on the opt-out list
   */
  const isPhoneOptedOut = useCallback(
    async (phone: string): Promise<boolean> => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return false

      const { data } = await supabase
        .from("opt_outs")
        .select("id")
        .eq("user_id", user.id)
        .eq("phone", phone)
        .single()

      return !!data
    },
    [supabase]
  )

  /**
   * Add a phone number to the opt-out list
   */
  const addOptOut = async (input: OptOutInput): Promise<OptOut> => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error("Not authenticated")

    const { data, error } = await supabase
      .from("opt_outs")
      .upsert(
        {
          user_id: user.id,
          phone: input.phone,
          reason: input.reason || "manual",
          lead_id: input.lead_id,
          opted_out_at: new Date().toISOString(),
        },
        {
          onConflict: "user_id,phone",
        }
      )
      .select()
      .single()

    if (error) throw error

    // Also update any leads with this phone number
    await supabase
      .from("leads")
      .update({
        status: "opted_out",
        next_action_at: null,
      })
      .eq("user_id", user.id)
      .eq("phone", input.phone)

    setOptOuts((prev) => [data, ...prev.filter((o) => o.phone !== input.phone)])
    return data
  }

  /**
   * Remove a phone number from the opt-out list (re-subscribe)
   */
  const removeOptOut = async (phone: string): Promise<void> => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error("Not authenticated")

    const { error } = await supabase
      .from("opt_outs")
      .delete()
      .eq("user_id", user.id)
      .eq("phone", phone)

    if (error) throw error

    setOptOuts((prev) => prev.filter((o) => o.phone !== phone))
  }

  /**
   * Get opt-out record for a specific phone number
   */
  const getOptOut = useCallback(
    async (phone: string): Promise<OptOut | null> => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return null

      const { data } = await supabase
        .from("opt_outs")
        .select("*")
        .eq("user_id", user.id)
        .eq("phone", phone)
        .single()

      return data
    },
    [supabase]
  )

  /**
   * Bulk check multiple phone numbers
   */
  const checkBulkOptOuts = useCallback(
    async (phones: string[]): Promise<Map<string, boolean>> => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return new Map(phones.map((p) => [p, false]))

      const { data } = await supabase
        .from("opt_outs")
        .select("phone")
        .eq("user_id", user.id)
        .in("phone", phones)

      const optedOutPhones = new Set(data?.map((o: { phone: string }) => o.phone) || [])
      return new Map(phones.map((p) => [p, optedOutPhones.has(p)]))
    },
    [supabase]
  )

  return {
    optOuts,
    isLoading,
    error,
    refetch: fetchOptOuts,
    isPhoneOptedOut,
    addOptOut,
    removeOptOut,
    getOptOut,
    checkBulkOptOuts,
  }
}

/**
 * Simple hook to check if a specific phone is opted out
 */
export function useIsOptedOut(phone: string) {
  const [isOptedOut, setIsOptedOut] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    if (!phone) {
      setIsOptedOut(false)
      setIsLoading(false)
      return
    }

    const checkOptOut = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          setIsOptedOut(false)
          return
        }

        const { data } = await supabase
          .from("opt_outs")
          .select("id")
          .eq("user_id", user.id)
          .eq("phone", phone)
          .single()

        setIsOptedOut(!!data)
      } catch {
        setIsOptedOut(false)
      } finally {
        setIsLoading(false)
      }
    }

    checkOptOut()
  }, [supabase, phone])

  return { isOptedOut, isLoading }
}
