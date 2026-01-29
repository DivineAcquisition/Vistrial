"use client"

import { useEffect, useState, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import type { DashboardStats } from "@/types/database"

interface UseDashboardStatsOptions {
  startDate?: Date
  endDate?: Date
}

export function useDashboardStats(options: UseDashboardStatsOptions = {}) {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const supabase = createClient()
  const { startDate, endDate } = options

  const fetchStats = useCallback(async () => {
    try {
      setIsLoading(true)

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Not authenticated")

      const { data, error: fetchError } = await supabase.rpc("get_lead_stats", {
        p_user_id: user.id,
        p_start_date: startDate?.toISOString().split("T")[0],
        p_end_date: endDate?.toISOString().split("T")[0],
      })

      if (fetchError) throw fetchError

      // The RPC returns a single row
      if (data && data.length > 0) {
        setStats(data[0])
      }
    } catch (err) {
      setError(err as Error)
    } finally {
      setIsLoading(false)
    }
  }, [startDate, endDate])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  return {
    stats,
    isLoading,
    error,
    refetch: fetchStats,
  }
}
