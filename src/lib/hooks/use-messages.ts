"use client"

import { useEffect, useState, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import type { Message } from "@/types/database"

export function useMessages(leadId: string) {
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const supabase = createClient()

  const fetchMessages = useCallback(async () => {
    try {
      setIsLoading(true)

      const { data, error: fetchError } = await supabase
        .from("messages")
        .select("*")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: true })

      if (fetchError) throw fetchError

      setMessages(data || [])
    } catch (err) {
      setError(err as Error)
    } finally {
      setIsLoading(false)
    }
  }, [leadId])

  useEffect(() => {
    if (leadId) {
      fetchMessages()
    }
  }, [leadId, fetchMessages])

  // Set up real-time subscription
  useEffect(() => {
    if (!leadId) return

    const channel = supabase
      .channel(`messages:${leadId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `lead_id=eq.${leadId}`,
        },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as Message])
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `lead_id=eq.${leadId}`,
        },
        (payload) => {
          setMessages((prev) =>
            prev.map((m) => (m.id === payload.new.id ? (payload.new as Message) : m))
          )
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [leadId])

  const sendMessage = async (body: string) => {
    const response = await fetch("/api/twilio/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId, message: body }),
    })

    if (!response.ok) {
      const data = await response.json()
      throw new Error(data.error || "Failed to send message")
    }

    const data = await response.json()
    return data.message as Message
  }

  return {
    messages,
    isLoading,
    error,
    refetch: fetchMessages,
    sendMessage,
  }
}
