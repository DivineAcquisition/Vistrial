/**
 * Quotes Page
 * Display all quotes with stats and filtering
 */

import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { QuotesDashboard } from "@/components/quotes/QuotesDashboard"
import type { Quote, QuoteStats } from "@/types/quotes"

export const dynamic = "force-dynamic"

export default async function QuotesPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  // Get quotes
  const { data: quotesData, error: quotesError } = await supabase
    .from("quotes")
    .select(
      `
      *,
      leads(id, name, phone, email)
    `
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100)

  if (quotesError) {
    console.error("Error fetching quotes:", quotesError)
  }

  // Define shape of data from Supabase
  interface QuoteData {
    id: string
    created_at: string
    status: string
    total: number | null
    profit_margin: number | null
    leads?: {
      id: string
      name?: string
      phone?: string
      email?: string
    } | null
    [key: string]: unknown
  }

  // Transform to match Quote type
  const quotes: Quote[] = (quotesData || []).map((q: QuoteData) => ({
    ...q,
    contact: q.leads
      ? {
          id: q.leads.id,
          first_name: q.leads.name?.split(" ")[0] || "",
          last_name: q.leads.name?.split(" ").slice(1).join(" ") || "",
          phone: q.leads.phone || "",
          email: q.leads.email || null,
        }
      : undefined,
  }))

  // Calculate stats
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  const monthQuotes = quotes.filter((q) => new Date(q.created_at) >= startOfMonth)
  const sentQuotes = monthQuotes.filter((q) => q.status !== "draft")
  const acceptedQuotes = monthQuotes.filter((q) => q.status === "accepted")
  const declinedQuotes = monthQuotes.filter((q) => q.status === "declined")
  const acceptedRevenue = acceptedQuotes.reduce((sum, q) => sum + (q.total || 0), 0)
  const conversionRate = sentQuotes.length > 0 ? Math.round((acceptedQuotes.length / sentQuotes.length) * 100) : 0
  const averageQuoteValue = monthQuotes.length > 0 ? monthQuotes.reduce((sum, q) => sum + (q.total || 0), 0) / monthQuotes.length : 0
  const averageProfitMargin =
    monthQuotes.length > 0
      ? monthQuotes.reduce((sum, q) => sum + (q.profit_margin || 0), 0) / monthQuotes.length
      : 0

  const stats: QuoteStats = {
    total_quotes: monthQuotes.length,
    sent_quotes: sentQuotes.length,
    accepted_quotes: acceptedQuotes.length,
    declined_quotes: declinedQuotes.length,
    accepted_revenue: acceptedRevenue,
    conversion_rate: conversionRate,
    average_quote_value: averageQuoteValue,
    average_profit_margin: averageProfitMargin,
  }

  return <QuotesDashboard quotes={quotes} stats={stats} />
}
