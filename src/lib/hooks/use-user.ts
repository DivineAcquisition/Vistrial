"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import type { Profile } from "@/types/database"
import type { User } from "@supabase/supabase-js"

export function useUser() {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const supabase = createClient()

  useEffect(() => {
    async function getUser() {
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser()

        if (authError) throw authError

        setUser(user)

        if (user) {
          const { data: profile, error: profileError } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", user.id)
            .single()

          if (profileError) throw profileError

          setProfile(profile)
        }
      } catch (err) {
        setError(err as Error)
      } finally {
        setIsLoading(false)
      }
    }

    getUser()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setUser(session?.user ?? null)
        
        if (session?.user) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", session.user.id)
            .single()

          setProfile(profile)
        } else {
          setProfile(null)
        }
      }
    )

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  const updateProfile = async (updates: Partial<Profile>) => {
    if (!user) throw new Error("Not authenticated")

    const { data, error } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", user.id)
      .select()
      .single()

    if (error) throw error

    setProfile(data)
    return data
  }

  return {
    user,
    profile,
    isLoading,
    error,
    updateProfile,
  }
}
