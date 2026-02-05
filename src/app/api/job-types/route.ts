// @ts-nocheck
/**
 * Job Types API Route
 * GET - List job types for the current user
 * POST - Create a new job type
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// GET - List job types
export async function GET() {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: jobTypes, error } = await supabase
      .from("job_types")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .order("name")

    if (error) {
      console.error("Error fetching job types:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ jobTypes })
  } catch (error) {
    console.error("GET job types error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// POST - Create job type
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
    const { name, defaultAmount } = body

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 })
    }

    const { data: jobType, error } = await supabase
      .from("job_types")
      .insert({
        user_id: user.id,
        name,
        default_amount: defaultAmount || null,
        is_active: true,
      })
      .select()
      .single()

    if (error) {
      console.error("Error creating job type:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ jobType })
  } catch (error) {
    console.error("POST job type error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
