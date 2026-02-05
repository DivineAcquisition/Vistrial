// @ts-nocheck
/**
 * Leads API Route
 * GET - List leads for the current user
 * POST - Create a new lead
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// GET - List leads
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status")
    const limit = parseInt(searchParams.get("limit") || "100")

    let query = supabase
      .from("leads")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(limit)

    if (status && status !== "all") {
      query = query.eq("status", status)
    }

    const { data: leads, error } = await query

    if (error) {
      console.error("Error fetching leads:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ leads })
  } catch (error) {
    console.error("GET leads error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// POST - Create lead
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { name, phone, email, quoteAmount, jobTypeId, sequenceId, notes } = body

    if (!name || !phone) {
      return NextResponse.json({ error: "Name and phone are required" }, { status: 400 })
    }

    const { data: lead, error } = await supabase
      .from("leads")
      .insert({
        user_id: user.id,
        name,
        phone,
        email: email || null,
        quote_amount: quoteAmount || null,
        job_type_id: jobTypeId || null,
        sequence_id: sequenceId || null,
        notes: notes || null,
        status: sequenceId ? "in_sequence" : "new",
        current_step: sequenceId ? 1 : null,
        next_action_at: sequenceId ? new Date().toISOString() : null,
      })
      .select()
      .single()

    if (error) {
      console.error("Error creating lead:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ lead })
  } catch (error) {
    console.error("POST lead error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
